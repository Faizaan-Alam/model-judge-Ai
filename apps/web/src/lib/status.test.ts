import { strict as assert } from "assert";

function statusTone(status: string): string {
  if (status === "COMPLETED") return "green";
  if (status === "COMPLETED_PARTIAL") return "amber";
  if (status === "FAILED" || status === "CANCELLED") return "red";
  if (
    ["TRAINING", "PREPROCESSING", "SCORING_MJS", "EXPLAINING", "REPORTING", "PROFILING", "PENDING"].includes(
      status
    )
  )
    return "blue";
  return "slate";
}

function main() {
  assert.equal(statusTone("COMPLETED"), "green");
  assert.equal(statusTone("COMPLETED_PARTIAL"), "amber");
  assert.equal(statusTone("FAILED"), "red");
  assert.equal(statusTone("TRAINING"), "blue");
  assert.equal(statusTone("PLAN_READY"), "slate");
  console.log("web status tests ok");
}

main();
