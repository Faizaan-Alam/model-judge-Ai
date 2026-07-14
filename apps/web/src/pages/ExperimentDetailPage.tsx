import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { io } from "socket.io-client";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Badge, Button, Card, statusTone } from "../components/ui";

type Experiment = {
  _id: string;
  name: string;
  status: string;
  statusMessage?: string;
  progress?: { percent?: number; modelsCompleted?: number; modelsTotal?: number };
  rankingSummary?: Array<{ modelName: string; composite: number; rank: number }>;
  timeline?: Array<{ at: string; status: string; message: string }>;
  mjsConfig?: { weights?: Record<string, number>; method?: string };
  lineage?: Record<string, unknown>;
  config?: Record<string, unknown>;
  error?: { message?: string };
};

type ModelRun = {
  _id: string;
  modelName: string;
  status: string;
  metrics?: Record<string, unknown>;
  timing?: { trainMs?: number };
  resources?: { modelSizeKb?: number };
};

type MjsDoc = {
  weights: Record<string, number>;
  mjsVersion: string;
  method: string;
  scores: Array<{
    modelName: string;
    composite: number;
    rank: number;
    dimensions: Record<string, number>;
  }>;
  explainabilityPending?: boolean;
};

type Explanation = {
  _id: string;
  modelName: string;
  method: string;
  status: string;
  quality?: Record<string, number>;
  globalImportance?: Array<{ feature: string; absValue?: number; value?: number }>;
};

type Report = {
  sections?: { recommendations?: string; ranking?: unknown };
};

const API_URL = import.meta.env.VITE_API_URL || "";

