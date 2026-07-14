import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Badge, Button, Card, Input, Label, statusTone } from "../components/ui";

type Dataset = {
  _id: string;
  name: string;
  originalFilename: string;
  sizeBytes: number;
  nRows?: number;
  nCols?: number;
  profile: { status: string; warnings?: string[]; columns?: unknown[] };
  createdAt: string;
};

export function DatasetsPage() {
  const [items, setItems] = useState<Dataset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    const r = await api<{ items: Dataset[] }>("/api/v1/datasets");
    setItems(r.items);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = setInterval(() => load().catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, []);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (name) fd.append("name", name);
      await api("/api/v1/datasets", { method: "POST", body: fd });
      setFile(null);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Datasets</h1>
        <p className="text-sm text-slate-500">CSV/TSV only. Profile runs automatically after upload.</p>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-4 md:items-end" onSubmit={onUpload}>
          <div className="md:col-span-2">
            <Label>CSV file</Label>
            <Input
              type="file"
              accept=".csv,.tsv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <Label>Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My dataset" />
          </div>
          <Button type="submit" disabled={!file || uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Profile</th>
              <th className="px-4 py-2">Rows × Cols</th>
              <th className="px-4 py-2">Size</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d._id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-slate-500">{d.originalFilename}</div>
                </td>
                <td className="px-4 py-2">
                  <Badge tone={statusTone(d.profile?.status || "NONE")}>
                    {d.profile?.status || "NONE"}
                  </Badge>
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {d.nRows ?? "—"} × {d.nCols ?? "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {(d.sizeBytes / 1024).toFixed(1)} KB
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
