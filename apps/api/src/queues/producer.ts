import { Queue } from "bullmq";
import { getRedis } from "../lib/redis";

let workflowQueue: Queue | null = null;
let profileQueue: Queue | null = null;

function connection() {
  return getRedis();
}

export function getWorkflowQueue(): Queue {
  if (!workflowQueue) {
    workflowQueue = new Queue("mj.workflow", { connection: connection() });
  }
  return workflowQueue;
}

export function getProfileQueue(): Queue {
  if (!profileQueue) {
    profileQueue = new Queue("mj.profile", { connection: connection() });
  }
  return profileQueue;
}

export async function enqueueProfile(data: {
  requestId: string;
  userId: string;
  datasetId: string;
  jobDocId: string;
}): Promise<string> {
  const job = await getProfileQueue().add("profile-dataset", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

export async function enqueueExperiment(data: {
  requestId: string;
  userId: string;
  experimentId: string;
  jobDocId: string;
}): Promise<string> {
  const job = await getWorkflowQueue().add("run-experiment", data, {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  return job.id!;
}
