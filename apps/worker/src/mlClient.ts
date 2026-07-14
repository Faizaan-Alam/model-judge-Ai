import { config } from "./config";

export class MlError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: unknown
  ) {
    super(message);
    this.name = "MlError";
  }
}

async function call<T>(
  path: string,
  body: unknown,
  requestId?: string,
  timeoutMs = 600_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.ml.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ml.token}`,
        "X-Request-Id": requestId || "",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (data.error as Record<string, unknown>) || data;
      throw new MlError(
        res.status,
        String(err.code || "ML_FAILED"),
        String(err.message || res.statusText),
        err.detail || err.details
      );
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export const mlClient = {
  health: async () => {
    const res = await fetch(`${config.ml.url}/health`);
    return res.json();
  },
  profile: (body: unknown, requestId?: string) =>
    call("/v1/profile", body, requestId, 120_000),
  preprocessPlan: (body: unknown, requestId?: string) =>
    call("/v1/preprocess/plan", body, requestId, 60_000),
  preprocessApply: (body: unknown, requestId?: string) =>
    call("/v1/preprocess/apply", body, requestId, 300_000),
  trainOne: (body: unknown, requestId?: string) =>
    call("/v1/train/one", body, requestId, 600_000),
  robustness: (body: unknown, requestId?: string) =>
    call("/v1/evaluate/robustness", body, requestId, 600_000),
  scoreMjs: (body: unknown, requestId?: string) =>
    call("/v1/score/mjs", body, requestId, 60_000),
  explain: (body: unknown, requestId?: string) =>
    call("/v1/explain", body, requestId, 600_000),
};
