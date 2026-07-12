/** Stats dérivées après application des RuntimeModifiers. Absentes si non calculées. */
export type CreatureRuntimeStats = {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  speed: number;
  attackRange: number;
};

/**
 * Bloc d'inspection combat runtime d'UNE créature vivante (Studio DevTools,
 * lecture seule). Sert l'endpoint admin `GET /admin/creatures/:id/runtime-combat`.
 * Ne transite JAMAIS par le broadcast joueur (`CreatureDto`/`creature_update`).
 * Aucune valeur n'est recalculée côté client : le serveur est la source.
 */
export type CreatureRuntimeCombatDto = {
  // A. Identité / état
  id: string;
  templateKey: string;
  name: string;
  state: 'alive' | 'fighting' | 'escaping' | 'dead';
  /** Cible d'aggro courante (characterId) ou null si aucune. Live (patrolStates). */
  currentTargetId: string | null;
  worldX: number | null;
  worldY: number | null;
  mapId: number | null;
  // B. Survie
  currentHealth: number;
  maxHealth: number;
  /** Défense effective (runtime, inclut les RuntimeModifiers) ou armure de base. */
  defenseTotal: number;
  baseArmor: number;
  alive: boolean;
  respawnAt: Date | null;
  // C. Combat offensif
  baseAttack: number;
  /** Attaque effective runtime (RuntimeModifiers inclus). */
  attackPower: number;
  /** Portée réellement utilisée par la créature = MELEE_RANGE_WU (constante). */
  attackRangeWU: number;
  autoAttackCooldownMs: number;
  /** Timestamp epoch ms de la dernière auto-attaque, ou null si jamais frappé. */
  lastAutoAttackAt: number | null;
  /** Timestamp epoch ms du prochain hit possible, ou null si jamais frappé. */
  nextAutoAttackAt: number | null;
  // D. Combat défensif — les créatures n'ont pas encore ces stats runtime.
  canDodge: boolean;
  canBlock: boolean;
  canParry: boolean;
  // E. Loot / XP (facts du template ; le loot restant n'est pas tracké par instance)
  killCharacterXpReward: number;
  hasLootPool: boolean;
  lootPoolSize: number;
};

export type CreatureDto = {
  id: string;
  templateKey: string;
  type: string;
  /** Clé de texture Phaser explicite (= template.textureKey). Redondant avec type en Phase 1,
   *  utile quand type et textureKey divergeront. */
  textureKey: string;
  name: string;
  /** Coordonnées WU — source de vérité. */
  worldX: number | null;
  worldY: number | null;
  mapId: number | null;
  health: number;
  /** Valeur brute du template — conservée pour compatibilité. Préférer runtimeStats.maxHp si présent. */
  maxHealth: number;
  /** Valeur brute du template — conservée pour compatibilité. Préférer runtimeStats.defenseTotal si présent. */
  armor: number;
  /** Valeur brute du template — conservée pour compatibilité. Préférer runtimeStats.attackPower si présent. */
  attack: number;
  state: 'alive' | 'fighting' | 'escaping' | 'dead';
  respawnAt: Date | null;
  /** Stats effectives après RuntimeModifiers. Présentes sur tous les événements serveur runtime. */
  runtimeStats?: CreatureRuntimeStats;
};
