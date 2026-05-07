// Wire format shared between the browser client and the Cloudflare relay.
// Keep it small; both directions go over a single WebSocket per client.

export type Role = "host" | "guest";

// === Server -> Client (control plane) ===
export interface ServerJoinedMsg {
  type: "joined";
  role: Role;
}
export interface ServerReadyMsg {
  type: "ready";
}
export interface ServerPeerDisconnectedMsg {
  type: "peer_disconnected";
}
export interface ServerRoomFullMsg {
  type: "room_full";
}
export interface ServerErrorMsg {
  type: "error";
  message: string;
}

export type ServerMsg =
  | ServerJoinedMsg
  | ServerReadyMsg
  | ServerPeerDisconnectedMsg
  | ServerRoomFullMsg
  | ServerErrorMsg;

// === Game messages (relayed peer-to-peer through the room) ===

// Guest -> Host: raw key state every frame. Host derives JustPressed locally
// by diffing against the previous frame.
export interface InputMsg {
  type: "input";
  leftDown: boolean;
  rightDown: boolean;
  crouchDown: boolean;
  blockDown: boolean;
  jumpDown: boolean;
  attack1Down: boolean;
  attack2Down: boolean;
  heavyDown: boolean;
  dodgeDown: boolean;
}

// Host -> Guest: full snapshot of both fighters every frame.
export interface FighterSnap {
  x: number;
  y: number;
  facing: 0 | 1; // 0 = right, 1 = left (small ints to keep messages tight)
  state: string;
  anim: string;
  frame: number; // 1-indexed Phaser frame index inside the current anim
  hp: number;
}

export interface StateMsg {
  type: "state";
  p1: FighterSnap;
  p2: FighterSnap;
  gameOver: boolean;
}

export type GameMsg = InputMsg | StateMsg;
export type AnyMsg = ServerMsg | GameMsg;

export const ROOM_CODE_CHARS = "0123456789";
export const ROOM_CODE_LENGTH = 2;

export function generateRoomCode(): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return s;
}

export function isValidRoomCode(s: string): boolean {
  if (s.length !== ROOM_CODE_LENGTH) return false;
  return s.split("").every((c) => ROOM_CODE_CHARS.includes(c));
}
