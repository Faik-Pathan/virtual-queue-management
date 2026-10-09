/* QueueEase frontend — talks to the SQLite API in server.js */
let adminKey = sessionStorage.getItem("qeKey") || "";
const $ = id => document.getElementById(id);
const setText = (id, v) => { const e = $(id); if (e && e.textContent != v) { e.textContent = v; e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump"); } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method, headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
    body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2500);
}

/* ---------- live data ---------- */
async function updateAllViews() {
  try {
    const q = await api("/queue");
    const map = { Serving: q.serving, Next: q.next, Waiting: q.waiting, Completed: q.completed };
    for (const [k, v] of Object.entries(map)) { setText("hero" + k, v); setText("status" + k, v); }
    setText("adminTotal", q.total); setText("adminServing", q.serving);
    setText("adminWaiting", q.waiting); setText("adminCompleted", q.completed); setText("counterToken", q.serving);
    drawDonut(q);
    if (adminKey && !$("adminView").classList.contains("hidden")) { renderAdminTable(); loadCharts(); }
  } catch { /* server offline: keep last values */ }
}

/* ---------- booking ---------- */
async function generateToken(e) {
  e.preventDefault();
  try {
    const r = await api("/tokens", "POST", {
      name: $("name").value, mobile: $("mobile").value, email: $("email").value, service: $("service").value });
    setText("generatedToken", r.token);
    $("generatedName").textContent = "Hello, " + $("name").value.trim() + "!";
    let eta = $("etaBadge");
    if (!eta) { eta = document.createElement("div"); eta.id = "etaBadge"; eta.className = "eta"; $("tokenResult").append(eta); }
    eta.textContent = r.ahead + " ahead of you · about " + r.etaMinutes + " min wait";
    $("tokenResult").classList.remove("hidden");
    $("tokenResult").scrollIntoView({ behavior: "smooth", block: "center" });
    $("tokenForm").reset(); updateAllViews();
  } catch (err) { toast(err.message); }
}

/* ---------- admin ---------- */
async function renderAdminTable() {
  const rows = await api("/tokens");
  $("bookingTable").innerHTML = rows.length ? rows.map(b => `<tr>
    <td><strong>${esc(b.token)}</strong></td><td>${esc(b.name)}</td><td>${esc(b.service)}</td>
    <td>${esc(b.time)}</td><td><span class="status-badge" data-s="${esc(b.status)}">${esc(b.status)}</span></td></tr>`).join("")
    : `<tr><td colspan="5">No bookings yet</td></tr>`;
}
async function serveNext() { const r = await api("/serve", "POST"); toast(r.ok ? "Next token called" : "No waiting tokens"); updateAllViews(); }
async function completeToken() { await api("/complete", "POST"); toast("Token completed"); updateAllViews(); }
function refreshAdmin() { updateAllViews(); toast("Dashboard refreshed"); }
function showReports() { scrollToAdmin("analytics"); }
async function resetDemo() {
  if (!confirm("Delete ALL tokens from the database?")) return;
  await api("/reset", "POST"); toast("Database cleared"); updateAllViews();
}

const PUBLIC = ["#home", "#features", "#workflow", "#booking", "#queue", ".team-section", "footer", ".navbar"];
const showPublic = on => PUBLIC.forEach(s => document.querySelector(s).classList.toggle("hidden", !on));
function openAdminLogin() { $("loginModal").classList.remove("hidden"); }
function closeAdminLogin() { $("loginModal").classList.add("hidden"); }
async function adminLogin(e) {
  e.preventDefault();
  try {
    const r = await api("/login", "POST", { username: $("adminUsername").value, password: $("adminPassword").value });
    adminKey = r.key; sessionStorage.setItem("qeKey", adminKey);
    closeAdminLogin(); showPublic(false); $("adminView").classList.remove("hidden");
    injectAnalytics(); updateAllViews(); window.scrollTo({ top: 0 });
  } catch (err) { toast(err.message); }
}
function backToWebsite() { adminKey = ""; sessionStorage.removeItem("qeKey"); $("adminView").classList.add("hidden"); showPublic(true); window.scrollTo({ top: 0 }); }
function scrollToAdmin(id) { $(id)?.scrollIntoView({ behavior: "smooth" }); }

