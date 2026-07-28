import { useEffect, useMemo, useState } from "react";
import { Calendar, Package, CalendarDays, TrendingUp } from "lucide-react";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS_COURTS = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

const GAP_MOIS = 12;

function cellColor(qty, max) {
  if (!qty) return "#f0f0f0";
  const r = qty / (max || 1);
  if (r < 0.15) return "#c6efce";
  if (r < 0.35) return "#9be9a8";
  if (r < 0.60) return "#40c463";
  if (r < 0.80) return "#30a14e";
  return "#1a7f37";
}

function textColor(qty, max) {
  if (!qty) return "#bbb";
  const r = qty / (max || 1);
  return r > 0.35 ? "#fff" : "#1a7f37";
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDateFR(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
}

export default function ProductionHeatmap({ data, year, onDayClick }) {
  const [tooltip, setTooltip] = useState(null);

  // Taille des cellules : réduite sur petit écran
  const [cellSize, setCellSize] = useState(() => window.innerWidth < 640 ? 18 : 26);

  useEffect(() => {
    const onResize = () => setCellSize(window.innerWidth < 640 ? 18 : 26);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const CELL = cellSize;
  const GAP  = cellSize < 22 ? 2 : 3;
  const STEP = CELL + GAP;
  const LEFT = cellSize < 22 ? 28 : 38;
  const TOP  = cellSize < 22 ? 32 : 40;

  const prodMap = useMemo(() => {
    const m = {};
    (data?.labels || []).forEach((lbl, i) => { m[lbl] = data.data[i] || 0; });
    return m;
  }, [data]);

  const maxVal = useMemo(() => Math.max(1, ...Object.values(prodMap)), [prodMap]);

  const weeks = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const dow = (jan1.getDay() + 6) % 7;
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - dow);

    const result = [];
    const cursor = new Date(start);
    while (result.length < 54) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        week.push({
          iso:    toISO(cursor),
          inYear: cursor.getFullYear() === year,
          qty:    prodMap[toISO(cursor)] || 0,
          month:  cursor.getMonth(),
          day:    cursor.getDate(),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push(week);
      if (cursor.getFullYear() > year && cursor.getMonth() > 0) break;
    }
    return result;
  }, [year, prodMap]);

  const { weekX, monthLabels } = useMemo(() => {
    const wx = [];
    const ml = [];
    let x = LEFT;
    let prevMonth = -1;

    weeks.forEach((week) => {
      const first = week.find(c => c.inYear);
      if (first) {
        if (first.month !== prevMonth) {
          if (prevMonth !== -1) x += GAP_MOIS;
          ml.push({ month: first.month, x });
          prevMonth = first.month;
        }
      }
      wx.push(x);
      x += STEP;
    });

    return { weekX: wx, monthLabels: ml };
  }, [weeks, LEFT, STEP]);

  const svgWidth  = (weekX[weekX.length - 1] || LEFT) + STEP + 4;
  const svgHeight = TOP + 7 * STEP + 4;

  const totalProd  = useMemo(() => Object.values(prodMap).reduce((a, b) => a + b, 0), [prodMap]);
  const activeDays = useMemo(() => Object.values(prodMap).filter(v => v > 0).length, [prodMap]);

  const monthBands = useMemo(() => {
    return monthLabels.map((ml, i) => ({
      ...ml,
      width: i + 1 < monthLabels.length
        ? monthLabels[i + 1].x - ml.x - GAP_MOIS
        : svgWidth - ml.x,
    }));
  }, [monthLabels, svgWidth]);

  const showTooltip = (e, cell) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTooltip({ screenX: r.left, screenY: r.top, ...cell });
  };

  const hideTooltip = () => setTooltip(null);

  const toggleTooltip = (e, cell) => {
    e.stopPropagation();
    if (tooltip?.iso === cell.iso) {
      hideTooltip();
    } else {
      showTooltip(e, cell);
    }
  };

  return (
    <div
      className="heatmap-wrapper"
      style={{ overflowX: "auto", padding: "8px 0 4px", WebkitOverflowScrolling: "touch" }}
      onClick={hideTooltip}
    >
      {/* Résumé */}
      <div
        className="heatmap-summary"
        style={{ display:"flex", flexWrap:"wrap", gap:20, fontSize:13, color:"#555", marginBottom:14 }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar size={14} /> <strong>{year}</strong></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Package size={14} /> Total : <strong style={{ color:"#2e7d32" }}>{totalProd.toLocaleString("fr-FR")} régimes</strong></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={14} /> Jours actifs : <strong>{activeDays}</strong></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><TrendingUp size={14} /> Pic : <strong>{maxVal.toLocaleString("fr-FR")} régimes</strong></span>
      </div>

      <svg width={svgWidth} height={svgHeight} style={{ display:"block", overflow:"visible" }}>

        {/* Fond par mois */}
        {monthBands.map((b, i) => (
          <rect
            key={`bg-${b.month}`}
            x={b.x - 2} y={TOP - 6}
            width={b.width} height={7 * STEP + 8}
            fill={i % 2 === 0 ? "#f7f7f7" : "#ffffff"}
            stroke="#ddd" strokeWidth={1} rx={4}
          />
        ))}

        {/* Étiquettes mois */}
        {monthBands.map((b) => (
          <text
            key={`mois-${b.month}`}
            x={b.x + b.width / 2 - 2} y={TOP - 14}
            fontSize={cellSize < 22 ? 10 : 12}
            fontWeight="700" fill="#333" textAnchor="middle"
          >
            {MOIS_COURTS[b.month]}
          </text>
        ))}

        {/* Étiquettes jours */}
        {JOURS.map((lbl, i) => (
          <text
            key={lbl}
            x={LEFT - 5} y={TOP + i * STEP + CELL - 4}
            fontSize={cellSize < 22 ? 8 : 10}
            fill="#777" textAnchor="end" fontWeight="500"
          >
            {/* Sur petit écran : première lettre seulement */}
            {cellSize < 22 ? lbl[0] : lbl}
          </text>
        ))}

        {/* Cases */}
        {weeks.map((week, wi) =>
          week.map((cell) => {
            if (!cell.inYear) return null;
            const x = weekX[wi];
            const y = TOP + week.indexOf(cell) * STEP;
            const bg = cellColor(cell.qty, maxVal);
            const fg = textColor(cell.qty, maxVal);
            return (
              <g
                key={cell.iso}
                style={{ cursor: cell.qty > 0 ? "pointer" : "default" }}
                onMouseEnter={(e) => showTooltip(e, cell)}
                onMouseLeave={hideTooltip}
                onTouchStart={(e) => toggleTooltip(e, cell)}
                onClick={() => { if (cell.qty > 0 && onDayClick) onDayClick(cell.iso); }}
              >
                <rect
                  x={x} y={y}
                  width={CELL} height={CELL}
                  rx={cellSize < 22 ? 3 : 4}
                  fill={bg}
                  stroke={cell.qty > 0 ? "rgba(0,0,0,.1)" : "#ddd"}
                  strokeWidth={0.8}
                />
                {/* Numéro du jour — masqué si cellule trop petite */}
                {CELL >= 22 && (
                  <text
                    x={x + CELL / 2} y={y + CELL / 2 + 4}
                    fontSize={9} fill={fg}
                    textAnchor="middle"
                    fontWeight={cell.qty > 0 ? "700" : "400"}
                    style={{ userSelect:"none", pointerEvents:"none" }}
                  >
                    {cell.day}
                  </text>
                )}
              </g>
            );
          })
        )}
      </svg>

      {/* Légende */}
      <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:10, fontSize:11, color:"#888" }}>
        <span>Moins</span>
        {["#f0f0f0","#c6efce","#9be9a8","#40c463","#30a14e","#1a7f37"].map(c => (
          <div key={c} style={{
            width:CELL, height:CELL, background:c, borderRadius:4, border:"1px solid #ddd",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:9, color: c === "#f0f0f0" ? "#bbb" : "#fff", fontWeight:700,
          }}>
            {c === "#f0f0f0" ? "0" : ""}
          </div>
        ))}
        <span>Plus</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:"fixed",
          left: Math.min(tooltip.screenX + CELL + 10, window.innerWidth - 180),
          top:  Math.max(tooltip.screenY - 10, 60),
          background:"#1a1a2e",
          color:"#fff",
          padding:"8px 14px",
          borderRadius:8,
          fontSize:12,
          pointerEvents:"none",
          zIndex:9999,
          whiteSpace:"nowrap",
          boxShadow:"0 4px 16px rgba(0,0,0,.4)",
        }}>
          <div style={{ fontWeight:700, marginBottom:3 }}>{formatDateFR(tooltip.iso)}</div>
          <div style={{ color: tooltip.qty > 0 ? "#9be9a8" : "#aaa" }}>
            {tooltip.qty > 0
              ? `${tooltip.qty.toLocaleString("fr-FR")} régimes récoltés`
              : "Aucune récolte"}
          </div>
        </div>
      )}
    </div>
  );
}
