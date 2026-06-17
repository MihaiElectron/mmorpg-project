import Phaser from "phaser";

import Player from "../player/Player";
import PlayerController from "../player/PlayerController";

import { setSpriteDepth } from "../utils/depth";

import { getActionPanelStore } from "../../store/actionPanel.store";
import { getCharacterStore } from "../../store/character.store";
import { getAdminStore } from "../../store/admin.store";

// ── HP bar constants (mirrors SCSS variables) ──────────────────────────────
const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 6;
const HP_BAR_OFFSET_Y = -46;
const HP_BAR_DEPTH = 18;

function getHpColor(pct) {
  if (pct >= 0.75) return 0x4caf50; // $hp-color-high
  if (pct >= 0.50) return 0xf4d03f; // $hp-color-medium
  if (pct >= 0.25) return 0xe67e22; // $hp-color-low
  return 0xc0392b;                   // $hp-color-critical
}

function createHpBar(scene, x, y) {
  const bg = scene.add.rectangle(x, y + HP_BAR_OFFSET_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x000000, 0.65);
  bg.setDepth(HP_BAR_DEPTH);
  const fill = scene.add.rectangle(x - HP_BAR_WIDTH / 2, y + HP_BAR_OFFSET_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x4caf50);
  fill.setOrigin(0, 0.5);
  fill.setDepth(HP_BAR_DEPTH + 1);
  return { bg, fill };
}

function updateHpBar(hpBar, health, maxHealth, x, y) {
  const pct = maxHealth > 0 ? Math.min(health / maxHealth, 1) : 0;
  hpBar.bg.setPosition(x, y + HP_BAR_OFFSET_Y);
  hpBar.fill.setPosition(x - HP_BAR_WIDTH / 2, y + HP_BAR_OFFSET_Y);
  hpBar.fill.setSize(Math.max(HP_BAR_WIDTH * pct, 1), HP_BAR_HEIGHT);
  hpBar.fill.setFillStyle(getHpColor(pct));
}

