/**
 * Fonctions utilitaires pour appeler l’API backend.
 * - registerUser : crée un nouvel utilisateur via POST /auth/register
 * - loginUser : connecte un utilisateur via POST /auth/login
 */

export async function registerUser(username, password) {
  const res = await fetch('http://localhost:3000/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json(); // récupère le message du backend

  if (!res.ok) {
    // renvoie le vrai message du backend
    throw new Error(data.message || 'Erreur');
  }

  return data;
}

export async function loginUser(username, password) {
  const res = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json(); // récupère le message du backend

  if (!res.ok) {
    throw new Error(data.message || 'Erreur');
  }

  return data; // renvoie { access_token }
}
