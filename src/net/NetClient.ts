import type {
  AnyMsg,
  GameMsg,
  InputMsg,
  Role,
  ServerMsg,
  StateMsg,
} from "./Protocol";

const RELAY_URL =
  (import.meta.env.VITE_RELAY_URL as string | undefined) ||
  "wss://kungfu-relay.engineerbk.workers.dev";

export type ConnectionState = "idle" | "connecting" | "waiting" | "ready" | "closed";

export class NetClient {
  private ws: WebSocket | null = null;
  state: ConnectionState = "idle";
  role: Role | null = null;
  code: string | null = null;

  // Callbacks (set by consumers)
  onJoined?: (role: Role) => void;
  onReady?: () => void;
  onPeerDisconnected?: () => void;
  onClose?: () => void;
  onError?: (message: string) => void;
  onInput?: (msg: InputMsg) => void;
  onState?: (msg: StateMsg) => void;

  connect(code: string): Promise<void> {
    this.code = code;
    this.state = "connecting";
    const url = `${RELAY_URL}/${encodeURIComponent(code)}`;
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      const settleOpen = () => resolve();
      const settleErr = (e: Event) => {
        this.state = "closed";
        reject(new Error("WebSocket failed to connect"));
        ws.removeEventListener("error", settleErr);
        ws.removeEventListener("open", settleOpen);
      };

      ws.addEventListener("open", settleOpen, { once: true });
      ws.addEventListener("error", settleErr);

      ws.addEventListener("message", (event) => {
        let msg: AnyMsg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        this.handleMessage(msg);
      });

      ws.addEventListener("close", () => {
        this.state = "closed";
        this.onClose?.();
      });
    });
  }

  private handleMessage(msg: AnyMsg) {
    switch (msg.type) {
      case "joined":
        this.role = (msg as ServerMsg & { role: Role }).role;
        this.state = "waiting";
        this.onJoined?.(this.role);
        break;
      case "ready":
        this.state = "ready";
        this.onReady?.();
        break;
      case "peer_disconnected":
        this.state = "waiting";
        this.onPeerDisconnected?.();
        break;
      case "room_full":
        this.onError?.("Room is full");
        this.close();
        break;
      case "error":
        this.onError?.((msg as { message: string }).message);
        break;
      case "input":
        this.onInput?.(msg);
        break;
      case "state":
        this.onState?.(msg);
        break;
    }
  }

  send(msg: GameMsg) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws?.close();
    this.ws = null;
    this.state = "closed";
  }
}
