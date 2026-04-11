import { useEffect, useState } from "react";
import ChartCard from "./ChartCard.jsx";

// Modal dialog for expanded chart
export default function ChartDialog({ open, onClose, chart }) {
  const [instance, setInstance] = useState(null);

  // Lock body scroll when dialog is open
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !chart) return null;

  // Telechargement du graphique en image (PNG)
  const handleDownload = () => {
    if (!instance) return;
    const name = (chart?.title || "graphique")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const link = document.createElement("a");
    link.download = `${name || "graphique"}.png`;
    link.href = instance.toBase64Image();
    link.click();
  };

  // Export CSV (labels + datasets)
  const handleExportCsv = () => {
    const labels = chart?.data?.labels || [];
    const datasets = chart?.data?.datasets || [];

    const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
    const header = ["Label", ...datasets.map((d, i) => d.label || `Serie ${i + 1}`)];
    const rows = labels.map((lbl, idx) => [
      lbl,
      ...datasets.map((d) => (Array.isArray(d.data) ? d.data[idx] : "")),
    ]);

    const csv = [header, ...rows].map((r) => r.map(escapeCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const name = (chart?.title || "graphique")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const link = document.createElement("a");
    link.download = `${name || "graphique"}.csv`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-close" onClick={onClose}>
          Fermer
        </button>
        <button className="dialog-csv" onClick={handleExportCsv}>
          Exporter Excel
        </button>
        <button
          className="dialog-download"
          onClick={handleDownload}
          disabled={!instance}
        >
          Telecharger
        </button>

        <ChartCard
          title={chart.title}
          type={chart.type}
          data={chart.data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 18 } },
            ...(chart.options || {}),
          }}
          onChartReady={setInstance}
        />
      </div>
    </div>
  );
}
