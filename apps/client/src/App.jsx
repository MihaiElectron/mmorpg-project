/**
 * Rôle :
 * - Définir les routes principales de l'application avec react-router-dom.
 * - /login → LoginPage
 * - /world → WorldPage
 */

import React from 'react';
import './styles/main.scss';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import WorldPage from './pages/WorldPage';
import GameLayout from './layouts/GameLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Pages sans layer */}
        <Route path="/" element={<LoginPage />} />

        {/* Pages AVEC layer */}
        <Route path="/world" element={<GameLayout />}>
          <Route index element={<WorldPage />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;
