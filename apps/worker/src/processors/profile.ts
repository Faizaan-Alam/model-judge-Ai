import { Job as BullJob } from "bullmq";
import { Dataset, Job } from "../models";
import { mlClient } from "../mlClient";
import { config } from "../config";

export async function processProfile(
  job: BullJob<{
    requestId: string;
    userId: string;
    datasetId: string;
    jobDocId: string;
  }>
): Promise<void> {
  const { datasetId, jobDocId, requestId } = job.data;
  await Job.findByIdAndUpdate(jobDocId, {
    status: "ACTIVE",
    startedAt: new Date(),
    attempts: job.attemptsMade + 1,
  });

  const ds = await Dataset.findById(datasetId);
  if (!ds) throw new Error("Dataset not found");

  try {
    const result = (await mlClient.profile(
      {
        bucket: config.minioBucket,
        key: ds.storage?.rawKey,
        format: "csv",
      },
      requestId
    )) as {
      n_rows: number;
      n_cols: number;
      columns: Array<Record<string, unknown>>;
      warnings: string[];
      profile_version: string;
    };

    ds.nRows = result.n_rows;
    ds.nCols = result.n_cols;
    ds.profile = {
      status: "READY",
      columns: result.columns,
      warnings: result.warnings || [],
      profiledAt: new Date(),
      profileVersion: result.profile_version || "1.0.0",
    };
    await ds.save();

    await Job.findByIdAndUpdate(jobDocId, {
      status: "COMPLETED",
      finishedAt: new Date(),
      progress: { percent: 100, message: "Profile complete" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Profile failed";
    ds.profile = {
      ...(ds.profile || {}),
      status: "FAILED",
      columns: ds.profile?.columns || [],
      warnings: [message],
    };
    await ds.save();
    await Job.findByIdAndUpdate(jobDocId, {
      status: "FAILED",
      finishedAt: new Date(),
      error: { code: "PROFILE_FAILED", message, retriable: true },
    });
    throw e;
  }
}
