// Miroir des coefficients de dérivation des secondaires créature (serveur —
// V6-B2.5). Le client n'implémente AUCUN calcul de stat : il lit/écrit ces 14
// coefficients ; le serveur reste seul à dériver les secondaires et à appliquer
// les bornes finales.

export interface CreatureSecondaryCoefficients {
  // Actifs en combat.
  attackPowerPerStrength: number;
  defenseTotalPerEndurance: number;
  accuracyPerDexterity: number;
  // Calculés, non actifs en défense.
  dodgePerAgility: number;
  blockPerEndurance: number;
  blockPerStrength: number;
  blockReductionPercent: number;
  parryPerStrength: number;
  parryPerDexterity: number;
  counterPerDexterity: number;
  counterPerAgility: number;
  counterPerIntelligence: number;
  // Vitalité (informatif).
  maxHealthPerVitality: number;
  secondaryChanceCap: number;
}

export type CreatureCoefficientKey = keyof CreatureSecondaryCoefficients;

/** Les 14 clés — ordre stable pour l'itération/validation. */
export const CREATURE_COEFFICIENT_KEYS: CreatureCoefficientKey[] = [
  "attackPowerPerStrength",
  "defenseTotalPerEndurance",
  "accuracyPerDexterity",
  "dodgePerAgility",
  "blockPerEndurance",
  "blockPerStrength",
  "blockReductionPercent",
  "parryPerStrength",
  "parryPerDexterity",
  "counterPerDexterity",
  "counterPerAgility",
  "counterPerIntelligence",
  "maxHealthPerVitality",
  "secondaryChanceCap",
];

export interface CoefficientField {
  key: CreatureCoefficientKey;
  label: string;
}

export interface CoefficientGroup {
  id: string;
  title: string;
  fields: CoefficientField[];
}

/** Regroupement d'affichage (aucune logique — purement visuel). */
export const COEFFICIENT_GROUPS: CoefficientGroup[] = [
  {
    id: "offensif",
    title: "Offensif",
    fields: [
      { key: "attackPowerPerStrength", label: "Force → attaque" },
      { key: "accuracyPerDexterity", label: "Dextérité → précision" },
      { key: "counterPerDexterity", label: "Dextérité → contre-attaque" },
      { key: "counterPerAgility", label: "Agilité → contre-attaque" },
      { key: "counterPerIntelligence", label: "Intelligence → contre-attaque" },
    ],
  },
  {
    id: "defensif",
    title: "Défensif",
    fields: [
      { key: "defenseTotalPerEndurance", label: "Endurance → défense" },
      { key: "dodgePerAgility", label: "Agilité → esquive" },
      { key: "blockPerEndurance", label: "Endurance → blocage" },
      { key: "blockPerStrength", label: "Force → blocage" },
      { key: "blockReductionPercent", label: "Réduction blocage" },
      { key: "parryPerStrength", label: "Force → parade" },
      { key: "parryPerDexterity", label: "Dextérité → parade" },
      { key: "secondaryChanceCap", label: "Cap chances secondaires" },
    ],
  },
  {
    id: "vitalite",
    title: "Vitalité",
    fields: [{ key: "maxHealthPerVitality", label: "Vitalité → PV max dérivés" }],
  },
];

/** Brouillon local : chaque coefficient est édité comme chaîne (champ input). */
export type CoefficientDraft = Record<CreatureCoefficientKey, string>;
