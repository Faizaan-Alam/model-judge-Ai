import mongoose, { Schema, Document, Types } from "mongoose";

export interface IReport extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  experimentId: Types.ObjectId;
  status: string;
  format: string;
  title: string;
  sections: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  generatorVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: "Experiment", required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    format: { type: String, default: "json" },
    title: String,
    sections: { type: Schema.Types.Mixed, default: {} },
    artifacts: { type: Schema.Types.Mixed, default: {} },
    generatorVersion: { type: String, default: "0.1.0" },
  },
  { timestamps: true }
);

reportSchema.index({ experimentId: 1 }, { unique: true });

export const Report = mongoose.model<IReport>("Report", reportSchema);
