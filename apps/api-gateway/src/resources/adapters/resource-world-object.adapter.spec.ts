import { toResourceWorldObject, ResourceWorldObject } from './resource-world-object.adapter';
import { Resource } from '../entities/resource.entity';
import { ResourceTemplate } from '../entities/resource-template.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'test-uuid-1234',
    type: 'dead_tree',
    x: 400,
    y: 300,
    worldX: null,
    worldY: null,
    mapId: null,
    state: 'alive',
    remainingLoots: 3,
    respawnAt: null,
    ...overrides,
  } as Resource;
}

function makeTemplate(overrides: Partial<ResourceTemplate> = {}): ResourceTemplate {
  return {
    id: 'tpl-1',
    type: 'dead_tree',
    textureKey: 'dead_tree',
    defaultRemainingLoots: 5,
    respawnDelayMs: 60_000,
    lootPool: null,
    skillKey: null,
    gatheringXpReward: 0,
    ...overrides,
  } as ResourceTemplate;
}

// ─── Forme de l'objet retourné ────────────────────────────────────────────────

describe('toResourceWorldObject — forme du WorldObject', () => {
  it('retourne kind="entity" et category="resource"', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.kind).toBe('entity');
    expect(wo.category).toBe('resource');
  });

  it('recopie id et type depuis la Resource', () => {
    const wo = toResourceWorldObject(makeResource({ id: 'abc-123', type: 'ore' }));
    expect(wo.id).toBe('abc-123');
    expect(wo.type).toBe('ore');
  });

  it('recopie state et remainingLoots', () => {
    const wo = toResourceWorldObject(makeResource({ state: 'dead', remainingLoots: 0 }));
    expect(wo.state).toBe('dead');
    expect(wo.remainingLoots).toBe(0);
  });
});

// ─── Position WU ─────────────────────────────────────────────────────────────

describe('toResourceWorldObject — position WU', () => {
  it('position non-null si worldX/worldY/mapId sont tous présents', () => {
    const wo = toResourceWorldObject(
      makeResource({ worldX: 1024, worldY: 2048, mapId: 1 }),
    );
    expect(wo.position).toEqual({ worldX: 1024, worldY: 2048 });
    expect(wo.mapId).toBe(1);
  });

  it('position null si worldX est absent', () => {
    const wo = toResourceWorldObject(
      makeResource({ worldX: null, worldY: 2048, mapId: 1 }),
    );
    expect(wo.position).toBeNull();
  });

  it('position null si worldY est absent', () => {
    const wo = toResourceWorldObject(
      makeResource({ worldX: 1024, worldY: null, mapId: 1 }),
    );
    expect(wo.position).toBeNull();
  });

  it('position null si mapId est absent', () => {
    const wo = toResourceWorldObject(
      makeResource({ worldX: 1024, worldY: 2048, mapId: null }),
    );
    expect(wo.position).toBeNull();
    expect(wo.mapId).toBeNull();
  });

  it('position null si aucune colonne WU n\'est renseignée (legacy only)', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.position).toBeNull();
  });
});


// ─── Capabilities ─────────────────────────────────────────────────────────────

describe('toResourceWorldObject — capabilities', () => {
  it('expose exactement les 5 capacités attendues', () => {
    const wo = toResourceWorldObject(makeResource());
    const expected: ResourceWorldObject['capabilities'] = [
      'transform',
      'harvestable',
      'loot',
      'persistence',
      'validation',
    ];
    expect(wo.capabilities).toEqual(expected);
  });

  it('capabilities identiques pour une resource alive avec WU', () => {
    const wo = toResourceWorldObject(
      makeResource({ worldX: 1024, worldY: 2048, mapId: 1, state: 'alive' }),
    );
    expect(wo.capabilities).toContain('transform');
    expect(wo.capabilities).toContain('harvestable');
    expect(wo.capabilities).toContain('loot');
    expect(wo.capabilities).toContain('persistence');
    expect(wo.capabilities).toContain('validation');
  });

  it('capabilities identiques pour une resource dead', () => {
    const wo = toResourceWorldObject(
      makeResource({ state: 'dead', remainingLoots: 0 }),
    );
    expect(wo.capabilities).toHaveLength(5);
    expect(wo.capabilities).toContain('harvestable');
  });

  it('pas de capability "respawn" — non implémentée', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.capabilities).not.toContain('respawn');
  });

  it('pas de capability "node_member" — non implémentée', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.capabilities).not.toContain('node_member');
  });
});

