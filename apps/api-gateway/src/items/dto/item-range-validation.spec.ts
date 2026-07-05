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
