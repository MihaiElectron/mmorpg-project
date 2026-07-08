// Règles globales de progression (miroir du GameConfig serveur — ADR-0018).
// Le client n'implémente AUCUNE logique de calcul : il lit/écrit ces valeurs
// et affiche les échantillons et simulations calculés serveur.
//
// Le modèle XP est une progression multiplicative par tranches de niveaux :
// XP requise pour atteindre le niveau N = XP requise du niveau précédent
// × multiplicateur de la tranche de N. Aucune formule n'est affichée ni
// recalculée côté client — uniquement des champs lisibles et des résultats
// serveur.

export interface GameConfigDto {
  // XP — modèle actif par tranches.
  startingXp: number;
  xpMultiplierLevel1To10: number;
  xpMultiplierLevel11To30: number;
  xpMultiplierLevel31To60: number;
  xpMultiplierLevel61To120: number;
  // Niveaux.
  characterMaxLevel: number;
  characterCurrentLevelCap: number;
  // Points de stats.
  statPointsAtLevelOne: number;
  statPointsPerLevel: number;
  // Masteries.
  masteryNaturalCap: number;
  masteryOvercap: number;
  // Legacy — champs de l'ancien modèle XP (base × level^exposant × coefficient).
  // Ne sont plus utilisés par le calcul serveur ; non affichés dans ce panneau.
  characterBaseXpPerLevel?: number;
  characterXpCurveExponent?: number;
  characterXpCoefficient?: number;
  highLevelXpMultiplier?: number;
}

export interface GameConfigSample {
  level: number;
  totalStatPoints: number;
  xpToReachLevel: number;
  cumulativeXp: number;
}

export interface GameConfigSimulation {
  previousLevel: number;
  targetLevel: number;
  xpForTransition: number;
  cumulativeXpToTarget: number;
}

export interface GameConfigPreview {
  current: GameConfigDto;
  draft: GameConfigDto;
  affectedCharacterCount: number;
  samples: GameConfigSample[];
  simulation: GameConfigSimulation;
  resetExecuted: false;
  note: string;
}

// Champs éditables exposés dans le panneau (le legacy n'y figure pas).
export type GameConfigField =
  | "startingXp"
  | "xpMultiplierLevel1To10"
  | "xpMultiplierLevel11To30"
  | "xpMultiplierLevel31To60"
  | "xpMultiplierLevel61To120"
  | "characterMaxLevel"
  | "characterCurrentLevelCap"
  | "statPointsAtLevelOne"
  | "statPointsPerLevel"
  | "masteryNaturalCap"
  | "masteryOvercap";

export interface FieldMeta {
  key: GameConfigField;
  label: string;
  step: number;
}

export interface FieldGroup {
  id: string;
  title: string;
  fields: FieldMeta[];
}

// Regroupement pour l'affichage en sections repliables.
export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: "levels",
    title: "Niveaux",
    fields: [
      { key: "characterMaxLevel", label: "Niveau max final", step: 1 },
      { key: "characterCurrentLevelCap", label: "Cap de niveau actuel", step: 1 },
    ],
  },
  {
    id: "statPoints",
    title: "Points de stats",
    fields: [
      { key: "statPointsAtLevelOne", label: "Points au niveau 1", step: 1 },
      { key: "statPointsPerLevel", label: "Points par niveau", step: 1 },
    ],
  },
  {
    id: "xp",
    title: "XP",
    fields: [
      { key: "startingXp", label: "XP de départ (niveau 1 → 2)", step: 1 },
      { key: "xpMultiplierLevel1To10", label: "Multiplicateur niveaux 1–10", step: 0.01 },
      { key: "xpMultiplierLevel11To30", label: "Multiplicateur niveaux 11–30", step: 0.01 },
      { key: "xpMultiplierLevel31To60", label: "Multiplicateur niveaux 31–60", step: 0.01 },
      { key: "xpMultiplierLevel61To120", label: "Multiplicateur niveaux 61–120", step: 0.01 },
    ],
  },
  {
    id: "mastery",
    title: "Mastery caps",
    fields: [
      { key: "masteryNaturalCap", label: "Cap naturel", step: 1 },
      { key: "masteryOvercap", label: "Overcap", step: 1 },
    ],
  },
];

// ── Recalcul global des points de stats (ADR-0018 §1, Étape 1B) ─────────────
// Action destructive, séparée des règles globales ci-dessus. Le client ne
// calcule rien : uniquement le rapport retourné par le serveur.

export interface StatPointsRecalculationError {
  characterId: string;
  message: string;
}

export interface StatPointsRecalculationReport {
  processedCharacterCount: number;
  totalCharacterCount: number;
  oldDistributedTotal: number;
  newAvailableTotal: number;
  errors: StatPointsRecalculationError[];
  executedAt: string;
}
