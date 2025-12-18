/**
 * LoginPage
 * ----------------------------
 * - Un seul formulaire avec deux inputs (username, password).
 * - Deux boutons : "Créer son compte" et "Se connecter".
 * - Chaque bouton déclenche la même fonction `handleSubmit` avec une action différente.
 * - Affiche "Bienvenue" par défaut.
 * - En cas d'erreur, affiche le message en fondu pendant 2s puis revient à "Bienvenue".
 */

import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { registerUser, loginUser } from '../api/auth';

function LoginPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Bienvenue'); // message affiché
  const [fade, setFade] = useState(false); // contrôle du fondu

  // Fonction unique pour gérer register/login
  async function handleSubmit(e, action) {
    e.preventDefault();
    const username = e.target.form.username.value; // récupère l'input du formulaire
    const password = e.target.form.password.value;

    if (password.length < 6) {
        setMessage('Le mot de passe doit contenir au moins 6 caractères');
        setFade(true);
        setTimeout(() => {
          setMessage('Bienvenue');
          setFade(false);
        }, 2000);
        return; // stoppe ici, n’envoie pas au backend
    }
    
    try {
      if (action === 'register') {
        await registerUser(username, password);
      } else {
        await loginUser(username, password);
      }
      navigate('/world'); // redirection après succès
    } catch (err) {
      // Affiche le message d’erreur en fondu
      setMessage(err.message || 'Erreur');
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
          <input
            className="login__input"
            name="username"
            placeholder="Nom d’utilisateur"
          />
          <input
            className="login__input"
            name="password"
            type="password"
            placeholder="Mot de passe"
          />

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
