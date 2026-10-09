// QueueEase backend: Express + SQLite (file: queue.db)
const express = require("express");
const Database = require("better-sqlite3");

const ADMIN_USER = "admin", ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const db = new Database("queue.db");
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE, name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT NOT NULL,
  service TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Waiting',
  created_at TEXT DEFAULT (datetime('now','localtime')), served_at TEXT, completed_at TEXT)`);

const app = express();
app.use(express.json());

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function adminOnly(req, res, next) {
  if (req.get("x-admin-key") !== ADMIN_PASS) return res.status(401).json({ error: "Not authorised" });
  next();
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) return res.json({ key: ADMIN_PASS });
  res.status(401).json({ error: "Invalid username or password" });
});

// Public: live queue numbers
app.get("/api/queue", (_, res) => {
  const count = s => one("SELECT COUNT(*) c FROM tokens WHERE status=?", s).c;
  res.json({
    serving: one("SELECT token FROM tokens WHERE status='Serving'")?.token || "—",
    next: one("SELECT token FROM tokens WHERE status='Waiting' ORDER BY id LIMIT 1")?.token || "—",
    waiting: count("Waiting"), completed: count("Completed"),
    total: one("SELECT COUNT(*) c FROM tokens").c,
  });
});

// Public: book a token
app.post("/api/tokens", (req, res) => {
  const { name, mobile, email, service } = req.body;
  if (![name, mobile, email, service].every(v => typeof v === "string" && v.trim()))
    return res.status(400).json({ error: "Please fill all fields." });
  const { lastInsertRowid: id } = run(
    "INSERT INTO tokens (name,mobile,email,service) VALUES (?,?,?,?)",
    name.trim(), mobile.trim(), email.trim(), service);
  const token = "A" + (100 + Number(id));
  run("UPDATE tokens SET token=? WHERE id=?", token, id);
  const ahead = one("SELECT COUNT(*) c FROM tokens WHERE status='Waiting' AND id<?", id).c;
  res.json({ token, ahead, etaMinutes: ahead * 5 });
});

// Admin
app.get("/api/tokens", adminOnly, (_, res) =>
  res.json(all("SELECT token,name,service,status,strftime('%H:%M',created_at) time FROM tokens ORDER BY id DESC LIMIT 10")));

app.post("/api/serve", adminOnly, (_, res) => {   // finish current, call next
  run("UPDATE tokens SET status='Completed',completed_at=datetime('now','localtime') WHERE status='Serving'");
  const n = one("SELECT id FROM tokens WHERE status='Waiting' ORDER BY id LIMIT 1");
  if (n) run("UPDATE tokens SET status='Serving',served_at=datetime('now','localtime') WHERE id=?", n.id);
  res.json({ ok: !!n });
});

app.post("/api/complete", adminOnly, (_, res) => {
  run("UPDATE tokens SET status='Completed',completed_at=datetime('now','localtime') WHERE status='Serving'");
  res.json({ ok: true });
});

app.get("/api/stats", adminOnly, (_, res) => res.json({
  byService: all("SELECT service label, COUNT(*) value FROM tokens GROUP BY service ORDER BY value DESC"),
  byHour: all("SELECT strftime('%H',created_at) label, COUNT(*) value FROM tokens GROUP BY label ORDER BY label"),
  byStatus: all("SELECT status label, COUNT(*) value FROM tokens GROUP BY status"),
  avgServiceMin: one(`SELECT ROUND(AVG((julianday(completed_at)-julianday(served_at))*1440),1) m
                      FROM tokens WHERE completed_at IS NOT NULL AND served_at IS NOT NULL`).m || 0,
}));

app.post("/api/reset", adminOnly, (_, res) => {
  run("DELETE FROM tokens"); run("DELETE FROM sqlite_sequence WHERE name='tokens'");
  res.json({ ok: true });
});

app.listen(3000, () => console.log("QueueEase API → http://localhost:3000"));