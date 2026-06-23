import { getDevToolsStore } from "../../store/devtools.store";

export default class PlayerController {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    this.cursors = scene.input.keyboard.createCursorKeys();

    // Souris
    this.mouseActive = false;
    this.isDragging = false;
    this.clickStartTime = 0;

    // Pathfinding
    this.path = null;
    this.currentPathIndex = 0;
    this.arrivalThreshold = 8;

    // Steering direct
    this.target = null;
  }

  // -------------------------------------------------------
  // POINTER DOWN
  // -------------------------------------------------------
  startMouseMove(x, y) {
    this.mouseActive = true;
    this.isDragging = false;
    this.clickStartTime = performance.now();

    this.target = { x, y };
  }

  // -------------------------------------------------------
  // POINTER MOVE (MAINTIEN)
  // -------------------------------------------------------
  updateMouseTarget(x, y) {
    if (!this.mouseActive) return;

    const heldTime = performance.now() - this.clickStartTime;

    if (heldTime > 150) {
      this.isDragging = true;
      this.path = null;
      this.currentPathIndex = 0;

      this.target = { x, y };
    }
  }

  // -------------------------------------------------------
  // POINTER UP
  // -------------------------------------------------------
  stopMouseMove() {
    const clickDuration = performance.now() - this.clickStartTime;

    if (clickDuration < 150 && !this.isDragging) {
      if (this.target) this.calculatePath(this.target.x, this.target.y);
      return;
    }

    this.mouseActive = false;
    this.target = null;
    this.path = null;
    this.currentPathIndex = 0;
  }

  // -------------------------------------------------------
  // DÉPLACEMENT PROGRAMMATIQUE (auto-attaque, poursuite)
  // -------------------------------------------------------
  moveTo(x, y) {
    this.mouseActive = true;
    this.isDragging = true;
    this.path = null;
    this.currentPathIndex = 0;
    this.target = { x, y };
  }

  // -------------------------------------------------------
  // PATHFINDING
  // -------------------------------------------------------
  calculatePath(targetX, targetY) {
    if (!this.scene.pathfinder) {
      console.warn("Pathfinder missing, fallback to direct movement");
      this.target = { x: targetX, y: targetY };
      return;
    }

    const tileSize = 32;
    const startX = Math.floor(this.player.x / tileSize);
    const startY = Math.floor(this.player.y / tileSize);
    const endX = Math.floor(targetX / tileSize);
    const endY = Math.floor(targetY / tileSize);

    const newPath = this.scene.pathfinder.findPath(startX, startY, endX, endY);

    if (newPath && newPath.length > 0) {
      this.path = newPath;
      this.currentPathIndex = 0;
      this.target = null;
    } else {
      this.path = null;
      this.target = { x: targetX, y: targetY };
    }
  }

  // -------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------
  update() {
    const speed = this.player.speed;

    // 1. CLAVIER — désactivé quand la console admin a le focus
    let vx = 0;
    let vy = 0;

    if (!getDevToolsStore().getState().isConsoleActive) {
      if (this.cursors.left.isDown) vx = -speed;
      if (this.cursors.right.isDown) vx = speed;
      if (this.cursors.up.isDown) vy = -speed;
      if (this.cursors.down.isDown) vy = speed;
    }

    if (vx !== 0 || vy !== 0) {
      this.mouseActive = false;
      this.path = null;
      this.target = null;
      this.player.setVelocity(vx, vy);
      return;
    }

    // 2. MAINTIEN → steering direct
    if (this.mouseActive && this.isDragging && this.target) {
      this.directMoveToTarget(speed);
      return;
    }

    // 3. CLIC SIMPLE → pathfinding
    if (this.mouseActive && this.path && this.path.length > 0) {
      this.followPath(speed);
      return;
    }

    // 4. AUCUN INPUT
    this.player.setVelocity(0);
  }

  // -------------------------------------------------------
  // FOLLOW PATH
  // -------------------------------------------------------
  followPath(speed) {
    if (!this.path || this.currentPathIndex >= this.path.length) {
      this.player.setVelocity(0);
      this.mouseActive = false;
      return;
    }

    const tileSize = 32;
    const waypoint = this.path[this.currentPathIndex];

    const targetX = waypoint.x * tileSize + tileSize / 2;
    const targetY = waypoint.y * tileSize + tileSize / 2;

    const dx = targetX - this.player.x;
    const dy = targetY - this.player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.arrivalThreshold) {
      this.currentPathIndex++;
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    this.player.setVelocity(nx * speed, ny * speed);
  }

  // -------------------------------------------------------
  // DIRECT MOVE (drag)
  // -------------------------------------------------------
  directMoveToTarget(speed) {
    const dx = this.target.x - this.player.x;
    const dy = this.target.y - this.player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.arrivalThreshold) {
      this.player.setVelocity(0);
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    this.player.setVelocity(nx * speed, ny * speed);
  }
}
