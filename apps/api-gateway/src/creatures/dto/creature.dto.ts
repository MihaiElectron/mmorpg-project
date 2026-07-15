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
/**
 * Capacité damage d'une créature avec son état de cooldown LIVE (V5-C1, lecture
 * seule). Croise la config (getDamageAbilities) et le runtime
 * (`creatureSkillCooldowns`). Aucune donnée recalculée côté client.
 */
export type CreatureRuntimeAbilityDto = {
  skillKey: string;
  skillName: string;
  /** V5-D1-A : `damage` ou `heal` (le heal n'est pas encore casté). */
  effectType: string;
  rangeWU: number;
  cooldownMs: number;
  /** Epoch ms du dernier cast de ce skill par cette créature, ou null si jamais. */
  lastCastAt: number | null;
  /** Epoch ms du prochain cast possible, ou null si jamais casté. */
  nextCastAt: number | null;
  /** Temps de cooldown restant en ms (0 si prêt / jamais casté). */
  cooldownRemainingMs: number;
  /** true si la capacité est encore en cooldown. */
  onCooldown: boolean;
};

/**
 * Stats primaires créature (V6-B1) — informatif seulement. Aucune dérivation ni
 * effet combat aujourd'hui (prévu V6-B2). Valeurs brutes du template.
 */
export type CreaturePrimaryStatsDto = {
  strength: number;
  vitality: number;
  endurance: number;
  agility: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  spirit: number;
  willpower: number;
  charisma: number;
};

/**
 * Stats secondaires CALCULÉES depuis les primaires (V6-B2) — informatif SEULEMENT.
 *
 * Ces valeurs sont dérivées côté serveur (`resolveCombatStats`) mais NE sont PAS
 * actives en défense : la créature n'esquive/bloque/pare toujours pas
 * (`canDodge`/`canBlock`/`canParry` restent `false`). `maxHealthDerived` est le PV
 * max théorique dérivé de la vitalité — il ne remplace PAS `maxHealth` (PV max
 * actif = `baseHealth`). Bloc séparé pour ne jamais suggérer une activation combat.
 */
export type CreatureDerivedSecondaryStatsDto = {
  /** Chance d'esquive dérivée (%). Non active (canDodge false). */
  dodgeChance: number;
  /** Chance de blocage dérivée (%). Non active (canBlock false). */
  blockChance: number;
  /** Réduction d'un blocage réussi (%). Non active. */
  blockReductionPercent: number;
  /** Chance de parade dérivée (%). Non active (canParry false). */
  parryChance: number;
  /** Puissance de contre-attaque dérivée. Non active. */
  counterAttackPower: number;
  /** PV max dérivé (baseHealth + vitality × coeff) — informatif, PAS le PV max actif. */
  maxHealthDerived: number;
};

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
  // D-bis. Stats de combat avancées (V5-D2-A, lecture seule). healingPower = valeur
  // effective (fallback attackPower si non configurée) ; les 4 autres = config template.
  healingPower: number;
  criticalChance: number;
  criticalDamage: number;
  accuracy: number;
  armorPenetrationPercent: number;
  // D-ter. Stats primaires (V6-B1) — informatif SEULEMENT : aucune dérivation ni
  // effet combat aujourd'hui (prévu V6-B2). Bloc séparé pour ne pas suggérer un
  // impact sur attackPower/defenseTotal/maxHealth.
  primaryStats: CreaturePrimaryStatsDto;
  // D-quater. Stats secondaires CALCULÉES depuis les primaires (V6-B2) — informatif
  // SEULEMENT. Dérivées serveur mais NON actives en défense (canDodge/canBlock/
  // canParry restent false). `maxHealthDerived` ne remplace pas `maxHealth`.
  derivedSecondaryStats: CreatureDerivedSecondaryStatsDto;
  // E. Loot / XP (facts du template ; le loot restant n'est pas tracké par instance)
  killCharacterXpReward: number;
  hasLootPool: boolean;
  lootPoolSize: number;
  // F. Capacités damage configurées + cooldown live (V5-C1). Toujours présent
  // (tableau vide si aucune capacité). Lecture seule.
  abilities?: CreatureRuntimeAbilityDto[];
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
