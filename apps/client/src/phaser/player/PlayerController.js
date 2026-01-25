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
    console.log("🟦 POINTER DOWN at", x, y);

    if (this.player.isGathering) {
      this.player.socket.emit("stop_gathering");
      this.player.stopGathering();
    }

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
    console.log("🟨 POINTER MOVE, held:", heldTime);

    if (heldTime > 150) {
      if (!this.isDragging) console.log("🟧 DRAG MODE ACTIVATED");

      this.isDragging = true;

      if (this.path) console.log("❌ DRAG CANCELS PATHFINDING");

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
    console.log("🟥 POINTER UP, duration:", clickDuration);

    if (clickDuration < 150 && !this.isDragging) {
      console.log("🟩 SIMPLE CLICK → PATHFINDING");
      if (this.target) this.calculatePath(this.target.x, this.target.y);
      return;
    }

    console.log("🟫 DRAG END → STOP MOVEMENT");

    this.mouseActive = false;
    this.target = null;
    this.path = null;
    this.currentPathIndex = 0;
  }

  // -------------------------------------------------------
  // PATHFINDING
  // -------------------------------------------------------
  calculatePath(targetX, targetY) {
    console.log("🔵 PATHFINDING REQUEST to", targetX, targetY);

    if (!this.scene.pathfinder) {
      console.warn("⚠ Pathfinder missing → fallback direct");
      this.target = { x: targetX, y: targetY };
      return;
    }

    const tileSize = 32;
    const startX = Math.floor(this.player.x / tileSize);
    const startY = Math.floor(this.player.y / tileSize);
    const endX = Math.floor(targetX / tileSize);
    const endY = Math.floor(targetY / tileSize);

    console.log(
      "Tile target:",
      endX,
      endY,
      "grid value:",
      this.scene.collisionGrid[endY]?.[endX],
    );

    const newPath = this.scene.pathfinder.findPath(startX, startY, endX, endY);

    if (newPath && newPath.length > 0) {
      console.log("🟢 PATH FOUND:", newPath.length, "waypoints");
      this.path = newPath;
      this.currentPathIndex = 0;
      this.target = null;
    } else {
      console.log("🔴 NO PATH → fallback direct");
      this.path = null;
      this.target = { x: targetX, y: targetY };
    }
  }

  // -------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------
  update() {
    const speed = this.player.speed;

    // 1. CLAVIER
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown) vx = -speed;
    if (this.cursors.right.isDown) vx = speed;
    if (this.cursors.up.isDown) vy = -speed;
    if (this.cursors.down.isDown) vy = speed;

    if (vx !== 0 || vy !== 0) {
      console.log("⌨ KEYBOARD OVERRIDE");
      this.mouseActive = false;
      this.path = null;
      this.target = null;
      this.player.setVelocity(vx, vy);
      return;
    }

    // 2. MAINTIEN → steering direct
    if (this.mouseActive && this.isDragging && this.target) {
      console.log("➡ DIRECT MOVE (drag)");
      this.directMoveToTarget(speed);
      return;
    }

    // 3. CLIC SIMPLE → pathfinding
    if (this.mouseActive && this.path && this.path.length > 0) {
      console.log("➡ FOLLOW PATH");
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
      console.log("🏁 PATH COMPLETE");
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

    console.log(
      `📍 PATH STEP ${this.currentPathIndex}/${this.path.length} → dist ${dist}`,
    );

    if (dist <= this.arrivalThreshold) {
      console.log("➡ NEXT WAYPOINT");
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

    console.log("🎯 DIRECT MOVE → dist", dist);

    if (dist <= this.arrivalThreshold) {
      console.log("🛑 DIRECT MOVE STOP");
      this.player.setVelocity(0);
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    this.player.setVelocity(nx * speed, ny * speed);
  }
}
