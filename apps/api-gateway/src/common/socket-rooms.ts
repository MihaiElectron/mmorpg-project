// Noms de rooms Socket.IO par mapId.
// Phase 1 : rooms par map. Phase 2 (future) : rooms par chunk.
export function getMapRoomId(mapId: number): string {
  return `map:${mapId}`;
}

// Room réservée aux sockets admin (jointe côté serveur après vérification du
// rôle JWT). Un client ne peut pas la rejoindre lui-même.
export const ADMIN_ROOM = 'admin';
