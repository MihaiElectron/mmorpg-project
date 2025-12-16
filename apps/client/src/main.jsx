// Point d'entrée du client React Vite : monte le router/arbre React dans #root
// et applique les styles globaux. Ajoutez ici les providers (state, query,
// i18n, etc.) dont toute l'app a besoin.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
