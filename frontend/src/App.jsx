import { useEffect, useMemo, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:2032/api";

const defaultFuels = ["Diesel", "DieselPremium", "Gasolina95", "Gasolina98"];

function parseList(value) {
  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function App() {
  const [config, setConfig] = useState(null);
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState(2);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [fields, setFields] = useState("full");
  const [stationId, setStationId] = useState("");
  const [stationName, setStationName] = useState("");
  const [fuelSelection, setFuelSelection] = useState(defaultFuels);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    fetch(`${apiBase}/config`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data.config);
        setCity(data.config.city || "");
        setLatitude(data.config.latitude ?? "");
        setLongitude(data.config.longitude ?? "");
        setRadius(data.config.radiusKm);
        setPage(data.config.page);
        setLimit(data.config.limit);
        setFields(data.config.fields);
        setFuelSelection(data.config.selectedFuels.length ? data.config.selectedFuels : defaultFuels);
      })
      .catch((reason) => setError(`Config load failed: ${reason}`));
  }, []);

  const selectedFuels = useMemo(() => fuelSelection.join(","), [fuelSelection]);

  const fuelOptions = [
    "Diesel",
    "DieselPremium",
    "Gasolina95",
    "Gasolina98",
    "HVO",
    "Gasolina95_E5_Premium",
  ];

  function toggleFuel(fuel) {
    setFuelSelection((current) =>
      current.includes(fuel) ? current.filter((item) => item !== fuel) : [...current, fuel]
    );
  }

  async function loadPrices(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStations([]);
    setMeta(null);

    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (latitude) params.set("latitude", latitude);
    if (longitude) params.set("longitude", longitude);
    params.set("radius", String(radius));
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("fields", fields);
    if (stationId) params.set("stationId", stationId);
    if (stationName) params.set("stationName", stationName);
    params.set("fuels", selectedFuels);

    try {
      const response = await fetch(`${apiBase}/prices?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "API error");
      }
      setStations(data.stations);
      setMeta(data);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>GasPriceTracker</h1>
        <p>Configure location, radius, fuels and station filters, then fetch prices.</p>
      </header>

      <form className="config-form" onSubmit={loadPrices}>
        <section>
          <label>
            City
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City name" />
          </label>
          <label>
            Latitude
            <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="38.533722" />
          </label>
          <label>
            Longitude
            <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-0.172750" />
          </label>
        </section>

        <section>
          <label>
            Radius (km)
            <input type="number" value={radius} min="1" step="0.1" onChange={(e) => setRadius(e.target.value)} />
          </label>
          <label>
            Page
            <input type="number" value={page} min="1" onChange={(e) => setPage(e.target.value)} />
          </label>
          <label>
            Limit
            <input type="number" value={limit} min="1" onChange={(e) => setLimit(e.target.value)} />
          </label>
          <label>
            Fields
            <select value={fields} onChange={(e) => setFields(e.target.value)}>
              <option value="full">full</option>
              <option value="current">current</option>
              <option value="basic">basic</option>
            </select>
          </label>
        </section>

        <section>
          <label>
            Station ID
            <input value={stationId} onChange={(e) => setStationId(e.target.value)} />
          </label>
          <label>
            Station name or address
            <input value={stationName} onChange={(e) => setStationName(e.target.value)} />
          </label>
        </section>

        <fieldset>
          <legend>Select fuel types</legend>
          <div className="fuel-grid">
            {fuelOptions.map((fuel) => (
              <label key={fuel} className="fuel-checkbox">
                <input
                  type="checkbox"
                  checked={fuelSelection.includes(fuel)}
                  onChange={() => toggleFuel(fuel)}
                />
                {fuel}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Fetch prices"}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {meta && (
        <div className="status-card">
          <strong>Fetched at:</strong> {meta.fetchedAt}
          <br />
          <strong>Resolved:</strong> {meta.query.latitude}, {meta.query.longitude}
          <br />
          <strong>Stations returned:</strong> {stations.length}
        </div>
      )}

      <div className="stations">
        {stations.map((station) => (
          <article key={station.idEstacion} className="station-card">
            <h2>{station.nombreEstacion}</h2>
            <p>{station.direccion}</p>
            <p>
              <strong>Localidad:</strong> {station.localidad} · <strong>Provincia:</strong> {station.provincia}
            </p>
            <p>
              <strong>Last update:</strong> {station.lastUpdate}
            </p>
            <div className="prices">
              {Object.entries(station.selectedPrices).map(([fuel, price]) => (
                <div key={fuel} className="price-item">
                  <span>{fuel}</span>
                  <strong>{price ?? "N/A"}</strong>
                </div>
              ))}
            </div>
            {station.distancia !== null && <p>Distance: {station.distancia} km</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

export default App;
