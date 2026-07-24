# GasPriceTracker

A Docker web app to track local gas station fuel prices using the Precioil API. It includes:

- `api/` — Express backend that resolves city coordinates and returns filtered station prices.
- `docker-compose.yml` — runs the backend on port `2032`.

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

4. Open the API in your browser or call it directly:

   - http://localhost:2032/api/config
   - Or from another machine on your local network:
     http://192.168.1.20:2032/api/config

If you access the API from another machine, use the server host and port 2032.

## API usage

The backend exposes:

- `GET /api/config` — returns resolved coordinates and active config
- `GET /api/prices` — returns station prices filtered by query params
- `GET /api/cheapest` — returns the cheapest station selling both Diesel and Gasolina98
- `GET /api/station-widget` — returns a Homepage custom API payload for the three configured stations

Query parameters supported by `/api/prices` and `/api/cheapest`:

- `city`
- `latitude`, `longitude`
- `radius`
- `page`
- `limit`
- `fields`
- `fuels`

Additional `/api/prices` parameters:

- `stationId`
- `stationName`

Example request:

```bash
curl "http://localhost:2032/api/station-widget?city=Finestrat&radius=2"
```

The `/api/station-widget` endpoint returns flat fields formatted for Homepage's `customapi` widget, with one update label and fuel price fields for each station.

Response keys:
- `currency` — always `EUR`
- `petroprix` — `PETROPRIX` update label
- `petroprixDiesel` — Diesel price for PETROPRIX
- `petroprixGasolina95` — Gasolina95 price for PETROPRIX
- `repsol1` — `Repsol 1` update label
- `repsol1Diesel` — Diesel price for Repsol 1
- `repsol1Gasolina98` — Gasolina98 price for Repsol 1
- `repsol2` — `Repsol 2` update label
- `repsol2Diesel` — Diesel price for Repsol 2
- `repsol2Gasolina98` — Gasolina98 price for Repsol 2

For today’s update timestamps, the label will show `today at HH:MM` instead of a full timestamp.

Example mapping for the widget:

```yaml
mappings:
  - field: petroprix
    label: PETROPRIX update
    format: text
  - field: petroprixDiesel
    label: PETROPRIX Diesel
    format: number
  - field: petroprixGasolina95
    label: PETROPRIX Gasolina95
    format: number
  - field: repsol1
    label: Repsol 1 update
    format: text
  - field: repsol1Diesel
    label: Repsol 1 Diesel
    format: number
  - field: repsol1Gasolina98
    label: Repsol 1 Gasolina98
    format: number
  - field: repsol2
    label: Repsol 2 update
    format: text
  - field: repsol2Diesel
    label: Repsol 2 Diesel
    format: number
  - field: repsol2Gasolina98
    label: Repsol 2 Gasolina98
    format: number
```

## Notes

- The app uses `.env` for configuration and optional city-to-coordinate resolution.
- No database is required for the initial implementation.
