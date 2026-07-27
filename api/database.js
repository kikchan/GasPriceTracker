import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

const DB_PATH = process.env.DB_PATH || "../prices.db";

let sqliteDb = null;

function runSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function allSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export async function initDatabase() {
  const fullPath = path.resolve(process.cwd(), DB_PATH);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
    throw new Error(`Database path is a directory: ${fullPath}`);
  }

  fs.openSync(fullPath, "a");

  sqlite3.verbose();
  sqliteDb = new sqlite3.Database(fullPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
  await runSqlite(
    sqliteDb,
    `CREATE TABLE IF NOT EXISTS price_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id INTEGER NOT NULL,
      fuel TEXT NOT NULL,
      price REAL NOT NULL,
      timestamp TEXT NOT NULL,
      is_cached INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  const columns = await allSqlite(sqliteDb, `PRAGMA table_info(price_points)`, []);
  const hasIsCached = columns.some((column) => column.name === "is_cached");
  if (!hasIsCached) {
    await runSqlite(sqliteDb, `ALTER TABLE price_points ADD COLUMN is_cached INTEGER NOT NULL DEFAULT 0`);
  }
}

export async function savePricePoint(stationId, fuel, price, timestamp, isCached = false) {
  await runSqlite(
    sqliteDb,
    `INSERT INTO price_points (station_id, fuel, price, timestamp, is_cached) VALUES (?, ?, ?, ?, ?)`,
    [stationId, fuel, price, timestamp, isCached ? 1 : 0]
  );
}

export async function getPriceHistory(stationId, fuel, sinceTimestamp = null, aggregateByDay = false) {
  if (!aggregateByDay) {
    const params = [stationId, fuel];
    let sql = `SELECT timestamp, price, is_cached FROM price_points WHERE station_id = ? AND fuel = ?`;
    if (sinceTimestamp) {
      sql += ` AND timestamp >= ?`;
      params.push(sinceTimestamp);
    }
    sql += ` ORDER BY timestamp ASC`;

    return allSqlite(sqliteDb, sql, params).then((rows) =>
      rows.map((row) => ({
        timestamp: row.timestamp,
        price: Number(row.price),
        isCached: Boolean(row.is_cached),
      }))
    );
  }

  const params = [stationId, fuel];
  let dateFilter = "";
  if (sinceTimestamp) {
    dateFilter = "AND timestamp >= ?";
    params.push(sinceTimestamp);
  }

  const sql = `
    SELECT p.timestamp, p.price, p.is_cached
    FROM price_points p
    JOIN (
      SELECT date(timestamp) AS day, MAX(timestamp) AS latest_ts
      FROM price_points
      WHERE station_id = ? AND fuel = ? ${dateFilter}
      GROUP BY day
    ) q ON date(p.timestamp) = q.day AND p.timestamp = q.latest_ts
    WHERE p.station_id = ? AND p.fuel = ?
    ORDER BY p.timestamp ASC
  `;
  params.push(stationId, fuel);

  return allSqlite(sqliteDb, sql, params).then((rows) =>
    rows.map((row) => ({
      timestamp: row.timestamp,
      price: Number(row.price),
      isCached: Boolean(row.is_cached),
    }))
  );
}
