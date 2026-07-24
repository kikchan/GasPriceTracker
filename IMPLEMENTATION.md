# GasPriceTracker Implementation Notes

## Overview

GasPriceTracker is a Dockerized two-service web app:

- `api/`: Node.js + Express backend that fetches nearby gas station data from the Precioil API.
- `frontend/`: Vite + React frontend that lets users configure city, coordinates, radius, station filters, and fuel types.
- `docker-compose.yml`: runs the backend on port `2032` and the frontend on port `2033`.

## Configuration

The implementation uses a root `.env` file to store runtime configuration. This avoids a database dependency and keeps the app lightweight.

Supported environment variables:

- `API_KEY`: Precioil API key. Uses `X-API-Key` when provided.
- `CITY`: a city name to resolve to coordinates via OpenStreetMap Nominatim.
- `LATITUDE` / `LONGITUDE`: direct coordinates override city resolution.
- `RADIUS_KM`: search radius in kilometers.
- `PAGE`: pagination page number.
- `LIMIT`: maximum stations to request.
- `FIELDS`: Precioil `fields` query parameter, e.g. `full`, `current`, `basic`.
- `SELECTED_FUELS`: comma-separated default fuel types.
- `SELECTED_STATION_ID`: optional default station ID filter.
- `SELECTED_STATION_NAME`: optional default station name filter.
- `FRONTEND_API_BASE_URL`: build-time API URL used by the frontend.

## Backend behavior

- Requests `/api/config` to expose the active configuration values and resolved coordinates.
- Requests `/api/prices` to fetch station data from Precioil and return only the selected fuel prices plus `lastUpdate`.
- Accepts query parameters to override `.env` values from the frontend.
- Resolves city names to lat/lon using OpenStreetMap when coordinates are not supplied.
- Filters by station ID or name and selected fuels.

## Frontend behavior

- Loads backend configuration from `/api/config`.
- Displays a form for:
  - city or coordinates
  - radius
  - station ID / station name
  - fuel type selection
  - limit and fields
- Displays station list results with the selected fuel prices and last price check.

## Notes

- This implementation does not use MySQL or YAML storage. It is configured by `.env` and the frontend.
- The backend allows any origin via CORS so the UI can request the API across host ports.
- The chosen design keeps the app simple and portable in Docker.

## Future improvements

- Add local caching of the lastPrecioil response.
- Store user settings or price history in MySQL or a YAML file.
- Add favorites, alerts, and station metadata.
