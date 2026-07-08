import AdminPanelWOM from "../AdminPanel/AdminPanelWOM";
import { WorldModule } from "./modules/World";
import { ItemsModule } from "./modules/Items";
import { LootPoolModule } from "./modules/LootPools";
import { CharacterProgressionModule } from "./modules/CharacterProgression";
import OverlayControls from "./OverlayControls";
import LotsInspector from "./LotsInspector";
import "./DevToolsPanel.scss";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <ItemsModule />
      <LootPoolModule />
      <CharacterProgressionModule />
      <LotsInspector />
      <OverlayControls />
      <AdminPanelWOM />
    </>
  );
}
