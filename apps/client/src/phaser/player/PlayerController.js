import { getDevToolsStore } from "../../store/devtools.store";
import { pushDebugEvent } from "../../components/DevTools/debugEventLog";

export const MOUSE_HOLD_THRESHOLD_MS = 150;

export default class PlayerController {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    this.cursors = scene.input.keyboard.createCursorKeys();

    // Souris
    this.mouseActive = false;
    this.isDragging = false;
    this.isPointerHeld = false;
    this.isMouseHoldMovement = false;
    this.lastMouseDirection = null;
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
    this.isPointerHeld = true;
    this.isMouseHoldMovement = false;
    this.lastMouseDirection = null;
    this.clickStartTime = performance.now();

    this.target = { x, y };

    pushDebugEvent({
      source: "PlayerController",
      type: "mouse_movement_start",
      details: this.getDebugDetails({ targetX: Math.round(x), targetY: Math.round(y) }),
    });
  }

  // -------------------------------------------------------
  // POINTER MOVE (MAINTIEN)
  // -------------------------------------------------------
  updateMouseTarget(x, y) {
    if (!this.mouseActive) return;

    this.target = { x, y };

    this.activateMouseDragIfHeld();

    pushDebugEvent({
      source: "PlayerController",
      type: "mouse_target_update",
      details: this.getDebugDetails({ targetX: Math.round(x), targetY: Math.round(y) }),
    });
  }

  // -------------------------------------------------------
  // POINTER UP
  // -------------------------------------------------------
  stopMouseMove(reason = "pointerup") {
    if (!this.mouseActive) return;

    const clickDuration = performance.now() - this.clickStartTime;
    this.isPointerHeld = false;

    if (clickDuration < MOUSE_HOLD_THRESHOLD_MS && !this.isDragging) {
      pushDebugEvent({
        source: "PlayerController",
        type: "mouse_click_path_request",
        details: this.getDebugDetails({
          reason,
          clickDurationMs: Math.round(clickDuration),
        }),
      });
      if (this.target) this.calculatePath(this.target.x, this.target.y);
      return;
    }

    pushDebugEvent({
      source: "PlayerController",
      type: "mouse_movement_stop",
      details: this.getDebugDetails({
        reason,
        clickDurationMs: Math.round(clickDuration),
      }),
    });

    this.mouseActive = false;
    this.isDragging = false;
    this.isMouseHoldMovement = false;
    this.lastMouseDirection = null;
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
    this.isPointerHeld = false;
    this.isMouseHoldMovement = false;
    this.lastMouseDirection = null;
    this.path = null;
    this.currentPathIndex = 0;
    this.target = { x, y };

    pushDebugEvent({
      source: "PlayerController",
      type: "programmatic_move_start",
      details: this.getDebugDetails({ targetX: Math.round(x), targetY: Math.round(y) }),
    });
  }

  // -------------------------------------------------------
  // PATHFINDING
  // -------------------------------------------------------
  calculatePath(targetX, targetY) {
    if (!this.scene.pathfinder) {
      console.warn("Pathfinder missing, fallback to direct movement");
      pushDebugEvent({
        source: "PlayerController",
        type: "pathfinding_fallback",
        details: this.getDebugDetails({
          reason: "missing_pathfinder",
          targetX: Math.round(targetX),
          targetY: Math.round(targetY),
        }),
      });
      this.target = { x: targetX, y: targetY };
      return;
    }

    // Legacy pathfinding grid: not wired in Walkability P1.
    // The active Tiled map uses ADR WU conversions and 128x64 visual tiles.
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
      pushDebugEvent({
        source: "PlayerController",
        type: "pathfinding_path_found",
        details: this.getDebugDetails({ pathLength: newPath.length }),
      });
    } else {
      this.path = null;
      this.target = { x: targetX, y: targetY };
      pushDebugEvent({
        source: "PlayerController",
        type: "pathfinding_fallback",
        details: this.getDebugDetails({
          reason: "no_path",
          targetX: Math.round(targetX),
          targetY: Math.round(targetY),
        }),
      });
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
      if (this.mouseActive) {
        pushDebugEvent({
          source: "PlayerController",
          type: "mouse_movement_stop",
          details: this.getDebugDetails({ reason: "keyboard_input" }),
        });
      }
      this.mouseActive = false;
      this.isDragging = false;
      this.isPointerHeld = false;
      this.isMouseHoldMovement = false;
      this.lastMouseDirection = null;
      this.path = null;
      this.target = null;
      this.player.setVelocity(vx, vy);
      return;
    }

    this.activateMouseDragIfHeld();

    // 2. MAINTIEN → steering direct
    if (this.mouseActive && this.isMouseHoldMovement && this.target) {
      this.moveInMouseHoldDirection(speed);
      return;
    }

    // 3. Déplacement direct vers cible (clic simple fallback / poursuite)
    if (this.mouseActive && this.target) {
      this.directMoveToTarget(speed);
      return;
    }

    // 4. CLIC SIMPLE → pathfinding
    if (this.mouseActive && this.path && this.path.length > 0) {
      this.followPath(speed);
      return;
    }

    // 5. AUCUN INPUT
    this.player.setVelocity(0);
  }

  activateMouseDragIfHeld() {
    if (!this.mouseActive || !this.isPointerHeld || this.isDragging || !this.target) return;

    const heldTime = performance.now() - this.clickStartTime;
    if (heldTime <= MOUSE_HOLD_THRESHOLD_MS) return;

    this.isDragging = true;
    this.isMouseHoldMovement = true;
    this.path = null;
    this.currentPathIndex = 0;
    this.updateLastMouseDirection();

    pushDebugEvent({
      source: "PlayerController",
      type: "mouse_drag_activated",
      details: this.getDebugDetails({ heldTimeMs: Math.round(heldTime) }),
    });
  }

  isKeyboardActive() {
    return Boolean(
      this.cursors.left.isDown ||
      this.cursors.right.isDown ||
      this.cursors.up.isDown ||
      this.cursors.down.isDown,
    );
  }

  getDebugDetails(extra = {}) {
    return {
      mouseActive: this.mouseActive,
      isDragging: this.isDragging,
      isPointerHeld: this.isPointerHeld,
      isMouseHoldMovement: this.isMouseHoldMovement,
      keyboardActive: this.isKeyboardActive(),
      hasTarget: Boolean(this.target),
      targetX: this.target ? Math.round(this.target.x) : null,
      targetY: this.target ? Math.round(this.target.y) : null,
      hasPath: Boolean(this.path?.length),
      lastDirX: this.lastMouseDirection ? Number(this.lastMouseDirection.x.toFixed(3)) : null,
      lastDirY: this.lastMouseDirection ? Number(this.lastMouseDirection.y.toFixed(3)) : null,
      ...extra,
    };
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

  // -------------------------------------------------------
  // HOLD MOVE (clic maintenu)
  // -------------------------------------------------------
  moveInMouseHoldDirection(speed) {
    this.refreshMouseHoldTargetFromPointer();
    const direction = this.updateLastMouseDirection();

    if (!direction) {
      this.player.setVelocity(0);
      return;
    }

    const dx = this.target.x - this.player.x;
    const dy = this.target.y - this.player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.arrivalThreshold) {
      pushDebugEvent({
        source: "PlayerController",
        type: "target_reached_ignored_because_dragging",
        details: this.getDebugDetails({ distance: Number(dist.toFixed(2)) }),
      });
    }

    pushDebugEvent({
      source: "PlayerController",
      type: "mouse_hold_direction_move",
      details: this.getDebugDetails({
        dirX: Number(direction.x.toFixed(3)),
        dirY: Number(direction.y.toFixed(3)),
      }),
    });

    this.player.setVelocity(direction.x * speed, direction.y * speed);
  }

  refreshMouseHoldTargetFromPointer() {
    const pointer = this.scene.input?.activePointer;
    const camera = this.scene.cameras?.main;

    if (!pointer || !camera?.getWorldPoint) return;

    const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
    if (!Number.isFinite(worldPoint?.x) || !Number.isFinite(worldPoint?.y)) return;

    this.target = {
      x: worldPoint.x,
      y: worldPoint.y,
    };
  }

  updateLastMouseDirection() {
    if (!this.target) return this.lastMouseDirection;

    const dx = this.target.x - this.player.x;
    const dy = this.target.y - this.player.y;
    const dist = Math.hypot(dx, dy);

    if (dist > this.arrivalThreshold) {
      this.lastMouseDirection = {
        x: dx / dist,
        y: dy / dist,
      };
    }

    return this.lastMouseDirection;
  }
}
