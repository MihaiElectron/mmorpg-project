import {
  toCreatureSpawnWorldObject,
  CreatureSpawnWorldObject,
} from './creature-spawn-world-object.adapter';
import { CreatureSpawn } from '../entities/creature-spawn.entity';
import { CreatureTemplate } from '../entities/creature-template.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<CreatureTemplate> = {}): CreatureTemplate {
  return {
    id: 1,
    key: 'turkey',
    name: 'Turkey',
    textureKey: 'turkey',
    baseHealth: 100,
    baseArmor: 5,
    baseAttack: 10,
    patrolRadius: 200,
    speedMin: 1,
    speedMax: 3,
    pauseMinMs: 500,
    pauseMaxMs: 3000,
    aggroRadius: 0,
    fleeThresholdPct: 0,
    ...overrides,
  } as CreatureTemplate;
}

function makeSpawn(overrides: Partial<CreatureSpawn> = {}): CreatureSpawn {
  return {
    id: 'spawn-uuid-1234',
    key: 'turkey_spawn_1',
    template: makeTemplate(),
    spawnX: 600,
    spawnY: 580,
    worldX: null,
    worldY: null,
    mapId: null,
    respawnDelayMs: 20000,
    ...overrides,
  } as CreatureSpawn;
}

// ─── Forme de l'objet retourné ────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — forme du WorldObject', () => {
  it('retourne kind="spawn_point" et category="creature_spawn"', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(wo.kind).toBe('spawn_point');
    expect(wo.category).toBe('creature_spawn');
  });

  it('recopie id depuis le spawn', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ id: 'my-spawn-id' }));
    expect(wo.id).toBe('my-spawn-id');
  });

  it('type = template.key si le template est chargé', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(wo.type).toBe('turkey');
  });

  it('state est toujours "active"', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(wo.state).toBe('active');
  });
});

// ─── Fallback type sans template ──────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — fallback sans template', () => {
  it('type = spawn.key si template est absent (undefined)', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ template: undefined as any }),
    );
    expect(wo.type).toBe('turkey_spawn_1');
  });

  it('type = spawn.key si template est null (relation non chargée)', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ template: null as any }),
    );
    expect(wo.type).toBe('turkey_spawn_1');
  });

  it('metadata.templateKey est null si template absent', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ template: null as any }));
    expect(wo.metadata.templateKey).toBeNull();
  });

  it('metadata.templateName est null si template absent', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ template: null as any }));
    expect(wo.metadata.templateName).toBeNull();
  });

  it('metadata.patrolRadius est null si template absent', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ template: null as any }));
    expect(wo.metadata.patrolRadius).toBeNull();
  });
});

// ─── Position WU ─────────────────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — position WU', () => {
  it('position non-null si worldX/worldY/mapId sont tous présents', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ worldX: 1024, worldY: 2048, mapId: 1 }),
    );
    expect(wo.position).toEqual({ worldX: 1024, worldY: 2048 });
    expect(wo.mapId).toBe(1);
  });

  it('position null si worldX est absent', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ worldX: null, worldY: 2048, mapId: 1 }),
    );
    expect(wo.position).toBeNull();
  });

  it('position null si worldY est absent', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ worldX: 1024, worldY: null, mapId: 1 }),
    );
    expect(wo.position).toBeNull();
  });

  it('position null si mapId est absent', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ worldX: 1024, worldY: 2048, mapId: null }),
    );
    expect(wo.position).toBeNull();
    expect(wo.mapId).toBeNull();
  });

  it('position null si aucune colonne WU n\'est renseignée (legacy only)', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(wo.position).toBeNull();
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — metadata', () => {
  it('metadata.key = spawn.key', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ key: 'goblin_spawn_1' }));
    expect(wo.metadata.key).toBe('goblin_spawn_1');
  });

  it('metadata.templateKey = template.key si template chargé', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ template: makeTemplate({ key: 'goblin' }) }),
    );
    expect(wo.metadata.templateKey).toBe('goblin');
  });

  it('metadata.templateName = template.name si template chargé', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ template: makeTemplate({ name: 'Goblin' }) }),
    );
    expect(wo.metadata.templateName).toBe('Goblin');
  });

  it('metadata.respawnDelayMs recopié depuis spawn', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ respawnDelayMs: 45000 }));
    expect(wo.metadata.respawnDelayMs).toBe(45000);
  });

  it('metadata.patrolRadius recopié depuis template', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ template: makeTemplate({ patrolRadius: 350 }) }),
    );
    expect(wo.metadata.patrolRadius).toBe(350);
  });
});

