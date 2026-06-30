/**
 * GameLayout.jsx
 */

import { Outlet } from "react-router-dom";
import CharacterLayout from "../components/CharacterLayout/CharacterLayout";
import ActionPanel from "../components/ActionPanel/ActionPanel";
import DevToolsHudButton from "../components/DevTools/DevToolsHudButton";
import DevToolsFloatingPanel from "../components/DevTools/DevToolsFloatingPanel";
import WindowManager from "../components/Windows/WindowManager";

export default function GameLayout() {
  return (
    <div className="game-layout">
      <main className="game-layout__content">
        <Outlet />
      </main>

      <CharacterLayout />
      <ActionPanel />
      <WindowManager />
      <DevToolsHudButton />
      <DevToolsFloatingPanel />
    </div>
  );
}
