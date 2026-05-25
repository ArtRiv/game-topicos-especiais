/**
 * Fake RTCPeerConnection harness for multi-peer mesh tests.
 *
 * Goal: let N NetworkManager instances exercise the real production signaling
 * code paths (offer/answer/ice via socket.io) without depending on a real
 * WebRTC stack. Skips the ICE/STUN layer entirely — when a fake offerer's
 * data channel is created, it is wired to its matching answerer's channel via
 * a shared registry keyed by a synthetic "session id" embedded in the SDP.
 *
 * What this DOES exercise:
 *   - All NetworkManager mesh-init code (initWebRTCMesh, createOffer, handleOffer,
 *     handleAnswer, handleIceCandidate, setupDataChannel, broadcastUnreliable, etc.)
 *   - ICE candidate ordering / buffering (handleIceCandidate before/after setRemoteDescription)
 *   - Channel onopen handlers and the lastSentSnapshot reset
 *   - Mesh-health timer + NETWORK_MESH_PARTIAL emission
 *   - debugSnapshot() invariants on every peer
 *
 * What this does NOT exercise:
 *   - Real ICE / STUN / NAT traversal
 *   - Encryption, DTLS, SCTP
 *   - Bandwidth limits, packet loss, reordering (channels here are perfectly reliable)
 *   - Native WebRTC quirks across browsers
 *
 * For those, write a separate test under @roamhq/wrtc — out of scope here.
 */

type FakeSDP = { type: 'offer' | 'answer'; sdp: string; sessionId: string };
type FakeIce = { sessionId: string; candidate: string; toJSON(): { sessionId: string; candidate: string } };

function makeFakeIce(sessionId: string): FakeIce {
  // toJSON() is required because NetworkManager#createPeerConnection calls
  // `e.candidate.toJSON()` before relaying via socket.io. Real RTCIceCandidate
  // has this method built-in; our fake mirrors the API surface.
  return {
    sessionId,
    candidate: `fake-ice-${sessionId}`,
    toJSON() {
      return { sessionId: this.sessionId, candidate: this.candidate };
    },
  };
}

/**
 * Per-session connection registry. Both halves of an offer/answer pair find each other
 * via the sessionId — the offerer generates a session id when it creates the offer,
 * embeds it in the SDP, and the answerer reads it back from setRemoteDescription.
 * The two FakeRTCPeerConnection instances then store their data channels in here
 * and route send() → onmessage between paired channels.
 */
type Session = {
  offerer?: FakeRTCPeerConnection;
  answerer?: FakeRTCPeerConnection;
};
const SESSIONS = new Map<string, Session>();

let sessionCounter = 0;
function newSessionId(): string {
  return `fake-session-${++sessionCounter}`;
}

/** Clears all session state. Call this between tests. */
export function resetFakeRTC(): void {
  SESSIONS.clear();
  sessionCounter = 0;
}

class FakeRTCDataChannel {
  readyState: 'connecting' | 'open' | 'closed' = 'connecting';
  label: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  // Reference to the paired channel on the OTHER side. Set during finalization.
  paired: FakeRTCDataChannel | null = null;

  constructor(label: string) {
    this.label = label;
  }

  send(data: string): void {
    if (this.readyState !== 'open') {
      throw new Error(`FakeRTCDataChannel.send: channel not open (state=${this.readyState}, label=${this.label})`);
    }
    if (!this.paired) {
      // No peer — drop silently. Matches a half-open WebRTC channel.
      return;
    }
    // Deliver async (microtask) so handlers see the same ordering they would in real WebRTC.
    queueMicrotask(() => {
      this.paired?.onmessage?.({ data });
    });
  }

  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    queueMicrotask(() => this.onclose?.());
    if (this.paired && this.paired.readyState !== 'closed') {
      this.paired.close();
    }
  }
}

/**
 * Resolve pairing for a freshly-completed handshake. Called when BOTH sides have
 * landed in the session registry. Pairs up channels by label, opens them, and
 * triggers their onopen handlers.
 */
function finalizeSession(session: Session): void {
  const a = session.offerer;
  const b = session.answerer;
  if (!a || !b) return; // not both halves landed yet

  // Pair channels by label
  const labels = new Set<string>([...a.channels.keys(), ...b.channels.keys()]);
  for (const label of labels) {
    const ca = a.channels.get(label);
    const cb = b.channels.get(label);
    if (!ca || !cb) continue;
    ca.paired = cb;
    cb.paired = ca;
    ca.readyState = 'open';
    cb.readyState = 'open';
    queueMicrotask(() => {
      ca.onopen?.();
      cb.onopen?.();
    });
  }

  // Move both sides to "connected" ICE state
  a.iceConnectionState = 'connected';
  b.iceConnectionState = 'connected';
  queueMicrotask(() => {
    a.oniceconnectionstatechange?.();
    b.oniceconnectionstatechange?.();
  });
}

export class FakeRTCPeerConnection {
  iceConnectionState: 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed' = 'new';
  signalingState: 'stable' | 'have-local-offer' | 'have-remote-offer' | 'have-local-pranswer' | 'have-remote-pranswer' | 'closed' = 'stable';
  remoteDescription: FakeSDP | null = null;
  localDescription: FakeSDP | null = null;

