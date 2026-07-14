import { Worker } from "bullmq";
import IORedis from "ioredis";
import { connectDb } from "./db";
import { config } from "./config";
import { processProfile } from "./processors/profile";
import { processRunExperiment } from "./processors/runExperiment";

async function main() {
  await connectDb();
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  const profileWorker = new Worker("mj.profile", processProfile, {
    connection,
    concurrency: 2,
  });

  const workflowWorker = new Worker("mj.workflow", processRunExperiment, {
    connection: connection.duplicate(),
    concurrency: 1,
  });

  profileWorker.on("completed", (job) =>
    console.log(`[worker] profile job ${job.id} completed`)
  );
  profileWorker.on("failed", (job, err) =>
    console.error(`[worker] profile job ${job?.id} failed`, err.message)
  );
  workflowWorker.on("completed", (job) =>
    console.log(`[worker] experiment job ${job.id} completed`)
  );
  workflowWorker.on("failed", (job, err) =>
    console.error(`[worker] experiment job ${job?.id} failed`, err.message)
  );

  console.log("[worker] listening on mj.profile + mj.workflow");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
