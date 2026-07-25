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
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  sqlite3.verbose();
  sqliteDb = new sqlite3.Database(fullPath);
  await runSqlite(
    sqliteDb,
    `CREATE TABLE IF NOT EXISTS price_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id INTEGER NOT NULL,
      fuel TEXT NOT NULL,
      price REAL NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
}

export async function savePricePoint(stationId, fuel, price, timestamp) {
  await runSqlite(
    sqliteDb,
    `INSERT INTO price_points (station_id, fuel, price, timestamp) VALUES (?, ?, ?, ?)`,
    [stationId, fuel, price, timestamp]
  );
}

export async function getPriceHistory(stationId, fuel, sinceTimestamp = null) {
  const params = [stationId, fuel];
  let sql = `SELECT timestamp, price FROM price_points WHERE station_id = ? AND fuel = ?`;
  if (sinceTimestamp) {
    sql += ` AND timestamp >= ?`;
    params.push(sinceTimestamp);
  }
  sql += ` ORDER BY timestamp ASC`;

  return allSqlite(sqliteDb, sql, params).then((rows) => rows.map((row) => ({ timestamp: row.timestamp, price: Number(row.price) })));
}
