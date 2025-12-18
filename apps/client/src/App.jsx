/**
 * Rôle :
 * - Définir les routes principales de l'application avec react-router-dom.
 * - /login → LoginPage
 * - /world → WorldPage
 */

import React from 'react';
import './styles/main.scss'; // import global
import { BrowserRouter, Routes, Route } from 'react-router-dom'; // ⚠️ IMPORT OBLIGATOIRE
import LoginPage from './pages/LoginPage';
import WorldPage from './pages/WorldPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/world" element={<WorldPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;