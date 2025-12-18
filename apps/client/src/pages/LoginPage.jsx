/**
 * LoginPage :
 * - Contient deux formulaires/boutons :
 *   1. "Créer son compte" → appelle /auth/register
 *   2. "Se connecter" → appelle /auth/login
 * - Après succès, redirige vers /world.
 */

/**
 * LoginPage :
 * - Un seul formulaire avec deux inputs (username, password).
 * - Deux boutons : "Créer son compte" et "Se connecter".
 * - Chaque bouton déclenche une fonction différente selon son type.
 * - Affiche "Bienvenue" par défaut.
 * - Remplace par un message d’erreur en fondu pendant 2s si register/login échoue.
 */

import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { registerUser, loginUser } from '../api/auth';

function LoginPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Bienvenue'); // message affiché
  const [fade, setFade] = useState(false); // contrôle du fondu

  async function handleSubmit(e, action) {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
      if (action === 'register') {
        await registerUser(username, password);
      } else {
        await loginUser(username, password);
      }
      navigate('/world');
    } catch (err) {
      // Affiche le message d’erreur
      setMessage(err.message);
      setFade(true);

      // Après 2s, revient à "Bienvenue"
      setTimeout(() => {
        setMessage('Bienvenue');
        setFade(false);
      }, 2000);
    }
  }

  return (
    <div className="login">
      <div className="login__container">
        <h2 className={`login__title ${fade ? 'fade' : ''}`}>{message}</h2>
        <form className="login__form">
          <input className="login__input" name="username" placeholder="Nom d’utilisateur" />
          <input className="login__input" name="password" type="password" placeholder="Mot de passe" />

          <button
            className="login__button login__button--primary"
            type="submit"
            onClick={(e) => handleSubmit(e, 'register')}
          >
            Créer son compte
          </button>

          <button
            className="login__button login__button--secondary"
            type="submit"
            onClick={(e) => handleSubmit(e, 'login')}
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;