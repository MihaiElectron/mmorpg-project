import { beforeEach, describe, expect, it, vi } from "vitest";

import PlayerController, { MOUSE_HOLD_THRESHOLD_MS } from "./PlayerController";

vi.mock("../../store/devtools.store", () => ({
  getDevToolsStore: () => ({
    getState: () => ({ isConsoleActive: false }),
  }),
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
  const scene = {
    pathfinder,
    input: {
      keyboard: {
        createCursorKeys: () => cursors,
      },
    },
  };

  return {
    controller: new PlayerController(scene, player),
    cursors,
    player,
  };
}

describe("PlayerController — mouse movement", () => {
  let now;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  it("continue vers la cible si le clic reste maintenu sans nouveau pointermove", () => {
    const { controller, player } = createController();

    controller.startMouseMove(100, 0);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();

    expect(controller.isDragging).toBe(true);
    expect(player.setVelocity).toHaveBeenLastCalledWith(100, 0);
  });

  it("utilise la position courante du pointeur quand le maintien devient un drag", () => {
    const { controller, player } = createController();

    controller.startMouseMove(100, 0);
    now = 50;
    controller.updateMouseTarget(0, 100);
    now = MOUSE_HOLD_THRESHOLD_MS + 1;
    controller.update();

    expect(controller.isDragging).toBe(true);
    expect(player.velocity.x).toBeCloseTo(0);
    expect(player.velocity.y).toBeCloseTo(100);
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
    controller.update();
    expect(player.setVelocity).toHaveBeenLastCalledWith(0);
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
