import { useState } from "react";
import CharacterLayer from "../CharacterLayer/CharacterLayer";
import Inventory from "../Inventory/Inventory";
import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayout() {
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);

  const [activeTab, setActiveTab] = useState("perso");

  function handleTabClick(tab) {
    if (!isOpen) {
      toggleOpen();
      setActiveTab(tab);
    } else if (activeTab === tab) {
      toggleOpen();
    } else {
      setActiveTab(tab);
    }
  }

  return (
    <div className={`character-layout ${isOpen ? "is-open" : "is-closed"}`}>
      <div className="character-layout__tabs">
        <button
          className={`character-layout__tab${activeTab === "perso" && isOpen ? " character-layout__tab--active" : ""}`}
          onClick={() => handleTabClick("perso")}
        >
          Perso
        </button>
      </div>

      {activeTab === "perso" && (
        <>
          <div className="character-layout__content">
            <CharacterLayer />
          </div>
          <div className="character-layout__inventory">
            <Inventory />
          </div>
        </>
      )}
    </div>
  );
}
