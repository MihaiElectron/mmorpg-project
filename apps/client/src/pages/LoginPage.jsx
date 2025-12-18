import React, { useState } from 'react';


const LoginPage = () => {
  const [characterName, setCharacterName] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    console.log('Login:', { characterName, password });
    // TODO: appel API auth
  };

  const handleCreateAccount = () => {
    console.log('Créer compte');
    // TODO: navigation vers RegisterPage
  };

  return (
    <div className="login">
      <div className="login__container">
        <form className="login__form" onSubmit={handleLogin}>
          <h1 className="login__title">Connexion MMORPG</h1>

          <div className="login__field">
            <input
              type="text"
              placeholder="Nom du personnage"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="login__input"
            />
          </div>

          <div className="login__field">
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login__input"
            />
          </div>

          <button type="submit" className="login__button login__button--primary">
            Se connecter
          </button>
        </form>

        <button
          className="login__button login__button--secondary"
          onClick={handleCreateAccount}
        >
          Créer son compte
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
