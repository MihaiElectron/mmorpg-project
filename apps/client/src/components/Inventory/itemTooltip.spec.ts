import { describe, it, expect } from "vitest";
import { formatItemTooltip } from "./itemTooltip";

describe("formatItemTooltip", () => {
  it("item minimal (nom seul) → aucune ligne undefined/null", () => {
    const out = formatItemTooltip({ name: "Objet" });
    expect(out).toContain("Objet");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("null");
    // pas de slot → marqué non équipable
    expect(out).toContain("Non équipable");
  });

  it("affiche type, catégorie et slot", () => {
    const out = formatItemTooltip({ name: "Épée", type: "weapon", category: "sword", slot: "right-hand" });
    expect(out).toContain("Type : weapon");
    expect(out).toContain("Catégorie : sword");
    expect(out).toContain("Slot : right-hand");
    expect(out).not.toContain("Non équipable");
  });

  it("affiche attack/defense (signés) et range", () => {
    const out = formatItemTooltip({ name: "Épée", slot: "right-hand", attack: 10, defense: 5, range: 1000 });
    expect(out).toContain("Attaque : +10");
    expect(out).toContain("Défense : +5");
    expect(out).toContain("Portée : 1000");
  });

  it("masque attack/defense/range absents", () => {
    const out = formatItemTooltip({ name: "Babiole", slot: "necklace" });
    expect(out).not.toContain("Attaque");
    expect(out).not.toContain("Défense");
    expect(out).not.toContain("Portée");
  });

  it("affiche les statBonuses avec labels FR et signe", () => {
    const out = formatItemTooltip({ name: "Épée", slot: "right-hand", statBonuses: { strength: 3, vitality: 2 } });
    expect(out).toContain("Bonus :");
    expect(out).toContain("- Force +3");
    expect(out).toContain("- Vitalité +2");
  });

  it("valeur de bonus négative affichée avec -", () => {
    const out = formatItemTooltip({ name: "Épée maudite", slot: "right-hand", statBonuses: { agility: -2 } });
    expect(out).toContain("- Agilité -2");
  });

  it("statBonuses vide → pas de section Bonus", () => {
    const out = formatItemTooltip({ name: "Épée", slot: "right-hand", statBonuses: {} });
    expect(out).not.toContain("Bonus :");
  });

  it("ignore les clés inconnues de statBonuses", () => {
    const out = formatItemTooltip({ name: "Épée", slot: "right-hand", statBonuses: { foo: 9, strength: 1 } });
    expect(out).toContain("- Force +1");
    expect(out).not.toContain("foo");
  });

  it("affiche requiredLevel (>1), requiredClass et requiredMasteries", () => {
    const out = formatItemTooltip({
      name: "Hache", slot: "right-hand",
      requiredLevel: 5, requiredClass: "guerrier", requiredMasteries: { woodcutting: 2 },
    });
    expect(out).toContain("Prérequis :");
    expect(out).toContain("- Niveau 5");
    expect(out).toContain("- Classe guerrier");
    expect(out).toContain("- Maîtrise woodcutting 2");
  });

  it("requiredLevel = 1 (défaut) et prérequis vides → pas de section Prérequis", () => {
    const out = formatItemTooltip({ name: "Épée", slot: "right-hand", requiredLevel: 1, requiredClass: null, requiredMasteries: {} });
    expect(out).not.toContain("Prérequis :");
  });

  it("slot absent → Non équipable", () => {
    const out = formatItemTooltip({ name: "Potion", type: "consumable", slot: null });
    expect(out).toContain("Non équipable");
  });

  it("ajoute la ligne d'action si fournie, en dernier", () => {
    const out = formatItemTooltip({ name: "Épée", slot: "right-hand" }, { actionHint: "Double-clic pour équiper" });
    const parts = out.split("\n");
    expect(parts[parts.length - 1]).toBe("Double-clic pour équiper");
  });

  it("item nul → renvoie l'action seule (ou vide)", () => {
    expect(formatItemTooltip(null)).toBe("");
    expect(formatItemTooltip(null, { actionHint: "Slot vide" })).toBe("Slot vide");
  });
});
