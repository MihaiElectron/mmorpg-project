/**
 * CharacterLayout.jsx
 * ---------------------------------------------------------------------------
 * Rôle :
 * - Conteneur du layout personnage affiché en bas à droite.
 * - Contient un onglet (demi-cercle) permettant d’ouvrir/fermer le panneau.
 * - Contient le composant CharacterLayer (infos du personnage).
 *
 * Emplacement :
 * apps/client/src/components/CharacterLayout/CharacterLayout.jsx
 *
 * Dépendances :
 * - CharacterLayer : contenu interne du panneau.
 *
 * Remarques :
 * - Le style (position fixe, demi-cercle, transitions) sera géré via Sass 7-1.
 * - L’ouverture/fermeture sera gérée plus tard via Zustand.
 * ---------------------------------------------------------------------------
 */

import CharacterLayer from "../CharacterLayer/CharacterLayer";
import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayout() {
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);

  return (
    <div className={`character-layout ${isOpen ? "is-open" : "is-closed"}`}>
      <button className="character-layout__tab" onClick={toggleOpen}>
        Perso
      </button>


      <div className="character-layout__content">
        <CharacterLayer />
      </div>
    </div>
  );
}

