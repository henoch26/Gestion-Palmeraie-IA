import { useMemo, useState } from "react";
import ChartCard from "./ChartCard.jsx";
import useBodyScrollLock from "../utils/useBodyScrollLock.js";

// Génère un nom de fichier sûr à partir du titre
function safeFilename(title = "graphique") {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // supprime les accents
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    || "graphique";
}

// Export Excel XML (.xls) — sans dépendance externe, ouvre directement dans Excel
function exportToExcel(title, chartData) {
  const labels   = chartData?.labels   || [];
  const datasets = chartData?.datasets || [];

  const headers = ["Étiquette", ...datasets.map((d, i) => d.label || `Série ${i + 1}`)];
  const rows    = labels.map((lbl, idx) => [
    lbl,
    ...datasets.map((d) => (Array.isArray(d.data) ? (d.data[idx] ?? "") : "")),
  ]);

  const xmlRows = [headers, ...rows]
    .map((row) =>
      `<Row>${row
        .map((cell) => {
          const isNum = typeof cell === "number";
          const val   = String(cell ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${val}</Data></Cell>`;
        })
        .join("")}</Row>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Données">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${safeFilename(title)}.xls`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function ChartDialog({ open, onClose, chart, subtitle }) {
  const [instance, setInstance] = useState(null);
  useBodyScrollLock(!!open);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { bottom: 18 } },
      ...(chart?.options || {}),
    }),
    [chart]
  );

  if (!open || !chart) return null;

  const handleDownloadImage = () => {
    if (!instance) return;
    const link = document.createElement("a");
    link.download = `${safeFilename(chart.title)}.png`;
    link.href = instance.toBase64Image("image/png", 1);
    link.click();
  };

  const handleExportExcel = () => exportToExcel(chart.title, chart.data);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        style={{ maxWidth: 900, width: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── En-tête ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{chart.title}</h3>
            {subtitle && (
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "#888", fontStyle: "italic", fontWeight: 500 }}>
                {subtitle}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleExportExcel}
              style={{
                padding: "6px 14px", borderRadius: 4, border: "1px solid #217346",
                background: "#217346", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ⬇ Excel
            </button>
            <button
              onClick={handleDownloadImage}
              disabled={!instance}
              style={{
                padding: "6px 14px", borderRadius: 4, border: "1px solid #1565c0",
                background: instance ? "#1565c0" : "#bbb", color: "#fff",
                cursor: instance ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              🖼 Image PNG
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "6px 14px", borderRadius: 4, border: "1px solid #ccc",
                background: "#fff", color: "#333", cursor: "pointer", fontSize: 13,
              }}
            >
              ✕ Fermer
            </button>
          </div>
        </div>

        {/* ── Graphique agrandi ── */}
        <div style={{ height: 480 }}>
          <ChartCard
            title=""
            type={chart.type}
            data={chart.data}
            options={chartOptions}
            plugins={chart.plugins}
            onChartReady={setInstance}
          />
        </div>
      </div>
    </div>
  );
}
