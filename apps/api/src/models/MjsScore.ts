import mongoose, { Schema, Document, Types } from "mongoose";

export interface IMjsScore extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  experimentId: Types.ObjectId;
  kind: string;
  label: string;
  mjsVersion: string;
  method: string;
  weights: Record<string, number>;
  normalization: Record<string, unknown>;
  scores: Array<Record<string, unknown>>;
  explainabilityPending: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const mjsScoreSchema = new Schema<IMjsScore>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: "Experiment", required: true },
    kind: { type: String, default: "primary" },
    label: { type: String, default: "primary" },
    mjsVersion: String,
    method: String,
    weights: { type: Schema.Types.Mixed, default: {} },
    normalization: { type: Schema.Types.Mixed, default: {} },
    scores: { type: Schema.Types.Mixed, default: [] },
    explainabilityPending: { type: Boolean, default: false },
  },
  { timestamps: true }
);

mjsScoreSchema.index({ experimentId: 1, kind: 1, createdAt: -1 });

export const MjsScore = mongoose.model<IMjsScore>("MjsScore", mjsScoreSchema);
