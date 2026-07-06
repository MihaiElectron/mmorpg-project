import { makeCombatEvent, COMBAT_EVENT } from './combat-event';

describe('makeCombatEvent', () => {
  it('remplit id (string) et createdAt (number) et conserve les champs', () => {
    const before = Date.now();
    const ev = makeCombatEvent({
      type: 'damage',
      amount: 8,
      sourceType: 'player',
      sourceId: 'char-1',
      targetType: 'creature',
      targetId: 'creature-1',
      worldX: 100,
      worldY: 200,
      text: '-8',
    });

    expect(typeof ev.id).toBe('string');
    expect(ev.id.length).toBeGreaterThan(0);
    expect(ev.createdAt).toBeGreaterThanOrEqual(before);
    expect(ev.type).toBe('damage');
    expect(ev.amount).toBe(8);
    expect(ev.sourceType).toBe('player');
    expect(ev.sourceId).toBe('char-1');
    expect(ev.targetType).toBe('creature');
    expect(ev.targetId).toBe('creature-1');
    expect(ev.worldX).toBe(100);
    expect(ev.worldY).toBe(200);
    expect(ev.text).toBe('-8');
  });

  it('génère des id uniques', () => {
    const a = makeCombatEvent({ type: 'death', sourceType: 'player', targetType: 'creature', targetId: 'c', worldX: 0, worldY: 0 });
    const b = makeCombatEvent({ type: 'death', sourceType: 'player', targetType: 'creature', targetId: 'c', worldX: 0, worldY: 0 });
    expect(a.id).not.toBe(b.id);
  });

  it('expose le nom canonique de l\'event', () => {
    expect(COMBAT_EVENT).toBe('combat:event');
  });
});
