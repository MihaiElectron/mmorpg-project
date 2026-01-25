/**
 * GameLayout.jsx
 */

import { Outlet } from "react-router-dom";
import CharacterLayout from "../components/CharacterLayout/CharacterLayout";
import ActionPanel from "../components/ActionPanel/ActionPanel";

export default function GameLayout() {
  return (
    <div className="game-layout">
      <main className="game-layout__content">
        <Outlet />
      </main>

      <CharacterLayout />
      <ActionPanel />
    </div>
  );
}
