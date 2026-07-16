import { SkillsGateway } from './skills.gateway';
import { SkillCastService } from './skill-cast.service';
import { WsAuthService } from '../common/ws-auth.service';
import { WorldItemService } from '../world-items/world-item.service';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { DataSource } from 'typeorm';
import type { WorldSocket } from '../types/world-socket';
import { COMBAT_EVENT } from '../creatures/combat-event';

type Emitted = { room: string; event: string; payload: any };

function makeGateway(castResult: any) {
  const roomEmits: Emitted[] = [];
  const skillCast = {
    castCreatureSkill: jest.fn().mockResolvedValue(castResult),
    castSelfSkill: jest.fn(),
  } as unknown as SkillCastService;

  const gw = new SkillsGateway(
    skillCast,
    {} as unknown as WsAuthService,
    {} as unknown as WorldItemService,
    {} as unknown as ItemMaterializationService,
    {} as unknown as DataSource,
  );
  (gw as any).server = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => roomEmits.push({ room, event, payload }),
    }),
  };
  return { gw, roomEmits };
}

function makeClient(): WorldSocket & { emit: jest.Mock } {
  return {
    id: 'socket-1',
    data: { player: { characterId: 'char-1', worldX: 100, worldY: 200, mapId: 1 } },
    emit: jest.fn(),
  } as unknown as WorldSocket & { emit: jest.Mock };
}

const CREATURE_DTO = { id: 'creature-1', name: 'Turkey', worldX: 6080, worldY: 12480, mapId: 1, state: 'alive', health: 100 };

function skillResult(over: Record<string, unknown> = {}) {
  return {
    success: true,
    skillKey: 'fireball',
    skillName: 'Boule de feu',
    dto: { ...CREATURE_DTO },
    damage: 0, // paré
    attackerId: 'char-1',
    isCritical: false,
    killed: false,
    isDodged: false,
    isBlocked: false,
    blockedDamage: 0,
    isParried: true,
    cooldownMs: 1000,
    ...over,
  };
}

const CREATURE_ID = '11111111-1111-4111-8111-111111111111';
const PAYLOAD = { skillKey: 'fireball', targetType: 'creature', targetId: CREATURE_ID };

describe('SkillsGateway — V6-B7 contre-attaque créature sur skill paré', () => {
  it('creatureCounterAttack → character_damaged + combat:event creature→player (isCounterAttack)', async () => {
    const { gw, roomEmits } = makeGateway(
      skillResult({
        creatureCounterAttack: {
          amount: 10, currentHealth: 90, maxHealth: 100, killed: false,
          isCritical: false, isDodged: false, isBlocked: false, isParried: false,
          blockedDamage: 0, isCounterAttack: true,
        },
      }),
    );
    const client = makeClient();

    await (gw as any).onSkillCast(client, PAYLOAD);

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
      sourceId: CREATURE_ID,
      targetType: 'player',
      targetId: 'char-1',
      amount: 10,
      text: '-10',
      isCounterAttack: true,
      isParried: false,
    });
    expect(roomEmits.some((e) => e.event === COMBAT_EVENT && e.payload.type === 'death')).toBe(false);
  });

  it('creatureCounterAttack létale → un seul death event targetType player', async () => {
    const { gw, roomEmits } = makeGateway(
      skillResult({
        creatureCounterAttack: {
          amount: 100, currentHealth: 0, maxHealth: 100, killed: true,
          isCritical: false, isDodged: false, isBlocked: false, isParried: false,
          blockedDamage: 0, isCounterAttack: true,
        },
      }),
    );
    const client = makeClient();

    await (gw as any).onSkillCast(client, PAYLOAD);

    const deaths = roomEmits.filter(
      (e) => e.event === COMBAT_EVENT && e.payload.type === 'death' && e.payload.targetType === 'player',
    );
    expect(deaths).toHaveLength(1);
    expect(deaths[0].payload).toMatchObject({
      sourceType: 'creature',
      sourceId: CREATURE_ID,
      targetType: 'player',
      targetId: 'char-1',
      isCounterAttack: true,
      targetDied: true,
    });
  });

  it('sans creatureCounterAttack → aucun combat:event targetType player isCounterAttack', async () => {
    const { gw, roomEmits } = makeGateway(skillResult());
    const client = makeClient();

    await (gw as any).onSkillCast(client, PAYLOAD);

    expect(
      roomEmits.some(
        (e) => e.event === COMBAT_EVENT && e.payload.targetType === 'player' && e.payload.isCounterAttack === true,
      ),
    ).toBe(false);
  });
});