  onicecandidate: ((e: { candidate: FakeIce | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: { channel: FakeRTCDataChannel }) => void) | null = null;

  // Channels created on THIS side (offerer's createDataChannel OR answerer's recv).
  channels = new Map<string, FakeRTCDataChannel>();

  // Session this PC belongs to. Set on first createOffer (offerer) or first setRemoteDescription (answerer).
  sessionId: string | null = null;
  role: 'offerer' | 'answerer' | null = null;

  // Simulate ICE candidate emission timing — fire one synthetic candidate per direction
  // after setLocalDescription, to exercise the buffer-drain path.
  #scheduledIce = false;

  constructor(_config?: unknown) {
    // _config is RTCConfiguration in real WebRTC — we don't need iceServers here.
  }

  // --- Offerer side ---
  async createOffer(): Promise<FakeSDP> {
    if (!this.sessionId) {
      this.sessionId = newSessionId();
      this.role = 'offerer';
    }
    return { type: 'offer', sdp: `fake-sdp-offer-${this.sessionId}`, sessionId: this.sessionId };
  }

  async setLocalDescription(desc: FakeSDP): Promise<void> {
    this.localDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-local-offer';
      // Register self as offerer in session
      let session = SESSIONS.get(desc.sessionId);
      if (!session) {
        session = {};
        SESSIONS.set(desc.sessionId, session);
      }
      session.offerer = this;
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
      // Finalize: both sides now present
      const session = SESSIONS.get(desc.sessionId);
      if (session) finalizeSession(session);
    }
    // Schedule one synthetic ICE candidate emission after a microtask boundary,
    // so the NetworkManager's onicecandidate fires AFTER setLocalDescription resolves —
    // matches real-WebRTC behavior, exercises the ICE buffer drain code path.
    if (!this.#scheduledIce) {
      this.#scheduledIce = true;
      queueMicrotask(() => {
        this.onicecandidate?.({ candidate: makeFakeIce(this.sessionId!) });
        // Followed by the end-of-candidates signal that real WebRTC sends.
        queueMicrotask(() => this.onicecandidate?.({ candidate: null }));
      });
    }
  }

  // --- Answerer side ---
  async setRemoteDescription(desc: FakeSDP): Promise<void> {
    this.remoteDescription = desc;
    this.sessionId = desc.sessionId;
    if (desc.type === 'offer') {
      this.role = 'answerer';
      this.signalingState = 'have-remote-offer';
      let session = SESSIONS.get(desc.sessionId);
      if (!session) {
        session = {};
        SESSIONS.set(desc.sessionId, session);
      }
      session.answerer = this;
      // Drain the offerer's data channels into ondatachannel events on this side.
      // Real WebRTC fires ondatachannel as the SCTP transport negotiates; we mimic
      // by inspecting the offerer's already-created channels.
      const offerer = session.offerer;
      if (offerer && this.ondatachannel) {
        for (const [label, _offChan] of offerer.channels) {
          // Create the answerer's mirror channel and fire ondatachannel on this side.
          const recvCh = new FakeRTCDataChannel(label);
          this.channels.set(label, recvCh);
          const ev = { channel: recvCh };
          queueMicrotask(() => this.ondatachannel?.(ev));
        }
      }
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
      // Offerer side just received the answer — finalize pairing if both halves present.
      const session = SESSIONS.get(desc.sessionId);
      if (session) finalizeSession(session);
    }
  }

  async createAnswer(): Promise<FakeSDP> {
    if (!this.sessionId) {
      throw new Error('createAnswer called without prior setRemoteDescription');
    }
    return { type: 'answer', sdp: `fake-sdp-answer-${this.sessionId}`, sessionId: this.sessionId };
  }

  async addIceCandidate(candidate: FakeIce): Promise<void> {
    // No real ICE checking — just record. (Used by NetworkManager only as a "happened" signal.)
    if (this.signalingState === 'closed') {
      throw new Error('addIceCandidate on closed connection');
    }
    // No-op success — represents successful ICE registration in real WebRTC.
    void candidate;
  }

  createDataChannel(label: string, _opts?: unknown): FakeRTCDataChannel {
    const ch = new FakeRTCDataChannel(label);
    this.channels.set(label, ch);
    return ch;
  }

  close(): void {
    if (this.signalingState === 'closed') return;
    this.signalingState = 'closed';
    this.iceConnectionState = 'closed';
    for (const ch of this.channels.values()) ch.close();
    queueMicrotask(() => this.oniceconnectionstatechange?.());
  }
}

/**
 * Install FakeRTCPeerConnection on globalThis so NetworkManager's
 * `typeof RTCPeerConnection === 'undefined'` guard passes and it uses the fake.
 * Call from beforeAll(); call uninstallFakeRTC() in afterAll() to restore.
 */
export function installFakeRTC(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).RTCPeerConnection = FakeRTCPeerConnection;
}

export function uninstallFakeRTC(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).RTCPeerConnection;
}
