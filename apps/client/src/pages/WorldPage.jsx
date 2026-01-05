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
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const clearCharacter = useCharacterStore((s) => s.clearCharacter);

  // Vérification d'authentification : si pas de token → retour à l'accueil
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/" />;
  }

  /**
   * handleErrorResponse
   * -------------------
   * Fonction utilitaire locale pour gérer les erreurs HTTP.
   * - Évite la duplication
   * - Gère JSON, non-JSON, tableaux NestJS
   */
  async function handleErrorResponse(res, defaultMessage) {
    let errorMessage = defaultMessage;

    try {
      const data = await res.json();

      if (Array.isArray(data.message)) {
        errorMessage = data.message.join(", ");
      } else {
        errorMessage = data.message || errorMessage;
      }
    } catch {
      errorMessage = res.statusText || errorMessage;
    }

    return errorMessage;
  }

  /**
   * Chargement du personnage du joueur
   * ----------------------------------
   * Le backend renvoie :
   * - un objet personnage si l'utilisateur en possède un
   * - 404 si aucun personnage n'existe encore
   */
  useEffect(() => {
    async function loadCharacter() {
      try {
        const res = await fetch("http://localhost:3000/characters/me", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        // Gestion des erreurs HTTP
        if (!res.ok) {
          if (res.status === 404) {
            // Aucun personnage → redirection vers la création
            navigate("/create-character");
            return;
          }

          const msg = await handleErrorResponse(
            res,
            "Erreur lors du chargement du personnage"
          );
          console.error(msg);
          navigate("/create-character");
          return;
        }

        // Succès → parse JSON
        const character = await res.json();

        if (!character) {
          navigate("/create-character");
          return;
        }

        setCharacter(character);
      } catch (error) {
        /**
         * Erreurs réseau / backend down / CORS
         * ------------------------------------
         * On redirige vers la création, mais on log l'erreur.
         */
        console.error("Erreur lors du chargement:", error);
        navigate("/create-character");
      }
    }

    loadCharacter();
  }, [navigate, setCharacter, token]);

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
        const msg = await handleErrorResponse(
          res,
          "Erreur lors de la suppression"
        );
        alert(msg);
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
