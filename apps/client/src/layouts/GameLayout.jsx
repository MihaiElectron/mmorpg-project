/**
 * GameLayout.jsx
 * Layout principal des pages du jeu.
 * Affiche le CharacterLayout + le contenu de la page.
 */

import { Outlet } from "react-router-dom";
import CharacterLayout from "../components/CharacterLayout/CharacterLayout";

export default function GameLayout() {
  return (
    <>
      <Outlet />
      <CharacterLayout />
    </>
  );
}
