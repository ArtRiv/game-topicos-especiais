import nodeDataChannel from 'node-datachannel';
import type { Server, Socket } from 'socket.io';

const { PeerConnection, cleanup: ndcCleanup } = nodeDataChannel;
type NdcPeerConnection = InstanceType<typeof PeerConnection>;
type NdcDataChannel = ReturnType<NdcPeerConnection['createDataChannel']>;

/** Reserved signaling target id the CLIENT uses when offering to the server relay (mirrors
 *  NetworkManager.STAR_SERVER_ID on the client). */
export const STAR_SERVER_ID = '__server__';

/** One client's server-side WebRTC endpoint: the PeerConnection + its two inbound data channels. */
interface StarPeer {
  socketId: string;
  pc: NdcPeerConnection;
  unreliable?: NdcDataChannel; // 'pos' — position snapshots
  reliable?: NdcDataChannel; // 'events' — spell casts etc.
  lobbyId: string;
}

/**
 * StarRelay — the server acts as a WebRTC peer (via node-datachannel) for every client in a match,
 * forming a STAR topology (each client ↔ server, instead of an N-to-N mesh). The client is always the
 * offerer; the server answers. Signaling is RELAYED OVER THE EXISTING socket.io channel: when a client
 * emits webrtc:offer/ice with targetSocketId === STAR_SERVER_ID, server.ts routes it here instead of
 * forwarding to another socket.
 *
 * Phase 1: just establish the connection + both channels (message handlers are stubs).
 * Phase 2/3/4 add the position/event relay + the snapshot-aggregation tick.
 */
export class StarRelay {
  #io: Server;
  #peers = new Map<string, StarPeer>(); // socketId → peer

  constructor(io: Server) {
    this.#io = io;
  }

  /** Handle an inbound offer from a client (targetSocketId === STAR_SERVER_ID). Creates the server-side
   *  answerer PeerConnection, wires answer + ICE back over socket.io, and registers the data channels. */
  handleOffer(socket: Socket, lobbyId: string, offer: { sdp: string; type: string }): void {
    // Defensive: never double-create for the same socket.
    if (this.#peers.has(socket.id)) {
      this.#closePeer(socket.id);
    }

    const pc = new PeerConnection(`srv-${socket.id.slice(0, 6)}`, {
      iceServers: ['stun:stun.l.google.com:19302'],
    });
    const peer: StarPeer = { socketId: socket.id, pc, lobbyId };
    this.#peers.set(socket.id, peer);

    // Send our ANSWER (and trickled ICE) back to this client over socket.io, mirroring the shape the
    // client's #handleAnswer / #handleIceCandidate expect (fromSocketId === STAR_SERVER_ID).
    pc.onLocalDescription((sdp, type) => {
      socket.emit('webrtc:answer', { fromSocketId: STAR_SERVER_ID, answer: { sdp, type } });
    });
    pc.onLocalCandidate((candidate, mid) => {
      socket.emit('webrtc:ice', { fromSocketId: STAR_SERVER_ID, candidate: { candidate, sdpMid: mid } });
    });

    // The client (offerer) created both channels; we receive them here.
    pc.onDataChannel((dc) => {
      const label = dc.getLabel();
      if (label === 'pos') {
        peer.unreliable = dc;
      } else {
        peer.reliable = dc;
      }
      dc.onMessage((msg) => this.#onChannelMessage(peer, label, msg));
      dc.onClosed(() => {
        /* channel closed — peer cleanup happens on socket disconnect */
      });
    });

    pc.onStateChange((state) => {
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        // ICE-level drop; the authoritative cleanup is socket disconnect, but free resources early.
        if (state === 'closed') this.#peers.delete(socket.id);
      }
    });

    // Apply the client's offer → triggers onLocalDescription with our answer.
    pc.setRemoteDescription(offer.sdp, offer.type as 'offer');
  }

  /** Apply a trickled ICE candidate from the client to its server-side PeerConnection. */
  handleIce(socketId: string, candidate: { candidate: string; sdpMid?: string | null }): void {
    const peer = this.#peers.get(socketId);
    if (!peer) return;
    try {
      peer.pc.addRemoteCandidate(candidate.candidate, candidate.sdpMid ?? '0');
    } catch {
      /* malformed/late candidate — ignore */
    }
  }

  /** Tear down a client's server-side peer (on socket disconnect or match end). */
  removePeer(socketId: string): void {
    this.#closePeer(socketId);
  }

  #closePeer(socketId: string): void {
    const peer = this.#peers.get(socketId);
    if (!peer) return;
    try { peer.unreliable?.close(); } catch { /* ignore */ }
    try { peer.reliable?.close(); } catch { /* ignore */ }
    try { peer.pc.close(); } catch { /* ignore */ }
    this.#peers.delete(socketId);
  }

  /**
   * Inbound message from a client's data channel. Phase 1 STUB — Phase 2 (position) and Phase 3
   * (events) implement the relay; Phase 4 adds snapshot aggregation. For now, just count it so the
   * milestone test can confirm bytes flow end-to-end.
   */
  #msgCount = 0;
  #onChannelMessage(_peer: StarPeer, _label: string, _msg: string | ArrayBuffer | Buffer): void {
    this.#msgCount++;
  }

  /** For the Phase 1 smoke test: how many peers are connected + messages seen. */
  debugStats(): { peers: number; messages: number } {
    return { peers: this.#peers.size, messages: this.#msgCount };
  }

  /** Process-exit cleanup for the native library. */
  static cleanup(): void {
    ndcCleanup();
  }
}
