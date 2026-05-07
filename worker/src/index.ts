/**
 * Kung Fu game relay — a Cloudflare Worker + Durable Object.
 *
 * Each room is one Durable Object instance keyed by the room code. Up to 2
 * WebSocket clients connect to a room; messages from one are forwarded to
 * the other. Server-originated control messages: `joined`, `ready`,
 * `peer_disconnected`, `room_full`.
 *
 * Path: wss://kungfu-relay.<account>.workers.dev/<ROOMCODE>
 */

export interface Env {
  ROOM: DurableObjectNamespace;
}

export class Room implements DurableObject {
  state: DurableObjectState;
  clients: WebSocket[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    if (this.clients.length >= 2) {
      // Reject up-front before doing the websocket dance
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      server.send(JSON.stringify({ type: "room_full" }));
      server.close(1013, "Room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const role: "host" | "guest" = this.clients.length === 0 ? "host" : "guest";
    this.clients.push(server);

    server.send(JSON.stringify({ type: "joined", role }));

    if (this.clients.length === 2) {
      this.broadcast({ type: "ready" });
    }

    server.addEventListener("message", (event: MessageEvent) => {
      // Pass through to the other client(s) without parsing the payload.
      // We trust the format because both clients are our own code.
      const data = event.data;
      for (const c of this.clients) {
        if (c !== server && c.readyState === WebSocket.READY_STATE_OPEN) {
          try {
            c.send(data);
          } catch {
            // ignore single-send failure; close handler will clean up
          }
        }
      }
    });

    const cleanup = () => {
      this.clients = this.clients.filter((c) => c !== server);
      this.broadcast({ type: "peer_disconnected" });
    };

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.readyState === WebSocket.READY_STATE_OPEN) {
        try {
          c.send(data);
        } catch {
          // best-effort
        }
      }
    }
  }
}

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Upgrade",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health-check / root
    if (url.pathname === "/" || url.pathname === "") {
      return new Response("kungfu relay ok", {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "text/plain" },
      });
    }

    const code = decodeURIComponent(url.pathname.replace(/^\/+/, "")).toUpperCase();
    if (!code || code.length < 3 || code.length > 12 || !/^[A-Z0-9]+$/.test(code)) {
      return new Response("bad room code", { status: 400, headers: CORS_HEADERS });
    }

    const id = env.ROOM.idFromName(code);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};
