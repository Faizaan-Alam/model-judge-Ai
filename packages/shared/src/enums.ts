export const PROBLEM_TYPES = [
  "binary_classification",
  "multiclass_classification",
  "regression",
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

export const EXPERIMENT_STATUSES = [
  "CREATED",
  "UPLOADING",
  "PROFILING",
  "PLAN_READY",
  "PREPROCESSING",
  "TRAINING",
  "SCORING_MJS",
  "EXPLAINING",
  "REPORTING",
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "FAILED",
  "CANCELLED",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const MODEL_NAMES = [
  "logistic_regression",
  "linear_regression",
  "ridge",
  "lasso",
  "decision_tree",
  "random_forest",
  "svm",
  "svr",
  "knn",
  "naive_bayes",
  "gradient_boosting",
  "xgboost",
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

export const WEIGHT_METHODS = ["fixed", "entropy", "ahp"] as const;
export type WeightMethod = (typeof WEIGHT_METHODS)[number];

export const JOB_TYPES = [
  "PROFILE",
  "PREPROCESS",
  "TRAIN_ONE",
  "ROBUSTNESS",
  "SCORE_MJS",
  "EXPLAIN",
  "REPORT",
  "SENSITIVITY",
  "RUN_EXPERIMENT",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "QUEUED",
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "STALLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type MjsWeights = {
  performance: number;
  robustness: number;
  efficiency: number;
  explainability: number;
  reproducibility: number;
};

export const DEFAULT_MJS_WEIGHTS: MjsWeights = {
  performance: 0.35,
  robustness: 0.2,
  efficiency: 0.15,
  explainability: 0.15,
  reproducibility: 0.15,
};

export const MJS_VERSION = "1.0.0";

export const CLASSIFICATION_MODELS: ModelName[] = [
  "logistic_regression",
  "ridge",
  "decision_tree",
  "random_forest",
  "svm",
  "knn",
  "naive_bayes",
  "gradient_boosting",
  "xgboost",
];

export const REGRESSION_MODELS: ModelName[] = [
  "linear_regression",
  "ridge",
  "lasso",
  "decision_tree",
  "random_forest",
  "svr",
  "knn",
  "gradient_boosting",
  "xgboost",
];

export function modelsForProblem(problemType: ProblemType): ModelName[] {
  if (problemType === "regression") return [...REGRESSION_MODELS];
  return [...CLASSIFICATION_MODELS];
}
