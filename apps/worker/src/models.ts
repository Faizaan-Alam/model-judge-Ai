/**
 * Minimal mongoose models mirrored from API (same DB/collections).
 * Kept here so worker does not import the API package.
 */
import mongoose, { Schema } from "mongoose";

const datasetSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    storage: Schema.Types.Mixed,
    hashes: Schema.Types.Mixed,
    profile: Schema.Types.Mixed,
    nRows: Number,
    nCols: Number,
  },
  { timestamps: true, strict: false }
);

const experimentSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    datasetId: Schema.Types.ObjectId,
    status: String,
    statusMessage: String,
    currentStage: String,
    cancelRequested: Boolean,
    config: Schema.Types.Mixed,
    preprocessPlan: Schema.Types.Mixed,
    artifacts: Schema.Types.Mixed,
    lineage: Schema.Types.Mixed,
    mjsConfig: Schema.Types.Mixed,
    progress: Schema.Types.Mixed,
    rankingSummary: [Schema.Types.Mixed],
    primaryMjsScoreId: Schema.Types.ObjectId,
    reportId: Schema.Types.ObjectId,
    timeline: [Schema.Types.Mixed],
    error: Schema.Types.Mixed,
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true, strict: false }
);

const modelRunSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    experimentId: Schema.Types.ObjectId,
    modelName: String,
    modelFamily: String,
    status: String,
    hyperparams: Schema.Types.Mixed,
    metrics: Schema.Types.Mixed,
    timing: Schema.Types.Mixed,
    resources: Schema.Types.Mixed,
    robustness: Schema.Types.Mixed,
    artifacts: Schema.Types.Mixed,
    featureNames: [String],
    nFeaturesIn: Number,
    error: Schema.Types.Mixed,
    trainedAt: Date,
  },
  { timestamps: true, strict: false }
);
modelRunSchema.index({ experimentId: 1, modelName: 1 }, { unique: true });

const mjsSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    experimentId: Schema.Types.ObjectId,
    kind: String,
    label: String,
    mjsVersion: String,
    method: String,
    weights: Schema.Types.Mixed,
    normalization: Schema.Types.Mixed,
    scores: [Schema.Types.Mixed],
    explainabilityPending: Boolean,
  },
  { timestamps: true, strict: false }
);

const explanationSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    experimentId: Schema.Types.ObjectId,
    modelRunId: Schema.Types.ObjectId,
    modelName: String,
    status: String,
    method: String,
    methodParams: Schema.Types.Mixed,
    quality: Schema.Types.Mixed,
    globalImportance: [Schema.Types.Mixed],
    local: [Schema.Types.Mixed],
    artifacts: Schema.Types.Mixed,
    error: Schema.Types.Mixed,
  },
  { timestamps: true, strict: false }
);
explanationSchema.index({ experimentId: 1, modelRunId: 1 }, { unique: true });

const reportSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    experimentId: Schema.Types.ObjectId,
    status: String,
    format: String,
    title: String,
    sections: Schema.Types.Mixed,
    artifacts: Schema.Types.Mixed,
    generatorVersion: String,
  },
  { timestamps: true, strict: false }
);

const jobSchema = new Schema(
  {
    userId: Schema.Types.ObjectId,
    experimentId: Schema.Types.ObjectId,
    datasetId: Schema.Types.ObjectId,
    bullJobId: String,
    type: String,
    status: String,
    payload: Schema.Types.Mixed,
    progress: Schema.Types.Mixed,
    attempts: Number,
    error: Schema.Types.Mixed,
    resultRef: Schema.Types.Mixed,
    queuedAt: Date,
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true, strict: false }
);

export const Dataset =
  mongoose.models.Dataset || mongoose.model("Dataset", datasetSchema);
export const Experiment =
  mongoose.models.Experiment || mongoose.model("Experiment", experimentSchema);
export const ModelRun =
  mongoose.models.ModelRun || mongoose.model("ModelRun", modelRunSchema);
export const MjsScore =
  mongoose.models.MjsScore || mongoose.model("MjsScore", mjsSchema);
export const Explanation =
  mongoose.models.Explanation || mongoose.model("Explanation", explanationSchema);
export const Report =
  mongoose.models.Report || mongoose.model("Report", reportSchema);
export const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);
