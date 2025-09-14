import { createServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "./lib/jwt";
import { GameSocketService } from "./services/Game.service";
import { connectDB } from "./lib/mongodb";

(async () => {
  await connectDB();

  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Missing token"));
      const userId = verifyToken(token);
      (socket as any).userId = userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket as any).userId;
    console.log(`User connected: ${userId}`);

    socket.on("join", async (gameId: string) => {
      let game = GameSocketService.getGame(gameId, userId);
      if (!game) game = await GameSocketService.loadGame(gameId, userId);
      if (!game) return socket.emit("error_message", "Game not found");

      socket.join(gameId);
      socket.emit("state", GameSocketService.getSafeGame(gameId, userId));
    });

    socket.on("flip", ({ gameId, cardIndex }) => {
      try {
        GameSocketService.flipCard(gameId, cardIndex, userId);
        io.to(gameId).emit("state", GameSocketService.getSafeGame(gameId, userId));
      } catch (err: any) {
        socket.emit("error_message", err.message);
      }
    });

    socket.on("match", ({ gameId }) => {
      try {
        GameSocketService.matchCards(gameId, userId);
        io.to(gameId).emit("state", GameSocketService.getSafeGame(gameId, userId));
      } catch (err: any) {
        socket.emit("error_message", err.message);
      }
    });
  });

  httpServer.listen(8080, () => console.log("WS server listening :8080"));

  const shutdown = async () => {
    console.log("Shutting down... Persisting active games...");
    const games = GameSocketService.getAllGames();
    for (const game of games) {
      await GameSocketService.persistGame(game._id.toString());
    }
    console.log("All active games persisted. Closing server...");
    io.close();
    httpServer.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
