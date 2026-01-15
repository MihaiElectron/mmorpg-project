/**
 * WorldPage
 * ----------------------------
 * Page principale après login/register.
 *
 * Fonctionnalités :
 * - Vérifie la présence du token (protection de route).
 * - Charge le personnage unique du joueur depuis le backend.
 * - Monte Phaser dans un container React.
 * - Détruit Phaser proprement au unmount.
 */

import { useEffect, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCharacterStore } from "../store/character.store";
import Phaser from "phaser";

function WorldPage() {
  const navigate = useNavigate();

  // Store Zustand
  const character = useCharacterStore((s) => s.character);
  const loadCharacter = useCharacterStore((s) => s.loadCharacter);
  const clearCharacter = useCharacterStore((s) => s.clearCharacter);

  // 🔹 Référence vers l’instance Phaser (important)
  const phaserGameRef = useRef(null);

  // Auth
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/" />;
  }

  /**
   * Chargement du personnage
   */
  useEffect(() => {
    if (!token) return;

    loadCharacter().catch((error) => {
      console.error("Erreur lors du chargement:", error);
      if (!error.message?.includes("404")) {
        navigate("/create-character");
      }
    });
  }, [token, loadCharacter, navigate]);

  /**
   * 🔹 INITIALISATION PHASER
   * -----------------------
   * - Phaser démarre UNIQUEMENT si :
   *   - un personnage est chargé
   *   - Phaser n’est pas déjà monté
   */
  useEffect(() => {
    if (!character) return;
    if (phaserGameRef.current) return;

    // Configuration minimale Phaser
    const config = {
      type: Phaser.AUTO,
      parent: "game-container", // ⚠️ div React
      width: 800,
      height: 600,
      backgroundColor: "#1e1e1e",
      scene: {
        preload() {
          console.log("Phaser preload");
        },
        create() {
          this.add.text(20, 20, "Phaser est prêt 🚀", {
            fontSize: "20px",
            color: "#ffffff",
          });
        },
      },
    };

    // Création du jeu
    phaserGameRef.current = new Phaser.Game(config);

    // 🔥 Cleanup OBLIGATOIRE
    return () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, [character]);

  /**
   * Déconnexion
   */
  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/");
  }

  /**
   * Suppression du personnage
   */
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
      <h1>Bienvenue dans le Monde</h1>

      {/* 🔹 CONTAINER PHASER */}
      <div
        id="game-container"
        style={{
          width: "800px",
          height: "600px",
          border: "2px solid #444",
          marginBottom: "1rem",
        }}
      />

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
