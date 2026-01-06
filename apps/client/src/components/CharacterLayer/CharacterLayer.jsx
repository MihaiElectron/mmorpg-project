/**
 * CharacterLayer.jsx
 * ---------------------------------------------------------------------------
 * Rôle :
 * - Affiche les informations du personnage (nom, stats, portrait, etc.).
 * - Ce composant est inclus DANS CharacterLayout.
 *
 * Emplacement :
 * apps/client/src/components/CharacterLayer/CharacterLayer.jsx
 *
 * Dépendances :
 * - Zustand (useCharacterStore) pour récupérer le personnage courant.
 *
 * Remarques :
 * - Ne gère PAS l’ouverture/fermeture du layout.
 * - Ne gère PAS la position : c’est le rôle de CharacterLayout.
 * ---------------------------------------------------------------------------
 */

import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayer() {
  const character = useCharacterStore((s) => s.character);

  if (!character) return null;

  return (
    <div className="character-layer">
      <div className={`character-layer__character character--${character.sex}`}></div>

      <div className="character-layer__slot slot--left-earring"></div>
      <div className="character-layer__slot slot--right-earring"></div>
      <div className="character-layer__slot slot--headgear"></div>
      <div className="character-layer__slot slot--ranged-weapon"></div>

      <div className="character-layer__slot slot--necklace"></div>
      <div className="character-layer__slot slot--chest-armor"></div>

      <div className="character-layer__slot slot--left-bracelet"></div>
      <div className="character-layer__slot slot--right-weapon"></div>
      <div className="character-layer__slot slot--lzft-hand"></div>
      <div className="character-layer__slot slot--gloves"></div>

      <div className="character-layer__slot slot--right-bracelet"></div>
      <div className="character-layer__slot slot--leg-armor"></div>

      <div className="character-layer__slot slot--left-ring"></div>
      <div className="character-layer__slot slot--right-ring"></div>
      <div className="character-layer__slot slot--boots"></div>
      <div className="character-layer__slot slot--bag"></div>
    </div>
  );
}