export function ExperimentDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [exp, setExp] = useState<Experiment | null>(null);
  const [models, setModels] = useState<ModelRun[]>([]);
  const [mjs, setMjs] = useState<MjsDoc | null>(null);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"overview" | "models" | "mjs" | "explain" | "report" | "lineage">(
    "overview"
  );
  const [live, setLive] = useState("offline");

  async function refresh() {
    if (!id) return;
    const e = await api<{ experiment: Experiment }>(`/api/v1/experiments/${id}`);
    setExp(e.experiment);
    const m = await api<{ items: ModelRun[] }>(`/api/v1/experiments/${id}/models`);
    setModels(m.items);
    const mj = await api<{ items: MjsDoc[] }>(`/api/v1/experiments/${id}/mjs?kind=primary`);
    setMjs(mj.items[0] || null);
    const ex = await api<{ items: Explanation[] }>(`/api/v1/experiments/${id}/explanations`);
    setExplanations(ex.items);
    const rp = await api<{ report: Report | null }>(`/api/v1/experiments/${id}/report`);
    setReport(rp.report);
  }

  useEffect(() => {
    refresh().catch(console.error);
    const poll = setInterval(() => {
      if (live !== "live") refresh().catch(() => undefined);
    }, 8000);
    return () => clearInterval(poll);
  }, [id, live]); // eslint-disable-line

  useEffect(() => {
    if (!id || !token) return;
    const socket = io(API_URL || undefined, {
      auth: { token },
      path: "/socket.io",
    });
    socket.on("connect", () => {
      setLive("live");
      socket.emit("experiment:join", { experimentId: id });
    });
    socket.on("disconnect", () => setLive("offline"));
    const bump = () => refresh().catch(() => undefined);
    socket.on("experiment:status", bump);
    socket.on("model:completed", bump);
    socket.on("mjs:ready", bump);
    socket.on("explain:progress", bump);
    socket.on("experiment:failed", bump);
    return () => {
      socket.emit("experiment:leave", { experimentId: id });
      socket.disconnect();
    };
  }, [id, token]); // eslint-disable-line

  const radarData = useMemo(() => {
    if (!mjs?.scores?.length) return [];
    const dims = ["performance", "robustness", "efficiency", "explainability", "reproducibility"];
    const top = [...mjs.scores].sort((a, b) => a.rank - b.rank).slice(0, 5);
    return dims.map((d) => {
      const row: Record<string, string | number> = { dim: d };
      for (const s of top) {
        row[s.modelName] = Number(s.dimensions?.[d] ?? 0);
      }
      return row;
    });
  }, [mjs]);

  const topModels = useMemo(() => {
    if (!mjs?.scores) return [];
    return [...mjs.scores].sort((a, b) => a.rank - b.rank).slice(0, 5).map((s) => s.modelName);
  }, [mjs]);

  const colors = ["#4f46e5", "#059669", "#d97706", "#db2777", "#0891b2"];

  if (!exp) return <div className="text-slate-500">Loading experiment…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/experiments" className="text-xs text-brand-600 hover:underline">
            ← Experiments
          </Link>
          <h1 className="text-2xl font-semibold">{exp.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(exp.status)}>{exp.status}</Badge>
            <span className="text-xs text-slate-500">{exp.statusMessage}</span>
            <Badge tone={live === "live" ? "green" : "amber"}>
              {live === "live" ? "Live" : "Polling"}
            </Badge>
          </div>
        </div>
        <Button variant="secondary" onClick={() => refresh()}>
          Refresh
        </Button>
      </div>

      {exp.progress && (
        <Card className="p-3">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>
              Models {exp.progress.modelsCompleted ?? 0}/{exp.progress.modelsTotal ?? "?"}
            </span>
            <span>{exp.progress.percent ?? 0}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${exp.progress.percent ?? 0}%` }}
            />
          </div>
        </Card>
      )}

      {exp.status === "COMPLETED_PARTIAL" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Partial success — some models failed. Rankings use successful runs only.
        </div>
      )}
      {exp.error?.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {exp.error.message}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {(
          [
            ["overview", "Overview"],
            ["models", "Models"],
            ["mjs", "MJS"],
            ["explain", "Explanations"],
            ["report", "Report"],
            ["lineage", "Lineage"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === k ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <h2 className="font-medium">Leaderboard</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {(exp.rankingSummary || mjs?.scores || [])
                .slice()
                .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank)
                .map((r: { rank: number; modelName: string; composite: number }) => (
                  <li key={r.modelName} className="flex justify-between border-b border-slate-100 py-1">
                    <span>
                      #{r.rank} <span className="font-mono text-xs">{r.modelName}</span>
                    </span>
                    <span className="font-mono">{Number(r.composite).toFixed(3)}</span>
                  </li>
                ))}
              {!exp.rankingSummary?.length && !mjs?.scores?.length && (
                <li className="text-slate-500">Ranking not ready yet.</li>
              )}
            </ol>
          </Card>
          <Card className="p-4">
            <h2 className="font-medium">Timeline</h2>
            <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-xs">
              {(exp.timeline || [])
                .slice()
                .reverse()
                .map((t, i) => (
                  <li key={i} className="border-l-2 border-brand-200 pl-2">
                    <div className="font-medium">{t.status}</div>
                    <div className="text-slate-500">{t.message}</div>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "models" && (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Primary metrics</th>
                <th className="px-3 py-2">Train ms</th>
                <th className="px-3 py-2">Size KB</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m._id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{m.modelName}</td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {m.metrics
                      ? Object.entries(m.metrics)
                          .filter(([k]) => !["cv", "confusionMatrix"].includes(k))
                          .slice(0, 4)
                          .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(3) : v}`)
                          .join(" · ")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{m.timing?.trainMs?.toFixed?.(1) ?? "—"}</td>
                  <td className="px-3 py-2">{m.resources?.modelSizeKb?.toFixed?.(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "mjs" && (
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            <p>
              <strong>Method:</strong> {mjs?.method || exp.mjsConfig?.method || "—"} ·{" "}
              <strong>mjsVersion:</strong> {mjs?.mjsVersion || "—"}
              {mjs?.explainabilityPending && (
                <span className="ml-2 text-amber-700">(explainability prior / pending XAI quality)</span>
              )}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-600">
              weights: {JSON.stringify(mjs?.weights || exp.mjsConfig?.weights || {})}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Composite is a weighted summary. Inspect all five dimensions before deployment decisions.
            </p>
          </Card>

          {radarData.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 font-medium">MJS radar (top models)</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                    {topModels.map((m, i) => (
                      <Radar
                        key={m}
                        name={m}
                        dataKey={m}
                        stroke={colors[i % colors.length]}
                        fill={colors[i % colors.length]}
                        fillOpacity={0.15}
                      />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Composite</th>
                  <th className="px-3 py-2">Perf</th>
                  <th className="px-3 py-2">Rob</th>
                  <th className="px-3 py-2">Eff</th>
                  <th className="px-3 py-2">XAI</th>
                  <th className="px-3 py-2">Repr</th>
                </tr>
              </thead>
              <tbody>
                {(mjs?.scores || [])
                  .slice()
                  .sort((a, b) => a.rank - b.rank)
                  .map((s) => (
                    <tr key={s.modelName} className="border-t border-slate-100 font-mono text-xs">
                      <td className="px-3 py-2">{s.rank}</td>
                      <td className="px-3 py-2">{s.modelName}</td>
                      <td className="px-3 py-2 font-semibold">{s.composite?.toFixed(3)}</td>
                      <td className="px-3 py-2">{s.dimensions?.performance?.toFixed(3)}</td>
                      <td className="px-3 py-2">{s.dimensions?.robustness?.toFixed(3)}</td>
                      <td className="px-3 py-2">{s.dimensions?.efficiency?.toFixed(3)}</td>
                      <td className="px-3 py-2">{s.dimensions?.explainability?.toFixed(3)}</td>
                      <td className="px-3 py-2">{s.dimensions?.reproducibility?.toFixed(3)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "explain" && (
        <div className="grid gap-4">
          {!explanations.length && (
            <Card className="p-4 text-sm text-slate-500">
              No explanations yet (fast mode, still running, or top-K=0).
            </Card>
          )}
          {explanations.map((ex) => {
            const bars = (ex.globalImportance || []).slice(0, 15).map((g) => ({
              feature: g.feature?.length > 24 ? g.feature.slice(-24) : g.feature,
              value: Math.abs(Number(g.absValue ?? g.value ?? 0)),
            }));
            return (
              <Card key={ex._id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-sm font-medium">{ex.modelName}</h3>
                  <Badge>{ex.method}</Badge>
                  <Badge tone={statusTone(ex.status)}>{ex.status}</Badge>
                </div>
                {ex.quality && (
                  <p className="mt-1 text-xs text-slate-600">
                    quality: faith={Number(ex.quality.faithfulness ?? 0).toFixed(2)} stab=
                    {Number(ex.quality.stability ?? 0).toFixed(2)} cplx=
                    {Number(ex.quality.complexity ?? 0).toFixed(2)} summary=
                    {Number(ex.quality.summaryScore ?? ex.quality.summary_score ?? 0).toFixed(2)}
                  </p>
                )}
                {bars.length > 0 && (
                  <div className="mt-3 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bars} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="feature" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#4f46e5" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Post-hoc explanation — not causal. Use with domain knowledge.
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "report" && (
        <Card className="space-y-3 p-4 text-sm">
          <h2 className="font-medium">Recommendation</h2>
          <p className="leading-relaxed text-slate-700">
            {report?.sections?.recommendations || "Report not ready yet."}
          </p>
        </Card>
      )}

      {tab === "lineage" && (
        <Card className="p-4">
          <h2 className="font-medium">Reproducibility lineage</h2>
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(
              { lineage: exp.lineage, mjsConfig: exp.mjsConfig, config: exp.config },
              null,
              2
            )}
          </pre>
        </Card>
      )}
    </div>
  );
}
