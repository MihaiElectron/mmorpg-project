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
  
    if (!res.ok) {
      throw new Error('Nom déjà pris ou erreur serveur');
    }
  
    return res.json();
  }
  
  export async function loginUser(username, password) {
    const res = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  
    if (!res.ok) {
      throw new Error('Identifiants invalides');
    }
  
    return res.json(); // renvoie { access_token }
  }
  