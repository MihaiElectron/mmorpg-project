import { CreaturesGateway } from './creatures.gateway';
import { CreaturesService } from './creatures.service';
import { WsAuthService } from '../common/ws-auth.service';
import { WorldItemService } from '../world-items/world-item.service';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { DataSource } from 'typeorm';
import type { WorldSocket } from '../types/world-socket';
import { COMBAT_EVENT } from './combat-event';

type Emitted = { room: string; event: string; payload: any };

function makeGateway(attackResult: any) {
  const roomEmits: Emitted[] = [];
  const creaturesService = {
    attack: jest.fn().mockResolvedValue(attackResult),
  } as unknown as CreaturesService;

  const gw = new CreaturesGateway(
    creaturesService,
    {} as unknown as WsAuthService,
    {} as unknown as WorldItemService,
    {} as unknown as DataSource,
    {} as unknown as ItemMaterializationService,
  );
  (gw as any).server = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => roomEmits.push({ room, event, payload }),
    }),
  };
  return { gw, roomEmits, creaturesService };
}

function makeClient(): WorldSocket & { emit: jest.Mock } {
  return {
    id: 'socket-1',
    data: { player: { characterId: 'char-1', worldX: 100, worldY: 200, mapId: 1 } },
    emit: jest.fn(),
  } as unknown as WorldSocket & { emit: jest.Mock };
}

const CREATURE_DTO = {
  id: 'creature-1',
  name: 'Turkey',
  worldX: 6080,
  worldY: 12480,
  mapId: 1,
  state: 'alive',
  health: 22,
};

