import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CraftingService } from './crafting.service';

/**
 * Garde de sécurité (ADR-0009) : le craft instantané joueur n'existe plus. La
 * méthode legacy `CraftingService.craft()` a été supprimée et toute fabrication
 * joueur passe par un CraftJob (POST /crafting/craft → launch → scheduler →
 * claim), l'output n'étant matérialisé qu'au claim.
 *
 * Ce test lit les sources du domaine craft pour empêcher toute régression :
 * réintroduction d'un `@SubscribeMessage('craft:start')`, d'un handler socket
 * appelant un craft instantané, ou de la méthode instantanée elle-même.
 */
describe('Craft — pas de bypass instantané joueur', () => {
  const dir = __dirname; // src/crafting
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => ({ file: f, src: readFileSync(join(dir, f), 'utf8') }));

  it("aucun handler socket 'craft:start' n'existe dans le domaine craft", () => {
    const offenders = sources.filter(
      (s) => s.src.includes("'craft:start'") || s.src.includes('"craft:start"'),
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("aucune gateway/handler socket (@SubscribeMessage) n'appelle un craft instantané", () => {
    const offenders = sources.filter(
      (s) =>
        s.src.includes('@SubscribeMessage') &&
        /craftingService\.craft\s*\(|this\.craft\s*\(/.test(s.src),
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("le contrôleur public n'appelle jamais un craft instantané (route vers CraftJob)", () => {
    const controller = sources.find((s) => s.file === 'crafting.controller.ts');
    expect(controller).toBeDefined();
    expect(/craftingService\.craft\s*\(/.test(controller.src)).toBe(false);
  });

  it("la méthode instantanée CraftingService.craft n'existe plus (supprimée)", () => {
    expect(
      (CraftingService.prototype as unknown as Record<string, unknown>).craft,
    ).toBeUndefined();
  });

  it('le service ne redéfinit pas de méthode de craft instantané', () => {
    // Le handler `craft` du contrôleur (route FABRIQUER → CraftJob) est légitime ;
    // c'est la matérialisation immédiate côté service qui ne doit pas réapparaître.
    const svc = sources.find((s) => s.file === 'crafting.service.ts');
    expect(svc).toBeDefined();
    expect(/\basync\s+craft\s*\(/.test(svc.src)).toBe(false);
  });
});
