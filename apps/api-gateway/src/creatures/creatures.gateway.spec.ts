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
      riposte: { damage: 3, characterHealth: 97 },
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
    });
  });
});
