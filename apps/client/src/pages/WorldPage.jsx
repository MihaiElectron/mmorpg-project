/**
 * WorldPage
 * ----------------------------
 * Page principale après login/register.
 * Affiche un bouton "Se déconnecter" qui renvoie vers /login.
 */

import { useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from "../store/character.store";

function WorldPage() {
  const navigate = useNavigate();
  const setCharacter = useCharacterStore((s) => s.setCharacter);

  useEffect(() => {
    // TEMPORAIRE : charge un personnage pour tester la layer
    setCharacter({
      id: 1,
      name: "Mihai le Conquérant",
    });
  }, []);

  function handleLogout() {
    navigate('/');
  }

  return (
    <div className="world">
      <h1>Bienvenue dans le Monde 🌍</h1>
      <button onClick={handleLogout}>Se déconnecter</button>
    </div>
  );
}

export default WorldPage;

