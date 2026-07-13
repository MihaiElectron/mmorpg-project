/**
 * Filtre de rendu des créatures (pur, testable).
 * ---------------------------------------------------------------------------
 * Le snapshot serveur `creatures` (`get_creatures`, envoyé notamment au
 * (re)connect) inclut TOUTES les créatures vivantes du runtime, quel que soit
 * leur état de combat (`alive` / `fighting` / `escaping`). Le client doit donc
 * rendre toutes les créatures NON mortes — sinon la créature du combat en cours
 * (état `fighting`/`escaping`) disparaît lors d'un re-render complet, laissant
 * la boucle d'auto-attaque sans sprite (`if (!entry) return`) : le combat en
 * cours devient « muet » côté client alors qu'il continue côté serveur, tandis
 * qu'un nouveau combat sur une créature `alive` s'affiche normalement.
 *
 * Ne décide RIEN du gameplay : purement de l'affichage. Les corps (`dead`) ne
 * sont jamais rendus (retirés via `creature_update` state `dead`).
 */
export const RENDERABLE_CREATURE_STATES = ['alive', 'fighting', 'escaping'] as const;

export function isRenderableCreatureState(state: string | null | undefined): boolean {
  return typeof state === 'string' && (RENDERABLE_CREATURE_STATES as readonly string[]).includes(state);
}
