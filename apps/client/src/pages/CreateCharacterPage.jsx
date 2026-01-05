/**
 * CreateCharacterPage
 * ----------------------------
 * Page permettant à l'utilisateur de créer son personnage unique.
 *
 * Fonctionnalités :
 * - Formulaire avec nom + sexe
 * - Envoi sécurisé au backend (token JWT)
 * - Gestion d'erreurs robuste (JSON, non-JSON, tableaux NestJS)
 * - Stockage du personnage dans Zustand
 * - Redirection vers /world après succès
 */

import { useNavigate } from "react-router-dom";
import { useCharacterStore } from "../store/character.store";

function CreateCharacterPage() {
  const navigate = useNavigate();
  const setCharacter = useCharacterStore((s) => s.setCharacter);

  /**
   * handleSubmit
   * ------------
   * Gère l'envoi du formulaire :
   * - Empêche le rechargement de page
   * - Récupère les valeurs du formulaire
   * - Appelle l'API backend
   * - Gère les erreurs proprement
   */
  async function handleSubmit(e) {
    e.preventDefault();

    const name = e.target.name.value;
    const sex = e.target.sex.value;
    const token = localStorage.getItem("token");

    try {
      const res = await fetch("http://localhost:3000/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`, // Authentification JWT
        },
        body: JSON.stringify({ name, sex }),
      });

      /**
       * Gestion d'erreur unifiée
       * ------------------------
       * On vérifie res.ok AVANT de parser le JSON.
       * Cela évite les erreurs de parsing si le backend renvoie du HTML ou rien.
       */
      if (!res.ok) {
        let errorMessage = "Erreur lors de la création du personnage";

        try {
          const data = await res.json();

          // Cas NestJS : message = tableau d'erreurs
          if (Array.isArray(data.message)) {
            errorMessage = data.message.join(", ");
          } else {
            errorMessage = data.message || errorMessage;
          }
        } catch {
          // Si le backend ne renvoie pas de JSON valide
          errorMessage = res.statusText || errorMessage;
        }

        alert(errorMessage);
        return;
      }

      // Succès → on parse le JSON une seule fois
      const character = await res.json();
      console.log("Personnage créé :", character);

      // Stockage dans Zustand
      setCharacter(character);

      // Redirection vers la page du monde
      navigate("/world");
    } catch (error) {
      /**
       * Gestion des erreurs réseau / exceptions JS
       * ------------------------------------------
       * Exemple : backend down, CORS, perte de connexion, etc.
       */
      console.error("Erreur:", error);
      alert(error.message || "Une erreur est survenue");
    }
  }

  return (
    <div className="create-character">
      <h1>Créer un personnage</h1>

      <form onSubmit={handleSubmit} className="create-character__form">
        <input
          name="name"
          placeholder="Nom du personnage"
          required
          className="create-character__input"
        />

        <select name="sex" className="create-character__select">
          <option value="male">Homme</option>
          <option value="female">Femme</option>
        </select>

        <button type="submit" className="create-character__button">
          Créer
        </button>
      </form>
    </div>
  );
}

export default CreateCharacterPage;
