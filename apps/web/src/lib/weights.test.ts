import { strict as assert } from "assert";

/** Proportional renormalize helper (mirrors UI intent). */
export function renormalize(weights: Record<string, number>): Record<string, number> {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const keys = Object.keys(weights);
    const eq = 1 / keys.length;
    return Object.fromEntries(keys.map((k) => [k, eq]));
  }
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / sum]));
}

export function weightsSumOk(weights: Record<string, number>, eps = 1e-6): boolean {
  const s = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(s - 1) < eps;
}

function main() {
  const w = renormalize({
    performance: 0.5,
    robustness: 0.5,
    efficiency: 0.5,
    explainability: 0,
    reproducibility: 0,
  });
  assert.ok(weightsSumOk(w));
  assert.ok(Math.abs(w.performance - 1 / 3) < 1e-9);

  assert.equal(
    weightsSumOk({
      performance: 0.35,
      robustness: 0.2,
      efficiency: 0.15,
      explainability: 0.15,
      reproducibility: 0.15,
    }),
    true
  );
  assert.equal(weightsSumOk({ a: 0.5, b: 0.4 }), false);

  console.log("web weight tests ok");
}

main();
