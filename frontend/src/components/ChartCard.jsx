import { useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";

export default function ChartCard({
  title,
  subtitle,
  type,
  data,
  options,
  onClick,
  onChartReady,
  headerRight,
  plugins,
}) {

    // creation des references persistantes
    const canvasRef = useRef(null);         //Permet d'acceder a l'element canvas dans le DOM
    const chartRef = useRef(null);           //Sert a stocker le graphique

    useEffect(()=>{
        if (!canvasRef.current) return;

        chartRef.current?.destroy();
        chartRef.current = null;

        try {
            chartRef.current = new Chart(canvasRef.current, {
                type, data, options,
                plugins: plugins || [],
            });
            if (onChartReady) onChartReady(chartRef.current);
        } catch (e) {
            console.error("ChartCard: erreur Chart.js", e);
        }

        return () => {
            if (onChartReady) onChartReady(null);
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    },[type,data,options,onChartReady]);

    return (

            <div
                className={`chart-card ${onClick ? "clickable" : ""}`}
                onClick={onClick}
                role={onClick  ? "button" : undefined}
                tabIndex={onClick  ? 0 : undefined}
                onKeyDown={(e) => {
                    if (!onClick) return;
                    if (e.key === "Enter" || e.key === " ") onClick();
                }}
            
            >
                <div className="chart-card-head">
                  <div>
                    <h3>{title}</h3>
                    {subtitle && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888", fontStyle: "italic", fontWeight: 500 }}>
                        {subtitle}
                      </p>
                    )}
                  </div>
                  {headerRight && (
                    <div
                      className="chart-card-head-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      {headerRight}
                    </div>
                  )}
                </div>
                <div className="chart-canvas-wrapper">
                  <canvas ref={canvasRef} />
                </div>
            </div>
        );



}
