import { Router } from "express";
import { createExperimentSchema, modelsForProblem } from "@modeljudge/shared";
import { z } from "zod";
import { requireAuth, AuthedRequest, asAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AppError } from "../middleware/errorHandler";
import {
  Dataset,
  Experiment,
  ModelRun,
  MjsScore,
  Explanation,
  Report,
  Job,
} from "../models";
import { enqueueExperiment } from "../queues/producer";

export const experimentsRouter = Router();
experimentsRouter.use(requireAuth);

experimentsRouter.get("/", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const status = req.query.status as string | undefined;
    const filter: Record<string, unknown> = { userId: user.id };
    if (status) filter.status = status;
    const items = await Experiment.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.post(
  "/",
  validate({ body: createExperimentSchema }),
  async (req, res, next) => {
    try {
      const { user } = asAuth(req);
      const body = req.body as z.infer<typeof createExperimentSchema>;

      const ds = await Dataset.findOne({
        _id: body.datasetId,
        userId: user.id,
        deletedAt: null,
      });
      if (!ds) throw new AppError(404, "NOT_FOUND", "Dataset not found");
      if (ds.profile.status !== "READY") {
        throw new AppError(400, "PROFILE_NOT_READY", "Dataset profile is not ready");
      }

      const allowed = new Set(modelsForProblem(body.config.problemType));
      for (const m of body.config.models) {
        if (!allowed.has(m)) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            `Model ${m} is not applicable to ${body.config.problemType}`
          );
        }
      }
      if (body.config.featureColumns.includes(body.config.targetColumn)) {
        throw new AppError(400, "VALIDATION_ERROR", "Target cannot be a feature");
      }

      const exp = await Experiment.create({
        userId: user.id,
        datasetId: ds._id,
        name: body.name,
        description: body.description || "",
        status: "PLAN_READY",
        statusMessage: "Ready to start",
        currentStage: "plan",
        config: body.config,
        mjsConfig: body.mjsConfig,
        progress: {
          modelsTotal: body.config.models.length,
          modelsCompleted: 0,
          modelsFailed: 0,
          explainTotal: 0,
          explainCompleted: 0,
          percent: 0,
        },
        timeline: [
          {
            at: new Date(),
            status: "PLAN_READY",
            stage: "plan",
            message: "Experiment created",
          },
        ],
      });

      res.status(201).json({ experiment: exp });
    } catch (e) {
      next(e);
    }
  }
);

experimentsRouter.get("/:id", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    res.json({ experiment: exp });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.post("/:id/start", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    if (!["PLAN_READY", "CREATED"].includes(exp.status)) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot start experiment in status ${exp.status}`
      );
    }

    const ds = await Dataset.findById(exp.datasetId);
    if (!ds || ds.profile.status !== "READY") {
      throw new AppError(400, "PROFILE_NOT_READY", "Dataset profile is not ready");
    }

    exp.status = "PREPROCESSING";
    exp.statusMessage = "Queued for preprocessing";
    exp.currentStage = "preprocess";
    exp.startedAt = new Date();
    exp.cancelRequested = false;
    exp.timeline.push({
      at: new Date(),
      status: "PREPROCESSING",
      stage: "preprocess",
      message: "Experiment start requested",
    });
    await exp.save();

    const jobDoc = await Job.create({
      userId: user.id,
      experimentId: exp._id,
      type: "RUN_EXPERIMENT",
      status: "QUEUED",
      payload: {},
      queuedAt: new Date(),
    });

    const bullId = await enqueueExperiment({
      requestId: asAuth(req).requestId || "",
      userId: user.id,
      experimentId: exp._id.toString(),
      jobDocId: jobDoc._id.toString(),
    });
    jobDoc.bullJobId = bullId;
    await jobDoc.save();

    res.status(202).json({ experiment: exp, jobId: jobDoc._id });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    exp.cancelRequested = true;
    exp.status = "CANCELLED";
    exp.statusMessage = "Cancelled by user";
    exp.timeline.push({
      at: new Date(),
      status: "CANCELLED",
      stage: exp.currentStage,
      message: "Cancelled by user",
    });
    await exp.save();
    res.json({ experiment: exp });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.get("/:id/models", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    const items = await ModelRun.find({ experimentId: exp._id }).sort({ modelName: 1 });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.get("/:id/mjs", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    const kind = (req.query.kind as string) || "primary";
    const items = await MjsScore.find({ experimentId: exp._id, kind }).sort({
      createdAt: -1,
    });
    res.json({ items, primaryId: exp.primaryMjsScoreId });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.get("/:id/explanations", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    const items = await Explanation.find({ experimentId: exp._id });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.get("/:id/report", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    const report = await Report.findOne({ experimentId: exp._id });
    res.json({ report });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.get("/:id/lineage", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    res.json({ lineage: exp.lineage, mjsConfig: exp.mjsConfig, config: exp.config });
  } catch (e) {
    next(e);
  }
});

experimentsRouter.get("/:id/jobs", async (req, res, next) => {
  try {
    const { user } = asAuth(req);
    const exp = await Experiment.findOne({ _id: req.params.id, userId: user.id });
    if (!exp) throw new AppError(404, "NOT_FOUND", "Experiment not found");
    const items = await Job.find({ experimentId: exp._id }).sort({ createdAt: -1 });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});
