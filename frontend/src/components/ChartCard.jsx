import { useEffect, useRef } from "react";
import { Chart } from "chart.js/auto";

export default function ChartCard({
  title,
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
        if (!canvasRef.current) return;     //On arrete tout si canvasRef n'existe pas

        if (chartRef.current){                  //On detruit le graphique existant
            chartRef.current.destroy();          //pour ne pas avoir de superposition de graphique
        }

        // creation d'un nouveau graphique

        chartRef.current = new Chart(canvasRef.current,{
            type, data, options,
            plugins: plugins || [],
        });

        if (onChartReady) onChartReady(chartRef.current);

        return () => {
            if (onChartReady) onChartReady(null);
            chartRef.current?.destroy();
        }
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
                  <h3>{title}</h3>
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
                <canvas ref={canvasRef} />
            </div>
        );



}
