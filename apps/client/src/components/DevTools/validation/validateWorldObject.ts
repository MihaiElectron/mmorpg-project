import type { WorldObject } from "../types/worldObject.types";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
}

// ── Règles génériques ─────────────────────────────────────────────────────────

function validateGeneric(obj: WorldObject, out: Diagnostic[]): void {
  if (!obj.id) {
    out.push({ severity: "error", code: "MISSING_ID", message: "id absent" });
  }
  if (!obj.category) {
    out.push({ severity: "error", code: "MISSING_CATEGORY", message: "category absente" });
  }
  if (!obj.type) {
    out.push({ severity: "error", code: "MISSING_TYPE", message: "type absent" });
  }
  if (!obj.state) {
    out.push({ severity: "error", code: "MISSING_STATE", message: "state absent" });
  }
  if (obj.mapId == null) {
    out.push({ severity: "warning", code: "MISSING_MAP_ID", message: "mapId absent — entité hors carte" });
  }
  if (obj.position == null) {
    out.push({ severity: "warning", code: "MISSING_POSITION", message: "position WU absente — entité non localisée" });
  }
  if (!obj.capabilities || obj.capabilities.length === 0) {
    out.push({ severity: "warning", code: "EMPTY_CAPABILITIES", message: "capabilities vides" });
  }
}

// ── Règles spécifiques à la catégorie resource ────────────────────────────────

function validateResource(obj: WorldObject, out: Diagnostic[]): void {
  const loots = obj.remainingLoots;

  if (loots != null && loots < 0) {
    out.push({
      severity: "error",
      code: "RESOURCE_NEGATIVE_LOOTS",
      message: `remainingLoots négatif (${loots})`,
    });
  }

  if (obj.state === "dead" && loots != null && loots > 0) {
    out.push({
      severity: "warning",
      code: "RESOURCE_DEAD_WITH_LOOTS",
      message: `resource dead mais remainingLoots = ${loots}`,
    });
  }

  if (obj.state === "alive" && loots === 0) {
    out.push({
      severity: "info",
      code: "RESOURCE_ALIVE_NO_LOOTS",
      message: "resource alive mais aucun loot restant",
    });
  }
}

// ── Règles spécifiques à la catégorie animal ──────────────────────────────────

function validateAnimal(obj: WorldObject, out: Diagnostic[]): void {
  if (obj.health == null || obj.health < 0) {
    out.push({
      severity: "error",
      code: "ANIMAL_INVALID_HEALTH",
      message: `health invalide (${obj.health ?? "absent"})`,
    });
  }

  if (obj.state === "dead" && obj.health != null && obj.health > 0) {
    out.push({
      severity: "warning",
      code: "ANIMAL_DEAD_WITH_HP",
      message: `animal dead mais health = ${obj.health}`,
    });
  }

  if ((obj.state === "alive" || obj.state === "fighting") && obj.health === 0) {
    out.push({
      severity: "warning",
      code: "ANIMAL_ALIVE_NO_HP",
      message: `animal ${obj.state} mais health = 0`,
    });
  }
}

// ── Registre de règles par catégorie ─────────────────────────────────────────
// Ajouter une entrée ici pour brancher un validateur sur une nouvelle catégorie.

const CATEGORY_VALIDATORS: Record<string, (obj: WorldObject, out: Diagnostic[]) => void> = {
  resource: validateResource,
  animal: validateAnimal,
};

// ── Point d'entrée ────────────────────────────────────────────────────────────

export function validateWorldObject(obj: WorldObject): Diagnostic[] {
  const diags: Diagnostic[] = [];
  validateGeneric(obj, diags);
  CATEGORY_VALIDATORS[obj.category]?.(obj, diags);
  return diags;
}
