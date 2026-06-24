import { useState } from "react";
import CharacterLayer from "../CharacterLayer/CharacterLayer";
import Inventory from "../Inventory/Inventory";
import SkillsTab from "./SkillsTab";
import { useCharacterStore } from "../../store/character.store";

const TABS = [
  { id: "perso",        label: "Perso" },
  { id: "skills",       label: "Skills" },
  { id: "talents",      label: "Talents",  soon: true },
  { id: "achievements", label: "Succès",   soon: true },
];

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
        {TABS.map(({ id, label, soon }) => (
          <button
            key={id}
            className={`character-layout__tab${activeTab === id && isOpen ? " character-layout__tab--active" : ""}${soon ? " character-layout__tab--soon" : ""}`}
            onClick={() => !soon && handleTabClick(id)}
            title={soon ? "À venir" : undefined}
          >
            {label}
            {soon && <span className="character-layout__tab-soon-badge">bientôt</span>}
          </button>
        ))}
      </div>

      {activeTab === "perso" && isOpen && (
        <>
          <div className="character-layout__content">
            <CharacterLayer />
          </div>
          <div className="character-layout__inventory">
            <Inventory />
          </div>
        </>
      )}

      {activeTab === "skills" && isOpen && (
        <div className="character-layout__content character-layout__content--full">
          <SkillsTab />
        </div>
      )}
    </div>
  );
}
