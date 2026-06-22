type DevToolsSocket = {
  connected?: boolean;
  emit: (event: string, payload: unknown, callback?: (response: unknown) => void) => void;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  off?: (event: string, callback: (...args: any[]) => void) => void;
};

type PhaserGameLike = {
  socket?: DevToolsSocket;
  scene?: {
    getScene?: (key: string) => any;
  };
};

type DevToolsWindow = Window &
  typeof globalThis & {
    game?: PhaserGameLike;
  };

export function getPhaserGame(): PhaserGameLike | null {
  if (typeof window === "undefined") return null;
  return (window as DevToolsWindow).game ?? null;
}

export function getWorldScene(): any | null {
  try {
    return getPhaserGame()?.scene?.getScene?.("WorldScene") ?? null;
  } catch {
    return null;
  }
}

export function getDevToolsSocket(): DevToolsSocket | null {
  return getPhaserGame()?.socket ?? null;
}

export function getCurrentMapId(): number {
  const mapId = getWorldScene()?.mapId;
  // Temporaire : carte unique tant que le contexte multi-map n'est pas exposé par WorldScene.
  return Number.isFinite(mapId) ? mapId : 1;
}

export function getMainCamera(): any | null {
  return getWorldScene()?.cameras?.main ?? null;
}