function destroyHpBar(hpBar) {
  if (!hpBar) return;
  hpBar.bg.destroy();
  hpBar.fill.destroy();
}

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "WorldScene" });

    this.player = null;
    this.controller = null;

    this.fireCamp = null;

    this.socket = null;
    this.interactionTargets = [];
    this.resourceSprites = new Map();
    this.animalSprites = new Map();
    this.remotePlayers = new Map();
    this.gatheringEventsRegistered = false;
    this.lastPlayerSyncAt = 0;
    this.lastSyncedPosition = null;

    // Indicateur visuel de récolte (local, visible uniquement par ce client).
    this.gatherIndicator = null;

    this.autoAttackTargetId = null;
    this.autoAttackInterval = null;
    this.playerHpBar = null;
  }

  startAutoAttack(targetId) {
    this.stopAutoAttack();
    this.autoAttackTargetId = targetId;

    if (this.player && !this.playerHpBar) {
      this.playerHpBar = createHpBar(this, this.player.x, this.player.y);
    }

    let lastAttackEmitAt = 0;
    const ATTACK_INTERVAL_MS = 750;

    const tick = () => {
      if (!this.socket || !this.autoAttackTargetId) return;
      const character = getCharacterStore().getState().character;
      if (!character?.id) { this.stopAutoAttack(); return; }

      const entry = this.animalSprites.get(targetId);
      if (!entry) return;

      const dist = Math.hypot(
        entry.animal.x - this.player.x,
        entry.animal.y - this.player.y,
      );

      // Poursuite continue : replanifier vers la position actuelle de l'animal
      if (dist > 60 && this.controller) {
        this.controller.moveTo(entry.animal.x, entry.animal.y);
      }

      // Attaque toutes les 750 ms (le serveur vérifie aussi le cooldown)
      const now = Date.now();
      if (now - lastAttackEmitAt >= ATTACK_INTERVAL_MS) {
        lastAttackEmitAt = now;
        this.socket.emit("attack_animal", { targetId, characterId: character.id });
      }
    };

    tick();
    this.autoAttackInterval = setInterval(tick, 300);
  }

  stopAutoAttack() {
    if (this.autoAttackInterval !== null) {
      clearInterval(this.autoAttackInterval);
      this.autoAttackInterval = null;
    }
    this.autoAttackTargetId = null;
    destroyHpBar(this.playerHpBar);
    this.playerHpBar = null;
  }

  create() {
    // on garde window.game pointant sur cette instance
    window.game = this.game;

    this.cameras.main.setBackgroundColor(0x2ecc71);
    this.input.setPollAlways();
    this.input.topOnly = false;

    this.socket = this.game.socket;

    if (!this.socket) {
      console.warn("No socket found in WorldScene");
    } else {
      this.registerGatheringEvents();
    }

    // WORLD BOUNDS
    this.physics.world.setBounds(0, 0, 2000, 2000);
    this.cameras.main.setBounds(0, 0, 2000, 2000);

    // PLAYER
    const character = getCharacterStore().getState().character;
    const startX = character?.positionX ?? 400;
    const startY = character?.positionY ?? 300;
    this.player = new Player(
      this,
      startX,
      startY,
      this.getPlayerTexture(character?.sex),
    );
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

      getCharacterStore().getState().closePanel?.();

      const targets = this.getGatheringTargetsAt(worldX, worldY);

      if (targets.length > 0) {
        const store = getActionPanelStore();
        const first = targets[0];
        const firstAnimal = this.animalSprites.get(first.id)?.animal;

        const overlapping = targets.map((t) => {
          const animalData = this.animalSprites.get(t.id)?.animal;
          return {
            id: t.id,
            type: t.type,
            kind: t.kind,
            health: animalData?.health ?? null,
            maxHealth: animalData?.maxHealth ?? null,
          };
        });

        store.getState().openPanel(
          {
            id: first.id,
            type: first.type,
            kind: first.kind,
            health: firstAnimal?.health ?? null,
            maxHealth: firstAnimal?.maxHealth ?? null,
          },
          first.actions,
          overlapping.length > 1 ? overlapping : [],
        );
        return;
      }

      getAdminStore().getState().setLastClickedPos({ x: Math.round(worldX), y: Math.round(worldY) });
      getActionPanelStore().getState().closePanel();
      this.stopAutoAttack();
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
    this.updateGatherIndicator();
    this.updatePlayerHpBar();
    this.updateAnimalHpBars();
  }

  updatePlayerHpBar() {
    if (!this.playerHpBar || !this.player) return;
    const char = getCharacterStore().getState().character;
    if (!char) return;
    updateHpBar(this.playerHpBar, char.health, char.maxHealth, this.player.x, this.player.y);
  }

  updateAnimalHpBars() {
    for (const entry of this.animalSprites.values()) {
      if (entry.hpBar) {
        updateHpBar(entry.hpBar, entry.animal.health, entry.animal.maxHealth, entry.sprite.x, entry.sprite.y);
      }
    }
  }

  // CLICK DETECTION
  getGatheringTargetAt(x, y) {
    for (const t of this.interactionTargets) {
      const bounds = t.sprite.getBounds();
      if (bounds.contains(x, y)) return t;
    }
    return null;
  }

  getGatheringTargetsAt(x, y) {
    return this.interactionTargets.filter((t) =>
      t.sprite.getBounds().contains(x, y)
    );
  }

  // SOCKET EVENTS
  registerGatheringEvents() {
    if (this.gatheringEventsRegistered) {
      return;
    }

    if (!this.socket) {
      console.warn("No socket found in WorldScene");
      return;
    }

    this.gatheringEventsRegistered = true;

    this.socket.on("connect", () => {
      this.socket.emit("get_resources");
      this.socket.emit("get_animals");
      this.joinWorld();
    });

    this.socket.on("resources", (resources) => {
      this.renderResources(resources);
    });

    this.socket.on("animals", (animals) => {
      this.renderAnimals(animals);
    });

    this.socket.on("inventory_update", (data) => {
      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: data.itemId,
        quantity: data.total,
        name: data.itemId.replace("_", " "),
        image: `/assets/images/items/${data.itemId}.png`,
      });
    });

    this.socket.on("resource_loot", (data) => {
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
      if (data.state === "dead") {
        this.removeResource(data.id);
      }
    });

    this.socket.on("gather_tick", (data) => {
      this.startGatherIndicator(data.targetId, data.duration);
    });

    this.socket.on("gather_stopped", (data) => {
      this.stopGatherIndicator(data.targetId);
    });

    this.socket.on("animal_update", (animal) => {
      if (animal.state === "dead") {
        this.removeAnimal(animal.id);
        if (this.autoAttackTargetId === animal.id) {
          this.stopAutoAttack();
        }
        const panelStore = getActionPanelStore();
        if (panelStore.getState().target?.id === animal.id) {
          panelStore.getState().closePanel();
        }
        return;
      }

      this.upsertAnimal(animal);

      const panelStore = getActionPanelStore();
      const panelState = panelStore.getState();
      if (panelState.target?.id === animal.id) {
        panelState.updateTargetHealth(animal.health, animal.maxHealth);
      }
    });

    this.socket.on("current_players", (players) => {
      this.clearRemotePlayers();
      players.forEach((player) => this.upsertRemotePlayer(player));
    });

    this.socket.on("world_joined", (player) => {
      if (!this.player) return;

      this.player.setPosition(player.x, player.y);
      this.lastSyncedPosition = {
        x: Math.round(player.x),
        y: Math.round(player.y),
        direction: player.direction,
      };
    });

    this.socket.on("player_joined", (player) => {
      this.upsertRemotePlayer(player);
    });

    this.socket.on("player_moved", (player) => {
      this.upsertRemotePlayer(player);
    });

    this.socket.on("player_left", (player) => {
      this.removeRemotePlayer(player);
    });

    this.socket.on("character_damaged", (data) => {
      getCharacterStore().getState().setHealth(data.health);
      if (!this.playerHpBar && this.player) {
        this.playerHpBar = createHpBar(this, this.player.x, this.player.y);
      }
    });

    this.socket.on("character_teleport", (data) => {
      if (this.player) {
        this.player.setPosition(data.x, data.y);
        this.cameras.main.centerOn(data.x, data.y);
        this.lastSyncedPosition = { x: data.x, y: data.y, direction: this.player.direction };
      }
    });

    this.socket.on("character_respawn", (data) => {
      getCharacterStore().getState().setHealth(data.health);
      destroyHpBar(this.playerHpBar);
      this.playerHpBar = null;
      if (this.player) {
        this.player.setPosition(data.x, data.y);
        this.cameras.main.centerOn(data.x, data.y);
        this.lastSyncedPosition = { x: data.x, y: data.y, direction: "down" };
      }
    });

    if (this.socket.connected) {
      this.socket.emit("get_resources");
      this.socket.emit("get_animals");
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
    if (!player?.characterId || player.socketId === this.socket?.id) return;

    const existing = this.remotePlayers.get(player.characterId);
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
      existing.socketId = player.socketId;
      setSpriteDepth(existing.sprite);
      existing.nameText.setDepth(existing.sprite.depth + 1);
      return;
    }

    const sprite = this.add.sprite(
      player.x,
      player.y,
      this.getPlayerTexture(player.sex),
    );
    sprite.setTint(0x66ccff);
    setSpriteDepth(sprite);
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
      Phaser.Geom.Rectangle.Contains,
    );

    const nameText = this.add
      .text(player.x, player.y - 34, player.name || "Joueur", {
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    nameText.setDepth(sprite.depth + 1);

    this.remotePlayers.set(player.characterId, {
      sprite,
      nameText,
      socketId: player.socketId,
    });

    this.interactionTargets.push({
      sprite,
      id: player.characterId,
      type: player.name || "joueur",
      kind: "player",
      actions: ["inspecter"],
    });
  }

  getPlayerTexture(sex) {
    return sex === "female" ? "player_female_32x64" : "player_male_32x64";
  }

  removeRemotePlayer(player) {
    const remote = player?.characterId
      ? this.remotePlayers.get(player.characterId)
      : null;
    if (!remote) return;

    if (player.socketId && remote.socketId !== player.socketId) return;

    remote.sprite.destroy();
    remote.nameText.destroy();
    this.remotePlayers.delete(player.characterId);
    this.interactionTargets = this.interactionTargets.filter(
      (t) => !(t.kind === "player" && t.id === player.characterId),
    );
  }

  updateRemotePlayerLabels() {
    for (const remote of this.remotePlayers.values()) {
      remote.nameText.setPosition(remote.sprite.x, remote.sprite.y - 34);
      remote.nameText.setDepth(remote.sprite.depth + 1);
    }
  }

  clearRemotePlayers() {
    for (const [characterId, remote] of this.remotePlayers.entries()) {
      remote.sprite.destroy();
      remote.nameText.destroy();
      this.remotePlayers.delete(characterId);
    }
    this.interactionTargets = this.interactionTargets.filter(
      (t) => t.kind !== "player",
    );
  }

  // -----------------------------------------------------------------------
  // INDICATEUR DE RÉCOLTE (local, visible uniquement par ce joueur)
  // -----------------------------------------------------------------------
  startGatherIndicator(targetId, duration) {
    if (this.gatherIndicator && this.gatherIndicator.targetId !== targetId) {
      this.gatherIndicator.graphics.destroy();
      this.gatherIndicator = null;
    }

    if (!this.gatherIndicator) {
      const graphics = this.add.graphics();
      graphics.setDepth(20);
      this.gatherIndicator = { targetId, graphics, startTime: this.time.now, duration };
      return;
    }

    // Même cible : on resynchronise juste le timer du cycle suivant.
    this.gatherIndicator.startTime = this.time.now;
    this.gatherIndicator.duration = duration;
  }

  stopGatherIndicator(targetId) {
    if (!this.gatherIndicator || this.gatherIndicator.targetId !== targetId) return;

    this.gatherIndicator.graphics.destroy();
    this.gatherIndicator = null;
  }

  updateGatherIndicator() {
    if (!this.gatherIndicator) return;

    const sprite = this.resourceSprites.get(this.gatherIndicator.targetId);
    if (!sprite) {
      this.stopGatherIndicator(this.gatherIndicator.targetId);
      return;
    }

    const { graphics, startTime, duration } = this.gatherIndicator;
    const progress = Phaser.Math.Clamp((this.time.now - startTime) / duration, 0, 1);

    const x = sprite.x;
    const y = sprite.y - 40;
    const radius = 10;

    graphics.clear();
    graphics.lineStyle(3, 0x000000, 0.4);
    graphics.strokeCircle(x, y, radius);

    graphics.lineStyle(3, 0x00ff66, 1);
    graphics.beginPath();
    graphics.arc(
      x,
      y,
      radius,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + progress * 360),
      false,
    );
    graphics.strokePath();
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
          kind: "resource",
          actions: ["ramasser", "gathering"],
        });
      });
  }

  renderAnimals(animals) {
    this.clearAnimals();

    animals
      .filter((animal) => animal.state === "alive")
      .forEach((animal) => this.upsertAnimal(animal));
  }

  upsertAnimal(animal) {
    const existing = this.animalSprites.get(animal.id);

    if (existing) {
      existing.animal = animal;
      this.tweens.add({
        targets: existing.sprite,
        x: animal.x,
        y: animal.y,
        duration: 180,
        ease: "Linear",
      });

      const inCombat = animal.state === "fighting" || animal.state === "escaping";
      if (inCombat && !existing.hpBar) {
        existing.hpBar = createHpBar(this, existing.sprite.x, existing.sprite.y);
      } else if (!inCombat && existing.hpBar) {
        destroyHpBar(existing.hpBar);
        existing.hpBar = null;
      }
      return;
    }

    const textureKey = this.textures.exists(animal.type) ? animal.type : "turkey";
    const sprite = this.add.image(animal.x, animal.y, textureKey);
    sprite.setDepth(10);
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
      Phaser.Geom.Rectangle.Contains,
    );

    const inCombat = animal.state === "fighting" || animal.state === "escaping";
    const hpBar = inCombat ? createHpBar(this, animal.x, animal.y) : null;
    if (hpBar) updateHpBar(hpBar, animal.health, animal.maxHealth, animal.x, animal.y);

    this.animalSprites.set(animal.id, { sprite, animal, hpBar });
    this.interactionTargets.push({
      sprite,
      id: animal.id,
      type: animal.type,
      kind: "animal",
      actions: ["attaquer"],
    });
  }

  clearResources() {
    for (const sprite of this.resourceSprites.values()) {
      sprite.destroy();
    }

    this.resourceSprites.clear();
    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.kind !== "resource",
    );
  }

  clearAnimals() {
    for (const entry of this.animalSprites.values()) {
      entry.sprite.destroy();
      destroyHpBar(entry.hpBar);
    }

    this.animalSprites.clear();
    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.kind !== "animal",
    );
  }

  removeResource(resourceId) {
    const sprite = this.resourceSprites.get(resourceId);

    if (sprite) {
      sprite.destroy();
      this.resourceSprites.delete(resourceId);
    }

    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.id !== resourceId,
    );

    this.stopGatherIndicator(resourceId);
  }

  removeAnimal(animalId) {
    const entry = this.animalSprites.get(animalId);

    if (entry) {
      entry.sprite.destroy();
      destroyHpBar(entry.hpBar);
      this.animalSprites.delete(animalId);
    }

    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.id !== animalId,
    );
  }

  destroy() {
    if (this.socket) {
      this.socket.off("connect");
      this.socket.off("resources");
      this.socket.off("animals");
      this.socket.off("inventory_update");
      this.socket.off("resource_loot");
      this.socket.off("resource_update");
      this.socket.off("gather_tick");
      this.socket.off("gather_stopped");
      this.socket.off("animal_update");
      this.socket.off("current_players");
      this.socket.off("world_joined");
      this.socket.off("player_joined");
      this.socket.off("player_moved");
      this.socket.off("player_left");
    }

    if (this.gatherIndicator) {
      this.gatherIndicator.graphics.destroy();
      this.gatherIndicator = null;
    }

    this.clearResources();
    destroyHpBar(this.playerHpBar);
    this.playerHpBar = null;
    this.clearAnimals();
    this.clearRemotePlayers();
    super.destroy();
  }
}
