import type {
  CoefficientEntry,
  CreatureDerivedConfiguration,
  DerivedStatConfigEntry,
  ReplaceDerivedConfigurationPayload,
  ScalarParamConfigEntry,
} from "./creatureDerivedConfig.types";

// État d'édition LOCAL (les inputs numériques restent des chaînes brutes tant
// que l'utilisateur saisit ; le parsing/validation se fait à la sauvegarde).

export interface DerivedCoefficientEdit {
  primaryStatKey: string;
  /** Valeur brute saisie (chaîne). Parsée à la sauvegarde. */
  coefficient: string;
}

export interface DerivedStatEdit {
  derivedStatKey: string;
  /** true = override propre au template ; false = fallback global/catalogue. */
  overridden: boolean;
  coefficients: DerivedCoefficientEdit[];
}

export interface ScalarParamEdit {
  scalarParamKey: string;
  overridden: boolean;
  /** Valeur brute (chaîne). */
  value: string;
}

export interface DerivedEditorState {
  derived: DerivedStatEdit[];
  scalars: ScalarParamEdit[];
}

/**
 * Libellés/aides HISTORIQUES transférés du panneau autonome `Coefficients
 * créature`, associés DYNAMIQUEMENT aux clés reçues du serveur (jamais une liste
 * de stats codée en dur). Utilisés seulement pour l'affichage.
 */
export const SCALAR_LABELS: Record<string, { label: string; help: string }> = {
  blockReductionPercent: {
    label: "Réduction blocage",
    help: "Pourcentage des dégâts absorbés lorsqu'un blocage réussit.",
  },
  secondaryChanceCap: {
    label: "Cap chances secondaires",
    help: "Plafond appliqué aux chances d'esquive / blocage / parade dérivées.",
  },
};

export function scalarLabel(scalarParamKey: string): string {
  return SCALAR_LABELS[scalarParamKey]?.label ?? scalarParamKey;
}

export function scalarHelp(scalarParamKey: string): string | null {
  return SCALAR_LABELS[scalarParamKey]?.help ?? null;
}

/** Libellé d'une dérivée : label serveur (catalogue) sinon la clé canonique. */
export function derivedLabel(entry: Pick<DerivedStatConfigEntry, "derivedStatKey" | "label">): string {
  return entry.label ?? entry.derivedStatKey;
}

/** Message affiché quand une dérivée n'a aucune contribution de primaire. */
export const EMPTY_CONTRIBUTIONS_MESSAGE = "Aucune contribution de statistique primaire.";

/**
 * Texte de LECTURE des coefficients actuellement utilisés (`prim × coef  +  …`).
 * Sans contribution → message dédié. Ne révèle aucune provenance technique.
 */
export function formatEffectiveCoefficients(coefs: readonly CoefficientEntry[]): string {
  if (coefs.length === 0) return EMPTY_CONTRIBUTIONS_MESSAGE;
  return coefs.map((c) => `${c.primaryStatKey} × ${c.coefficient}`).join("  +  ");
}

/**
 * Clone PROFOND des coefficients actuellement utilisés vers un état éditable
 * (valeurs en chaînes). Ne mute JAMAIS l'entrée reçue du GET (nouveaux objets).
 * Utilisé au clic « Edit » — réutilise le mécanisme d'activation d'override.
 */
export function cloneEffectiveCoefficients(
  entry: Pick<DerivedStatConfigEntry, "effectiveCoefficients">,
): DerivedCoefficientEdit[] {
  return entry.effectiveCoefficients.map((c) => ({
    primaryStatKey: c.primaryStatKey,
    coefficient: String(c.coefficient),
  }));
}

/** Construit l'état d'édition initial depuis la config serveur. */
export function buildEditorState(config: CreatureDerivedConfiguration): DerivedEditorState {
  return {
    derived: config.derivedStats.map((d) => ({
      derivedStatKey: d.derivedStatKey,
      overridden: d.overrideState !== "none",
      coefficients: (d.explicitCoefficients ?? []).map((c) => ({
        primaryStatKey: c.primaryStatKey,
        coefficient: String(c.coefficient),
      })),
    })),
    scalars: config.scalarParams.map((s: ScalarParamConfigEntry) => ({
      scalarParamKey: s.scalarParamKey,
      overridden: s.explicitValue !== null,
      value: String(s.explicitValue ?? s.effectiveValue),
    })),
  };
}

/**
 * Validation LOCALE (le serveur reste l'autorité). Retourne un message d'erreur
 * ou `null`. Autorise négatif / zéro / map vide ; rejette NaN/Infinity, saisie
 * non numérique, et doublon de primaire dans une même dérivée.
 */
export function validateEditorState(state: DerivedEditorState): string | null {
  for (const d of state.derived) {
    if (!d.overridden) continue;
    const seen = new Set<string>();
    for (const c of d.coefficients) {
      if (!c.primaryStatKey) {
        return `${d.derivedStatKey} : une statistique primaire n'est pas sélectionnée.`;
      }
      if (seen.has(c.primaryStatKey)) {
        return `${d.derivedStatKey} : primaire dupliquée (${c.primaryStatKey}).`;
      }
      seen.add(c.primaryStatKey);
      const n = Number(c.coefficient);
      if (c.coefficient.trim() === "" || !Number.isFinite(n)) {
        return `${d.derivedStatKey} : coefficient invalide pour ${c.primaryStatKey}.`;
      }
    }
  }
  for (const s of state.scalars) {
    if (!s.overridden) continue;
    const n = Number(s.value);
    if (s.value.trim() === "" || !Number.isFinite(n)) {
      return `${s.scalarParamKey} : valeur invalide.`;
    }
  }
  return null;
}

/**
 * Construit le payload PUT (remplacement complet) depuis l'état d'édition.
 * Sémantique : dérivée/scalaire NON overridé → OMIS (fallback) ; overridé →
 * envoyé (coefficients éventuellement `[]` = override vide volontaire). Ne
 * renvoie JAMAIS les valeurs effectives comme overrides.
 */
export function buildPutPayload(state: DerivedEditorState): ReplaceDerivedConfigurationPayload {
  return {
    derivedOverrides: state.derived
      .filter((d) => d.overridden)
      .map((d) => ({
        derivedStatKey: d.derivedStatKey,
        coefficients: d.coefficients.map((c) => ({
          primaryStatKey: c.primaryStatKey,
          coefficient: Number(c.coefficient),
        })),
      })),
    scalarOverrides: state.scalars
      .filter((s) => s.overridden)
      .map((s) => ({ scalarParamKey: s.scalarParamKey, value: Number(s.value) })),
  };
}
