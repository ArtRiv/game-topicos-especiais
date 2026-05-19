---
phase: 6
slug: foundation-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (if installed) or manual verification via browser console |
| **Config file** | none — Wave 0 installs if needed |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | FND-01 | — | N/A | manual | Check EVENT_BUS listener count in console | — | ⬜ pending |
| 06-02-01 | 02 | 1 | FND-02 | — | Host privileges only granted by server assignment | manual | Disconnect host, verify new host gets controls | — | ⬜ pending |
| 06-03-01 | 03 | 2 | FND-03 | — | N/A | manual | Play match, return to lobby, verify clean state | — | ⬜ pending |
| 06-04-01 | 04 | 2 | FND-04 | — | N/A | manual | Return to lobby, verify socket.io stays connected | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — this phase is primarily architectural cleanup verified through manual testing and browser console checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No duplicate listeners after scene transitions | FND-01 | Requires Phaser scene lifecycle in browser | Transition lobby→game→lobby 3x, check EVENT_BUS listener count |
| Host migration on disconnect | FND-02 | Requires multi-client WebRTC session | Open 3 clients, disconnect host, verify new host gets controls |
| Clean state on rematch | FND-03 | Requires full game loop in browser | Play match, return to lobby, start new match, verify defaults |
| Socket.io survives mesh teardown | FND-04 | Requires WebRTC + socket.io in browser | End match, check socket.io connected while peers disconnected |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
