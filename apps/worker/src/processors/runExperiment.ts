import { Job as BullJob } from "bullmq";
import { MJS_VERSION } from "@modeljudge/shared";
import {
  Dataset,
  Experiment,
  ModelRun,
  MjsScore,
  Explanation,
  Report,
  Job,
} from "../models";
import { mlClient } from "../mlClient";
import { emitExperiment } from "../events";
import { config } from "../config";

async function pushStatus(
  exp: InstanceType<typeof Experiment>,
  status: string,
  stage: string,
  message: string,
  percent?: number
) {
  exp.status = status;
  exp.currentStage = stage;
  exp.statusMessage = message;
  if (percent !== undefined) exp.progress = { ...exp.progress, percent };
  exp.timeline = [
    ...(exp.timeline || []).slice(-99),
    { at: new Date(), status, stage, message },
  ];
  await exp.save();
  await emitExperiment(exp._id.toString(), "experiment:status", {
    status,
    stage,
    message,
    progress: exp.progress,
  });
}

function familyOf(modelName: string): string {
  if (["logistic_regression", "linear_regression", "ridge", "lasso"].includes(modelName))
    return "linear";
  if (["decision_tree", "random_forest"].includes(modelName)) return "tree";
  if (["gradient_boosting", "xgboost"].includes(modelName)) return "boosting";
  if (["svm", "svr"].includes(modelName)) return "svm";
  if (modelName === "knn") return "neighbor";
  if (modelName === "naive_bayes") return "bayes";
  return "other";
}

