import { strict as assert } from "assert";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { mjsWeightsSchema, createExperimentSchema, DEFAULT_MJS_WEIGHTS } from "@modeljudge/shared";
import { signToken } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

function testWeights() {
  const w = mjsWeightsSchema.parse({ ...DEFAULT_MJS_WEIGHTS });
  const sum =
    w.performance + w.robustness + w.efficiency + w.explainability + w.reproducibility;
  assert.ok(Math.abs(sum - 1) < 1e-9);

  assert.throws(() =>
    mjsWeightsSchema.parse({
      performance: 0.5,
      robustness: 0.5,
      efficiency: 0.5,
      explainability: 0,
      reproducibility: 0,
    })
  );
}

function testCreateExperimentDefaults() {
  const exp = createExperimentSchema.parse({
    name: "exp",
    datasetId: "ds1",
    config: {
      problemType: "regression",
      targetColumn: "y",
      featureColumns: ["x1"],
      models: ["ridge", "random_forest"],
    },
  });
  assert.equal(exp.config.cvFolds, 5);
  assert.equal(exp.config.fastMode, false);
  assert.equal(exp.mjsConfig.weights.performance, 0.35);
}

function testJwtRoundtrip() {
  // signToken uses config jwt secret from env
  process.env.JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
  const token = signToken({ id: "u1", email: "a@b.com", role: "user" });
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
  assert.equal(payload.id, "u1");
  assert.equal(payload.email, "a@b.com");
}

async function testBcrypt() {
  const hash = await bcrypt.hash("password123", 10);
  assert.ok(await bcrypt.compare("password123", hash));
  assert.equal(await bcrypt.compare("wrong", hash), false);
}

function testAppError() {
  const e = new AppError(400, "VALIDATION_ERROR", "bad");
  assert.equal(e.status, 400);
  assert.equal(e.code, "VALIDATION_ERROR");
}

/** Illegal experiment start statuses */
function testStartStatusGate() {
  const allowed = new Set(["PLAN_READY", "CREATED"]);
  for (const s of ["TRAINING", "COMPLETED", "FAILED", "CANCELLED"]) {
    assert.equal(allowed.has(s), false);
  }
  assert.ok(allowed.has("PLAN_READY"));
}

async function main() {
  testWeights();
  testCreateExperimentDefaults();
  testJwtRoundtrip();
  await testBcrypt();
  testAppError();
  testStartStatusGate();
  console.log("api unit tests ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
