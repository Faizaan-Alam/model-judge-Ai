import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDataset extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  originalFilename: string;
  contentType: string;
  format: string;
  storage: { bucket: string; rawKey: string; parquetKey?: string; schemaKey?: string };
  hashes: { rawSha256?: string; parquetSha256?: string };
  sizeBytes: number;
  nRows?: number;
  nCols?: number;
  profile: {
    status: "NONE" | "PENDING" | "READY" | "FAILED";
    columns: Array<Record<string, unknown>>;
    warnings: string[];
    profiledAt?: Date;
    profileVersion?: string;
  };
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const datasetSchema = new Schema<IDataset>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    originalFilename: String,
    contentType: String,
    format: { type: String, default: "csv" },
    storage: {
      bucket: String,
      rawKey: String,
      parquetKey: String,
      schemaKey: String,
    },
    hashes: { rawSha256: String, parquetSha256: String },
    sizeBytes: Number,
    nRows: Number,
    nCols: Number,
    profile: {
      status: {
        type: String,
        enum: ["NONE", "PENDING", "READY", "FAILED"],
        default: "NONE",
      },
      columns: { type: Schema.Types.Mixed, default: [] },
      warnings: { type: Schema.Types.Mixed, default: [] },
      profiledAt: Date,
      profileVersion: String,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

datasetSchema.index({ userId: 1, createdAt: -1 });

export const Dataset = mongoose.model<IDataset>("Dataset", datasetSchema);