// ─── Metadata respawnDelayMs ──────────────────────────────────────────────────

describe('toResourceWorldObject — metadata.respawnDelayMs', () => {
  it('présent si template fourni avec respawnDelayMs > 0', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ respawnDelayMs: 60_000 }));
    expect(wo.metadata.respawnDelayMs).toBe(60_000);
  });

  it('null si template non fourni', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.metadata.respawnDelayMs).toBeNull();
  });

  it('null si template explicitement null', () => {
    const wo = toResourceWorldObject(makeResource(), null);
    expect(wo.metadata.respawnDelayMs).toBeNull();
  });

  it('reflète respawnDelayMs du template passé', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ respawnDelayMs: 45_000 }));
    expect(wo.metadata.respawnDelayMs).toBe(45_000);
  });
});

// ─── Metadata defaultRemainingLoots ──────────────────────────────────────────

describe('toResourceWorldObject — metadata.defaultRemainingLoots', () => {
  it('présent si template fourni', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ defaultRemainingLoots: 9999 }));
    expect(wo.metadata.defaultRemainingLoots).toBe(9999);
  });

  it('null si template absent', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.metadata.defaultRemainingLoots).toBeNull();
  });

  it('null si template explicitement null', () => {
    const wo = toResourceWorldObject(makeResource(), null);
    expect(wo.metadata.defaultRemainingLoots).toBeNull();
  });

  it('reflète la valeur du template passé', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ defaultRemainingLoots: 5 }));
    expect(wo.metadata.defaultRemainingLoots).toBe(5);
  });
});

// ─── Metadata lootPool ───────────────────────────────────────────────────────

describe('toResourceWorldObject — metadata.lootPool', () => {
  it('lootPoolCount et lootPoolItems présents si template avec pool valide', () => {
    const pool = [{ itemId: 'wooden_stick', minQty: 1, maxQty: 1, probability: 1 }];
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ lootPool: pool }));
    expect(wo.metadata.lootPoolCount).toBe(1);
    expect(wo.metadata.lootPoolItems).toEqual(['wooden_stick']);
  });

  it('null si template absent', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.metadata.lootPoolCount).toBeNull();
    expect(wo.metadata.lootPoolItems).toBeNull();
  });

  it('null si template explicitement null', () => {
    const wo = toResourceWorldObject(makeResource(), null);
    expect(wo.metadata.lootPoolCount).toBeNull();
    expect(wo.metadata.lootPoolItems).toBeNull();
  });

  it('lootPoolCount 0 si pool tableau vide', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ lootPool: [] }));
    expect(wo.metadata.lootPoolCount).toBe(0);
    expect(wo.metadata.lootPoolItems).toEqual([]);
  });

  it('entrées avec itemId vide sont ignorées dans le décompte', () => {
    const pool = [
      { itemId: '', minQty: 1, maxQty: 1, probability: 1 },
      { itemId: 'iron_ore', minQty: 1, maxQty: 1, probability: 1 },
    ];
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ lootPool: pool }));
    expect(wo.metadata.lootPoolCount).toBe(1);
    expect(wo.metadata.lootPoolItems).toEqual(['iron_ore']);
  });

  it('pool non-tableau (corromptu) → null', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ lootPool: 'bad' as any }));
    expect(wo.metadata.lootPoolCount).toBeNull();
    expect(wo.metadata.lootPoolItems).toBeNull();
  });
});

// ─── Immutabilité ─────────────────────────────────────────────────────────────

describe('toResourceWorldObject — metadata.respawnAt', () => {
  it('null si resource.respawnAt est null', () => {
    const wo = toResourceWorldObject(makeResource({ respawnAt: null }));
    expect(wo.metadata.respawnAt).toBeNull();
  });

  it('reflète resource.respawnAt si une date est présente', () => {
    const date = new Date('2026-06-24T10:00:00.000Z');
    const wo = toResourceWorldObject(makeResource({ respawnAt: date }));
    expect(wo.metadata.respawnAt).toBe(date);
  });
});

