import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Badge, Button, Card, statusTone } from "../components/ui";

type Experiment = {
  _id: string;
  name: string;
  status: string;
  statusMessage?: string;
  createdAt: string;
  config?: { problemType?: string };
};

export function ExperimentsPage() {
  const [items, setItems] = useState<Experiment[]>([]);

  useEffect(() => {
    api<{ items: Experiment[] }>("/api/v1/experiments").then((r) => setItems(r.items));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <Link to="/experiments/new">
          <Button>New experiment</Button>
        </Link>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Problem</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e._id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link className="font-medium text-brand-700 hover:underline" to={`/experiments/${e._id}`}>
                    {e.name}
                  </Link>
                  {e.statusMessage && (
                    <div className="text-xs text-slate-500">{e.statusMessage}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">{e.config?.problemType || "—"}</td>
                <td className="px-4 py-2">
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No experiments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
