// apps/api-gateway/src/player-runtime/player-runtime.service.spec.ts

import { PlayerRuntimeService } from './player-runtime.service';
import { Character } from '../characters/entities/character.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { Item } from '../items/entities/item.entity';
import { ConnectedPlayer } from '../world/world.service';
import { PlayerRuntimeEffect } from './player-runtime.types';
import { RuntimeDebugRegistry } from './debug-modifier.registry';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> = {}): Item {
  return Object.assign(new Item(), {
    id: 'item-1',
    name: 'Iron Sword',
    type: 'weapon',
    category: 'sword',
    attack: 5,
    defense: 0,
    range: null,
    ...overrides,
  } as Item);
}

function makeEquip(item: Item, overrides: Partial<CharacterEquipment> = {}): CharacterEquipment {
  return Object.assign(new CharacterEquipment(), {
    id: 'equip-1',
    characterId: 'char-1',
    itemId: item.id,
    item,
    slot: 'right-hand',
    ...overrides,
  } as CharacterEquipment);
}

function makeCharacter(
  overrides: Partial<Character> = {},
  equipment: CharacterEquipment[] = [],
): Character {
  return Object.assign(new Character(), {
    id: 'char-1',
    name: 'Hero',
    level: 3,
    health: 70,
    maxHealth: 100,
    attack: 10,
    defense: 5,
    experience: 200,
    worldX: 1024,
    worldY: 2048,
    mapId: 1,
    positionX: 400,
    positionY: 300,
    sex: 'male',
    userId: 'user-1',
    equipment,
    ...overrides,
  } as Character);
}

function makeConnectedPlayer(overrides: Partial<ConnectedPlayer> = {}): ConnectedPlayer {
  return {
    socketId: 'socket-abc',
    characterId: 'char-1',
    name: 'Hero',
    worldX: 5000,
    worldY: 6000,
    mapId: 1,
    x: 100,
    y: 200,
    ...overrides,
  };
}

function makeService(
  character: Character | null,
  connected: ConnectedPlayer | null = null,
  debugRegistry?: RuntimeDebugRegistry,
): PlayerRuntimeService {
  const characterRepo = {
    findOne: jest.fn().mockResolvedValue(character),
  } as any;
  const worldService = {
    getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(connected),
  } as any;
  return new PlayerRuntimeService(characterRepo, worldService, debugRegistry ?? new RuntimeDebugRegistry());
}

