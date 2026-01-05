/**
 * handleResponse
 * --------------
 * Fonction utilitaire centralisée pour gérer toutes les réponses HTTP.
 *
 * Rôle :
 * - Vérifier si la réponse est OK (status 2xx)
 * - Tenter de parser le JSON uniquement si possible
 * - Extraire un message d'erreur cohérent, même si le backend renvoie :
 *      - un message simple
 *      - un tableau d'erreurs (ValidationPipe NestJS)
 *      - un body non-JSON (erreurs réseau, HTML, etc.)
 * - Lever une exception propre avec un message lisible par le frontend
 */
async function handleResponse(res, defaultMessage) {
  // Si la requête a réussi → on renvoie directement le JSON
  if (res.ok) {
    return res.json();
  }

  // Message par défaut si rien d'autre n'est disponible
  let errorMessage = defaultMessage;

  try {
    // Tentative de parsing JSON (peut échouer si le backend renvoie autre chose)
    const data = await res.json();

    // Cas NestJS : message = tableau d'erreurs
    if (Array.isArray(data.message)) {
      errorMessage = data.message.join(', ');
    } else {
      errorMessage = data.message || errorMessage;
    }
  } catch {
    // Si le body n'est pas du JSON valide → fallback sur statusText
    errorMessage = res.statusText || errorMessage;
  }

  // On lève une erreur propre, capturable dans le frontend
  throw new Error(errorMessage);
}

/**
 * registerUser
 * ------------
 * Appelle POST /auth/register pour créer un nouvel utilisateur.
 * Utilise handleResponse pour une gestion d'erreur uniforme.
 */
export async function registerUser(username, password) {
  const res = await fetch('http://localhost:3000/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  return handleResponse(res, "Erreur lors de l'inscription");
}

/**
 * loginUser
 * ---------
 * Appelle POST /auth/login pour connecter un utilisateur.
 * Retourne { access_token } si succès.
 */
export async function loginUser(username, password) {
  const res = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  return handleResponse(res, "Erreur lors de la connexion");
}
