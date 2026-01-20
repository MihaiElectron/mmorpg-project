/**
 * WorldPage
 * ----------------------------
 * Page principale après login/register.
 */

import { useEffect, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCharacterStore } from "../store/character.store";
import Phaser from "phaser";

import PreloadScene from "../phaser/core/PreloadScene.js";
import WorldScene from "../phaser/core/WorldScene.js";

function WorldPage() {
  const navigate = useNavigate();

  const character = useCharacterStore((s) => s.character);
  const loadCharacter = useCharacterStore((s) => s.loadCharacter);
  const clearCharacter = useCharacterStore((s) => s.clearCharacter);

  const phaserGameRef = useRef(null);

  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/" />;
  }

  // Chargement du personnage
  useEffect(() => {
    if (!token) return;

    loadCharacter().catch((error) => {
      console.error("Erreur lors du chargement:", error);
      if (!error.message?.includes("404")) {
        navigate("/create-character");
      }
    });
  }, [token, loadCharacter, navigate]);

  useEffect(() => {
    // Si pas de token → pas de jeu
    if (!token) return;
  
    // Si pas de personnage → attendre
    if (!character) return;
  
    // Si Phaser existe déjà → ne pas recréer
    if (phaserGameRef.current) return;
  
    const config = {
      type: Phaser.AUTO,
      parent: "game-container",
  
      scale: {
        mode: Phaser.Scale.EXPAND,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
  
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
          gravity: { y: 0 },
        },
      },
  
      scene: [PreloadScene, WorldScene],
    };
  
    phaserGameRef.current = new Phaser.Game(config);
  
    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, [token]); // ← IMPORTANT : token + character
  
  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/");
  }

  async function handleDeleteCharacter() {
    if (!character) return;

    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${character.name} ?`)) {
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:3000/characters/${character.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const msg = await res
          .json()
          .catch(() => ({ message: "Erreur lors de la suppression" }));
        alert(
          Array.isArray(msg.message)
            ? msg.message.join(", ")
            : msg.message
        );
        return;
      }

      clearCharacter();
      navigate("/create-character");
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert(error.message || "Une erreur est survenue");
    }
  }

  return (
    <div className="world">
      <div id="game-container" className="world__phaser"></div>

      {character && (
        <div className="world__delete">
          <button onClick={handleDeleteCharacter}>
            Supprimer {character.name}
          </button>
        </div>
      )}

      <div className="world__logout">
        <button onClick={handleLogout}>Se déconnecter</button>
      </div>
    </div>
  );
}

export default WorldPage;
