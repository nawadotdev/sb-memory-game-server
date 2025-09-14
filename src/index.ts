import { WebSocketServer } from "ws";
import { connectDB } from "./lib/mongodb";

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  await connectDB();

  const wss = new WebSocketServer({ port: Number(PORT) });

  wss.on("connection", (ws) => {
    console.log("🔗 Client connected");

    ws.on("message", (message) => {
      console.log(`📩 Received: ${message}`);
      ws.send(`Echo: ${message}`);
    });

    ws.on("close", () => {
      console.log("❌ Client disconnected");
    });
  });

  console.log(`🚀 WS server running on ws://localhost:${PORT}`);
};

startServer().catch((err) => {
  console.error("Server failed to start:", err);
});