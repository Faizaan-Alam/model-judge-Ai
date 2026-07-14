import mongoose, { Schema, Document, Types } from "mongoose";
import type { ExperimentStatus } from "@modeljudge/shared";

export interface IExperiment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  datasetId: Types.ObjectId;
  name: string;
  description: string;
  status: ExperimentStatus;
  statusMessage: string;
  currentStage: string;
  cancelRequested: boolean;
  config: Record<string, unknown>;
  preprocessPlan: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  lineage: Record<string, unknown>;
  mjsConfig: Record<string, unknown>;
  progress: {
    modelsTotal: number;
    modelsCompleted: number;
    modelsFailed: number;
    explainTotal: number;
    explainCompleted: number;
    percent: number;
  };
  rankingSummary: Array<Record<string, unknown>>;
  primaryMjsScoreId?: Types.ObjectId;
  reportId?: Types.ObjectId;
  timeline: Array<{
    at: Date;
    status: string;
    stage: string;
    message: string;
  }>;
  error?: { code?: string; message?: string; stage?: string; details?: unknown };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const experimentSchema = new Schema<IExperiment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    datasetId: { type: Schema.Types.ObjectId, ref: "Dataset", required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, default: "PLAN_READY", index: true },
    statusMessage: { type: String, default: "" },
    currentStage: { type: String, default: "plan" },
    cancelRequested: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed, required: true },
    preprocessPlan: { type: Schema.Types.Mixed, default: {} },
    artifacts: { type: Schema.Types.Mixed, default: {} },
    lineage: { type: Schema.Types.Mixed, default: {} },
    mjsConfig: { type: Schema.Types.Mixed, required: true },
    progress: {
      modelsTotal: { type: Number, default: 0 },
      modelsCompleted: { type: Number, default: 0 },
      modelsFailed: { type: Number, default: 0 },
      explainTotal: { type: Number, default: 0 },
      explainCompleted: { type: Number, default: 0 },
      percent: { type: Number, default: 0 },
    },
    rankingSummary: { type: Schema.Types.Mixed, default: [] },
    primaryMjsScoreId: { type: Schema.Types.ObjectId, ref: "MjsScore" },
    reportId: { type: Schema.Types.ObjectId, ref: "Report" },
    timeline: { type: Schema.Types.Mixed, default: [] },
    error: {
      code: String,
      message: String,
      stage: String,
      details: Schema.Types.Mixed,
    },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

experimentSchema.index({ userId: 1, createdAt: -1 });

export const Experiment = mongoose.model<IExperiment>("Experiment", experimentSchema);
