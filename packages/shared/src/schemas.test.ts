/**
 * Lightweight tests run via node --test after tsc build,
 * or with vitest if configured. Here we use assert for node:test.
 */
import { strict as assert } from "assert";
import {
  createExperimentSchema,
  loginSchema,
  mjsWeightsSchema,
  registerSchema,
} from "./schemas";
import { DEFAULT_MJS_WEIGHTS, modelsForProblem } from "./enums";

export function runSharedTests() {
  // register
  assert.doesNotThrow(() =>
    registerSchema.parse({
      email: "a@b.com",
      password: "password1",
      name: "Ada",
    })
  );
  assert.throws(() =>
    registerSchema.parse({ email: "bad", password: "short", name: "" })
  );

  // login
  assert.doesNotThrow(() =>
    loginSchema.parse({ email: "a@b.com", password: "x" })
  );

  // weights sum
  assert.doesNotThrow(() => mjsWeightsSchema.parse(DEFAULT_MJS_WEIGHTS));
  assert.throws(() =>
    mjsWeightsSchema.parse({
      performance: 1,
      robustness: 1,
      efficiency: 0,
      explainability: 0,
      reproducibility: 0,
    })
  );

  // experiment
  const exp = createExperimentSchema.parse({
    name: "t",
    datasetId: "abc",
    config: {
      problemType: "binary_classification",
      targetColumn: "y",
      featureColumns: ["a", "b"],
      models: ["logistic_regression", "random_forest"],
    },
  });
  assert.equal(exp.config.testSize, 0.2);
  assert.equal(exp.mjsConfig.method, "fixed");

  // model zoo applicability
  assert.ok(modelsForProblem("regression").includes("ridge"));
  assert.ok(!modelsForProblem("regression").includes("naive_bayes"));
  assert.ok(modelsForProblem("binary_classification").includes("xgboost"));

  console.log("shared tests ok");
}

// run if executed directly
if (require.main === module) {
  runSharedTests();
}
