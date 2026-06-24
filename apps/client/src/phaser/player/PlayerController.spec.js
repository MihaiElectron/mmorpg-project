import { beforeEach, describe, expect, it, vi } from "vitest";

import PlayerController, { MOUSE_HOLD_THRESHOLD_MS } from "./PlayerController";
import { pushDebugEvent } from "../../components/DevTools/debugEventLog";

vi.mock("../../store/devtools.store", () => ({
  getDevToolsStore: () => ({
    getState: () => ({ isConsoleActive: false }),
  }),
}));

vi.mock("../../components/DevTools/debugEventLog", () => ({
  pushDebugEvent: vi.fn(),
}));

function createController({ pathfinder } = {}) {
  const cursors = {
    left: { isDown: false },
    right: { isDown: false },
    up: { isDown: false },
    down: { isDown: false },
  };
  const player = {
    x: 0,
    y: 0,
    speed: 100,
    velocity: { x: 0, y: 0 },
    setVelocity: vi.fn((x, y = x) => {
      player.velocity = { x, y };
    }),
  };
  const activePointer = {
    x: 100,
    y: 0,
  };
  const getWorldPoint = vi.fn((x, y) => ({ x, y }));
  const scene = {
    pathfinder,
    input: {
      activePointer,
      keyboard: {
        createCursorKeys: () => cursors,
      },
    },
    cameras: {
      main: {
        getWorldPoint,
      },
    },
  };

  return {
    controller: new PlayerController(scene, player),
    cursors,
    player,
    scene,
    getWorldPoint,
  };
}

describe("PlayerController — mouse movement", () => {
  let now;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.mocked(pushDebugEvent).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("continue dans la direction souris si le clic reste maintenu sans nouveau pointermove", () => {
    const { controller, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();

    expect(controller.isDragging).toBe(true);
    expect(controller.isMouseHoldMovement).toBe(true);
    expect(player.setVelocity).toHaveBeenLastCalledWith(100, 0);
  });

  it("utilise la position courante du pointeur quand le maintien devient un drag", () => {
    const { controller, player, scene } = createController();

    controller.startMouseMove(100, 0);
    now = 50;
    scene.input.activePointer.x = 0;
    scene.input.activePointer.y = 100;
    controller.updateMouseTarget(0, 100);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();

    expect(controller.isDragging).toBe(true);
    expect(player.velocity.x).toBeCloseTo(0);
    expect(player.velocity.y).toBeCloseTo(100);
  });

  it("le clic simple peut s'arrêter quand la cible est atteinte", () => {
    const { controller, player } = createController();

    player.x = 100;
    player.y = 0;
    controller.startMouseMove(100, 0);
    now = 50;
    controller.stopMouseMove();
    controller.update();

    expect(controller.isMouseHoldMovement).toBe(false);
    expect(player.setVelocity).toHaveBeenLastCalledWith(0);
  });

  it("le clic maintenu ne s'arrête pas quand la dernière cible est atteinte", () => {
    const { controller, getWorldPoint, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();
    player.x = 100;
    getWorldPoint.mockReturnValue({ x: 200, y: 0 });
    controller.update();

    expect(controller.isMouseHoldMovement).toBe(true);
    expect(controller.target).toEqual({ x: 200, y: 0 });
    expect(player.setVelocity).toHaveBeenLastCalledWith(100, 0);
  });

  it("le clic maintenu garde la dernière direction si la cible reprojetée reste dans le seuil", () => {
    const { controller, getWorldPoint, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();
    player.x = 100;
    getWorldPoint.mockReturnValue({ x: 100, y: 0 });
    controller.update();

    expect(controller.isMouseHoldMovement).toBe(true);
    expect(player.setVelocity).toHaveBeenLastCalledWith(100, 0);
    expect(pushDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "target_reached_ignored_because_dragging",
      }),
    );
  });

  it("arrête le déplacement souris au relâchement après maintien", () => {
    const { controller, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();
    now = 250;
    controller.stopMouseMove();

    expect(controller.mouseActive).toBe(false);
    expect(controller.target).toBe(null);
    expect(controller.path).toBe(null);
    expect(controller.isMouseHoldMovement).toBe(false);
    controller.update();
    expect(player.setVelocity).toHaveBeenLastCalledWith(0);
  });

  it("le clavier garde la priorité et annule le clic maintenu", () => {
    const { controller, cursors, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();
    cursors.up.isDown = true;
    controller.update();

    expect(controller.mouseActive).toBe(false);
    expect(controller.isMouseHoldMovement).toBe(false);
    expect(player.setVelocity).toHaveBeenLastCalledWith(0, -100);
    expect(pushDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mouse_movement_stop",
        details: expect.objectContaining({ reason: "keyboard_input" }),
      }),
    );
  });

  it("un blur annule le clic maintenu avec une raison explicite", () => {
    const { controller, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();
    now = 250;
    controller.stopMouseMove("window_blur");
    controller.update();

    expect(controller.mouseActive).toBe(false);
    expect(controller.isMouseHoldMovement).toBe(false);
    expect(player.setVelocity).toHaveBeenLastCalledWith(0);
    expect(pushDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mouse_movement_stop",
        details: expect.objectContaining({ reason: "window_blur" }),
      }),
    );
  });

  it("conserve le cheminement par clic simple sans rejeter le mouvement", () => {
    const pathfinder = {
      findPath: vi.fn(() => [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ]),
    };
    const { controller } = createController({ pathfinder });

    controller.startMouseMove(96, 0);
    now = 50;
    controller.stopMouseMove();

    expect(pathfinder.findPath).toHaveBeenCalledWith(0, 0, 3, 0);
    expect(controller.mouseActive).toBe(true);
    expect(controller.path).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });
});
