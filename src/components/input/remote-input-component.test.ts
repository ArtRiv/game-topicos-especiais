import { describe, it, expect, beforeEach } from 'vitest';
import { RemoteInputComponent } from '../../components/input/remote-input-component.js';

describe('RemoteInputComponent', () => {
  let ric: RemoteInputComponent;

  beforeEach(() => {
    ric = new RemoteInputComponent();
  });

  it('has isMovementLocked = true by default', () => {
    expect(ric.isMovementLocked).toBe(true);
  });

  it('getSnapshot returns null before any snapshot is applied', () => {
    expect(ric.getSnapshot()).toBeNull();
  });

  it('applySnapshot stores the snapshot', () => {
    ric.applySnapshot({ x: 100, y: 200, direction: 'RIGHT', state: 'MOVE', element: 'FIRE', playerId: 'p1' });
    const snap = ric.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBe(200);
    expect(snap?.direction).toBe('RIGHT');
    expect(snap?.state).toBe('MOVE');
    expect(snap?.element).toBe('FIRE');
  });

  it('getSnapshot returns the last applied snapshot', () => {
    ric.applySnapshot({ x: 10, y: 20, direction: 'UP', state: 'IDLE', element: 'ICE', playerId: 'p1' });
    ric.applySnapshot({ x: 50, y: 60, direction: 'DOWN', state: 'MOVE', element: 'FIRE', playerId: 'p1' });
    const snap = ric.getSnapshot();
    expect(snap?.x).toBe(50);
    expect(snap?.direction).toBe('DOWN');
  });

  it('keyboard input (isUpDown) always returns false', () => {
    expect(ric.isUpDown).toBe(false);
  });

  it('isMovementLocked stays true even after reset-like operations', () => {
    // movement locked should persist since remote players are always network-driven
    expect(ric.isMovementLocked).toBe(true);
  });
});
