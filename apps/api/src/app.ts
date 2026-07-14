import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { requestId } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { datasetsRouter } from "./routes/datasets";
import { experimentsRouter } from "./routes/experiments";

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "api" });
  });

  app.get("/api/v1/health", (_req, res) => {
    res.json({ status: "ok", service: "api" });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/datasets", datasetsRouter);
  app.use("/api/v1/experiments", experimentsRouter);

  app.use(errorHandler);
  return app;
}
