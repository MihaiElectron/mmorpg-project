import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Garde de sécurité (ADR-0009) : le craft instantané `CraftingService.craft()`
 * est réservé au legacy/interne/tests. AUCUNE surface joueur (socket ou
 * contrôleur) ne doit permettre de fabriquer instantanément — toute fabrication
 * joueur passe par un CraftJob (POST /crafting/craft → launch → claim).
 *
 * Ce test lit les sources du domaine craft pour empêcher toute régression
 * (réintroduction d'un `@SubscribeMessage('craft:start')` ou d'un handler socket
 * appelant le craft instantané).
 */
describe('Craft — pas de bypass instantané joueur', () => {
  const dir = __dirname; // src/crafting
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => ({ file: f, src: readFileSync(join(dir, f), 'utf8') }));

  it("aucun handler socket 'craft:start' n'existe dans le domaine craft", () => {
    const offenders = sources.filter((s) => s.src.includes("'craft:start'") || s.src.includes('"craft:start"'));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("aucun fichier avec des handlers socket (@SubscribeMessage) n'appelle CraftingService.craft()", () => {
    const offenders = sources.filter(
      (s) => s.src.includes('@SubscribeMessage') && /craftingService\.craft\s*\(|this\.craft\s*\(/.test(s.src),
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("le contrôleur public n'appelle jamais le craft instantané (route vers CraftJob)", () => {
    const controller = sources.find((s) => s.file === 'crafting.controller.ts');
    expect(controller).toBeDefined();
    expect(/craftingService\.craft\s*\(/.test(controller!.src)).toBe(false);
  });

  it("CraftingService.craft() n'est appelé que par lui-même (définition) — aucun caller joueur dans le domaine", () => {
    // Seul crafting.service.ts contient la définition `async craft(` ; aucun
    // autre fichier du domaine (contrôleur/gateway) ne doit l'appeler.
    const callers = sources.filter(
      (s) => s.file !== 'crafting.service.ts' && /craftingService\.craft\s*\(/.test(s.src),
    );
    expect(callers.map((o) => o.file)).toEqual([]);
  });
});
