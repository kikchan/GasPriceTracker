import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDatabase, savePricePoint, getPriceHistory } from "./database.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = parseInt(process.env.PORT, 10) || 2032;

const defaultConfig = {
  apiKey: process.env.API_KEY || "",
  city: process.env.CITY || "",
  latitude: parseNumber(process.env.LATITUDE),
  longitude: parseNumber(process.env.LONGITUDE),
  radiusKm: parseNumber(process.env.RADIUS_KM, 2),
  page: parseInt(process.env.PAGE, 10) || 1,
  limit: parseInt(process.env.LIMIT, 10) || 50,
  fields: process.env.FIELDS || "full",
  selectedFuels: parseList(process.env.SELECTED_FUELS, ["Diesel", "Gasolina95"]),
  selectedStationId: parseInt(process.env.SELECTED_STATION_ID, 10) || null,
  selectedStationName: process.env.SELECTED_STATION_NAME || "",
};

const widgetStationIds = [13032, 3697, 12061];
const stationFuelMap = {
  12061: ["Diesel", "Gasolina98"],
  13032: ["Diesel", "Gasolina95"],
  3697: ["Diesel", "Gasolina98"],
};
const stationInfoMap = {
  12061: {
    name: "Repsol Leroy",
    address: "AVENIDA PICASSO, 3",
  },
  13032: {
    name: "PETROPRIX",
    address: "AVENIDA PICASSO, 41",
  },
  3697: {
    name: "Repsol Corpore",
    address: "AVENIDA FEDERICO GARCIA LORCA, 21",
  },
};

let geoCache = null;

const PRECIOIL_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const precioilCache = new Map();

function parseNumber(value, fallback = null) {
  if (!value) return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function parseList(value, defaultValue = []) {
  if (!value || typeof value !== "string") return defaultValue;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLatLon(query) {
  const lat = parseNumber(query.latitude ?? query.lat ?? query.latitud ?? query.lat, null);
  const lon = parseNumber(query.longitude ?? query.lon ?? query.lng ?? query.longitud ?? query.long, null);
  return { latitude: lat, longitude: lon };
}

async function resolveCoordinates(config) {
  if (config.latitude !== null && config.longitude !== null) {
    return { latitude: config.latitude, longitude: config.longitude };
  }

  if (config.city) {
    if (geoCache?.city === config.city) {
      return geoCache.coords;
    }

    const q = encodeURIComponent(config.city);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "GasPriceTracker/1.0 (+https://github.com)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Geocode request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Unable to resolve coordinates for city '${config.city}'.`);
    }

    const coords = {
      latitude: parseNumber(data[0].lat, null),
      longitude: parseNumber(data[0].lon, null),
    };
    if (coords.latitude === null || coords.longitude === null) {
      throw new Error(`Geocode response did not contain valid coordinates for '${config.city}'.`);
    }

    geoCache = { city: config.city, coords };
    return coords;
  }

  throw new Error("Missing latitude/longitude or CITY configuration.");
}

function buildPrecioilUrl({ latitude, longitude, radiusKm, page, limit, fields }) {
  const url = new URL("https://api.precioil.es/estaciones/radio");
  url.searchParams.set("latitud", String(latitude));
  url.searchParams.set("longitud", String(longitude));
  url.searchParams.set("radio", String(radiusKm));
  url.searchParams.set("pagina", String(page));
  url.searchParams.set("limite", String(limit));
  url.searchParams.set("fields", fields);
  return url.toString();
}

async function fetchPrecioil(apiUrl) {
  const now = Date.now();
  const cacheEntry = precioilCache.get(apiUrl);

  // Return fresh cache if available
  if (cacheEntry && now - cacheEntry.fetchedAt < PRECIOIL_CACHE_TTL) {
    return { payload: cacheEntry.payload, cached: true };
  }

  const headers = { Accept: "application/json" };
  if (defaultConfig.apiKey) {
    headers["X-API-Key"] = defaultConfig.apiKey;
  }

  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Precioil API returned ${response.status}: ${body}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Precioil API responded with an unexpected payload.");
    }

    // Cache successful response
    precioilCache.set(apiUrl, { fetchedAt: Date.now(), payload });
    return { payload, cached: false };
  } catch (err) {
    // On error return cached payload if present
    if (cacheEntry && cacheEntry.payload) {
      console.warn("Precioil API fetch failed; returning cached payload:", err.message);
      return { payload: cacheEntry.payload, cached: true };
    }
    throw err;
  }
}

