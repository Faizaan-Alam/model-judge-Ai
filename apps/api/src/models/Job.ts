import mongoose, { Schema, Document, Types } from "mongoose";

export interface IJob extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  experimentId?: Types.ObjectId;
  datasetId?: Types.ObjectId;
  bullJobId?: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  progress: { percent: number; message: string };
  attempts: number;
  error?: { code?: string; message?: string; retriable?: boolean };
  resultRef: Record<string, unknown>;
  queuedAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: "Experiment" },
    datasetId: { type: Schema.Types.ObjectId, ref: "Dataset" },
    bullJobId: String,
    type: { type: String, required: true },
    status: {
      type: String,
      enum: ["QUEUED", "ACTIVE", "COMPLETED", "FAILED", "CANCELLED", "STALLED"],
      default: "QUEUED",
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    progress: {
      percent: { type: Number, default: 0 },
      message: { type: String, default: "" },
    },
    attempts: { type: Number, default: 0 },
    error: { code: String, message: String, retriable: Boolean },
    resultRef: { type: Schema.Types.Mixed, default: {} },
    queuedAt: Date,
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

jobSchema.index({ experimentId: 1, createdAt: -1 });

export const Job = mongoose.model<IJob>("Job", jobSchema);
