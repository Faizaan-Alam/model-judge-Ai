import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

export const config = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/modeljudge",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  ml: {
    url: process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000",
    token: process.env.ML_SERVICE_TOKEN ?? "dev-ml-service-token-change-me",
  },
  minioBucket: process.env.MINIO_BUCKET ?? "modeljudge",
  trainConcurrency: Number(process.env.TRAIN_CONCURRENCY ?? 2),
  explainConcurrency: Number(process.env.EXPLAIN_CONCURRENCY ?? 1),
};
