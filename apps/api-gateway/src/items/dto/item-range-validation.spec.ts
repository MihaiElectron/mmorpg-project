import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from './create-item.dto';
import { UpdateItemDto } from './update-item.dto';

async function rangeErrors<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto);
  return errors.some((e) => e.property === 'range');
}

describe('Item DTO — validation range (Progression / Combat V1)', () => {
  const base = { name: 'Épée', type: 'weapon', category: 'basic_sword' };

  describe('CreateItemDto', () => {
    it('refuse range = 0', async () => {
      expect(await rangeErrors(CreateItemDto, { ...base, range: 0 })).toBe(true);
    });

    it('refuse range négatif', async () => {
      expect(await rangeErrors(CreateItemDto, { ...base, range: -5 })).toBe(true);
    });

    it('refuse range non entier', async () => {
      expect(await rangeErrors(CreateItemDto, { ...base, range: 46.5 })).toBe(true);
    });

    it('accepte range = 80', async () => {
      expect(await rangeErrors(CreateItemDto, { ...base, range: 80 })).toBe(false);
    });

    it('accepte range absent (défaut serveur)', async () => {
      expect(await rangeErrors(CreateItemDto, { ...base })).toBe(false);
    });
  });

  describe('UpdateItemDto', () => {
    it('refuse range = 0', async () => {
      expect(await rangeErrors(UpdateItemDto, { range: 0 })).toBe(true);
    });

    it('refuse range négatif', async () => {
      expect(await rangeErrors(UpdateItemDto, { range: -1 })).toBe(true);
    });

    it('accepte range = 80', async () => {
      expect(await rangeErrors(UpdateItemDto, { range: 80 })).toBe(false);
    });

    it('accepte range absent', async () => {
      expect(await rangeErrors(UpdateItemDto, {})).toBe(false);
    });
  });
});

// ── Équipement V1-C-A : validation des nouveaux champs ─────────────────────────

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
  property: string,
): Promise<boolean> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto);
  return errors.some((e) => e.property === property);
}

describe('Item DTO — validation champs équipement (V1-C-A)', () => {
  const base = { name: 'Épée', type: 'weapon', category: 'sword' };

  it('refuse requiredLevel = 0', async () => {
    expect(await errorsFor(CreateItemDto, { ...base, requiredLevel: 0 }, 'requiredLevel')).toBe(true);
  });

  it('refuse requiredLevel non entier', async () => {
    expect(await errorsFor(CreateItemDto, { ...base, requiredLevel: 2.5 }, 'requiredLevel')).toBe(true);
  });

  it('accepte requiredLevel absent (défaut entity)', async () => {
    expect(await errorsFor(CreateItemDto, { ...base }, 'requiredLevel')).toBe(false);
  });

  it('accepte requiredLevel = 5', async () => {
    expect(await errorsFor(CreateItemDto, { ...base, requiredLevel: 5 }, 'requiredLevel')).toBe(false);
  });

  it('accepte statBonuses objet', async () => {
    expect(await errorsFor(CreateItemDto, { ...base, statBonuses: { strength: 5 } }, 'statBonuses')).toBe(false);
  });

  it('refuse statBonuses non-objet (string)', async () => {
    expect(await errorsFor(CreateItemDto, { ...base, statBonuses: 'nope' }, 'statBonuses')).toBe(true);
  });

  it('accepte requiredMasteries objet et requiredClass string/null', async () => {
    expect(await errorsFor(UpdateItemDto, { requiredMasteries: { woodcutting: 2 } }, 'requiredMasteries')).toBe(false);
    expect(await errorsFor(UpdateItemDto, { requiredClass: 'guerrier' }, 'requiredClass')).toBe(false);
    expect(await errorsFor(UpdateItemDto, { requiredClass: null }, 'requiredClass')).toBe(false);
  });

  it('ancien payload sans champs équipement reste valide', async () => {
    const dto = plainToInstance(CreateItemDto, { ...base });
    expect(await validate(dto)).toHaveLength(0);
  });
});
