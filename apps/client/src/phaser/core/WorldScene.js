import Phaser from "phaser";

import Player from "../player/Player";
import PlayerController from "../player/PlayerController";

import { setSpriteDepth } from "../utils/depth";

import { getActionPanelStore } from "../../store/actionPanel.store";
import { getCharacterStore } from "../../store/character.store";

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "WorldScene" });

    this.player = null;
    this.controller = null;

    this.fireCamp = null;
    this.deadTree = null;

    this.socket = null;
    this.interactionTargets = [];
  }

  create() {
    console.log("🌍 WorldScene.create()");
    console.log("🌐 [WorldScene] socket at create:", this.game.socket);
    console.log(
      "🟧 [WorldScene] this.game === window.game ?",
      this.game === window.game
    );

    // on garde window.game pointant sur cette instance
    window.game = this.game;

    this.cameras.main.setBackgroundColor(0x2ecc71);
    this.input.setPollAlways();
    this.input.topOnly = false;

    this.socket = this.game.socket;

    if (!this.socket) {
      console.warn("⚠️ No socket found in WorldScene");
    } else {
      console.log("🌐 [WorldScene] Waiting for socket connection...");

      this.socket.on("connect", () => {
        console.log("🌐 [WorldScene] Socket connected, registering events");
        this.registerGatheringEvents();
      });

      // si déjà connecté au moment du create, on enregistre tout de suite
      if (this.socket.connected) {
        console.log("🌐 [WorldScene] Socket already connected, registering events immediately");
        this.registerGatheringEvents();
      }
    }

    // WORLD BOUNDS
    this.physics.world.setBounds(0, 0, 2000, 2000);
    this.cameras.main.setBounds(0, 0, 2000, 2000);

    // PLAYER
    this.player = new Player(this, 400, 300, "player_idle_32");
    setSpriteDepth(this.player);

    // FIRE CAMP
    this.fireCamp = this.add.image(600, 300, "fire_camp");
    this.fireCamp.setDepth(10);
    this.fireCamp.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.fireCamp.width, this.fireCamp.height),
      Phaser.Geom.Rectangle.Contains
    );

    // DEAD TREE
    this.deadTree = this.add.image(600, 500, "dead_tree");
    this.deadTree.setDepth(10);
    this.deadTree.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.deadTree.width, this.deadTree.height),
      Phaser.Geom.Rectangle.Contains
    );

    // REGISTER INTERACTION TARGETS
    this.interactionTargets.push({
      sprite: this.deadTree,
      id: "tree_1",
      type: "dead_tree",
      actions: ["ramasser", "gathering"],
    });

    // CONTROLLER
    this.controller = new PlayerController(this, this.player);

    // INPUT MAIN HANDLER
    this.input.on("pointerdown", (pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const target = this.getGatheringTargetAt(worldX, worldY);

      if (target) {
        console.log("🎯 [Phaser] Target detected:", target);

        const store = getActionPanelStore();
        store.getState().openPanel(
          { id: target.id, type: target.type },
          target.actions
        );
        return;
      }

      this.controller.startMouseMove(worldX, worldY);
    });

    this.input.on("pointermove", (pointer) => {
      if (pointer.isDown) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.controller.updateMouseTarget(worldPoint.x, worldPoint.y);
      }
    });

    this.input.on("pointerup", () => {
      this.controller.stopMouseMove();
    });

    // CAMERA
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  update() {
    if (this.controller) this.controller.update();
    setSpriteDepth(this.player);
  }

  // CLICK DETECTION
  getGatheringTargetAt(x, y) {
    for (const t of this.interactionTargets) {
      const bounds = t.sprite.getBounds();
      if (bounds.contains(x, y)) return t;
    }
    return null;
  }

  // SOCKET EVENTS
  registerGatheringEvents() {
    console.log("🟦 [WorldScene] registerGatheringEvents CALLED");

    if (!this.socket) {
      console.warn("⚠️ No socket found in WorldScene");
      return;
    }

    this.socket.on("open_gather_window", (data) => {
      console.log("🟩 [WorldScene] open_gather_window RECEIVED", data);
      this.player.requestGather(data.targetId, data.targetType);
    });

    this.socket.on("inventory_update", (data) => {
      console.log("🟩 [WorldScene] inventory_update RECEIVED", data);

      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: data.itemId,
        quantity: data.total,
        name: data.itemId.replace("_", " "),
        image: `/assets/images/items/${data.itemId}.png`,
      });
    });

    this.socket.on("resource_loot", (data) => {
      console.log("🟩 [WorldScene] resource_loot RECEIVED", data);

      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: data.itemId,
        quantity: data.quantity,
        name: data.itemId.replace("_", " "),
        image: `/assets/images/items/${data.itemId}.png`,
      });
    });

    this.socket.on("resource_update", (data) => {
      console.log("🟩 [WorldScene] resource_update RECEIVED", data);
    });
  }

  destroy() {
    super.destroy();
  }
}