// ─── Metadata legacy ──────────────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — metadata.legacy', () => {
  it('legacy inclus si spawnX et spawnY sont des entiers finis', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ spawnX: 600, spawnY: 580 }));
    expect(wo.metadata.legacy).toEqual({ spawnX: 600, spawnY: 580 });
  });

  it('legacy présent même quand WU est disponible', () => {
    const wo = toCreatureSpawnWorldObject(
      makeSpawn({ spawnX: 600, spawnY: 580, worldX: 1024, worldY: 2048, mapId: 1 }),
    );
    expect(wo.metadata.legacy).toEqual({ spawnX: 600, spawnY: 580 });
    expect(wo.position).toEqual({ worldX: 1024, worldY: 2048 });
  });

  it('legacy null si spawnX est NaN', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ spawnX: NaN, spawnY: 580 }));
    expect(wo.metadata.legacy).toBeNull();
  });

  it('legacy null si spawnY est Infinity', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ spawnX: 600, spawnY: Infinity }));
    expect(wo.metadata.legacy).toBeNull();
  });
});

// ─── Capabilities ─────────────────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — capabilities', () => {
  it('expose exactement les 6 capacités attendues', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    const expected: CreatureSpawnWorldObject['capabilities'] = [
      'transform',
      'spawn',
      'respawn',
      'patrol',
      'persistence',
      'validation',
    ];
    expect(wo.capabilities).toEqual(expected);
  });

  it('capabilities identiques quel que soit le template', () => {
    const wo1 = toCreatureSpawnWorldObject(makeSpawn());
    const wo2 = toCreatureSpawnWorldObject(
      makeSpawn({ template: makeTemplate({ key: 'goblin' }) }),
    );
    expect(wo1.capabilities).toEqual(wo2.capabilities);
  });

  it('capabilities identiques sans template', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn({ template: null as any }));
    expect(wo.capabilities).toHaveLength(6);
    expect(wo.capabilities).toContain('spawn');
    expect(wo.capabilities).toContain('patrol');
    expect(wo.capabilities).toContain('respawn');
  });

  it('pas de capability "harvestable" — non applicable', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(wo.capabilities).not.toContain('harvestable');
  });

  it('pas de capability "combat" — non applicable au spawn point', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(wo.capabilities).not.toContain('combat');
  });
});

// ─── Immutabilité ─────────────────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — immutabilité', () => {
  it('le WorldObject retourné est frozen', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(Object.isFrozen(wo)).toBe(true);
  });

  it('metadata est frozen', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(Object.isFrozen(wo.metadata)).toBe(true);
  });

  it('capabilities est frozen', () => {
    const wo = toCreatureSpawnWorldObject(makeSpawn());
    expect(Object.isFrozen(wo.capabilities)).toBe(true);
  });
});

// ─── Cas nominaux complets ────────────────────────────────────────────────────

describe('toCreatureSpawnWorldObject — cas nominaux', () => {
  it('spawn avec coordonnées WU complètes', () => {
    const spawn = makeSpawn({
      id: 's-wu',
      key: 'turkey_spawn_1',
      template: makeTemplate({ key: 'turkey', name: 'Turkey', patrolRadius: 200 }),
      spawnX: 600,
      spawnY: 580,
      worldX: 3276,
      worldY: 13312,
      mapId: 1,
      respawnDelayMs: 20000,
    });

    const wo = toCreatureSpawnWorldObject(spawn);

    expect(wo).toMatchObject({
      kind:     'spawn_point',
      category: 'creature_spawn',
      id:       's-wu',
      type:     'turkey',
      mapId:    1,
      position: { worldX: 3276, worldY: 13312 },
      state:    'active',
    });
    expect(wo.metadata.key).toBe('turkey_spawn_1');
    expect(wo.metadata.templateKey).toBe('turkey');
    expect(wo.metadata.templateName).toBe('Turkey');
    expect(wo.metadata.patrolRadius).toBe(200);
    expect(wo.metadata.respawnDelayMs).toBe(20000);
    expect(wo.metadata.legacy).toEqual({ spawnX: 600, spawnY: 580 });
    expect(wo.capabilities).toHaveLength(6);
  });

  it('spawn sans WU (legacy only) et sans template', () => {
    const spawn = makeSpawn({
      id: 's-legacy',
      key: 'admin-goblin-1718000000',
      template: undefined as any,
      spawnX: 800,
      spawnY: 400,
      worldX: null,
      worldY: null,
      mapId: null,
      respawnDelayMs: 30000,
    });

    const wo = toCreatureSpawnWorldObject(spawn);

    expect(wo.type).toBe('admin-goblin-1718000000');
    expect(wo.position).toBeNull();
    expect(wo.mapId).toBeNull();
    expect(wo.metadata.templateKey).toBeNull();
    expect(wo.metadata.templateName).toBeNull();
    expect(wo.metadata.patrolRadius).toBeNull();
    expect(wo.metadata.legacy).toEqual({ spawnX: 800, spawnY: 400 });
    expect(wo.metadata.respawnDelayMs).toBe(30000);
  });
});
