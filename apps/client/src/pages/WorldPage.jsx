/**
 * WorldPage
 * ----------------------------
 * Page principale après login/register.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCharacterStore } from "../store/character.store";
import Phaser from "phaser";
import { io } from "socket.io-client";

import PreloadScene from "../phaser/core/PreloadScene.js";
import WorldScene from "../phaser/core/WorldScene.js";

function WorldPage() {
  const navigate = useNavigate();

  const character = useCharacterStore((s) => s.character);
  const loadCharacter = useCharacterStore((s) => s.loadCharacter);
  const clearCharacter = useCharacterStore((s) => s.clearCharacter);
  const equipment = useCharacterStore((s) => s.equipment);

  const phaserGameRef = useRef(null);
  const [phaserInitialized, setPhaserInitialized] = useState(false);

  const token = localStorage.getItem("token");

  // Chargement initial du personnage
  useEffect(() => {
    if (!token) return;

    if (!character) {
      loadCharacter().catch((error) => {
        console.error("Erreur lors du chargement:", error);
        if (!error.message?.includes("404")) {
          navigate("/create-character");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Trigger pour initialiser Phaser quand character devient disponible
  useEffect(() => {
    if (token && character && !phaserInitialized) {
      setPhaserInitialized(true);
    }
  }, [token, character, phaserInitialized]);

  // Initialisation de Phaser + socket
  useEffect(() => {
    if (!token || !phaserInitialized) return;
    if (phaserGameRef.current) return;

    // 1️⃣ Créer le socket AVANT Phaser
    const socket = io("http://localhost:3000");

    // 2️⃣ Config Phaser
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

    // 3️⃣ Créer Phaser
    phaserGameRef.current = new Phaser.Game(config);

    // 4️⃣ Attacher le socket au jeu
    phaserGameRef.current.socket = socket;

    // 5️⃣ Exposer globalement
    window.game = phaserGameRef.current;

    console.log("🎮 Phaser + Socket initialized:", socket);

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, [token, phaserInitialized]);

  // 🔥 VERSION FINALE — PROTECTION CONTRE LE REFRESH
  useEffect(() => {
    if (!phaserGameRef.current || !equipment) return;

    const world = phaserGameRef.current.scene.getScene("WorldScene");

    if (!world || !world.sys || !world.sys.isActive()) return;

    phaserGameRef.current.events.emit("equipment-changed", equipment);
  }, [equipment]);

  if (!token) {
    return <Navigate to="/" />;
  }

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