async function recordPriceHistory(stations, isCached = false) {
  const timestamp = new Date().toISOString();
  const savePoints = [];

  widgetStationIds.forEach((stationId) => {
    const station = stations.find((item) => item.idEstacion === stationId);
    if (!station) return;

    const fuels = stationFuelMap[stationId] || ["Diesel"];
    fuels.forEach((fuel) => {
      const price = formatFuelPrice(station[fuel]);
      if (price === null) return;
      savePoints.push(savePricePoint(stationId, fuel, Number(price), timestamp, isCached));
    });
  });

  await Promise.all(savePoints);
}

function normalizeStationName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function filterStations(stations, filters) {
  return stations
    .filter((station) => {
      if (filters.stationId && station.idEstacion !== filters.stationId) return false;
      if (filters.stationName) {
        const name = normalizeStationName(station.nombreEstacion || station.nombre || "");
        const address = normalizeStationName(station.direccion || "");
        return name.includes(filters.stationName) || address.includes(filters.stationName);
      }
      return true;
    })
    .map((station) => {
      const selectedPrices = {};
      filters.selectedFuels.forEach((fuel) => {
        if (Object.prototype.hasOwnProperty.call(station, fuel)) {
          selectedPrices[fuel] = station[fuel];
        }
      });

      return {
        idEstacion: station.idEstacion,
        nombreEstacion: station.nombreEstacion || station.nombre || "",
        direccion: station.direccion || "",
        lastUpdate: station.lastUpdate || station.fechaCambio || "",
        marca: station.marca || "",
        localidad: station.localidad || station.nombreMunicipio || "",
        provincia: station.provincia || station.provinciaDistrito || "",
        distancia: station.distancia ?? null,
        selectedPrices,
        raw: station,
      };
    });
}

function formatStationUpdateLabel(baseName, rawLastUpdate) {
  const date = rawLastUpdate ? new Date(rawLastUpdate) : null;
  const timeString = date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  if (date && !Number.isNaN(date.getTime())) {
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (sameDay) {
      return `${baseName} (today at ${timeString})`;
    }

    const dateString = date.toISOString().slice(0, 10);
    return `${baseName} (${dateString} ${timeString})`;
  }

  return `${baseName} (${rawLastUpdate || "unknown"})`;
}

function formatFuelPrice(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return null;
  }

  return Number(value).toFixed(3);
}

function buildStationWidgetItems(stations) {
  const stationById = stations.reduce((map, station) => {
    map[station.idEstacion] = station;
    return map;
  }, {});

  // Helper to get parsed date (ms) for a station
  const getStationDate = (station) => {
    if (!station) return null;
    const raw = station.lastUpdate || station.fechaCambio || null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };

  // Order of fuels and which stations' prices to show per fuel
  const fuelOrder = ["Diesel", "Gasolina95", "Gasolina98"];

  const items = [];

  // push the station groups in the requested order
  const stationGroups = [
    { stationId: 13032, fuel: "Diesel" },
    { stationId: 13032, fuel: "Gasolina95" },
    { stationId: 3697, fuel: "Diesel" },
    { stationId: 3697, fuel: "Gasolina98" },
    { stationId: 12061, fuel: "Diesel" },
    { stationId: 12061, fuel: "Gasolina98" },
  ];

  stationGroups.forEach(({ stationId, fuel }, index) => {
    const st = stationById[stationId];
    const info = stationInfoMap[stationId] || {};
    const stationName = info.name || (st ? st.nombreEstacion || st.nombre : `Station ${stationId}`);
    const price = formatFuelPrice(st && st[fuel]);

    if (index === 0 || stationGroups[index - 1].stationId !== stationId) {
      const lastUpdate = st ? st.lastUpdate || st.fechaCambio || "unknown" : "unknown";
      const updateLabel = formatStationUpdateLabel(stationName, lastUpdate);
      items.push({ name: stationName, label: updateLabel });
    }

    items.push({ name: fuel, label: price !== null ? `${price} €` : "N/A" });
  });

  return items;
}