export async function processRunExperiment(
  job: BullJob<{
    requestId: string;
    userId: string;
    experimentId: string;
    jobDocId: string;
  }>
): Promise<void> {
  const { experimentId, jobDocId, requestId, userId } = job.data;
  await Job.findByIdAndUpdate(jobDocId, { status: "ACTIVE", startedAt: new Date() });

  const exp = await Experiment.findById(experimentId);
  if (!exp) throw new Error("Experiment not found");
  const ds = await Dataset.findById(exp.datasetId);
  if (!ds) throw new Error("Dataset not found");

  const cfg = exp.config as {
    problemType: string;
    targetColumn: string;
    featureColumns: string[];
    idColumns?: string[];
    testSize: number;
    splitSeed: number;
    cvFolds: number;
    models: string[];
    topKExplain: number;
    fastMode: boolean;
    randomSeed: number;
    maxRows?: number;
  };
  const mjsConfig = exp.mjsConfig as {
    method: string;
    weights: Record<string, number>;
  };

  try {
    // Preprocess plan + apply
    await pushStatus(exp, "PREPROCESSING", "preprocess", "Building preprocess plan", 5);
    if (exp.cancelRequested) throw new Error("Cancelled");

    const plan = (await mlClient.preprocessPlan(
      {
        columns: ds.profile?.columns || [],
        problem_type: cfg.problemType,
        target_column: cfg.targetColumn,
        feature_columns: cfg.featureColumns,
      },
      requestId
    )) as { plan: Record<string, unknown> };
    exp.preprocessPlan = plan.plan;
    await exp.save();

    await pushStatus(exp, "PREPROCESSING", "preprocess", "Applying preprocess & split", 10);
    const applied = (await mlClient.preprocessApply(
      {
        experiment_id: experimentId,
        bucket: config.minioBucket,
        raw_key: ds.storage?.rawKey,
        plan: plan.plan,
        target_column: cfg.targetColumn,
        feature_columns: cfg.featureColumns,
        problem_type: cfg.problemType,
        test_size: cfg.testSize,
        split_seed: cfg.splitSeed,
        max_rows: cfg.maxRows,
      },
      requestId
    )) as {
      artifacts: Record<string, string>;
      n_features_out: number;
      class_distribution?: Record<string, number>;
      library_versions: Record<string, string>;
    };

    exp.artifacts = applied.artifacts;
    exp.lineage = {
      datasetSha256: ds.hashes?.rawSha256,
      pipelineVersion: "1.0.0",
      mjsVersion: MJS_VERSION,
      libraryVersions: applied.library_versions,
      seeds: {
        split: cfg.splitSeed,
        model: cfg.randomSeed,
        explain: cfg.randomSeed,
      },
    };
    await exp.save();

    // Train each model sequentially (simple, reliable for v1)
    await pushStatus(exp, "TRAINING", "train", "Training models", 15);
    const models = cfg.models;
    let completed = 0;
    let failed = 0;
    const runs: Array<Record<string, unknown>> = [];

    for (const modelName of models) {
      if (exp.cancelRequested) throw new Error("Cancelled");
      await emitExperiment(experimentId, "job:progress", {
        modelName,
        stage: "train",
        message: `Training ${modelName}`,
        pct: Math.round((completed / models.length) * 100),
      });

      await ModelRun.findOneAndUpdate(
        { experimentId, modelName },
        {
          userId,
          experimentId,
          modelName,
          modelFamily: familyOf(modelName),
          status: "TRAINING",
        },
        { upsert: true, new: true }
      );

      try {
        const trainRes = (await mlClient.trainOne(
          {
            experiment_id: experimentId,
            model_name: modelName,
            problem_type: cfg.problemType,
            artifacts: applied.artifacts,
            seed: cfg.randomSeed,
            cv_folds: cfg.cvFolds,
          },
          requestId
        )) as {
          hyperparams: Record<string, unknown>;
          metrics: Record<string, unknown>;
          timing: Record<string, unknown>;
          resources: Record<string, unknown>;
          artifacts: Record<string, unknown>;
          feature_names: string[];
          n_features_in: number;
          primary_score: number;
        };

        let robustness: Record<string, unknown> = { status: "SKIPPED" };
        try {
          robustness = (await mlClient.robustness(
            {
              experiment_id: experimentId,
              model_name: modelName,
              problem_type: cfg.problemType,
              artifacts: { ...applied.artifacts, ...trainRes.artifacts },
              seed: cfg.randomSeed,
              primary_score: trainRes.primary_score,
            },
            requestId
          )) as Record<string, unknown>;
        } catch {
          robustness = { status: "FAILED", summaryScore: 0.5 };
        }

        const run = await ModelRun.findOneAndUpdate(
          { experimentId, modelName },
          {
            status: "COMPLETED",
            hyperparams: trainRes.hyperparams,
            metrics: trainRes.metrics,
            timing: trainRes.timing,
            resources: trainRes.resources,
            robustness,
            artifacts: trainRes.artifacts,
            featureNames: trainRes.feature_names,
            nFeaturesIn: trainRes.n_features_in,
            trainedAt: new Date(),
            error: undefined,
          },
          { new: true }
        );

        completed += 1;
        runs.push({
          modelRunId: run?._id?.toString(),
          modelName,
          metrics: trainRes.metrics,
          timing: trainRes.timing,
          resources: trainRes.resources,
          robustness,
          primary_score: trainRes.primary_score,
          model_family: familyOf(modelName),
        });

        await emitExperiment(experimentId, "model:completed", {
          modelName,
          modelRunId: run?._id?.toString(),
          metrics: trainRes.metrics,
        });
      } catch (e) {
        failed += 1;
        const message = e instanceof Error ? e.message : "Train failed";
        await ModelRun.findOneAndUpdate(
          { experimentId, modelName },
          { status: "FAILED", error: { code: "TRAIN_FAILED", message } }
        );
      }

      exp.progress = {
        ...exp.progress,
        modelsTotal: models.length,
        modelsCompleted: completed,
        modelsFailed: failed,
        percent: 15 + Math.round((completed + failed) / models.length * 50),
      };
      await exp.save();
    }

    if (completed < 2) {
      throw new Error("INSUFFICIENT_MODELS: need at least 2 successful model runs");
    }

    // MJS pre-XAI
    await pushStatus(exp, "SCORING_MJS", "mjs", "Computing MJS", 70);
    const mjsPre = (await mlClient.scoreMjs(
      {
        models: runs.map((r) => ({
          model_name: r.modelName,
          model_run_id: r.modelRunId,
          model_family: r.model_family,
          primary_score: r.primary_score,
          metrics: r.metrics,
          timing: r.timing,
          resources: r.resources,
          robustness: r.robustness,
          explainability_quality: null,
        })),
        mjs_config: mjsConfig,
        kind: "primary_pre_xai",
        label: "primary_pre_xai",
      },
      requestId
    )) as {
      mjs_version: string;
      method: string;
      weights: Record<string, number>;
      normalization: Record<string, unknown>;
      scores: Array<Record<string, unknown>>;
      explainability_pending: boolean;
    };

    let mjsDoc = await MjsScore.create({
      userId,
      experimentId,
      kind: "primary_pre_xai",
      label: "primary_pre_xai",
      mjsVersion: mjsPre.mjs_version,
      method: mjsPre.method,
      weights: mjsPre.weights,
      normalization: mjsPre.normalization,
      scores: mjsPre.scores,
      explainabilityPending: true,
    });

    // Explain top-K
    let finalScores = mjsPre.scores;
    if (!cfg.fastMode && cfg.topKExplain > 0) {
      await pushStatus(exp, "EXPLAINING", "explain", "Running SHAP/LIME on top-K", 80);
      const ranked = [...mjsPre.scores].sort(
        (a, b) => Number(a.rank) - Number(b.rank)
      );
      const top = ranked.slice(0, cfg.topKExplain);
      exp.progress = {
        ...exp.progress,
        explainTotal: top.length,
        explainCompleted: 0,
      };
      await exp.save();

      const qualityMap: Record<string, Record<string, number>> = {};

      for (const s of top) {
        const modelName = String(s.modelName || s.model_name);
        const run = runs.find((r) => r.modelName === modelName);
        if (!run) continue;
        try {
          const ex = (await mlClient.explain(
            {
              experiment_id: experimentId,
              model_name: modelName,
              problem_type: cfg.problemType,
              artifacts: {
                ...applied.artifacts,
                ...(run.artifacts as Record<string, string>),
              },
              seed: cfg.randomSeed,
            },
            requestId
          )) as {
            method: string;
            method_params: Record<string, unknown>;
            quality: Record<string, number>;
            global_importance: Array<Record<string, unknown>>;
            local: Array<Record<string, unknown>>;
            artifacts: Record<string, unknown>;
          };

          await Explanation.findOneAndUpdate(
            { experimentId, modelRunId: run.modelRunId },
            {
              userId,
              experimentId,
              modelRunId: run.modelRunId,
              modelName,
              status: "COMPLETED",
              method: ex.method,
              methodParams: ex.method_params,
              quality: ex.quality,
              globalImportance: ex.global_importance,
              local: ex.local,
              artifacts: ex.artifacts,
            },
            { upsert: true }
          );
          qualityMap[modelName] = ex.quality;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Explain failed";
          await Explanation.findOneAndUpdate(
            { experimentId, modelRunId: run.modelRunId },
            {
              userId,
              experimentId,
              modelRunId: run.modelRunId,
              modelName,
              status: "FAILED",
              error: { code: "EXPLAIN_FAILED", message },
            },
            { upsert: true }
          );
        }
        exp.progress = {
          ...exp.progress,
          explainCompleted: (exp.progress?.explainCompleted || 0) + 1,
        };
        await exp.save();
        await emitExperiment(experimentId, "explain:progress", {
          modelName,
          pct: Math.round(
            ((exp.progress?.explainCompleted || 0) / top.length) * 100
          ),
        });
      }

      const mjsPost = (await mlClient.scoreMjs(
        {
          models: runs.map((r) => ({
            model_name: r.modelName,
            model_run_id: r.modelRunId,
            model_family: r.model_family,
            primary_score: r.primary_score,
            metrics: r.metrics,
            timing: r.timing,
            resources: r.resources,
            robustness: r.robustness,
            explainability_quality: qualityMap[String(r.modelName)] || null,
          })),
          mjs_config: mjsConfig,
          kind: "primary",
          label: "primary",
        },
        requestId
      )) as typeof mjsPre;

      mjsDoc = await MjsScore.create({
        userId,
        experimentId,
        kind: "primary",
        label: "primary",
        mjsVersion: mjsPost.mjs_version,
        method: mjsPost.method,
        weights: mjsPost.weights,
        normalization: mjsPost.normalization,
        scores: mjsPost.scores,
        explainabilityPending: false,
      });
      finalScores = mjsPost.scores;
    } else {
      // Promote pre-xai as primary when fast mode
      mjsDoc = await MjsScore.create({
        userId,
        experimentId,
        kind: "primary",
        label: "primary",
        mjsVersion: mjsPre.mjs_version,
        method: mjsPre.method,
        weights: mjsPre.weights,
        normalization: mjsPre.normalization,
        scores: mjsPre.scores,
        explainabilityPending: true,
      });
    }

    exp.primaryMjsScoreId = mjsDoc._id;
    exp.rankingSummary = finalScores.map((s) => ({
      modelName: s.modelName || s.model_name,
      modelRunId: s.modelRunId || s.model_run_id,
      composite: s.composite,
      rank: s.rank,
    }));
    await exp.save();
    await emitExperiment(experimentId, "mjs:ready", {
      ranking: exp.rankingSummary,
    });

    // Report
    await pushStatus(exp, "REPORTING", "report", "Generating report", 95);
    const top1 = [...finalScores].sort((a, b) => Number(a.rank) - Number(b.rank))[0];
    const recommendation = top1
      ? `Rank-1 model is ${top1.modelName || top1.model_name} with MJS ${Number(
          top1.composite
        ).toFixed(3)} (mjsVersion ${MJS_VERSION}). Weights: ${JSON.stringify(
          mjsConfig.weights
        )}. Composite is a weighted summary — inspect dimension scores before deployment.`
      : "No ranking available.";

    const report = await Report.findOneAndUpdate(
      { experimentId },
      {
        userId,
        experimentId,
        status: "COMPLETED",
        format: "json",
        title: `ModelJudge Report — ${exp.name || experimentId}`,
        sections: {
          recommendations: recommendation,
          ranking: finalScores,
          mjsConfig,
          lineage: exp.lineage,
          partial: failed > 0,
          modelsFailed: failed,
          modelsCompleted: completed,
        },
        generatorVersion: "0.1.0",
      },
      { upsert: true, new: true }
    );
    exp.reportId = report._id;

    const finalStatus = failed > 0 ? "COMPLETED_PARTIAL" : "COMPLETED";
    exp.completedAt = new Date();
    await pushStatus(
      exp,
      finalStatus,
      "done",
      failed > 0
        ? `Completed with ${failed} failed model(s)`
        : "Experiment completed",
      100
    );

    await Job.findByIdAndUpdate(jobDocId, {
      status: "COMPLETED",
      finishedAt: new Date(),
      progress: { percent: 100, message: finalStatus },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Experiment failed";
    exp.status = exp.cancelRequested ? "CANCELLED" : "FAILED";
    exp.statusMessage = message;
    exp.error = { code: "EXPERIMENT_FAILED", message, stage: exp.currentStage };
    exp.timeline = [
      ...(exp.timeline || []),
      {
        at: new Date(),
        status: exp.status,
        stage: exp.currentStage,
        message,
      },
    ];
    await exp.save();
    await emitExperiment(experimentId, "experiment:failed", {
      stage: exp.currentStage,
      message,
    });
    await Job.findByIdAndUpdate(jobDocId, {
      status: "FAILED",
      finishedAt: new Date(),
      error: { code: "EXPERIMENT_FAILED", message },
    });
    throw e;
  }
}
