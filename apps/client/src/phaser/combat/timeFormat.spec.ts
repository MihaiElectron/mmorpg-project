import { describe, expect, it } from "vitest";
import { formatClock } from "./timeFormat";

describe("formatClock", () => {
  it("formate un Date en HH:mm:ss (heure locale)", () => {
    const d = new Date(2026, 0, 2, 9, 5, 7);
    expect(formatClock(d)).toBe("09:05:07");
  });

  it("formate un timestamp numérique", () => {
    const d = new Date(2026, 5, 1, 23, 59, 0);
    expect(formatClock(d.getTime())).toBe("23:59:00");
  });

  it("pad les valeurs < 10", () => {
    const d = new Date(2026, 0, 1, 1, 2, 3);
    expect(formatClock(d)).toBe("01:02:03");
  });

  it("fallback --:--:-- pour une date invalide", () => {
    expect(formatClock("pas une date")).toBe("--:--:--");
    expect(formatClock(NaN)).toBe("--:--:--");
    expect(formatClock(null)).toBe("--:--:--");
    expect(formatClock(undefined)).toBe("--:--:--");
  });
});
