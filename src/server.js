import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setIO } from "./realtime/socket.js";

const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setIO(io);

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API docs UI: ${BASE_URL}/api-docs`);
  console.log(`OpenAPI spec: ${BASE_URL}/docs/openapi.yaml`);
});
