import Phaser from "phaser";
import Player from "../player/Player";
import PlayerController from "../player/PlayerController";
import Pathfinder from "../utils/pathfinding";
import { setSpriteDepth } from "../utils/depth";

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "WorldScene" });

    this.player = null;
    this.controller = null;

    this.fireCamp = null;
    this.deadTree = null;

    this.collisionGrid = null;
    this.pathfinder = null;

    this.equipment = {};
  }

  create() {
    console.log("WorldScene: create()");

    this.cameras.main.setBackgroundColor(0x2ecc71);
    this.input.setPollAlways();

    // -----------------------------------------------------------------------
    // WORLD BOUNDS (OBLIGATOIRE POUR LE MOUVEMENT)
    // -----------------------------------------------------------------------
    this.physics.world.setBounds(0, 0, 2000, 2000);
    this.cameras.main.setBounds(0, 0, 2000, 2000);

    // -----------------------------------------------------------------------
    // PLAYER
    // -----------------------------------------------------------------------
    this.player = new Player(this, 400, 300, "player_idle_32");
    setSpriteDepth(this.player);

    // -----------------------------------------------------------------------
    // FIRE CAMP
    // -----------------------------------------------------------------------
    this.fireCamp = this.physics.add.staticImage(600, 300, "fire_camp");
    this.fireCamp.body.setSize(40, 20);
    this.fireCamp.body.setOffset(
      (this.fireCamp.width - 40) / 2,
      (this.fireCamp.height - 20) / 2
    );
    this.fireCamp.refreshBody();
    this.physics.add.collider(this.player, this.fireCamp);
    setSpriteDepth(this.fireCamp);

    // -----------------------------------------------------------------------
    // DEAD TREE
    // -----------------------------------------------------------------------
    this.deadTree = this.physics.add.staticImage(600, 500, "dead_tree");
    this.deadTree.body.setSize(40, 20);
    this.deadTree.body.setOffset(
      (this.deadTree.width - 40) / 2,
      (this.deadTree.height - 20) / 2
    );
    this.deadTree.refreshBody();
    this.physics.add.collider(this.player, this.deadTree);
    setSpriteDepth(this.deadTree);

    // -----------------------------------------------------------------------
    // CONTROLLER
    // -----------------------------------------------------------------------
    this.controller = new PlayerController(this, this.player);

    // -----------------------------------------------------------------------
    // INPUT RELAY
    // -----------------------------------------------------------------------
    this.input.on("pointerdown", (pointer) => {
      this.controller.startMouseMove(pointer.worldX, pointer.worldY);
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

    // -----------------------------------------------------------------------
    // GRID + PATHFINDER
    // -----------------------------------------------------------------------
    this.createDynamicCollisionGrid();
    this.pathfinder = new Pathfinder(this.collisionGrid);

    // -----------------------------------------------------------------------
    // CAMERA (ZOOM AVANT FOLLOW)
    // -----------------------------------------------------------------------
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // -----------------------------------------------------------------------
    // EQUIPMENT
    // -----------------------------------------------------------------------
    this.game.events.on("equipment-changed", this.updateEquipment, this);
  }

  update() {
    if (this.controller) this.controller.update();

    setSpriteDepth(this.player);
    setSpriteDepth(this.fireCamp);
    setSpriteDepth(this.deadTree);
  }

  // -------------------------------------------------------------------------
  // DYNAMIC GRID (monde libre)
  // -------------------------------------------------------------------------
  createDynamicCollisionGrid() {
    const tileSize = 32;

    const worldWidth = 2000;
    const worldHeight = 2000;

    const gridWidth = Math.ceil(worldWidth / tileSize);
    const gridHeight = Math.ceil(worldHeight / tileSize);

    this.collisionGrid = Array(gridHeight)
      .fill()
      .map(() => Array(gridWidth).fill(0));

    const blockSprite = (sprite) => {
      const x = sprite.x - sprite.width / 2;
      const y = sprite.y - sprite.height / 2;
      const w = sprite.width;
      const h = sprite.height;

      const startX = Math.floor(x / tileSize);
      const startY = Math.floor(y / tileSize);
      const endX = Math.ceil((x + w) / tileSize);
      const endY = Math.ceil((y + h) / tileSize);

      for (let gy = startY; gy < endY; gy++) {
        for (let gx = startX; gx < endX; gx++) {
          if (this.collisionGrid[gy] && this.collisionGrid[gy][gx] !== undefined) {
            this.collisionGrid[gy][gx] = 1;
          }
        }
      }
    };

    blockSprite(this.fireCamp);
    blockSprite(this.deadTree);

    console.log("Dynamic collision grid created", gridWidth, "x", gridHeight);
  }

  updateEquipment(equipment) {
    console.log("WorldScene: updateEquipment", equipment);
    this.equipment = equipment;
  }

  destroy() {
    if (this.game && this.game.events) {
      this.game.events.off("equipment-changed", this.updateEquipment, this);
    }
    super.destroy();
  }
}
