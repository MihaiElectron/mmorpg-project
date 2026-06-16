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

    this.socket = null;
    this.interactionTargets = [];
    this.resourceSprites = new Map();
    this.remotePlayers = new Map();
    this.gatheringEventsRegistered = false;
    this.lastPlayerSyncAt = 0;
    this.lastSyncedPosition = null;
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
      this.registerGatheringEvents();
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

    this.joinWorld();
  }

  update(time) {
    if (this.controller) this.controller.update();
    setSpriteDepth(this.player);
    this.syncLocalPlayer(time);
    this.updateRemotePlayerLabels();
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
    if (this.gatheringEventsRegistered) {
      return;
    }

    console.log("🟦 [WorldScene] registerGatheringEvents CALLED");

    if (!this.socket) {
      console.warn("⚠️ No socket found in WorldScene");
      return;
    }

    this.gatheringEventsRegistered = true;

    this.socket.on("connect", () => {
      console.log("🌐 [WorldScene] Socket connected, requesting resources");
      this.socket.emit("get_resources");
      this.joinWorld();
    });

    this.socket.on("resources", (resources) => {
      console.log("🟩 [WorldScene] resources RECEIVED", resources);
      this.renderResources(resources);
    });

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

      const item = data.item || {};
      const itemId = item.id || data.itemId;
      const itemName = item.name || itemId.replace("_", " ");
      const itemImage =
        item.image || `/assets/images/items/${data.lootItemId || data.itemId}.png`;

      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: itemId,
        quantity: data.total ?? data.quantity,
        name: itemName,
        image: itemImage,
      });
    });

    this.socket.on("resource_update", (data) => {
      console.log("🟩 [WorldScene] resource_update RECEIVED", data);
      if (data.state === "dead") {
        this.removeResource(data.id);
      }
    });

    this.socket.on("current_players", (players) => {
      console.log("🟩 [WorldScene] current_players RECEIVED", players);
      this.clearRemotePlayers();
      players.forEach((player) => this.upsertRemotePlayer(player));
    });

    this.socket.on("player_joined", (player) => {
      console.log("🟩 [WorldScene] player_joined RECEIVED", player);
      this.upsertRemotePlayer(player);
    });

    this.socket.on("player_moved", (player) => {
      this.upsertRemotePlayer(player);
    });

    this.socket.on("player_left", (player) => {
      console.log("🟩 [WorldScene] player_left RECEIVED", player);
      this.removeRemotePlayer(player.socketId);
    });

    if (this.socket.connected) {
      this.socket.emit("get_resources");
      this.joinWorld();
    }
  }

  joinWorld() {
    if (!this.socket || !this.player) return;

    const character = getCharacterStore().getState().character;
    if (!character?.id) return;

    this.socket.emit("join_world", {
      characterId: character.id,
      name: character.name,
      sex: character.sex,
      x: this.player.x,
      y: this.player.y,
      direction: this.player.direction,
    });
  }

  syncLocalPlayer(time) {
    if (!this.socket || !this.socket.connected || !this.player) return;
    if (time - this.lastPlayerSyncAt < 80) return;

    const position = {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      direction: this.player.direction,
    };

    const previous = this.lastSyncedPosition;
    const hasMoved =
      !previous ||
      Math.abs(previous.x - position.x) > 1 ||
      Math.abs(previous.y - position.y) > 1 ||
      previous.direction !== position.direction;

    if (!hasMoved) return;

    this.lastPlayerSyncAt = time;
    this.lastSyncedPosition = position;
    this.socket.emit("player_move", position);
  }

  upsertRemotePlayer(player) {
    if (!player?.socketId || player.socketId === this.socket?.id) return;

    this.removeDuplicateRemotePlayers(player);

    const existing = this.remotePlayers.get(player.socketId);
    if (existing) {
      this.tweens.add({
        targets: existing.sprite,
        x: player.x,
        y: player.y,
        duration: 90,
        ease: "Linear",
      });

      existing.nameText.setText(player.name || "Joueur");
      existing.nameText.setPosition(player.x, player.y - 34);
      existing.characterId = player.characterId;
      setSpriteDepth(existing.sprite);
      existing.nameText.setDepth(existing.sprite.depth + 1);
      return;
    }

    const sprite = this.add.sprite(player.x, player.y, "player_idle_32");
    sprite.setTint(0x66ccff);
    setSpriteDepth(sprite);

    const nameText = this.add
      .text(player.x, player.y - 34, player.name || "Joueur", {
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    nameText.setDepth(sprite.depth + 1);

    this.remotePlayers.set(player.socketId, {
      sprite,
      nameText,
      characterId: player.characterId,
    });
  }

  removeDuplicateRemotePlayers(player) {
    if (!player.characterId) return;

    for (const [socketId, remote] of this.remotePlayers.entries()) {
      if (
        socketId !== player.socketId &&
        remote.characterId === player.characterId
      ) {
        remote.sprite.destroy();
        remote.nameText.destroy();
        this.remotePlayers.delete(socketId);
      }
    }
  }

  removeRemotePlayer(socketId) {
    const remote = this.remotePlayers.get(socketId);
    if (!remote) return;

    remote.sprite.destroy();
    remote.nameText.destroy();
    this.remotePlayers.delete(socketId);
  }

  updateRemotePlayerLabels() {
    for (const remote of this.remotePlayers.values()) {
      remote.nameText.setPosition(remote.sprite.x, remote.sprite.y - 34);
      remote.nameText.setDepth(remote.sprite.depth + 1);
    }
  }

  clearRemotePlayers() {
    for (const socketId of this.remotePlayers.keys()) {
      this.removeRemotePlayer(socketId);
    }
  }

  renderResources(resources) {
    this.clearResources();

    resources
      .filter((resource) => resource.state === "alive")
      .forEach((resource) => {
        const textureKey = this.textures.exists(resource.type)
          ? resource.type
          : "dead_tree";

        const sprite = this.add.image(resource.x, resource.y, textureKey);
        sprite.setDepth(10);
        sprite.setInteractive(
          new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
          Phaser.Geom.Rectangle.Contains
        );

        this.resourceSprites.set(resource.id, sprite);
        this.interactionTargets.push({
          sprite,
          id: resource.id,
          type: resource.type,
          actions: ["ramasser", "gathering"],
        });
      });
  }

  clearResources() {
    for (const sprite of this.resourceSprites.values()) {
      sprite.destroy();
    }

    this.resourceSprites.clear();
    this.interactionTargets = [];
  }

  removeResource(resourceId) {
    const sprite = this.resourceSprites.get(resourceId);

    if (sprite) {
      sprite.destroy();
      this.resourceSprites.delete(resourceId);
    }

    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.id !== resourceId
    );
  }

  destroy() {
    if (this.socket) {
      this.socket.off("connect");
      this.socket.off("resources");
      this.socket.off("open_gather_window");
      this.socket.off("inventory_update");
      this.socket.off("resource_loot");
      this.socket.off("resource_update");
      this.socket.off("current_players");
      this.socket.off("player_joined");
      this.socket.off("player_moved");
      this.socket.off("player_left");
    }

    this.clearResources();
    this.clearRemotePlayers();
    super.destroy();
  }
}
