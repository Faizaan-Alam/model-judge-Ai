import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Badge, Button, Card, statusTone } from "../components/ui";

type Experiment = {
  _id: string;
  name: string;
  status: string;
  createdAt: string;
  rankingSummary?: Array<{ modelName: string; composite: number; rank: number }>;
};

export function DashboardPage() {
  const [items, setItems] = useState<Experiment[]>([]);

  useEffect(() => {
    api<{ items: Experiment[] }>("/api/v1/experiments")
      .then((r) => setItems(r.items.slice(0, 5)))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Evaluate tabular models with ModelJudge Score (MJS) — performance, robustness,
            efficiency, explainability, reproducibility.
          </p>
        </div>
        <Link to="/experiments/new">
          <Button>New experiment</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Recent experiments</p>
          <p className="mt-2 text-3xl font-semibold">{items.length}</p>
        </Card>
        <Card className="p-4 md:col-span-2">
          <p className="text-sm text-slate-600">
            <strong>Scope:</strong> tabular supervised learning only. Fixed model zoo. Not AutoML.
            ML runs in an internal Python service; this app orchestrates and explains results.
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 font-medium">Latest experiments</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Top model</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => {
              const top = e.rankingSummary?.find((r) => r.rank === 1);
              return (
                <tr key={e._id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link className="text-brand-700 hover:underline" to={`/experiments/${e._id}`}>
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {top ? `${top.modelName} (${Number(top.composite).toFixed(3)})` : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {!items.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No experiments yet. Upload a dataset and start one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
