# GasPriceTracker

A Docker web app to track local gas station fuel prices using the Precioil API. It includes:

- `api/` — Express backend that resolves city coordinates and returns filtered station prices.
- `frontend/` — Vite + React UI for configuring location, radius, station, and fuel filters.
- `docker-compose.yml` — runs the backend on port `2032` and the frontend on port `2033`.

## Setup

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set:
   - `API_KEY` with your Precioil API key
   - `CITY` or `LATITUDE` and `LONGITUDE`
   - `RADIUS_KM`, `PAGE`, `LIMIT`, `FIELDS`
   - optional fuel and station defaults

3. Build and run with Docker Compose:

   ```bash
   docker compose up --build
   ```

4. Open the frontend in your browser:

   - http://localhost:2033
   - Or from another machine on your local network:
     http://192.168.1.20:2033

If you access the UI from another machine, set `FRONTEND_API_BASE_URL` in `.env` to the API server host, for example:

```bash
FRONTEND_API_BASE_URL=http://192.168.1.20:2032/api
```

## API usage

The backend exposes:

- `GET /api/config` — returns resolved coordinates and active config
- `GET /api/prices` — returns station prices filtered by query params

Query parameters supported by `/api/prices`:

- `city`
- `latitude`, `longitude`
- `radius`
- `page`
- `limit`
- `fields`
- `fuels`
- `stationId`
- `stationName`

Example request:

```bash
curl "http://localhost:2032/api/prices?city=Finestrat&radius=2&fuels=Diesel,Gasolina95"
```

## Notes

- The app uses `.env` for configuration and optional city-to-coordinate resolution.
- No database is required for the initial implementation.
- The frontend is configured at build time with `FRONTEND_API_BASE_URL`.
