import { useState, useEffect } from "react";
import CharacterLayer from "../CharacterLayer/CharacterLayer";
import Inventory from "../Inventory/Inventory";
import SkillsTab from "./SkillsTab";
import { useCharacterStore } from "../../store/character.store";

const TABS = [
  { id: "perso",        label: "Perso" },
  { id: "skills",       label: "Skills" },
  { id: "talents",      label: "Talents" },
  { id: "achievements", label: "Succès" },
];

export default function CharacterLayout() {
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);
  const balance = useCharacterStore((s) => s.balance);
  const loadBalance = useCharacterStore((s) => s.loadBalance);

  const [activeTab, setActiveTab] = useState("perso");

  useEffect(() => {
    if (isOpen && activeTab === "perso") loadBalance();
  }, [isOpen, activeTab]);

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
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`character-layout__tab${activeTab === id && isOpen ? " character-layout__tab--active" : ""}`}
            onClick={() => handleTabClick(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "perso" && isOpen && (
        <>
          <div className="character-layout__content">
            <CharacterLayer />
            {balance && (
              <div className="character-layout__balance">
                {balance.gold > 0 && <span className="character-layout__balance-gold">{balance.gold}g</span>}
                {(balance.gold > 0 || balance.silver > 0) && <span className="character-layout__balance-silver">{balance.silver}a</span>}
                <span className="character-layout__balance-bronze">{balance.bronze}b</span>
              </div>
            )}
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

      {activeTab === "talents" && isOpen && (
        <div className="character-layout__content character-layout__content--full">
          <div className="placeholder-tab">
            <span className="placeholder-tab__icon">✦</span>
            <p className="placeholder-tab__title">Système de talents à venir</p>
          </div>
        </div>
      )}

      {activeTab === "achievements" && isOpen && (
        <div className="character-layout__content character-layout__content--full">
          <div className="placeholder-tab">
            <span className="placeholder-tab__icon">★</span>
            <p className="placeholder-tab__title">Système de succès à venir</p>
          </div>
        </div>
      )}
    </div>
  );
}
