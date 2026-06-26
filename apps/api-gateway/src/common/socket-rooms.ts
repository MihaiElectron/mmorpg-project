// Noms de rooms Socket.IO par mapId.
// Phase 1 : rooms par map. Phase 2 (future) : rooms par chunk.
export function getMapRoomId(mapId: number): string {
  return `map:${mapId}`;
}
