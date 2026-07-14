import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  mongoUri: req("MONGODB_URI", "mongodb://127.0.0.1:27017/modeljudge"),
  redisUrl: req("REDIS_URL", "redis://127.0.0.1:6379"),
  jwtSecret: req("JWT_SECRET", "dev-jwt-secret-change-me"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  minio: {
    endPoint: process.env.MINIO_ENDPOINT ?? "127.0.0.1",
    port: Number(process.env.MINIO_PORT ?? 9000),
    accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    bucket: process.env.MINIO_BUCKET ?? "modeljudge",
    useSSL: (process.env.MINIO_USE_SSL ?? "false") === "true",
  },
  ml: {
    url: process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000",
    token: process.env.ML_SERVICE_TOKEN ?? "dev-ml-service-token-change-me",
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024),
};
