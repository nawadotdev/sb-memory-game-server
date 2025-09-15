import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./lib/jwt";
import { GameSocketService } from "./services/Game.service";
import { connectDB } from "./lib/mongodb";

const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB();

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  // gameId -> set of clients
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws, req) => {
    try {
      const params = new URLSearchParams(req.url?.split("?")[1]);
      const token = params.get("token");
      if (!token) {
        ws.close(4001, "Missing token");
        return;
      }
      const userId = verifyToken(token);
      (ws as any).userId = userId;

      console.log(`User connected: ${userId}`);

      ws.on("message", async (raw) => {
        try {
          const { type, payload } = JSON.parse(raw.toString());
          const uid = (ws as any).userId;

          if (type === "join") {
            const { gameId } = payload;
            let game = GameSocketService.getGame(gameId, uid);
            if (!game) game = await GameSocketService.loadGame(gameId, uid);
            if (!game) {
              ws.send(JSON.stringify({ type: "error_message", payload: "Game not found" }));
              return;
            }

            if (!rooms.has(gameId)) rooms.set(gameId, new Set());
            rooms.get(gameId)!.add(ws);

            ws.send(JSON.stringify({ type: "state", payload: GameSocketService.getSafeGame(gameId, uid) }));
          }

          if (type === "flip") {
            const { gameId, cardIndex } = payload;
            try {
              GameSocketService.flipCard(gameId, cardIndex, uid);
              broadcast(gameId, {
                type: "state",
                payload: GameSocketService.getSafeGame(gameId, uid),
              });
            } catch (err: any) {
              ws.send(JSON.stringify({ type: "error_message", payload: err.message }));
            }
          }

          if (type === "match") {
            const { gameId } = payload;
            try {
              GameSocketService.matchCards(gameId, uid);
              broadcast(gameId, {
                type: "state",
                payload: GameSocketService.getSafeGame(gameId, uid),
              });
            } catch (err: any) {
              ws.send(JSON.stringify({ type: "error_message", payload: err.message }));
            }
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: "error_message", payload: "Invalid message format" }));
        }
      });

      ws.on("close", () => {
        // kullanıcı çıkınca odalardan temizle
        for (const [gameId, clients] of rooms.entries()) {
          clients.delete(ws);
          if (clients.size === 0) rooms.delete(gameId);
        }
      });
    } catch {
      ws.close(4002, "Invalid token");
    }
  });

  function broadcast(gameId: string, message: any) {
    const clients = rooms.get(gameId);
    if (!clients) return;
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  httpServer.listen(PORT, () => console.log(`WS server listening :${PORT}`));

  const shutdown = async () => {
    console.log("Shutting down... Persisting active games...");
    const games = GameSocketService.getAllGames();
    for (const game of games) {
      await GameSocketService.persistGame(game._id.toString());
    }
    console.log("All active games persisted. Closing server...");
    wss.close();
    httpServer.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
