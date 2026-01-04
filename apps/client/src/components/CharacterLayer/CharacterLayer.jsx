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
  <div className="character-layer__character"></div>

  <div className="character-layer__slot slot--1"></div>
  <div className="character-layer__slot slot--2"></div>
  <div className="character-layer__slot slot--3"></div>
  <div className="character-layer__slot slot--4"></div>

  <div className="character-layer__slot slot--5"></div>
  <div className="character-layer__slot slot--6"></div>

  <div className="character-layer__slot slot--7"></div>
  <div className="character-layer__slot slot--8"></div>

  <div className="character-layer__slot slot--9"></div>
  <div className="character-layer__slot slot--10"></div>

  <div className="character-layer__slot slot--11"></div>
  <div className="character-layer__slot slot--12"></div>
  <div className="character-layer__slot slot--13"></div>
  <div className="character-layer__slot slot--14"></div>
</div>

  );
}
