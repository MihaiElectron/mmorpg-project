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
import CoordinatesLayer from "../components/CoordinatesLayer/CoordinatesLayer.jsx";
import { onItemDefinitionsChanged } from "../components/DevTools/modules/Items/itemEvents";
import { onDerivedStatsChanged } from "../components/DevTools/modules/DerivedStats/derivedStatsEvents";

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
        if (error.status === 404) {
          navigate("/create-character");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Recharge le personnage (inventaire + slots équipés + stats) quand le
  // catalogue d'items change dans le Studio (Équipement V1-C-B). Serveur
  // autoritaire : on relit getMe, aucun recalcul client.
  useEffect(() => {
    return onItemDefinitionsChanged(() => {
      loadCharacter().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recharge le personnage quand une stat dérivée change dans le Studio
  // (create/update/duplicate/delete/retrait de référence de maîtrise). Le
  // serveur recalcule `stats.derived` ; on relit getMe, aucun recalcul client.
  useEffect(() => {
    return onDerivedStatsChanged(() => {
      loadCharacter().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Créer le socket AVANT Phaser (JWT transmis pour l'authentification serveur)
    const socket = io(import.meta.env.VITE_API_URL, {
      auth: { token },
    });

    // Config Phaser
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

    // Créer Phaser
    phaserGameRef.current = new Phaser.Game(config);

    // Attacher le socket au jeu
    phaserGameRef.current.socket = socket;

    // Exposer globalement
    window.game = phaserGameRef.current;

    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
      // Fermer le socket : sinon chaque remontage empile un socket connecté
      // (handlers serveur/clients dupliqués, fuite réseau).
      socket.disconnect();
      if (window.game && window.game.socket === socket) {
        window.game = null;
      }
    };
  }, [token, phaserInitialized]);

  // Protection contre le refresh : ne notifier Phaser que si la scène est prête.
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
        `${import.meta.env.VITE_API_URL}/characters/${character.id}`,
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

      <CoordinatesLayer />

      <div className="world__logout">
        <button onClick={handleLogout}>Se déconnecter</button>
      </div>
    </div>
  );
}

export default WorldPage;
