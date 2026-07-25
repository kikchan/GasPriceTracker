import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend);

const stations = [
  { id: 13032, name: "PETROPRIX" },
  { id: 3697, name: "Repsol Corpore" },
  { id: 12061, name: "Repsol Leroy" },
];

const fuelLabels = {
  Diesel: "Diesel",
  Gasolina95: "Gasolina95",
  Gasolina98: "Gasolina98",
};

const scaleOptions = [
  { value: "1d", label: "1 Day" },
  { value: "1w", label: "1 Week" },
  { value: "1m", label: "1 Month" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All" },
];

const stationFuels = {
  13032: ["Diesel", "Gasolina95"],
  3697: ["Diesel", "Gasolina98"],
  12061: ["Diesel", "Gasolina98"],
};

const colors = {
  Diesel: "#38bdf8",
  Gasolina95: "#fbbf24",
  Gasolina98: "#f472b6",
};

function buildDataset(series) {
  return series.map((seriesItem) => ({
    label: fuelLabels[seriesItem.fuel] || seriesItem.fuel,
    data: seriesItem.points.map((item) => ({ x: item.timestamp, y: item.price })),
    borderColor: colors[seriesItem.fuel] || "#60a5fa",
    backgroundColor: colors[seriesItem.fuel] || "#60a5fa",
    tension: 0.2,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
  }));
}

const apiBaseUrl = "/api";

export default function App() {
  const [selectedPeriod, setSelectedPeriod] = useState("1w");
  const [graphData, setGraphData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadGraphData() {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${apiBaseUrl}/graph-data`, {
          params: { period: selectedPeriod },
        });
        setGraphData(response.data.graphData);
      } catch (err) {
        setError(err.message || "Unable to load graph data");
      } finally {
        setLoading(false);
      }
    }

    loadGraphData();
  }, [selectedPeriod]);

  const chartCards = useMemo(() => {
    return stations.map((station) => {
      const stationData = graphData.find((item) => item.stationId === station.id);
      const datasets = stationData ? buildDataset(stationData.series) : [];
      return {
        station,
        datasets,
      };
    });
  }, [graphData]);

  const yRange = useMemo(() => {
    const allPrices = chartCards.flatMap(({ datasets }) => datasets.flatMap((dataset) => dataset.data.map((point) => point.y)));
    if (allPrices.length === 0) return null;
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const padding = Math.max((max - min) * 0.1, 0.05);
    return { min: Math.max(0, min - padding), max: max + padding };
  }, [chartCards]);

  return (
    <div className="app-shell">
      <div className="header">
        <div>
          <h1 className="title">Gas Price Tracker</h1>
          <p>Station price history by fuel, with timestamps and period selector.</p>
        </div>
        <div className="controls">
          <select className="select" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
            {scaleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="loading">Loading graph data…</div>}
      {error && <div className="error">{error}</div>}

      <div className="cards">
        {chartCards.map(({ station, datasets }) => (
          <div key={station.id} className="card">
            <h2 className="card-title">{station.name}</h2>
            <div className="chart-wrapper">
              {datasets.length > 0 ? (
                <Line
                  data={{ datasets }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      x: {
                        type: "time",
                        time: { unit: "day", tooltipFormat: "PPpp" },
                        title: { display: true, text: "Timestamp" },
                        ticks: { color: "#cbd5e1" },
                      },
                      y: {
                        title: { display: true, text: "Price (€)" },
                        ticks: { color: "#cbd5e1" },
                        min: yRange?.min,
                        max: yRange?.max,
                      },
                    },
                    plugins: {
                      legend: { labels: { color: "#cbd5e1" } },
                      tooltip: { mode: "nearest", intersect: false },
                    },
                  }}
                />
              ) : (
                <div className="chart-empty">No price history available yet.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
