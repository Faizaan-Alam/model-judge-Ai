import mongoose, { Schema, Document, Types } from "mongoose";

export interface IModelRun extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  experimentId: Types.ObjectId;
  modelName: string;
  modelFamily: string;
  status: string;
  hyperparams: Record<string, unknown>;
  metrics: Record<string, unknown>;
  timing: Record<string, unknown>;
  resources: Record<string, unknown>;
  robustness: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  featureNames: string[];
  nFeaturesIn?: number;
  error?: { code?: string; message?: string };
  trainedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const modelRunSchema = new Schema<IModelRun>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: "Experiment", required: true },
    modelName: { type: String, required: true },
    modelFamily: String,
    status: {
      type: String,
      enum: ["PENDING", "TRAINING", "COMPLETED", "FAILED", "SKIPPED"],
      default: "PENDING",
    },
    hyperparams: { type: Schema.Types.Mixed, default: {} },
    metrics: { type: Schema.Types.Mixed, default: {} },
    timing: { type: Schema.Types.Mixed, default: {} },
    resources: { type: Schema.Types.Mixed, default: {} },
    robustness: { type: Schema.Types.Mixed, default: {} },
    artifacts: { type: Schema.Types.Mixed, default: {} },
    featureNames: { type: [String], default: [] },
    nFeaturesIn: Number,
    error: { code: String, message: String },
    trainedAt: Date,
  },
  { timestamps: true }
);

modelRunSchema.index({ experimentId: 1, modelName: 1 }, { unique: true });

export const ModelRun = mongoose.model<IModelRun>("ModelRun", modelRunSchema);
