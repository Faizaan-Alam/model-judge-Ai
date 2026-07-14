import IORedis from "ioredis";
import { config } from "../config";

let connection: IORedis | null = null;

export function getRedis(): IORedis {
  if (!connection) {
    connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const SOCKET_CHANNEL = "modeljudge:socket";
