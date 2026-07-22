import { describe, it, expect } from "vitest";
import {
  BOTTOM_THRESHOLD_PX,
  computeHistoryScrollTop,
  computeTrimDelta,
  distanceFromBottom,
  isAtBottom,
  lastEntryId,
  resolveScrollAction,
} from "./chatLogScroll";

const entries = (...ids) => ids.map((id) => ({ id }));

describe("distanceFromBottom", () => {
  it("calcule scrollHeight - scrollTop - clientHeight", () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 200 })).toBe(400);
    expect(distanceFromBottom({ scrollHeight: 500, scrollTop: 300, clientHeight: 200 })).toBe(0);
  });
});

describe("isAtBottom (détection du bas avec tolérance)", () => {
  it("position exactement en bas → considérée en bas", () => {
    expect(isAtBottom({ scrollHeight: 500, scrollTop: 300, clientHeight: 200 })).toBe(true);
  });

  it("à quelques pixels du bas (dans le seuil) → considérée en bas", () => {
    // distance = 4 <= seuil
    expect(isAtBottom({ scrollHeight: 504, scrollTop: 300, clientHeight: 200 })).toBe(true);
    // distance = seuil exact
    expect(
      isAtBottom({ scrollHeight: 500 + BOTTOM_THRESHOLD_PX, scrollTop: 300, clientHeight: 200 }),
    ).toBe(true);
  });

  it("utilisateur nettement remonté → hors du bas", () => {
    expect(isAtBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 200 })).toBe(false);
  });
});

describe("lastEntryId", () => {
  it("null si vide, sinon id de la dernière entrée", () => {
    expect(lastEntryId([])).toBeNull();
    expect(lastEntryId(entries(3, 7, 9))).toBe(9);
  });

  it("id identique pour la même collection (stabilité de dépendance)", () => {
    // Un rerender sans nouveau message ne doit pas changer le dernier id.
    const list = entries(1, 2, 3);
    expect(lastEntryId(list)).toBe(lastEntryId([...list]));
  });
});

describe("computeTrimDelta (append / trimming)", () => {
  it("liste initiale : tout est ajouté, rien retiré", () => {
    expect(computeTrimDelta({ prevLen: 0, prevLastId: null, entries: entries(1) })).toEqual({
      addedCount: 1,
      removedCount: 0,
    });
  });

  it("append pur (pas de limite atteinte) : 1 ajouté, 0 retiré", () => {
    expect(
      computeTrimDelta({ prevLen: 3, prevLastId: 3, entries: entries(1, 2, 3, 4) }),
    ).toEqual({ addedCount: 1, removedCount: 0 });
  });

  it("append avec trimming en tête : 1 ajouté, 1 retiré (longueur constante)", () => {
    // Avant: [1,2,3] (len 3). Après trim+append: [2,3,4] (len 3).
    expect(
      computeTrimDelta({ prevLen: 3, prevLastId: 3, entries: entries(2, 3, 4) }),
    ).toEqual({ addedCount: 1, removedCount: 1 });
  });

  it("retrait en tête sans nouveau message (trim par une autre catégorie)", () => {
    // Le dernier id ne change pas mais une entrée de tête a disparu.
    expect(
      computeTrimDelta({ prevLen: 3, prevLastId: 3, entries: entries(2, 3) }),
    ).toEqual({ addedCount: 0, removedCount: 1 });
  });
});

describe("resolveScrollAction", () => {
  it("utilisateur en bas → follow (suit les nouveaux messages)", () => {
    expect(resolveScrollAction({ stick: true, removedCount: 0 })).toBe("follow");
    expect(resolveScrollAction({ stick: true, removedCount: 1 })).toBe("follow");
  });

  it("utilisateur remonté, aucun trim → none (aucun scroll automatique)", () => {
    expect(resolveScrollAction({ stick: false, removedCount: 0 })).toBe("none");
  });

  it("utilisateur remonté pendant un trimming → compensate (position conservée)", () => {
    expect(resolveScrollAction({ stick: false, removedCount: 1 })).toBe("compensate");
  });
});

