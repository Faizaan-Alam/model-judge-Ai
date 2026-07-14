import mongoose, { Schema, Document, Types } from "mongoose";

export interface IExplanation extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  experimentId: Types.ObjectId;
  modelRunId: Types.ObjectId;
  modelName: string;
  status: string;
  method: string;
  methodParams: Record<string, unknown>;
  quality: Record<string, unknown>;
  globalImportance: Array<Record<string, unknown>>;
  local: Array<Record<string, unknown>>;
  artifacts: Record<string, unknown>;
  error?: { code?: string; message?: string };
  createdAt: Date;
  updatedAt: Date;
}

const explanationSchema = new Schema<IExplanation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: "Experiment", required: true },
    modelRunId: { type: Schema.Types.ObjectId, ref: "ModelRun", required: true },
    modelName: String,
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "SKIPPED"],
      default: "PENDING",
    },
    method: String,
    methodParams: { type: Schema.Types.Mixed, default: {} },
    quality: { type: Schema.Types.Mixed, default: {} },
    globalImportance: { type: [Schema.Types.Mixed], default: [] },
    local: { type: [Schema.Types.Mixed], default: [] },
    artifacts: { type: Schema.Types.Mixed, default: {} },
    error: { code: String, message: String },
  },
  { timestamps: true }
);

explanationSchema.index({ experimentId: 1, modelRunId: 1 }, { unique: true });

export const Explanation = mongoose.model<IExplanation>("Explanation", explanationSchema);