describe('CreaturesGateway — combat:event (onAttackCreature)', () => {
  it('émet combat:event damage à la room + conserve creature_hit et creature_update', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO },
      damage: 8,
      attackerId: 'char-1',
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    // Anciens events conservés
    expect(client.emit).toHaveBeenCalledWith(
      'creature_hit',
      expect.objectContaining({ damage: 8, attackerId: 'char-1' }),
    );
    expect(roomEmits.some((e) => e.event === 'creature_update')).toBe(true);

    // Nouveau combat:event damage
    const dmgEvents = roomEmits.filter((e) => e.event === COMBAT_EVENT && e.payload.type === 'damage');
    expect(dmgEvents).toHaveLength(1);
    expect(dmgEvents[0].payload).toMatchObject({
      type: 'damage',
      amount: 8,
      sourceType: 'player',
      sourceId: 'char-1',
      targetType: 'creature',
      targetId: 'creature-1',
      worldX: 6080,
      worldY: 12480,
      text: '-8',
      isBlocked: false,
      blockedDamage: 0,
    });
    expect(typeof dmgEvents[0].payload.id).toBe('string');
    expect(typeof dmgEvents[0].payload.createdAt).toBe('number');
  });

  it('n\'émet AUCUN combat:event si l\'attaque est refusée (out of range)', async () => {
    const { gw, roomEmits } = makeGateway({ success: false, error: 'Target out of range' });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    expect(roomEmits.some((e) => e.event === COMBAT_EVENT)).toBe(false);
    expect(client.emit).not.toHaveBeenCalledWith('creature_hit', expect.anything());
  });

  it('émet combat:event death quand la créature meurt', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO, state: 'dead', health: 0 },
      damage: 30,
      attackerId: 'char-1',
      isCritical: false,
      killed: true,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    const deathEvents = roomEmits.filter((e) => e.event === COMBAT_EVENT && e.payload.type === 'death');
    expect(deathEvents).toHaveLength(1);
    expect(deathEvents[0].payload).toMatchObject({
      type: 'death',
      sourceType: 'player',
      targetType: 'creature',
      targetId: 'creature-1',
      amount: 30,
      targetName: 'Turkey',
      targetDied: true,
    });
  });

  it('émet combat:event damage targetType player pour la riposte + conserve character_damaged', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO },
      damage: 8,
      attackerId: 'char-1',
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      riposte: { damage: 3, characterHealth: 97, isDodged: false, isBlocked: false, blockedDamage: 0, isParried: false },
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    // Ancien event conservé
    expect(client.emit).toHaveBeenCalledWith(
      'character_damaged',
      expect.objectContaining({ characterId: 'char-1', damage: 3, health: 97 }),
    );

    const playerHit = roomEmits.filter(
      (e) => e.event === COMBAT_EVENT && e.payload.type === 'damage' && e.payload.targetType === 'player',
    );
    expect(playerHit).toHaveLength(1);
    expect(playerHit[0].payload).toMatchObject({
      sourceType: 'creature',
      sourceId: 'creature-1',
      targetType: 'player',
      targetId: 'char-1',
      amount: 3,
      worldX: 100,
      worldY: 200,
      text: '-3',
      isBlocked: false,
      blockedDamage: 0,
    });
  });

  it('V6-B7 : creatureCounterAttack → character_damaged + combat:event creature→player (isCounterAttack)', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO },
      damage: 0, // hit principal paré
      attackerId: 'char-1',
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      isParried: true,
      creatureCounterAttack: {
        amount: 10, currentHealth: 90, maxHealth: 100, killed: false,
        isCritical: false, isDodged: false, isBlocked: false, isParried: false,
        blockedDamage: 0, isCounterAttack: true,
      },
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    // character_damaged vers le joueur attaquant (un seul, contrat riposte).
    expect(client.emit).toHaveBeenCalledWith(
      'character_damaged',
      expect.objectContaining({ characterId: 'char-1', damage: 10, health: 90 }),
    );

    const ccEvents = roomEmits.filter(
      (e) =>
        e.event === COMBAT_EVENT &&
        e.payload.type === 'damage' &&
        e.payload.targetType === 'player' &&
        e.payload.isCounterAttack === true,
    );
    expect(ccEvents).toHaveLength(1);
    expect(ccEvents[0].payload).toMatchObject({
      sourceType: 'creature',
      sourceId: 'creature-1',
      targetType: 'player',
      targetId: 'char-1',
      amount: 10,
      text: '-10',
      isCounterAttack: true,
      isParried: false,
      isDodged: false,
      isBlocked: false,
    });
    // Pas de death event (joueur vivant).
    expect(roomEmits.some((e) => e.event === COMBAT_EVENT && e.payload.type === 'death')).toBe(false);
  });

  it('V6-B7 : creatureCounterAttack létale → un seul death event targetType player (pas de double)', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO },
      damage: 0,
      attackerId: 'char-1',
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      isParried: true,
      creatureCounterAttack: {
        amount: 100, currentHealth: 0, maxHealth: 100, killed: true,
        isCritical: false, isDodged: false, isBlocked: false, isParried: false,
        blockedDamage: 0, isCounterAttack: true,
      },
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    const deaths = roomEmits.filter(
      (e) => e.event === COMBAT_EVENT && e.payload.type === 'death' && e.payload.targetType === 'player',
    );
    expect(deaths).toHaveLength(1);
    expect(deaths[0].payload).toMatchObject({
      sourceType: 'creature',
      sourceId: 'creature-1',
      targetType: 'player',
      targetId: 'char-1',
      isCounterAttack: true,
      targetDied: true,
    });
  });

  it('propage isBlocked/blockedDamage dans le combat:event de riposte quand le joueur bloque', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO },
      damage: 8,
      attackerId: 'char-1',
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      riposte: { damage: 2, characterHealth: 98, isDodged: false, isBlocked: true, blockedDamage: 2, isParried: false },
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    const playerHit = roomEmits.filter(
      (e) => e.event === COMBAT_EVENT && e.payload.type === 'damage' && e.payload.targetType === 'player',
    );
    expect(playerHit).toHaveLength(1);
    expect(playerHit[0].payload).toMatchObject({
      targetType: 'player',
      targetId: 'char-1',
      amount: 2,
      isDodged: false,
      isBlocked: true,
      blockedDamage: 2,
    });
  });

  it('V4-I : hit paré (riposte) → isParried true, amount 0, aucun death event ; contre-attaque = event séparé joueur → créature', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO, health: 14 },
      damage: 8,
      attackerId: 'char-1',
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      riposte: { damage: 0, characterHealth: 100, isDodged: false, isBlocked: false, blockedDamage: 0, isParried: true },
      counterAttack: { damage: 8, creatureHealth: 14, killed: false, isCritical: false },
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    // Le hit paré (riposte créature → joueur) : amount 0, isParried true.
    const parriedHit = roomEmits.filter(
      (e) => e.event === COMBAT_EVENT && e.payload.type === 'damage' && e.payload.targetType === 'player',
    );
    expect(parriedHit).toHaveLength(1);
    expect(parriedHit[0].payload).toMatchObject({
      targetType: 'player',
      targetId: 'char-1',
      amount: 0,
      isParried: true,
      isDodged: false,
      isBlocked: false,
    });

    // Contre-attaque = event damage SÉPARÉ, source joueur → cible créature.
    const counter = roomEmits.filter(
      (e) =>
        e.event === COMBAT_EVENT &&
        e.payload.type === 'damage' &&
        e.payload.isCounterAttack === true,
    );
    expect(counter).toHaveLength(1);
    expect(counter[0].payload).toMatchObject({
      sourceType: 'player',
      sourceId: 'char-1',
      targetType: 'creature',
      targetId: 'creature-1',
      amount: 8,
      isCounterAttack: true,
      targetDied: false,
    });

    // Aucun death event sur le hit paré entrant (créature vivante).
    expect(roomEmits.some((e) => e.event === COMBAT_EVENT && e.payload.type === 'death')).toBe(false);
  });

  it('V4-I : contre-attaque létale → death event lié à la contre-attaque uniquement', async () => {
    const { gw, roomEmits } = makeGateway({
      success: true,
      dto: { ...CREATURE_DTO, state: 'dead', health: 0 },
      damage: 8,
      attackerId: 'char-1',
      isCritical: false,
      killed: false, // le hit principal n'a PAS tué
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      riposte: { damage: 0, characterHealth: 100, isDodged: false, isBlocked: false, blockedDamage: 0, isParried: true },
      counterAttack: { damage: 98, creatureHealth: 0, killed: true, isCritical: false },
    });
    const client = makeClient();

    await (gw as any).onAttackCreature(client, { targetId: 'creature-1' });

    const deaths = roomEmits.filter((e) => e.event === COMBAT_EVENT && e.payload.type === 'death');
    expect(deaths).toHaveLength(1);
    expect(deaths[0].payload).toMatchObject({
      sourceType: 'player',
      targetType: 'creature',
      targetId: 'creature-1',
      isCounterAttack: true,
      targetDied: true,
    });
  });
});
