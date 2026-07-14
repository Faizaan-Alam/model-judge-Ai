/**
 * Pure logic tests mirroring orchestrator decisions (no Redis/Mongo).
 */
import { strict as assert } from "assert";

type Score = { modelName: string; composite: number; rank: number };

function pickTopK(scores: Score[], k: number): Score[] {
  return [...scores].sort((a, b) => a.rank - b.rank).slice(0, k);
}

function finalStatus(completed: number, failed: number): string {
  if (completed < 2) return "FAILED";
  if (failed > 0) return "COMPLETED_PARTIAL";
  return "COMPLETED";
}

function recommendation(top: Score | undefined, weights: Record<string, number>, ver: string) {
  if (!top) return "No ranking available.";
  return `Rank-1 model is ${top.modelName} with MJS ${top.composite.toFixed(
    3
  )} (mjsVersion ${ver}). Weights: ${JSON.stringify(weights)}.`;
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

function main() {
  const scores: Score[] = [
    { modelName: "rf", composite: 0.82, rank: 1 },
    { modelName: "lr", composite: 0.80, rank: 2 },
    { modelName: "knn", composite: 0.70, rank: 3 },
  ];
  assert.deepEqual(
    pickTopK(scores, 2).map((s) => s.modelName),
    ["rf", "lr"]
  );
  assert.equal(pickTopK(scores, 0).length, 0);

  assert.equal(finalStatus(3, 0), "COMPLETED");
  assert.equal(finalStatus(3, 1), "COMPLETED_PARTIAL");
  assert.equal(finalStatus(1, 2), "FAILED");

  const rec = recommendation(scores[0], { performance: 0.35 }, "1.0.0");
  assert.ok(rec.includes("random_forest") || rec.includes("rf"));
  assert.ok(rec.includes("0.820"));
  assert.ok(rec.includes("1.0.0"));

  assert.equal(familyOf("xgboost"), "boosting");
  assert.equal(familyOf("logistic_regression"), "linear");
  assert.equal(familyOf("unknown"), "other");

  console.log("worker logic tests ok");
}

main();