describe('toResourceWorldObject — immutabilité', () => {
  it('le WorldObject retourné est frozen', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(Object.isFrozen(wo)).toBe(true);
  });

  it('metadata est frozen', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(Object.isFrozen(wo.metadata)).toBe(true);
  });

  it('capabilities est frozen', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(Object.isFrozen(wo.capabilities)).toBe(true);
  });
});

// ─── Cas nominaux complets ────────────────────────────────────────────────────

describe('toResourceWorldObject — cas nominaux', () => {
  it('resource alive avec coordonnées WU complètes', () => {
    const resource = makeResource({
      id: 'r-alive-wu',
      type: 'dead_tree',
      worldX: 512,
      worldY: 1024,
      mapId: 1,
      state: 'alive',
      remainingLoots: 3,
    });

    const wo = toResourceWorldObject(resource);

    expect(wo).toMatchObject({
      kind: 'entity',
      category: 'resource',
      id: 'r-alive-wu',
      type: 'dead_tree',
      mapId: 1,
      position: { worldX: 512, worldY: 1024 },
      state: 'alive',
      remainingLoots: 3,
    });
    expect(wo.capabilities).toHaveLength(5);
  });

  it('resource dead sans coordonnées WU', () => {
    const resource = makeResource({
      id: 'r-dead-no-wu',
      type: 'ore',
      worldX: null,
      worldY: null,
      mapId: null,
      state: 'dead',
      remainingLoots: 0,
    });

    const wo = toResourceWorldObject(resource);

    expect(wo.state).toBe('dead');
    expect(wo.remainingLoots).toBe(0);
    expect(wo.position).toBeNull();
    expect(wo.mapId).toBeNull();
  });
});

// ─── Metadata skillKey ────────────────────────────────────────────────────────

describe('toResourceWorldObject — metadata.skillKey', () => {
  it('null si template absent', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.metadata.skillKey).toBeNull();
  });

  it('null si template explicitement null', () => {
    const wo = toResourceWorldObject(makeResource(), null);
    expect(wo.metadata.skillKey).toBeNull();
  });

  it('null si template.skillKey est null', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ skillKey: null }));
    expect(wo.metadata.skillKey).toBeNull();
  });

  it('reflète le skillKey du template', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ skillKey: 'woodcutting' }));
    expect(wo.metadata.skillKey).toBe('woodcutting');
  });
});

// ─── Metadata gatheringXpReward ───────────────────────────────────────────────

describe('toResourceWorldObject — metadata.gatheringXpReward', () => {
  it('null si template absent', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.metadata.gatheringXpReward).toBeNull();
  });

  it('null si template explicitement null', () => {
    const wo = toResourceWorldObject(makeResource(), null);
    expect(wo.metadata.gatheringXpReward).toBeNull();
  });

  it('0 si template.gatheringXpReward vaut 0', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ gatheringXpReward: 0 }));
    expect(wo.metadata.gatheringXpReward).toBe(0);
  });

  it('reflète la valeur du template', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ gatheringXpReward: 5 }));
    expect(wo.metadata.gatheringXpReward).toBe(5);
  });
});

// ─── Metadata textureKey ─────────────────────────────────────────────────────

describe('toResourceWorldObject — metadata.textureKey', () => {
  it('null si template absent', () => {
    const wo = toResourceWorldObject(makeResource());
    expect(wo.metadata.textureKey).toBeNull();
  });

  it('null si template explicitement null', () => {
    const wo = toResourceWorldObject(makeResource(), null);
    expect(wo.metadata.textureKey).toBeNull();
  });

  it('reflète la valeur du template', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate({ textureKey: 'fire_camp' }));
    expect(wo.metadata.textureKey).toBe('fire_camp');
  });

  it('dead_tree par défaut quand textureKey est la valeur par défaut', () => {
    const wo = toResourceWorldObject(makeResource(), makeTemplate());
    expect(wo.metadata.textureKey).toBe('dead_tree');
  });
});