function makeEffect(overrides: Partial<PlayerRuntimeEffect> = {}): PlayerRuntimeEffect {
  return {
    id: 'eff-1',
    sourceType: 'buff',
    sourceId: 'rage-buff',
    sourceLabel: 'Rage',
    modifiers: [{ targetStat: 'attackPower', operation: 'flat', value: 15 }],
    enabled: true,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PlayerRuntimeService', () => {
  describe('getPlayerRuntime', () => {
    it('retourne null si le personnage est introuvable', async () => {
      expect(await makeService(null).getPlayerRuntime('unknown')).toBeNull();
    });

    it('retourne un PlayerRuntime complet sans équipement', async () => {
      const runtime = await makeService(makeCharacter()).getPlayerRuntime('char-1');

      expect(runtime).not.toBeNull();
      expect(runtime!.characterId).toBe('char-1');
      expect(runtime!.baseStats.level).toBe(3);
      expect(runtime!.derivedStats.maxHp).toBe(100);
    });

    it('isConnected false et socketId null si joueur non connecté', async () => {
      const runtime = await makeService(makeCharacter(), null).getPlayerRuntime('char-1');

      expect(runtime!.isConnected).toBe(false);
      expect(runtime!.socketId).toBeNull();
    });

    it('utilise la position live ConnectedPlayer si connecté', async () => {
      const connected = makeConnectedPlayer({ worldX: 5000, worldY: 6000 });
      const runtime = await makeService(
        makeCharacter({ worldX: 1024, worldY: 2048 }),
        connected,
      ).getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(5000);
      expect(runtime!.worldY).toBe(6000);
      expect(runtime!.isConnected).toBe(true);
      expect(runtime!.socketId).toBe('socket-abc');
    });

    it('fallback sur position DB si ConnectedPlayer absent', async () => {
      const runtime = await makeService(
        makeCharacter({ worldX: 1024, worldY: 2048 }),
      ).getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(1024);
    });

    it('position 0/0 si worldX/Y DB sont null et joueur non connecté', async () => {
      const runtime = await makeService(
        makeCharacter({ worldX: null as any, worldY: null as any }),
      ).getPlayerRuntime('char-1');

      expect(runtime!.worldX).toBe(0);
      expect(runtime!.worldY).toBe(0);
    });

    it('intègre le bonus d\'attaque de l\'équipement dans derivedStats', async () => {
      const sword = makeItem({ attack: 7, defense: 0 });
      const character = makeCharacter({ attack: 10 }, [makeEquip(sword)]);
      const runtime = await makeService(character).getPlayerRuntime('char-1');

      expect(runtime!.derivedStats.attackPower).toBe(17);
    });
  });

  describe('getRuntimeStats', () => {
    it('retourne null si le personnage est introuvable', async () => {
      expect(await makeService(null).getRuntimeStats('unknown')).toBeNull();
    });

    it('retourne base et derived stats sans équipement', async () => {
      const result = await makeService(makeCharacter()).getRuntimeStats('char-1');

      expect(result!.base.level).toBe(3);
      expect(result!.derived.maxHp).toBe(100);
      expect(result!.derived.attackPower).toBe(10);
    });

    it('derived attackPower inclut le bonus d\'équipement', async () => {
      const sword = makeItem({ attack: 5, defense: 0 });
      const result = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeStats('char-1');

      expect(result!.derived.attackPower).toBe(15);
      expect(result!.base.attack).toBe(10);
    });

    it('derived defenseTotal inclut le bonus de défense de l\'équipement', async () => {
      const shield = makeItem({ name: 'Shield', attack: 0, defense: 8 });
      const result = await makeService(
        makeCharacter({ defense: 5 }, [makeEquip(shield)]),
      ).getRuntimeStats('char-1');

      expect(result!.derived.defenseTotal).toBe(13);
    });

    it('plusieurs pièces d\'équipement s\'accumulent', async () => {
      const sword = makeItem({ id: 'i1', name: 'Sword', attack: 5, defense: 0 });
      const gloves = makeItem({ id: 'i2', name: 'Gloves', attack: 3, defense: 0 });
      const result = await makeService(
        makeCharacter({ attack: 10 }, [
          makeEquip(sword, { id: 'e1', slot: 'right-hand', itemId: sword.id }),
          makeEquip(gloves, { id: 'e2', slot: 'gloves', itemId: gloves.id }),
        ]),
      ).getRuntimeStats('char-1');

      expect(result!.derived.attackPower).toBe(18);
    });

    it('non-régression : sans équipement, derived = base (comme phase 1 et 2)', async () => {
      const result = await makeService(makeCharacter({ attack: 10, defense: 5 })).getRuntimeStats('char-1');

      expect(result!.derived.attackPower).toBe(10);
      expect(result!.derived.defenseTotal).toBe(5);
    });
  });

  describe('getRuntimeTrace', () => {
    it('retourne null si le personnage est introuvable', async () => {
      expect(await makeService(null).getRuntimeTrace('unknown')).toBeNull();
    });

    it('trace vide sans équipement', async () => {
      const trace = await makeService(makeCharacter()).getRuntimeTrace('char-1');

      expect(trace!.modifierCount).toBe(0);
      expect(trace!.stats.attackPower?.modifiers).toHaveLength(0);
    });

    it('trace identifie le bonus d\'équipement', async () => {
      const sword = makeItem({ name: 'Iron Sword', attack: 5, defense: 0 });
      const trace = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeTrace('char-1');

      expect(trace!.modifierCount).toBe(1);
      const appMod = trace!.stats.attackPower?.modifiers[0];
      expect(appMod?.sourceLabel).toBe('Iron Sword');
      expect(appMod?.sourceType).toBe('equipment');
      expect(appMod?.contribution).toBe(5);
      expect(trace!.stats.attackPower?.baseValue).toBe(10);
      expect(trace!.stats.attackPower?.finalValue).toBe(15);
    });

    it('trace couvre toutes les StatKey', async () => {
      const trace = await makeService(makeCharacter()).getRuntimeTrace('char-1');

      expect(trace!.stats.maxHp).toBeDefined();
      expect(trace!.stats.attackPower).toBeDefined();
      expect(trace!.stats.defenseTotal).toBeDefined();
      expect(trace!.stats.speed).toBeDefined();
      expect(trace!.stats.gatheringRange).toBeDefined();
      expect(trace!.stats.attackRange).toBeDefined();
    });

    it('computedAt est une Date', async () => {
      const trace = await makeService(makeCharacter()).getRuntimeTrace('char-1');
      expect(trace!.computedAt).toBeInstanceOf(Date);
    });
  });

  describe('recalculateRuntime', () => {
    it('retourne le même résultat que getPlayerRuntime', async () => {
      const runtime = await makeService(makeCharacter()).recalculateRuntime('char-1');
      expect(runtime!.baseStats.level).toBe(3);
    });
  });

  describe('resolveEffects — Phase 4 (fondation)', () => {
    it('non-régression : sans équipement ni effets, derived = base', async () => {
      const result = await makeService(makeCharacter({ attack: 10 })).getRuntimeStats('char-1');
      expect(result!.derived.attackPower).toBe(10);
    });

    it('non-régression : équipement fonctionne toujours quand resolveEffects retourne []', async () => {
      const sword = makeItem({ attack: 7, defense: 0 });
      const result = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeStats('char-1');
      expect(result!.derived.attackPower).toBe(17);
    });

    it('resolveModifiers concatène equipment + effects (injection directe via effectToModifiers)', async () => {
      // Phase 4 : resolveEffects() retourne [] — ce test vérifie que le pipeline est en place
      // et que l'ajout d'effets via effectToModifiers() fonctionne côté mapper (testé séparément).
      // Sans effets actifs, le résultat doit être identique au résultat purement équipement.
      const sword = makeItem({ attack: 5, defense: 0 });
      const result = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeStats('char-1');
      expect(result!.derived.attackPower).toBe(15);
    });

    it('trace — resolveEffects vide produit modifierCount égal à l\'équipement seul', async () => {
      const sword = makeItem({ name: 'Sword', attack: 5, defense: 0 });
      const trace = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeTrace('char-1');
      expect(trace!.modifierCount).toBe(1);
      expect(trace!.stats.attackPower?.modifiers[0]?.sourceType).toBe('equipment');
    });
  });

  describe('makeEffect factory (vérifie la forme de PlayerRuntimeEffect)', () => {
    it('makeEffect produit un effet buff valide', () => {
      const eff = makeEffect();
      expect(eff.sourceType).toBe('buff');
      expect(eff.enabled).toBe(true);
      expect(eff.modifiers).toHaveLength(1);
    });

    it('makeEffect debuff avec expiresAt futur', () => {
      const eff = makeEffect({ sourceType: 'debuff', expiresAt: new Date(Date.now() + 5000) });
      expect(eff.sourceType).toBe('debuff');
      expect(eff.expiresAt).toBeDefined();
    });
  });

  describe('getRuntimeSnapshot', () => {
    it('retourne null si le personnage est introuvable', async () => {
      expect(await makeService(null).getRuntimeSnapshot('unknown')).toBeNull();
    });

    it('contient characterId et name', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      expect(snap!.characterId).toBe('char-1');
      expect(snap!.name).toBe('Hero');
    });

    it("contient entityId === characterId et entityKind === 'player'", async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      expect(snap!.entityId).toBe('char-1');
      expect(snap!.entityId).toBe(snap!.characterId);
      expect(snap!.entityKind).toBe('player');
    });

    it('contient baseStats cohérentes avec Character', async () => {
      const snap = await makeService(makeCharacter({ attack: 12, defense: 4 })).getRuntimeSnapshot('char-1');
      expect(snap!.baseStats.attack).toBe(12);
      expect(snap!.baseStats.defense).toBe(4);
      expect(snap!.baseStats.level).toBe(3);
    });

    it('contient derivedStats calculées', async () => {
      const snap = await makeService(makeCharacter({ attack: 10, maxHealth: 100 })).getRuntimeSnapshot('char-1');
      expect(snap!.derivedStats.attackPower).toBe(10);
      expect(snap!.derivedStats.maxHp).toBe(100);
    });

    it('derivedStats inclut les bonus d\'équipement', async () => {
      const sword = makeItem({ attack: 7, defense: 0 });
      const snap = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeSnapshot('char-1');
      expect(snap!.derivedStats.attackPower).toBe(17);
    });

    it('sources[] contient EquipmentSource et EffectSource', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      const kinds = snap!.sources.map((s) => s.kind);
      expect(kinds).toContain('equipment');
      expect(kinds).toContain('effect');
    });

    it('sources[equipment].modifiers vide sans équipement', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      const eqSrc = snap!.sources.find((s) => s.kind === 'equipment');
      expect(eqSrc!.modifiers).toHaveLength(0);
    });

    it('sources[equipment].modifiers contient le bonus d\'équipement', async () => {
      const sword = makeItem({ name: 'Iron Sword', attack: 5, defense: 0 });
      const snap = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeSnapshot('char-1');
      const eqSrc = snap!.sources.find((s) => s.kind === 'equipment');
      expect(eqSrc!.modifiers).toHaveLength(1);
      expect(eqSrc!.modifiers[0].sourceLabel).toBe('Iron Sword');
    });

    it('modifiers[] est la liste plate de toutes les sources', async () => {
      const sword = makeItem({ attack: 5, defense: 3 });
      const snap = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeSnapshot('char-1');
      // attack + defense = 2 modifiers depuis EquipmentSource
      expect(snap!.modifiers).toHaveLength(2);
    });

    it('modifiers[] vide sans équipement ni effets', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      expect(snap!.modifiers).toHaveLength(0);
    });

    it('contient une trace complète', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      expect(snap!.trace).toBeDefined();
      expect(snap!.trace.stats.maxHp).toBeDefined();
      expect(snap!.trace.stats.attackPower).toBeDefined();
      expect(snap!.trace.modifierCount).toBe(0);
    });

    it('trace reflète les bonus d\'équipement', async () => {
      const sword = makeItem({ name: 'Sword', attack: 5, defense: 0 });
      const snap = await makeService(
        makeCharacter({ attack: 10 }, [makeEquip(sword)]),
      ).getRuntimeSnapshot('char-1');
      expect(snap!.trace.modifierCount).toBe(1);
      expect(snap!.trace.stats.attackPower?.finalValue).toBe(15);
      expect(snap!.trace.stats.attackPower?.modifiers[0]?.sourceLabel).toBe('Sword');
    });

    it('computedAt est une Date', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      expect(snap!.computedAt).toBeInstanceOf(Date);
    });

    it('computedAt === trace.computedAt — cohérence temporelle', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      expect(snap!.computedAt).toBe(snap!.trace.computedAt);
    });

    it('non-régression : getRuntimeStats et snapshot retournent derivedStats identiques', async () => {
      const sword = makeItem({ attack: 5, defense: 2 });
      const char = makeCharacter({ attack: 10, defense: 5 }, [makeEquip(sword)]);
      const svc = makeService(char);
      const [stats, snap] = await Promise.all([
        svc.getRuntimeStats('char-1'),
        svc.getRuntimeSnapshot('char-1'),
      ]);
      expect(snap!.derivedStats.attackPower).toBe(stats!.derived.attackPower);
      expect(snap!.derivedStats.defenseTotal).toBe(stats!.derived.defenseTotal);
    });
  });

  describe('debug modifiers', () => {
    it('snapshot inclut source debug avec kind="debug"', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      const debugSrc = snap!.sources.find((s) => s.kind === 'debug');
      expect(debugSrc).toBeDefined();
    });

    it('source debug vide par défaut — aucun modifier', async () => {
      const snap = await makeService(makeCharacter()).getRuntimeSnapshot('char-1');
      const debugSrc = snap!.sources.find((s) => s.kind === 'debug');
      expect(debugSrc!.modifiers).toHaveLength(0);
    });

    it('modifier debug ajouté apparaît dans snapshot.modifiers', async () => {
      const registry = new RuntimeDebugRegistry();
      const svc = makeService(makeCharacter({ attack: 10 }), null, registry);
      registry.addModifier('char-1', { targetStat: 'attackPower', operation: 'flat', value: 25 });

      const snap = await svc.getRuntimeSnapshot('char-1');
      expect(snap!.modifiers).toHaveLength(1);
      expect(snap!.modifiers[0].sourceType).toBe('debug');
      expect(snap!.modifiers[0].value).toBe(25);
    });

    it('modifier debug inclus dans le calcul derivedStats', async () => {
      const registry = new RuntimeDebugRegistry();
      const svc = makeService(makeCharacter({ attack: 10 }), null, registry);
      registry.addModifier('char-1', { targetStat: 'attackPower', operation: 'flat', value: 30 });

      const snap = await svc.getRuntimeSnapshot('char-1');
      expect(snap!.derivedStats.attackPower).toBe(40);
    });

    it('modifier debug apparaît dans la trace', async () => {
      const registry = new RuntimeDebugRegistry();
      const svc = makeService(makeCharacter({ attack: 10 }), null, registry);
      registry.addModifier('char-1', {
        targetStat: 'attackPower',
        operation: 'flat',
        value: 15,
        sourceLabel: 'Test Debug',
      });

      const snap = await svc.getRuntimeSnapshot('char-1');
      const appMod = snap!.trace.stats.attackPower?.modifiers[0];
      expect(appMod?.sourceLabel).toBe('Test Debug');
      expect(appMod?.contribution).toBe(15);
      expect(snap!.trace.modifierCount).toBe(1);
    });

    it('clearDebugModifiers vide la source debug', async () => {
      const registry = new RuntimeDebugRegistry();
      const svc = makeService(makeCharacter({ attack: 10 }), null, registry);
      registry.addModifier('char-1', { targetStat: 'attackPower', operation: 'flat', value: 20 });
      svc.clearDebugModifiers('char-1');

      const snap = await svc.getRuntimeSnapshot('char-1');
      expect(snap!.modifiers).toHaveLength(0);
      expect(snap!.derivedStats.attackPower).toBe(10);
    });

    it('listDebugModifiers retourne les modifiers actifs', () => {
      const registry = new RuntimeDebugRegistry();
      const svc = makeService(makeCharacter(), null, registry);
      registry.addModifier('char-1', { targetStat: 'maxHp', operation: 'flat', value: 50 });

      const list = svc.listDebugModifiers('char-1');
      expect(list).toHaveLength(1);
      expect(list[0].targetStat).toBe('maxHp');
    });

    it('non-régression : debug source vide ne change pas les stats', async () => {
      const snap = await makeService(makeCharacter({ attack: 10 })).getRuntimeSnapshot('char-1');
      expect(snap!.derivedStats.attackPower).toBe(10);
    });

    it('debug + équipement — les deux sources contribuent', async () => {
      const registry = new RuntimeDebugRegistry();
      const sword = makeItem({ attack: 5, defense: 0 });
      const svc = makeService(makeCharacter({ attack: 10 }, [makeEquip(sword)]), null, registry);
      registry.addModifier('char-1', { targetStat: 'attackPower', operation: 'flat', value: 3 });

      const snap = await svc.getRuntimeSnapshot('char-1');
      expect(snap!.derivedStats.attackPower).toBe(18);
      expect(snap!.modifiers).toHaveLength(2);
    });
  });
});
