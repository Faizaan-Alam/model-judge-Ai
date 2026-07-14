import { z } from "zod";
import {
  DEFAULT_MJS_WEIGHTS,
  MODEL_NAMES,
  PROBLEM_TYPES,
  WEIGHT_METHODS,
} from "./enums";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const mjsWeightsSchema = z
  .object({
    performance: z.number().min(0).max(1),
    robustness: z.number().min(0).max(1),
    efficiency: z.number().min(0).max(1),
    explainability: z.number().min(0).max(1),
    reproducibility: z.number().min(0).max(1),
  })
  .refine(
    (w) => {
      const sum =
        w.performance +
        w.robustness +
        w.efficiency +
        w.explainability +
        w.reproducibility;
      return Math.abs(sum - 1) < 1e-6;
    },
    { message: "MJS weights must sum to 1.0" }
  );

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  datasetId: z.string().min(1),
  config: z.object({
    problemType: z.enum(PROBLEM_TYPES),
    targetColumn: z.string().min(1),
    featureColumns: z.array(z.string()).min(1),
    idColumns: z.array(z.string()).default([]),
    testSize: z.number().min(0.05).max(0.4).default(0.2),
    valSize: z.number().min(0).max(0.3).default(0),
    splitSeed: z.number().int().default(42),
    cvFolds: z.number().int().min(2).max(10).default(5),
    models: z.array(z.enum(MODEL_NAMES)).min(1),
    topKExplain: z.number().int().min(0).max(5).default(3),
    fastMode: z.boolean().default(false),
    maxRows: z.number().int().positive().optional(),
    randomSeed: z.number().int().default(42),
  }),
  mjsConfig: z
    .object({
      method: z.enum(WEIGHT_METHODS).default("fixed"),
      weights: mjsWeightsSchema.default(DEFAULT_MJS_WEIGHTS),
      notes: z.string().optional(),
    })
    .default({
      method: "fixed",
      weights: { ...DEFAULT_MJS_WEIGHTS },
    }),
});

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Socket event payload shapes (documentation + client typing) */
export const socketEvents = {
  experimentStatus: "experiment:status",
  jobProgress: "job:progress",
  modelCompleted: "model:completed",
  mjsReady: "mjs:ready",
  explainProgress: "explain:progress",
  experimentFailed: "experiment:failed",
} as const;
