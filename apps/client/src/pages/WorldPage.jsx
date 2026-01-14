/**
 * WorldPage
 * ----------------------------
 * Page principale après login/register.
 *
 * Fonctionnalités :
 * - Vérifie la présence du token (protection de route).
 * - Charge le personnage unique du joueur depuis le backend.
 * - Si aucun personnage n'existe → redirection vers la création.
 * - Affiche un bouton pour supprimer le personnage.
 * - Affiche un bouton pour se déconnecter.
 */

import { useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCharacterStore } from "../store/character.store";

function WorldPage() {
  const navigate = useNavigate();

  // Accès au store Zustand
  const character = useCharacterStore((s) => s.character);
  const loadCharacter = useCharacterStore((s) => s.loadCharacter);
  const clearCharacter = useCharacterStore((s) => s.clearCharacter);

  // Vérification d'authentification : si pas de token → retour à l'accueil
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/" />;
  }

  /**
   * Chargement du personnage du joueur
   * ----------------------------------
   * Utilise loadCharacter() du store qui charge :
   * - Le personnage
   * - L'inventaire (avec items)
   * - L'équipement
   */
  useEffect(() => {
    if (!token) return;

    loadCharacter().catch((error) => {
      console.error("Erreur lors du chargement:", error);
      // Si 404, loadCharacter aura déjà redirigé
      // Sinon on tente une redirection aussi
      if (!error.message?.includes("404")) {
        navigate("/create-character");
      }
    });
  }, [token, loadCharacter, navigate]);

  /**
   * Déconnexion : supprime le token et renvoie à l'accueil
   */
  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/");
  }

  /**
   * Suppression du personnage
   * -------------------------
   * - Appelle DELETE /characters/:id
   * - Vide le store Zustand
   * - Redirige vers la création de personnage
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
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const msg = await res.json().catch(() => ({ message: "Erreur lors de la suppression" }));
        alert(Array.isArray(msg.message) ? msg.message.join(", ") : msg.message);
        return;
      }

      clearCharacter();
      navigate("/create-character");
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert(error.message || "Une erreur est survenue lors de la suppression");
    }
  }

  return (
    <div className="world">
      <h1>Bienvenue dans le Monde</h1>

      {/* Bouton supprimer le personnage (uniquement si un personnage est chargé) */}
      {character && (
        <div className="world__delete">
          <button onClick={handleDeleteCharacter}>
            Supprimer {character.name}
          </button>
        </div>
      )}

      {/* Bouton déconnexion en dessous */}
      <div className="world__logout">
        <button onClick={handleLogout}>Se déconnecter</button>
      </div>
    </div>
  );
}

export default WorldPage;
