import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { getRedis, SOCKET_CHANNEL } from "../lib/redis";
import { Experiment } from "../models";

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.headers.authorization as string)?.replace("Bearer ", "");
      if (!token) return next(new Error("UNAUTHORIZED"));
      const payload = jwt.verify(token, config.jwtSecret) as { id: string };
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("experiment:join", async ({ experimentId }: { experimentId: string }) => {
      const exp = await Experiment.findOne({
        _id: experimentId,
        userId: socket.data.userId,
      });
      if (!exp) {
        socket.emit("experiment:failed", {
          experimentId,
          message: "Not found or forbidden",
        });
        return;
      }
      socket.join(`experiment:${experimentId}`);
    });

    socket.on("experiment:leave", ({ experimentId }: { experimentId: string }) => {
      socket.leave(`experiment:${experimentId}`);
    });
  });

  // Bridge worker → socket via Redis pub/sub
  const sub = getRedis().duplicate();
  sub.subscribe(SOCKET_CHANNEL);
  sub.on("message", (_channel, message) => {
    try {
      const { room, event, payload } = JSON.parse(message) as {
        room: string;
        event: string;
        payload: unknown;
      };
      io?.to(room).emit(event, payload);
    } catch (e) {
      console.error("[socket] bad pubsub message", e);
    }
  });

  console.log("[api] Socket.io ready");
  return io;
}

export function getIO(): Server | null {
  return io;
}