function findCheapestStation(stations, selectedFuels) {
  const candidates = stations
    .filter((station) =>
      selectedFuels.every(
        (fuel) => Number.isFinite(station[fuel]) && station[fuel] !== null
      )
    )
    .map((station) => {
      const prices = selectedFuels.reduce((acc, fuel) => {
        acc[fuel] = station[fuel];
        return acc;
      }, {});
      const totalPrice = selectedFuels.reduce((sum, fuel) => sum + Number(station[fuel]), 0);
      return {
        station,
        prices,
        totalPrice,
      };
    })
    .sort((a, b) => a.totalPrice - b.totalPrice);

  return candidates.length > 0 ? candidates[0] : null;
}

app.get("/api/config", async (req, res) => {
  try {
    const coords = await resolveCoordinates(defaultConfig);
    return res.json({
      config: {
        ...defaultConfig,
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/healthcheck", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/prices", async (req, res) => {
  try {
    const query = req.query;
    const queryCoords = normalizeLatLon(query);
    const config = {
      apiKey: defaultConfig.apiKey,
      city: query.city || defaultConfig.city,
      latitude: queryCoords.latitude !== null ? queryCoords.latitude : defaultConfig.latitude,
      longitude: queryCoords.longitude !== null ? queryCoords.longitude : defaultConfig.longitude,
      radiusKm: parseNumber(query.radius ?? query.radiusKm, defaultConfig.radiusKm),
      page: parseInt(query.page, 10) || defaultConfig.page,
      limit: parseInt(query.limit, 10) || defaultConfig.limit,
      fields: query.fields || defaultConfig.fields,
      selectedFuels: parseList(query.fuels || query.selectedFuels, defaultConfig.selectedFuels),
      stationId: parseInt(query.stationId, 10) || null,
      stationName: normalizeStationName(query.stationName || query.station || defaultConfig.selectedStationName),
    };

    const coords = await resolveCoordinates(config);
    const precioilUrl = buildPrecioilUrl({
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusKm: config.radiusKm,
      page: config.page,
      limit: config.limit,
      fields: config.fields,
    });

    const { payload: stations } = await fetchPrecioil(precioilUrl);
    const filteredStations = filterStations(stations, config);

    return res.json({
      fetchedAt: new Date().toISOString(),
      query: {
        city: config.city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        radiusKm: config.radiusKm,
        page: config.page,
        limit: config.limit,
        fields: config.fields,
        selectedFuels: config.selectedFuels,
        stationId: config.stationId,
        stationName: config.stationName,
      },
      stations: filteredStations,
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.get("/api/cheapest", async (req, res) => {
  try {
    const query = req.query;
    const queryCoords = normalizeLatLon(query);
    const selectedFuels = parseList(query.fuels || query.selectedFuels, ["Diesel", "Gasolina98"]);
    const config = {
      apiKey: defaultConfig.apiKey,
      city: query.city || defaultConfig.city,
      latitude: queryCoords.latitude !== null ? queryCoords.latitude : defaultConfig.latitude,
      longitude: queryCoords.longitude !== null ? queryCoords.longitude : defaultConfig.longitude,
      radiusKm: parseNumber(query.radius ?? query.radiusKm, defaultConfig.radiusKm),
      page: parseInt(query.page, 10) || defaultConfig.page,
      limit: parseInt(query.limit, 10) || defaultConfig.limit,
      fields: query.fields || defaultConfig.fields,
    };

    const coords = await resolveCoordinates(config);
    const precioilUrl = buildPrecioilUrl({
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusKm: config.radiusKm,
      page: config.page,
      limit: config.limit,
      fields: config.fields,
    });

    const { payload: stations } = await fetchPrecioil(precioilUrl);
    const cheapest = findCheapestStation(stations, selectedFuels);
    if (!cheapest) {
      return res.status(404).json({ error: "No station found with all requested fuels." });
    }

    const station = cheapest.station;
    const response = {
      fetchedAt: new Date().toISOString(),
      query: {
        city: config.city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        radiusKm: config.radiusKm,
        page: config.page,
        limit: config.limit,
        fields: config.fields,
        selectedFuels,
      },
      station: {
        idEstacion: station.idEstacion,
        nombreEstacion: station.nombreEstacion || station.nombre || "",
        direccion: station.direccion || "",
        lastUpdate: station.lastUpdate || station.fechaCambio || "",
        marca: station.marca || "",
        localidad: station.localidad || station.nombreMunicipio || "",
        provincia: station.provincia || station.provinciaDistrito || "",
        distancia: station.distancia ?? null,
        prices: cheapest.prices,
        totalPrice: cheapest.totalPrice,
        label: `${station.nombreEstacion || station.nombre || ""} — Diesel ${cheapest.prices.Diesel} / Gasolina98 ${cheapest.prices.Gasolina98}`,
      },
      items: [
        {
          station: station.nombreEstacion || station.nombre || "",
          address: station.direccion || "",
          diesel: cheapest.prices.Diesel,
          gasolina98: cheapest.prices.Gasolina98,
          totalPrice: cheapest.totalPrice,
          lastUpdate: station.lastUpdate || station.fechaCambio || "",
          label: `${station.nombreEstacion || station.nombre || ""} — Diesel ${cheapest.prices.Diesel} / Gasolina98 ${cheapest.prices.Gasolina98}`,
        },
      ],
    };

    return res.json(response);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.get("/api/station-widget", async (req, res) => {
  try {
    const query = req.query;
    const queryCoords = normalizeLatLon(query);
    const config = {
      apiKey: defaultConfig.apiKey,
      city: query.city || defaultConfig.city,
      latitude: queryCoords.latitude !== null ? queryCoords.latitude : defaultConfig.latitude,
      longitude: queryCoords.longitude !== null ? queryCoords.longitude : defaultConfig.longitude,
      radiusKm: parseNumber(query.radius ?? query.radiusKm, defaultConfig.radiusKm),
      page: parseInt(query.page, 10) || defaultConfig.page,
      limit: parseInt(query.limit, 10) || defaultConfig.limit,
      fields: query.fields || defaultConfig.fields,
    };

    const coords = await resolveCoordinates(config);
    const precioilUrl = buildPrecioilUrl({
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusKm: config.radiusKm,
      page: config.page,
      limit: config.limit,
      fields: config.fields,
    });

    const { payload: stations, cached } = await fetchPrecioil(precioilUrl);
    await recordPriceHistory(stations, cached);
    const items = buildStationWidgetItems(stations);

    return res.json({
      fetchedAt: new Date().toISOString(),
      query: {
        city: config.city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        radiusKm: config.radiusKm,
        page: config.page,
        limit: config.limit,
        fields: config.fields,
      },
      cached,
      items,
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

await initDatabase();

app.get("/api/graph-data", async (req, res) => {
  try {
    const period = (req.query.period || "1w").toLowerCase();
    const now = new Date();
    const periods = {
      "1d": 1,
      "1w": 7,
      "1m": 30,
      "3m": 90,
      "6m": 180,
      "1y": 365,
    };
    const days = periods[period] ?? null;
    const sinceTimestamp = days
      ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const graphData = await Promise.all(
      widgetStationIds.map(async (stationId) => {
        const info = stationInfoMap[stationId] || {};
        const fuels = stationFuelMap[stationId] || ["Diesel"];
        const series = await Promise.all(
          fuels.map(async (fuel) => ({
            fuel,
            points: await getPriceHistory(stationId, fuel, sinceTimestamp, period === "1w"),
          }))
        );
        return {
          stationId,
          stationName: info.name || `Station ${stationId}`,
          series,
        };
      })
    );

    return res.json({
      fetchedAt: new Date().toISOString(),
      period: period === "all" ? "all" : period,
      graphData,
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

await initDatabase();

app.listen(port, () => {
  console.log(`GasPriceTracker API listening on port ${port}`);
});