describe("computeHistoryScrollTop (préservation visuelle au trimming)", () => {
  it("remonte scrollTop de la hauteur retirée estimée", () => {
    // 10 entrées sur 200px → 20px/entrée. 1 retirée → scrollTop 120 → 100.
    expect(
      computeHistoryScrollTop({
        prevScrollTop: 120,
        prevScrollHeight: 200,
        prevLen: 10,
        removedCount: 1,
      }),
    ).toBe(100);
  });

  it("aucun trim → scrollTop inchangé", () => {
    expect(
      computeHistoryScrollTop({
        prevScrollTop: 120,
        prevScrollHeight: 200,
        prevLen: 10,
        removedCount: 0,
      }),
    ).toBe(120);
  });

  it("borne inférieure à 0 (jamais de scrollTop négatif)", () => {
    expect(
      computeHistoryScrollTop({
        prevScrollTop: 10,
        prevScrollHeight: 200,
        prevLen: 10,
        removedCount: 5,
      }),
    ).toBe(0);
  });
});

describe("scénarios du journal (composition des helpers)", () => {
  const AT_BOTTOM = { scrollHeight: 500, scrollTop: 300, clientHeight: 200 };
  const SCROLLED_UP = { scrollHeight: 1000, scrollTop: 100, clientHeight: 200 };

  it("nouveau message alors que l'utilisateur est en bas → follow", () => {
    const stick = isAtBottom(AT_BOTTOM);
    const { removedCount } = computeTrimDelta({ prevLen: 3, prevLastId: 3, entries: entries(1, 2, 3, 4) });
    expect(resolveScrollAction({ stick, removedCount })).toBe("follow");
  });

  it("nouveau message alors que l'utilisateur est remonté → none (aucun scroll)", () => {
    const stick = isAtBottom(SCROLLED_UP);
    const { removedCount } = computeTrimDelta({ prevLen: 3, prevLastId: 3, entries: entries(1, 2, 3, 4) });
    expect(resolveScrollAction({ stick, removedCount })).toBe("none");
  });

  it("retour manuel au bas → le prochain message réactive l'autoscroll", () => {
    // L'utilisateur redescend : le scroll manuel recalcule stick = true.
    const stickAfterManualReturn = isAtBottom(AT_BOTTOM);
    expect(stickAfterManualReturn).toBe(true);
    const { removedCount } = computeTrimDelta({ prevLen: 4, prevLastId: 4, entries: entries(1, 2, 3, 4, 5) });
    expect(resolveScrollAction({ stick: stickAfterManualReturn, removedCount })).toBe("follow");
  });

  it("journal vide puis premier message → follow (positionné en bas)", () => {
    const stick = true; // valeur initiale du suivi
    const { removedCount } = computeTrimDelta({ prevLen: 0, prevLastId: null, entries: entries(1) });
    expect(resolveScrollAction({ stick, removedCount })).toBe("follow");
  });

  it("rerender sans nouveau message → dernier id stable (pas de déclenchement)", () => {
    const before = entries(1, 2, 3);
    const after = [...before];
    expect(lastEntryId(after)).toBe(lastEntryId(before));
  });

  it("plusieurs messages successifs en bas → chacun suit le nouveau bas", () => {
    let list = entries(1, 2, 3);
    for (let next = 4; next <= 6; next += 1) {
      const prevLastId = lastEntryId(list);
      const prevLen = list.length;
      list = [...list, { id: next }];
      const { removedCount } = computeTrimDelta({ prevLen, prevLastId, entries: list });
      expect(resolveScrollAction({ stick: isAtBottom(AT_BOTTOM), removedCount })).toBe("follow");
    }
    expect(lastEntryId(list)).toBe(6);
  });

  it("utilisateur remonté pendant un trimming → position visuelle conservée", () => {
    const stick = isAtBottom(SCROLLED_UP); // false
    const { removedCount } = computeTrimDelta({ prevLen: 3, prevLastId: 3, entries: entries(2, 3, 4) });
    expect(resolveScrollAction({ stick, removedCount })).toBe("compensate");
    // 3 entrées sur 900px → 300px/entrée ; 1 retirée → scrollTop 100 → clampé 0.
    expect(
      computeHistoryScrollTop({ prevScrollTop: 100, prevScrollHeight: 900, prevLen: 3, removedCount }),
    ).toBe(0);
  });
});
