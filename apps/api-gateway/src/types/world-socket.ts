// apps/api-gateway/src/types/world-socket.ts

import { Socket } from 'socket.io';

export type PlayerData = {
  characterId: string;
  x: number;
  y: number;
};

export type WorldSocket = Socket<
  any, // events envoyés par le client
  any, // events envoyés au client
  any, // events internes
  { player: PlayerData } // 🔥 ICI : data strictement typé
>;
