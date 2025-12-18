/**
 * WorldPage
 * ----------------------------
 * Page principale après login/register.
 * Affiche un bouton "Se déconnecter" qui renvoie vers /login.
 */

import { useNavigate } from 'react-router-dom';

function WorldPage() {
  const navigate = useNavigate();

  function handleLogout() {
    // Ici tu peux aussi vider localStorage si tu stockes un token
    navigate('/login');
  }

  return (
    <div className="world">
      <h1>Bienvenue dans le Monde 🌍</h1>
      <button onClick={handleLogout}>Se déconnecter</button>
    </div>
  );
}

export default WorldPage;
