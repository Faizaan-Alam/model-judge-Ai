import IORedis from "ioredis";
import { config } from "./config";

const SOCKET_CHANNEL = "modeljudge:socket";
let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  return redis;
}

export async function emitExperiment(
  experimentId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const msg = JSON.stringify({
    room: `experiment:${experimentId}`,
    event,
    payload: { experimentId, ...payload },
  });
  await getRedis().publish(SOCKET_CHANNEL, msg);
}
