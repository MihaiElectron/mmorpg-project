import { useState } from "react";
import CharacterLayer from "../CharacterLayer/CharacterLayer";
import Inventory from "../Inventory/Inventory";
import AdminPanel from "../AdminPanel/AdminPanel";
import { useCharacterStore } from "../../store/character.store";

function decodeJwtRole(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null;
  } catch {
    return null;
  }
}

export default function CharacterLayout() {
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);
  const closePanel = useCharacterStore((s) => s.closePanel);

  const token = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";

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

        {isAdmin && (
          <button
            className={`character-layout__tab character-layout__tab--admin${activeTab === "admin" && isOpen ? " character-layout__tab--active" : ""}`}
            onClick={() => handleTabClick("admin")}
          >
            Admin
          </button>
        )}
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

      {activeTab === "admin" && isAdmin && (
        <div className="character-layout__content character-layout__content--admin">
          <AdminPanel />
        </div>
      )}
    </div>
  );
}
