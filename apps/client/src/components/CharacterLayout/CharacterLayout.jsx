/**
 * CharacterLayout.jsx
 */
import React from "react";
import CharacterLayer from "../CharacterLayer/CharacterLayer";
import Inventory from "../Inventory/Inventory";
import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayout() {
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);

  console.log("👤 [CharacterLayout] Render, isOpen:", isOpen);

  return (
    <div className={`character-layout ${isOpen ? "is-open" : "is-closed"}`}>
      <button className="character-layout__tab" onClick={toggleOpen}>
        Perso
      </button>

      <div className="character-layout__content">
        <CharacterLayer />
      </div>

      <div className="character-layout__inventory">
        <Inventory />
      </div>
    </div>
  );
}
