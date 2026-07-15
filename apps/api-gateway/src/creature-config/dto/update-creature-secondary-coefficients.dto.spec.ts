import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UpdateCreatureSecondaryCoefficientsDto } from "./update-creature-secondary-coefficients.dto";

/** Valide un payload brut via le DTO ; renvoie la liste des propriétés en erreur. */
async function invalidProps(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(UpdateCreatureSecondaryCoefficientsDto, payload);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe("UpdateCreatureSecondaryCoefficientsDto", () => {
  it("accepte un patch partiel valide (champs absents autorisés)", async () => {
    expect(await invalidProps({ attackPowerPerStrength: 4, secondaryChanceCap: 30 })).toEqual([]);
  });

  it("accepte un objet vide (tous les champs optionnels)", async () => {
    expect(await invalidProps({})).toEqual([]);
  });

  it("accepte les décimaux", async () => {
    expect(await invalidProps({ accuracyPerDexterity: 0.5, dodgePerAgility: 0.3 })).toEqual([]);
  });

  it("rejette une valeur négative (@Min(0))", async () => {
    expect(await invalidProps({ attackPowerPerStrength: -1 })).toContain("attackPowerPerStrength");
  });

  it("rejette une valeur au-dessus du max par champ", async () => {
    expect(await invalidProps({ attackPowerPerStrength: 21 })).toContain("attackPowerPerStrength"); // max 20
    expect(await invalidProps({ secondaryChanceCap: 101 })).toContain("secondaryChanceCap"); // max 100
    expect(await invalidProps({ maxHealthPerVitality: 1001 })).toContain("maxHealthPerVitality"); // max 1000
    expect(await invalidProps({ dodgePerAgility: 6 })).toContain("dodgePerAgility"); // max 5
  });

  it("rejette NaN et Infinity (@IsNumber sans allowNaN/allowInfinity)", async () => {
    expect(await invalidProps({ attackPowerPerStrength: NaN })).toContain("attackPowerPerStrength");
    expect(await invalidProps({ attackPowerPerStrength: Infinity })).toContain("attackPowerPerStrength");
    expect(await invalidProps({ attackPowerPerStrength: -Infinity })).toContain("attackPowerPerStrength");
  });

  it("rejette un non-nombre", async () => {
    expect(await invalidProps({ attackPowerPerStrength: "5" as unknown as number })).toContain("attackPowerPerStrength");
  });

  it("rejette une clé inconnue (forbidNonWhitelisted)", async () => {
    const errors = await invalidProps({ unknownKey: 1 } as Record<string, unknown>);
    expect(errors).toContain("unknownKey");
  });
});
