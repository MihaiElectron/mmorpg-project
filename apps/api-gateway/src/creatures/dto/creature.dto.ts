/** Stats dérivées après application des RuntimeModifiers. Absentes si non calculées. */
export type CreatureRuntimeStats = {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  speed: number;
  attackRange: number;
};

export type CreatureDto = {
  id: string;
  templateKey: string;
  type: string;
  /** Clé de texture Phaser explicite (= template.textureKey). Redondant avec type en Phase 1,
   *  utile quand type et textureKey divergeront. */
  textureKey: string;
  name: string;
  /** Coordonnées WU — source de vérité. Null si non encore initialisées au premier tick. */
  worldX: number | null;
  worldY: number | null;
  mapId: number | null;
  /** Cache pixel isométrique dérivé de worldX/worldY. Conservé pour fallback legacy. */
  x: number;
  y: number;
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