/* ---------- visuals (pure canvas, no libraries) ---------- */
const COLORS = ["#0b5ed7", "#3d8bff", "#7fb2ff", "#198754", "#f59f00", "#dc3545"];
function setup(canvas) {
  const r = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * r; canvas.height = h * r;
  const c = canvas.getContext("2d"); c.scale(r, r); c.clearRect(0, 0, w, h); c.font = "11px Arial";
  return { c, w, h };
}
function drawBars(id, data, horizontal) {
  const cv = $(id); if (!cv) return;
  const { c, w, h } = setup(cv), max = Math.max(1, ...data.map(d => d.value));
  if (!data.length) { c.fillStyle = "#8996a8"; c.fillText("No data yet", 10, 20); return; }
  const n = data.length, gap = 8;
  data.forEach((d, i) => {
    c.fillStyle = COLORS[i % COLORS.length];
    if (horizontal) {
      const bh = (h - gap * n) / n, y = i * (bh + gap), bw = (w - 110) * d.value / max;
      c.fillRect(100, y, bw, bh); c.fillStyle = "#425466";
      c.fillText(d.label.replace(" Section", ""), 0, y + bh / 2 + 4); c.fillText(d.value, 106 + bw, y + bh / 2 + 4);
    } else {
      const bw = (w - gap * n) / n, bh = (h - 30) * d.value / max, x = i * (bw + gap);
      c.fillRect(x, h - 20 - bh, bw, bh); c.fillStyle = "#425466";
      c.fillText(d.label + "h", x + bw / 2 - 8, h - 6); c.fillText(d.value, x + bw / 2 - 4, h - 24 - bh);
    }
  });
}
function drawDonutOn(id, parts) {
  const cv = $(id); if (!cv) return;
  const { c, w, h } = setup(cv), total = parts.reduce((s, p) => s + p.value, 0), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 12;
  if (!total) { c.fillStyle = "#8996a8"; c.textAlign = "center"; c.fillText("No tokens yet", cx, cy); return; }
  let a = -Math.PI / 2;
  parts.forEach(p => {
    const s = p.value / total * Math.PI * 2;
    c.beginPath(); c.arc(cx, cy, R, a, a + s); c.arc(cx, cy, R * .62, a + s, a, true); c.fillStyle = p.color; c.fill(); a += s;
  });
  c.fillStyle = "#09264d"; c.font = "bold 26px Arial"; c.textAlign = "center"; c.fillText(total, cx, cy + 4);
  c.font = "11px Arial"; c.fillStyle = "#718096"; c.fillText("tokens", cx, cy + 20);
}
function drawDonut(q) {
  if (!$("queueDonut")) {
    const box = document.createElement("div"); box.className = "donut-wrap";
    box.innerHTML = '<canvas id="queueDonut"></canvas><p style="text-align:center;font-size:12px;color:#718096">Blue: waiting · Green: completed · Amber: serving</p>';
    document.querySelector("#queue").append(box);
  }
  drawDonutOn("queueDonut", [
    { value: q.waiting, color: "#0b5ed7" }, { value: q.completed, color: "#198754" },
    { value: q.serving === "—" ? 0 : 1, color: "#f59f00" }]);
}
function injectAnalytics() {
  if ($("analytics")) return;
  const card = document.createElement("div"); card.id = "analytics"; card.className = "admin-card";
  card.innerHTML = `<div class="admin-card-header"><div><span>ANALYTICS</span><h2>Queue Insights</h2></div>
    <b id="avgTime" class="status-badge"></b></div><div class="charts">
    <div class="chart-box"><h4>Tokens by service</h4><canvas id="chService"></canvas></div>
    <div class="chart-box"><h4>Tokens by hour</h4><canvas id="chHour"></canvas></div>
    <div class="chart-box"><h4>Status split</h4><canvas id="chStatus"></canvas></div></div>`;
  $("tokens").before(card);
}
async function loadCharts() {
  const s = await api("/stats");
  drawBars("chService", s.byService, true); drawBars("chHour", s.byHour, false);
  const col = { Waiting: "#0b5ed7", Serving: "#f59f00", Completed: "#198754" };
  drawDonutOn("chStatus", s.byStatus.map(x => ({ value: x.value, color: col[x.label] })));
  $("avgTime").textContent = "Avg service time: " + s.avgServiceMin + " min";
}

document.addEventListener("DOMContentLoaded", updateAllViews);
setInterval(updateAllViews, 3000);