import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CLASSIFICATION_MODELS,
  DEFAULT_MJS_WEIGHTS,
  REGRESSION_MODELS,
  type ModelName,
  type ProblemType,
} from "@modeljudge/shared";
import { api } from "../lib/api";
import { Button, Card, Input, Label } from "../components/ui";

type Dataset = {
  _id: string;
  name: string;
  profile: { status: string; columns: Array<{ name: string; inferredType: string }> };
};

const PRESETS: Record<string, typeof DEFAULT_MJS_WEIGHTS> = {
  balanced: { ...DEFAULT_MJS_WEIGHTS },
  accuracy: {
    performance: 0.5,
    robustness: 0.15,
    efficiency: 0.1,
    explainability: 0.15,
    reproducibility: 0.1,
  },
  efficiency: {
    performance: 0.25,
    robustness: 0.15,
    efficiency: 0.35,
    explainability: 0.15,
    reproducibility: 0.1,
  },
  interpretability: {
    performance: 0.25,
    robustness: 0.15,
    efficiency: 0.1,
    explainability: 0.35,
    reproducibility: 0.15,
  },
};

export function NewExperimentPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [name, setName] = useState("My experiment");
  const [target, setTarget] = useState("");
  const [problemType, setProblemType] = useState<ProblemType>("binary_classification");
  const [features, setFeatures] = useState<string[]>([]);
  const [models, setModels] = useState<ModelName[]>([]);
  const [weights, setWeights] = useState({ ...DEFAULT_MJS_WEIGHTS });
  const [fastMode, setFastMode] = useState(false);
  const [topK, setTopK] = useState(3);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ items: Dataset[] }>("/api/v1/datasets").then((r) => {
      const ready = r.items.filter((d) => d.profile?.status === "READY");
      setDatasets(ready);
      if (ready[0]) setDatasetId(ready[0]._id);
    });
  }, []);

  const ds = datasets.find((d) => d._id === datasetId);
  const columns = ds?.profile?.columns || [];

  useEffect(() => {
    if (!columns.length) return;
    const names = columns.map((c) => c.name);
    if (!target && names.length) {
      setTarget(names[names.length - 1]);
    }
    setFeatures(names.filter((n) => n !== target));
  }, [datasetId, columns.length]); // eslint-disable-line

  useEffect(() => {
    setFeatures((prev) => {
      const names = columns.map((c) => c.name).filter((n) => n !== target);
      return names.length ? names : prev;
    });
  }, [target]); // eslint-disable-line

  const zoo = useMemo(
    () => (problemType === "regression" ? REGRESSION_MODELS : CLASSIFICATION_MODELS),
    [problemType]
  );

  useEffect(() => {
    setModels(zoo.slice(0, 4) as ModelName[]);
  }, [zoo]);

  function toggleModel(m: ModelName) {
    setModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function toggleFeature(f: string) {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function setWeight(key: keyof typeof weights, value: number) {
    setWeights((w) => ({ ...w, [key]: value }));
  }

  const weightSum =
    weights.performance +
    weights.robustness +
    weights.efficiency +
    weights.explainability +
    weights.reproducibility;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (Math.abs(weightSum - 1) > 1e-6) {
      setError("MJS weights must sum to 1.0");
      return;
    }
    if (!datasetId || !target || !features.length || !models.length) {
      setError("Dataset, target, features, and models are required");
      return;
    }
    setLoading(true);
    try {
      const created = await api<{ experiment: { _id: string } }>("/api/v1/experiments", {
        method: "POST",
        body: JSON.stringify({
          name,
          datasetId,
          config: {
            problemType,
            targetColumn: target,
            featureColumns: features,
            idColumns: [],
            testSize: 0.2,
            valSize: 0,
            splitSeed: 42,
            cvFolds: 5,
            models,
            topKExplain: topK,
            fastMode,
            randomSeed: 42,
          },
          mjsConfig: {
            method: "fixed",
            weights,
            notes: "Fixed weights v1",
          },
        }),
      });
      await api(`/api/v1/experiments/${created.experiment._id}/start`, { method: "POST" });
      nav(`/experiments/${created.experiment._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New experiment</h1>
        <p className="text-sm text-slate-500">Step {step} of 4 — wizard</p>
      </div>

      <div className="flex gap-2 text-xs">
        {["Dataset", "Problem", "Models & MJS", "Review"].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i + 1)}
            className={`rounded-full px-3 py-1 ${
              step === i + 1 ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {step === 1 && (
          <Card className="space-y-3 p-4">
            <div>
              <Label>Experiment name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Dataset (profile READY only)</Label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
              >
                {!datasets.length && <option value="">No ready datasets</option>}
                {datasets.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={() => setStep(2)} disabled={!datasetId}>
              Next
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card className="space-y-3 p-4">
            <div>
              <Label>Target column</Label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.inferredType})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Problem type</Label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={problemType}
                onChange={(e) => setProblemType(e.target.value as ProblemType)}
              >
                <option value="binary_classification">Binary classification</option>
                <option value="multiclass_classification">Multiclass classification</option>
                <option value="regression">Regression</option>
              </select>
            </div>
            <div>
              <Label>Features</Label>
              <div className="mt-1 grid max-h-48 grid-cols-2 gap-1 overflow-auto rounded border p-2 md:grid-cols-3">
                {columns
                  .filter((c) => c.name !== target)
                  .map((c) => (
                    <label key={c.name} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={features.includes(c.name)}
                        onChange={() => toggleFeature(c.name)}
                      />
                      {c.name}
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="space-y-4 p-4">
            <div>
              <Label>Models (fixed zoo)</Label>
              <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3">
                {zoo.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={models.includes(m as ModelName)}
                      onChange={() => toggleModel(m as ModelName)}
                    />
                    <span className="font-mono text-xs">{m}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>MJS weight presets</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {Object.keys(PRESETS).map((k) => (
                  <Button key={k} type="button" variant="secondary" onClick={() => setWeights({ ...PRESETS[k] })}>
                    {k}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(Object.keys(weights) as Array<keyof typeof weights>).map((k) => (
                <div key={k}>
                  <Label>
                    {k}: {weights[k].toFixed(2)}
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[k]}
                    onChange={(e) => setWeight(k, Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
            <p className={`text-xs ${Math.abs(weightSum - 1) < 1e-6 ? "text-emerald-700" : "text-red-600"}`}>
              Weight sum: {weightSum.toFixed(3)} (must be 1.0)
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} />
                Fast mode (skip SHAP/LIME; use intrinsic explainability prior)
              </label>
              <div>
                <Label>Top-K explain</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(4)}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card className="space-y-3 p-4">
            <h2 className="font-medium">Review</h2>
            <ul className="list-inside list-disc text-sm text-slate-700">
              <li>Name: {name}</li>
              <li>Dataset: {ds?.name}</li>
              <li>Target: {target}</li>
              <li>Type: {problemType}</li>
              <li>Features: {features.length}</li>
              <li>Models: {models.join(", ")}</li>
              <li>Fast mode: {fastMode ? "yes" : "no"}</li>
              <li>Weights: {JSON.stringify(weights)}</li>
            </ul>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Starting…" : "Create & start"}
              </Button>
            </div>
          </Card>
        )}
      </form>
    </div>
  );
}
