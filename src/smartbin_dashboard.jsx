import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Boxes, Map as MapIcon, AlertTriangle, Truck,
  Route as RouteIcon, BarChart3, FileText, Users, Cpu, Settings,
  HelpCircle, Bell, Calendar, ChevronDown, MapPin, Activity, Plus,
  RefreshCw, CheckCircle2, Copy, Trash2, Leaf, Battery, Signal, Gauge,
  Sun, Moon,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend as RLegend,
  RadialBarChart, RadialBar,
} from "recharts";

/* =========================================================================
   SmartBin Control Center — Operations Dashboard
   Light theme, sidebar navigation, KPI cards, live map, charts.
   ========================================================================= */

const API_BASE = "https://aoacx6u7g2.execute-api.eu-north-1.amazonaws.com";
const POLL_MS = 3000;
const MAPPLS_KEY = "wmyywpltuznyjpmpbcmqwpdzsngmqvwvegim";

const WATCH_AT = 50;
const CRITICAL_AT = 80;
const classify = (f) => f >= CRITICAL_AT ? "Critical" : f >= WATCH_AT ? "Watch" : "Optimal";
const nowSec = () => Math.floor(Date.now() / 1000);

const STATUS_COLOR = {
  Optimal: "#10b981", Watch: "#f59e0b", Critical: "#ef4444", Offline: "#94a3b8",
};

/* ---- demo fallback ---- */
const DEMO_BINS = [
  { bin_id: "SB-1025", bin_name: "Madhapur Road 36",  place: "Madhapur",    ward: "Ward 12", route: "Route 12", capacity: 200, latitude: "17.4456", longitude: "78.3772" },
  { bin_id: "SB-0876", bin_name: "Jubilee Hills Post", place: "Jubilee",    ward: "Ward 07", route: "Route 07", capacity: 200, latitude: "17.4239", longitude: "78.4067" },
  { bin_id: "SB-1345", bin_name: "Ameerpet Metro",    place: "Ameerpet",   ward: "Ward 09", route: "Route 03", capacity: 200, latitude: "17.4374", longitude: "78.4482" },
  { bin_id: "SB-1765", bin_name: "Dilsukhnagar Main", place: "Dilsukhnagar",ward: "Ward 21",route: "Route 09", capacity: 240, latitude: "17.3687", longitude: "78.5247" },
  { bin_id: "SB-1920", bin_name: "Kothapet Market",   place: "Kothapet",   ward: "Ward 22", route: "Route 09", capacity: 200, latitude: "17.3700", longitude: "78.5360" },
];
const DEMO_TELEMETRY = {
  "SB-1025": { bin_id:"SB-1025", fill_percent:100, distance_cm:0,  battery:55, rssi:-65, alert:true,  updated_at: nowSec()-2 },
  "SB-0876": { bin_id:"SB-0876", fill_percent:95,  distance_cm:10, battery:62, rssi:-71, alert:true,  updated_at: nowSec()-3 },
  "SB-1345": { bin_id:"SB-1345", fill_percent:100, distance_cm:0,  battery:48, rssi:-78, alert:true,  updated_at: nowSec()-1 },
  "SB-1765": { bin_id:"SB-1765", fill_percent:85,  distance_cm:30, battery:74, rssi:-66, alert:true,  updated_at: nowSec()-4 },
  "SB-1920": { bin_id:"SB-1920", fill_percent:30,  distance_cm:140,battery:80, rssi:-60, alert:false, updated_at: nowSec()-9000 }, // offline
};

/* ---- sparkline data (synthetic — replace with real history later) ---- */
const spark = (seed) => Array.from({ length: 12 }, (_, i) => ({ v: 50 + Math.sin(i / 2 + seed) * 12 + (i * (seed % 3 - 1)) }));

/* =========================================================================
   Theme system — premium light & dark, persisted to localStorage
   ========================================================================= */
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("smartbin-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch (_) {}
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    try { localStorage.setItem("smartbin-theme", theme); } catch (_) {}
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

/* Premium animated theme toggle — sliding sun/moon switch */
function ThemeToggle({ theme, toggle }) {
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light" : "Switch to dark"}
      className="theme-toggle"
    >
      <span className={`theme-toggle-knob ${dark ? "is-dark" : ""}`}>
        {dark
          ? <Moon className="h-3.5 w-3.5" strokeWidth={2.5} />
          : <Sun  className="h-3.5 w-3.5" strokeWidth={2.5} />}
      </span>
      <Sun  className={`theme-toggle-icon theme-toggle-sun  ${dark ? "is-dim" : ""}`} />
      <Moon className={`theme-toggle-icon theme-toggle-moon ${dark ? "" : "is-dim"}`} />
    </button>
  );
}

/* Global stylesheet — light defaults + premium dark overrides. */
function ThemeStyles() {
  return (
    <style>{`
      :root {
        --tx-base: 220ms cubic-bezier(.4,0,.2,1);
      }
      html, body, #root { background: #f8fafc; }
      body, button, input, select, textarea { transition: background-color var(--tx-base), color var(--tx-base), border-color var(--tx-base); }

      /* Premium toggle */
      .theme-toggle {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: 64px;
        height: 32px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid #e2e8f0;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%);
        box-shadow: inset 0 1px 2px rgba(15,23,42,.06);
        cursor: pointer;
        transition: all var(--tx-base);
      }
      .theme-toggle:hover { border-color: #cbd5e1; }
      .theme-toggle-icon {
        position: absolute; height: 14px; width: 14px;
        color: #94a3b8; transition: opacity var(--tx-base), color var(--tx-base);
      }
      .theme-toggle-sun  { left: 9px;  color: #f59e0b; }
      .theme-toggle-moon { right: 9px; color: #64748b; }
      .theme-toggle-icon.is-dim { opacity: .25; }
      .theme-toggle-knob {
        position: absolute;
        top: 3px; left: 3px;
        height: 24px; width: 24px;
        border-radius: 999px;
        background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
        box-shadow: 0 2px 5px rgba(15,23,42,.18), 0 0 0 1px rgba(15,23,42,.05);
        display: grid; place-items: center;
        color: #f59e0b;
        transform: translateX(0);
        transition: transform var(--tx-base), background var(--tx-base), color var(--tx-base);
      }
      .theme-toggle-knob.is-dark {
        transform: translateX(32px);
        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
        color: #e2e8f0;
        box-shadow: 0 2px 5px rgba(0,0,0,.45), 0 0 0 1px rgba(148,163,184,.15);
      }

      /* ====================== DARK THEME ====================== */
      .dark { color-scheme: dark; }
      .dark, .dark body, .dark #root { background: #070b14 !important; color: #f1f5f9 !important; }

      /* default text colour for everything in dark mode (catches un-classed text) */
      .dark, .dark * { color: #f1f5f9; }
      .dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6,
      .dark b, .dark strong, .dark .font-semibold, .dark .font-medium,
      .dark .font-bold { color: #ffffff !important; }
      .dark label { color: #e2e8f0 !important; }

      /* root chrome */
      .dark .bg-slate-50  { background-color: #070b14 !important; }
      .dark .bg-slate-100 { background-color: #182238 !important; }
      .dark .bg-slate-200 { background-color: #243049 !important; }
      .dark .bg-white     { background-color: #0f1525 !important; background-image: linear-gradient(180deg, #151d31 0%, #0f1525 100%) !important; }

      /* borders */
      .dark .border-slate-100 { border-color: #1f2a40 !important; }
      .dark .border-slate-200 { border-color: #2a3852 !important; }
      .dark .border-slate-300 { border-color: #364664 !important; }
      .dark .border-b, .dark .border-t, .dark .border-r, .dark .border-l { border-color: #2a3852; }

      /* text — brighter for readability */
      .dark .text-slate-900 { color: #ffffff !important; }
      .dark .text-slate-800 { color: #f1f5f9 !important; }
      .dark .text-slate-700 { color: #e2e8f0 !important; }
      .dark .text-slate-600 { color: #d1dae8 !important; }
      .dark .text-slate-500 { color: #c0cbdc !important; }
      .dark .text-slate-400 { color: #a7b4ca !important; }
      .dark .text-black     { color: #ffffff !important; }
      .dark .text-gray-900, .dark .text-zinc-900, .dark .text-neutral-900 { color: #ffffff !important; }
      .dark .text-gray-800, .dark .text-zinc-800, .dark .text-neutral-800 { color: #f1f5f9 !important; }
      .dark .text-gray-700, .dark .text-zinc-700, .dark .text-neutral-700 { color: #e2e8f0 !important; }
      .dark .text-gray-600, .dark .text-zinc-600, .dark .text-neutral-600 { color: #d1dae8 !important; }
      .dark .text-gray-500, .dark .text-zinc-500, .dark .text-neutral-500 { color: #c0cbdc !important; }
      .dark .text-gray-400, .dark .text-zinc-400, .dark .text-neutral-400 { color: #a7b4ca !important; }
      .dark code, .dark pre { color: #f1f5f9 !important; background-color: rgba(148,163,184,.12) !important; }

      /* hover surfaces */
      .dark .hover\\:bg-slate-50:hover  { background-color: #1c2740 !important; }
      .dark .hover\\:bg-slate-100:hover { background-color: #22304a !important; }

      /* tinted accent surfaces — brighter foregrounds for visibility */
      .dark .bg-emerald-50  { background-color: rgba(16,185,129,.16) !important; }
      .dark .border-emerald-100, .dark .border-emerald-200 { border-color: rgba(16,185,129,.45) !important; }
      .dark .text-emerald-800, .dark .text-emerald-700, .dark .text-emerald-600 { color: #6ee7b7 !important; }
      .dark .text-emerald-500 { color: #34d399 !important; }
      .dark .text-emerald-700\\/80 { color: #6ee7b7 !important; opacity: 1 !important; }

      .dark .bg-amber-50    { background-color: rgba(245,158,11,.15) !important; }
      .dark .border-amber-200 { border-color: rgba(245,158,11,.5) !important; }
      .dark .text-amber-800, .dark .text-amber-700, .dark .text-amber-600 { color: #fcd34d !important; }

      .dark .bg-rose-50     { background-color: rgba(244,63,94,.16) !important; }
      .dark .border-rose-200{ border-color: rgba(244,63,94,.5) !important; }
      .dark .text-rose-500, .dark .text-rose-700, .dark .text-rose-600, .dark .text-rose-800 { color: #fda4af !important; }

      .dark .bg-blue-50     { background-color: rgba(59,130,246,.15) !important; }
      .dark .text-blue-500, .dark .text-blue-600, .dark .text-blue-700 { color: #93c5fd !important; }

      /* opacity-suffixed text utilities (text-x/80 etc.) */
      .dark [class*="text-"][class*="\\/80"], .dark [class*="text-"][class*="\\/70"], .dark [class*="text-"][class*="\\/60"] { opacity: 1 !important; }

      /* placeholder text in inputs */
      .dark .placeholder\\:text-slate-400::placeholder { color: #94a3b8 !important; }

      /* premium toggle in dark */
      .dark .theme-toggle {
        border-color: #2c3a55;
        background: linear-gradient(180deg, #1a2236 0%, #131a2a 100%);
        box-shadow: inset 0 1px 2px rgba(0,0,0,.45);
      }
      .dark .theme-toggle:hover { border-color: #3d4f72; }

      /* cards: subtle glow on hover */
      .dark .rounded-xl.border, .dark .rounded-lg.border {
        box-shadow: 0 1px 2px rgba(0,0,0,.4), 0 0 0 1px rgba(148,163,184,.02);
      }

      /* inputs */
      .dark input, .dark select, .dark textarea {
        background-color: #131a2a !important;
        color: #e2e8f0 !important;
        border-color: #2c3a55 !important;
      }
      .dark input::placeholder, .dark textarea::placeholder { color: #64748b !important; }

      /* table rows */
      .dark thead { background-color: #131a2a !important; }
      .dark tbody tr { border-color: #1c2436 !important; }

      /* recharts text */
      .dark .recharts-text { fill: #94a3b8 !important; }
      .dark .recharts-tooltip-wrapper > div {
        background-color: #131a2a !important;
        border-color: #2c3a55 !important;
        color: #e2e8f0 !important;
      }
      .dark .recharts-default-tooltip { background-color: #131a2a !important; border-color: #2c3a55 !important; }

      /* scrollbars */
      .dark *::-webkit-scrollbar           { width: 10px; height: 10px; }
      .dark *::-webkit-scrollbar-track     { background: #0b1120; }
      .dark *::-webkit-scrollbar-thumb     { background: #2c3a55; border-radius: 5px; }
      .dark *::-webkit-scrollbar-thumb:hover { background: #3d4f72; }
    `}</style>
  );
}

/* ---- sidebar nav ---- */
const NAV = [
  { id: "Dashboard",   icon: LayoutDashboard },
  { id: "Map View",    icon: MapIcon },
  { id: "Alerts",      icon: AlertTriangle },
  { id: "Routes",      icon: RouteIcon },
  { id: "Analytics",   icon: BarChart3 },
  { id: "Reports",     icon: FileText },
  { id: "Users",       icon: Users },
  { id: "Devices",     icon: Cpu },
  { id: "Settings",    icon: Settings },
];

/* =========================================================================
   Mappls Map (for "Map View" page + Dashboard live map panel)
   ========================================================================= */
function useMapplsSdk(key) {
  const [loaded, setLoaded] = useState(() => !!(window.mappls && window.mappls.Map));
  useEffect(() => {
    if (window.mappls && window.mappls.Map) { setLoaded(true); return; }
    if (!key || key.startsWith("YOUR_")) return;
    let sc = document.getElementById("mappls-sdk");
    const onload = () => setLoaded(true);
    if (sc) { sc.addEventListener("load", onload); return () => sc.removeEventListener("load", onload); }
    sc = document.createElement("script");
    sc.id = "mappls-sdk";
    sc.src = `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${key}`;
    sc.async = true;
    sc.addEventListener("load", onload);
    document.head.appendChild(sc);
  }, [key]);
  return loaded;
}

function FleetMap({ bins, height = 360, mapId = "fleet-map" }) {
  const ready = useMapplsSdk(MAPPLS_KEY);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!ready || mapRef.current) return;
    const first = bins.find((b) => !isNaN(parseFloat(b.latitude)) && !isNaN(parseFloat(b.longitude)));
    const center = first
      ? { lat: parseFloat(first.latitude), lng: parseFloat(first.longitude) }
      : { lat: 17.385, lng: 78.4867 };
    mapRef.current = new window.mappls.Map(mapId, { center, zoom: 11 });
    if (mapRef.current?.on) mapRef.current.on("load", () => setMapLoaded(true));
    else setMapLoaded(true);
  }, [ready, bins, mapId]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    markersRef.current.forEach((m) => { try { m.remove ? m.remove() : window.mappls.remove({ map: mapRef.current, layer: m }); } catch (e) {} });
    markersRef.current = [];
    bins.forEach((b) => {
      const lat = parseFloat(b.latitude), lng = parseFloat(b.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      const color = STATUS_COLOR[b.status] || STATUS_COLOR.Offline;
      const marker = new window.mappls.Marker({
        map: mapRef.current,
        position: { lat, lng },
        html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>`,
        popupHtml: `<div style="font-family:sans-serif;min-width:170px"><b>${b.bin_name}</b><br/><span style="color:#666">${b.bin_id} · ${b.route} · ${b.ward}</span><br/>Fill: <b>${b.fill}%</b> · ${b.status}</div>`,
      });
      markersRef.current.push(marker);
    });
  }, [mapLoaded, bins]);

  if (!MAPPLS_KEY || MAPPLS_KEY.startsWith("YOUR_")) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">Add your Mappls Static Key to <code>MAPPLS_KEY</code> in smartbin_dashboard.jsx to enable the map.</div>;
  }
  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200">
      <div id={mapId} style={{ width: "100%", height }} />
      {!ready && <div className="absolute inset-0 grid place-items-center bg-white/70 text-slate-500 text-sm">Loading map…</div>}
    </div>
  );
}


/* ---- 10-second critical-bin beep (Web Audio API) -------------------------*/
function playCriticalBeep(durationSec = 10) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const start = ctx.currentTime;
    const beep = 0.30, gap = 0.20;            // 300ms beep, 200ms gap
    for (let t = 0; t < durationSec; t += beep + gap) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square"; osc.frequency.value = 880;
      osc.connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, start + t);
      g.gain.exponentialRampToValueAtTime(0.35, start + t + 0.01);
      g.gain.setValueAtTime(0.35, start + t + beep - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + t + beep);
      osc.start(start + t); osc.stop(start + t + beep);
    }
    setTimeout(() => ctx.close && ctx.close(), (durationSec + 0.5) * 1000);
  } catch (e) { /* browser blocked autoplay; first user gesture will unlock */ }
}

/* =========================================================================
   ROOT
   ========================================================================= */
export default function SmartBinDashboard() {
  const [page, setPage] = useState("Dashboard");
  const [registry, setRegistry] = useState([]);
  const [telemetry, setTelemetry] = useState({});
  const [events, setEvents] = useState([]);
  const [demo, setDemo] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const prevCriticalRef = useRef(new Set());
  const [criticalFlash, setCriticalFlash] = useState(null);   // {bin_id, at}
  const { theme, toggle: toggleTheme } = useTheme();

  const onCritical = useCallback((newOnes) => {
    if (!newOnes.length) return;
    playCriticalBeep(10);
    setCriticalFlash({ ids: newOnes.map(b => b.bin_id), at: Date.now() });
    setTimeout(() => setCriticalFlash(null), 10000);
  }, []);

  const loadRegistry = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/bins`);
      if (!r.ok) throw 0;
      const j = await r.json();
      setRegistry(j.bins || []);
      setDemo(false);
    } catch {
      // No demo data — show empty fleet rather than fake bins.
      setRegistry([]); setDemo(true);
    }
  }, []);

  const loadTelemetry = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/telemetry`);
      if (!r.ok) throw 0;
      let j = await r.json();
      if (j.body) j = typeof j.body === "string" ? JSON.parse(j.body) : j.body;
      setTelemetry(j || {});
      setDemo(false);
      setLastSync(new Date());
      ingest(j || {});
    } catch {
      // No demo data — keep last good telemetry, do NOT inject fake events.
      setDemo(true); setLastSync(new Date());
    }
  }, []);

  const ingest = useCallback((tel) => {
    setEvents((prev) => {
      const incoming = Object.values(tel).map((d) => ({
        key: `${d.bin_id}-${d.updated_at || d.timestamp}`,
        bin_id: d.bin_id, fill: Math.round(d.fill_percent ?? 0),
        status: classify(d.fill_percent ?? 0), at: new Date(),
      }));
      const seen = new Set(prev.map((e) => e.key));
      return [...incoming.filter((e) => !seen.has(e.key)), ...prev].slice(0, 12);
    });
  }, []);

  useEffect(() => { loadRegistry(); loadTelemetry(); }, [loadRegistry, loadTelemetry]);
  useEffect(() => { const id = setInterval(loadTelemetry, POLL_MS); return () => clearInterval(id); }, [loadTelemetry]);

  const bins = useMemo(() => registry.map((m) => {
    const live = telemetry[m.bin_id] || null;
    const stale = live ? (nowSec() - (live.updated_at || nowSec())) > 30 : true;
    const fill = live ? Math.round(live.fill_percent ?? 0) : 0;
    return {
      ...m, live, online: !!live && !stale, fill,
      distance_cm: live?.distance_cm, battery: live?.battery, rssi: live?.rssi,
      status: !live || stale ? "Offline" : classify(fill),
    };
  }), [registry, telemetry]);

  // Detect bins that just became Critical (fill >= 80) and beep
  useEffect(() => {
    const nowCritical = bins.filter((b) => b.status === "Critical");
    const nowIds = new Set(nowCritical.map((b) => b.bin_id));
    const newOnes = nowCritical.filter((b) => !prevCriticalRef.current.has(b.bin_id));
    if (newOnes.length) onCritical(newOnes);
    prevCriticalRef.current = nowIds;
  }, [bins, onCritical]);

  // Rolling fleet average over time (last 30 samples — fed to Analytics trend chart)
  const [trend, setTrend] = useState([]);
  useEffect(() => {
    if (!bins.length) return;
    const avg = Math.round(bins.reduce((s, b) => s + (b.fill || 0), 0) / bins.length);
    const critical = bins.filter((b) => b.status === "Critical").length;
    setTrend((prev) => [...prev, {
      t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      avg, critical,
    }].slice(-30));
  }, [bins]);

  return (
    <div className={`${theme === "dark" ? "dark" : ""} min-h-screen bg-slate-50 text-slate-800 font-sans flex`}>
      <ThemeStyles />
      <Sidebar active={page} setPage={setPage} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar page={page} lastSync={lastSync} theme={theme} toggleTheme={toggleTheme} />
        {demo && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs">
            Showing demo data — the API at <code>{API_BASE}</code> isn't reachable yet.
          </div>
        )}
        {criticalFlash && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-sm font-medium animate-pulse flex items-center gap-2">
            🔔 Critical: {criticalFlash.ids.join(", ")} — bin full, collection required (10s alert)
          </div>
        )}
        <main className="p-6 flex-1 overflow-auto">
          {page === "Dashboard"  && <DashboardPage bins={bins} events={events} onCritical={onCritical} />}
          {page === "Map View"   && <MapViewPage bins={bins} />}
          {page === "Alerts"     && <AlertsPage bins={bins} events={events} />}
          {page === "Routes"     && <RoutesPage bins={bins} />}
          {page === "Analytics"  && <AnalyticsPage bins={bins} trend={trend} />}
          {page === "Reports"    && <ReportsPage bins={bins} />}
          {page === "Users"      && <UsersPage />}
          {page === "Devices"    && <DevicesPage bins={bins} />}
          {page === "Settings"   && <SettingsPage />}
        </main>
        <FooterBar bins={bins} lastSync={lastSync} />
      </div>
    </div>
  );
}

/* =========================================================================
   Sidebar
   ========================================================================= */
function Sidebar({ active, setPage }) {
  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
        <div className="h-10 w-10 rounded-lg bg-emerald-500 grid place-items-center">
          <Trash2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-semibold leading-tight">SmartBin</div>
          <div className="text-[11px] text-slate-500">Waste Management System</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ id, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button key={id} onClick={() => setPage(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 font-medium border-l-4 border-emerald-500 pl-2"
                  : "text-slate-600 hover:bg-slate-50"
              }`}>
              <Icon className="h-4 w-4" /> {id}
            </button>
          );
        })}
      </nav>
      <div className="m-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
        <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
          <HelpCircle className="h-4 w-4" /> Need Help?
        </div>
        <div className="text-xs text-emerald-700/80 mt-1">Contact Support</div>
      </div>
    </aside>
  );
}

/* =========================================================================
   TopBar
   ========================================================================= */
function TopBar({ page, lastSync, theme, toggleTheme }) {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
      <div className="flex-1">
        <h1 className="text-xl font-semibold">{page}</h1>
        <p className="text-xs text-slate-500">Real-time overview of SmartBin operations</p>
      </div>
      <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm">
        All Zones <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
      <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm">
        <Calendar className="h-4 w-4 text-slate-400" />
        {lastSync ? lastSync.toLocaleDateString() : "—"}
      </div>
      <ThemeToggle theme={theme} toggle={toggleTheme} />
      <button className="relative p-2 rounded-lg border border-slate-200 bg-white">
        <Bell className="h-4 w-4 text-slate-500" />
        <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] rounded-full px-1.5">12</span>
      </button>
      <div className="flex items-center gap-2 pl-2">
        <div className="h-9 w-9 rounded-full bg-slate-200 grid place-items-center text-sm font-medium">A</div>
        <div className="hidden md:block leading-tight">
          <div className="text-sm font-medium">Admin</div>
          <div className="text-[11px] text-slate-500">Municipal Corp.</div>
        </div>
      </div>
    </header>
  );
}

/* =========================================================================
   FooterBar
   ========================================================================= */
function FooterBar({ bins, lastSync }) {
  const online = bins.filter((b) => b.online).length;
  return (
    <footer className="bg-white border-t border-slate-200 px-6 py-3 flex flex-wrap items-center gap-6 text-xs text-slate-500">
      <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> System Status <span className="text-emerald-600 font-medium">All Systems Operational</span></div>
      <div className="flex items-center gap-2"><Signal className="h-3.5 w-3.5" /> Network <span className="font-medium text-slate-700">98%</span></div>
      <div className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5" /> IoT Devices <span className="font-medium text-slate-700">{online} / {bins.length} Online</span></div>
      <div className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5" /> Last Data Update <span className="font-medium text-slate-700">{lastSync ? lastSync.toLocaleString() : "—"}</span></div>
      <div className="ml-auto text-slate-400">© SmartBin. All rights reserved.</div>
    </footer>
  );
}

/* =========================================================================
   Dashboard page (the big one)
   ========================================================================= */
function DashboardPage({ bins, events, onCritical }) {
  const kpis = useMemo(() => {
    const total = bins.length;
    const active = bins.filter((b) => b.online).length;
    const full = bins.filter((b) => b.fill >= CRITICAL_AT).length;
    const avg = total ? Math.round(bins.reduce((s, b) => s + (b.fill || 0), 0) / total) : 0;
    return { total, active, full, avg };
  }, [bins]);

  const statusCounts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0, offline: 0 };
    bins.forEach((b) => {
      if (b.status === "Offline") c.offline++;
      else if (b.fill >= CRITICAL_AT) c.red++;
      else if (b.fill >= WATCH_AT) c.yellow++;
      else c.green++;
    });
    return c;
  }, [bins]);

  const distribution = useMemo(() => {
    const buckets = [
      { range: "0-20%",   max: 20,  count: 0, color: "#10b981" },
      { range: "21-40%",  max: 40,  count: 0, color: "#10b981" },
      { range: "41-60%",  max: 60,  count: 0, color: "#f59e0b" },
      { range: "61-80%",  max: 80,  count: 0, color: "#f59e0b" },
      { range: "81-100%", max: 100, count: 0, color: "#ef4444" },
    ];
    bins.forEach((b) => {
      const idx = buckets.findIndex((bk) => b.fill <= bk.max);
      if (idx >= 0) buckets[idx].count++;
    });
    return buckets;
  }, [bins]);

  const critical = useMemo(() =>
    bins.filter((b) => b.fill >= CRITICAL_AT || b.status === "Offline").slice(0, 5),
  [bins]);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi icon={Trash2}      label="Total Bins"        value={kpis.total} sub="All locations"    accent="emerald" data={spark(1)} />
        <Kpi icon={CheckCircle2} label="Active Bins"       value={kpis.active} sub={`${kpis.total ? Math.round(kpis.active*100/kpis.total) : 0}% Online`} accent="emerald" data={spark(2)} />
        <Kpi icon={AlertTriangle} label="Full Bins"       value={kpis.full} sub={`${kpis.total ? Math.round(kpis.full*100/kpis.total) : 0}% Full`}   accent="rose"     data={spark(3)} />
        <Kpi icon={Gauge}        label="Average Fill Level" value={`${kpis.avg}%`} sub="+5% vs last 7 days" accent="amber"   data={spark(4)} />
        <Kpi icon={Leaf}         label="CO₂ Saved"        value="1.24 t" sub="This month"  accent="emerald" data={spark(6)} />
      </div>

      {/* Map + right column */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Live Bin Locations" className="xl:col-span-2" >
          <FleetMap bins={bins} height={420} mapId="dashboard-map" />
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-3">
            <Legend color={STATUS_COLOR.Optimal} label="0 - 40%" />
            <Legend color={STATUS_COLOR.Watch}   label="41 - 70%" />
            <Legend color={STATUS_COLOR.Critical} label="71 - 100%" />
            <Legend color={STATUS_COLOR.Offline} label="Offline" />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Critical Alerts" actions={<a className="text-xs text-emerald-600">View all</a>}>
            <ul className="space-y-3">
              {critical.length === 0 && <li className="text-sm text-slate-500">No critical bins right now 🎉</li>}
              {critical.map((b) => (
                <li key={b.bin_id} className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-full grid place-items-center ${b.status === "Critical" ? "bg-rose-50" : "bg-slate-100"}`}>
                    <AlertTriangle className={`h-4 w-4 ${b.status === "Critical" ? "text-rose-500" : "text-slate-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">Bin {b.bin_id} is {b.status === "Offline" ? "offline" : `${b.fill}% full`}</div>
                    <div className="text-xs text-slate-500 truncate">{b.place}, {b.route}</div>
                  </div>
                  <div className="text-[11px] text-slate-400 whitespace-nowrap">just now</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Bin Status Overview">
            <div className="flex items-center gap-4">
              <div className="relative w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                      { name: "0-40%",   value: statusCounts.green,   color: STATUS_COLOR.Optimal },
                      { name: "41-70%",  value: statusCounts.yellow,  color: STATUS_COLOR.Watch },
                      { name: "71-100%", value: statusCounts.red,     color: STATUS_COLOR.Critical },
                      { name: "Offline", value: statusCounts.offline, color: STATUS_COLOR.Offline },
                    ]} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                      {["#10b981","#f59e0b","#ef4444","#94a3b8"].map((c,i) => <Cell key={i} fill={c} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{bins.length}</div>
                    <div className="text-[10px] text-slate-500">Total Bins</div>
                  </div>
                </div>
              </div>
              <ul className="text-xs space-y-2 flex-1">
                <DonutLegend color={STATUS_COLOR.Optimal}  label="0 - 40%"   value={statusCounts.green}   total={bins.length} />
                <DonutLegend color={STATUS_COLOR.Watch}    label="41 - 70%"  value={statusCounts.yellow}  total={bins.length} />
                <DonutLegend color={STATUS_COLOR.Critical} label="71 - 100%" value={statusCounts.red}     total={bins.length} />
                <DonutLegend color={STATUS_COLOR.Offline}  label="Offline"   value={statusCounts.offline} total={bins.length} />
              </ul>
            </div>
          </Card>

          <Card title="Recent Activity" actions={<a className="text-xs text-emerald-600">View all</a>}>
            <ul className="space-y-3 max-h-60 overflow-auto">
              {events.length === 0 && <li className="text-sm text-slate-500">Waiting for telemetry…</li>}
              {events.slice(0, 6).map((e) => (
                <li key={e.key} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-100 grid place-items-center">
                    <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">Bin {e.bin_id} now <b>{e.fill}%</b> — {e.status}</div>
                    <div className="text-xs text-slate-500">{e.at.toLocaleTimeString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* Bottom row: distribution */}
      <div className="grid grid-cols-1 gap-4">
        <Card title="Fill Level Distribution">
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={distribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="range" axisLine={false} tickLine={false} fontSize={11} stroke="#94a3b8" />
                <YAxis hide />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[11px] text-slate-500 text-center mt-1">Fill Level (%)</div>
        </Card>

        
      </div>
    </div>
  );
}

/* ---- small shared bits ---- */
function Card({ title, actions, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent = "emerald", data }) {
  const tones = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", stroke: "#10b981" },
    rose:    { bg: "bg-rose-50",    text: "text-rose-600",    stroke: "#ef4444" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-600",   stroke: "#f59e0b" },
    sky:     { bg: "bg-sky-50",     text: "text-sky-600",     stroke: "#0ea5e9" },
  }[accent];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <div className={`h-8 w-8 rounded-lg grid place-items-center ${tones.bg}`}>
          <Icon className={`h-4 w-4 ${tones.text}`} />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
      <div className="h-10 -mx-1 mt-1">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <Area type="monotone" dataKey="v" stroke={tones.stroke} fill={tones.stroke} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}</span>;
}
function DonutLegend({ color, label, value, total }) {
  const pct = total ? Math.round(value * 100 / total) : 0;
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-slate-600">{label}</span>
      <span className="font-medium text-slate-700 tabular-nums">{value} <span className="text-slate-400">({pct}%)</span></span>
    </li>
  );
}

/* =========================================================================
   Other pages
   ========================================================================= */
function MapViewPage({ bins }) {
  return (
    <Card title="Fleet map">
      <FleetMap bins={bins} height={620} mapId="full-map" />
    </Card>
  );
}

function AlertsPage({ bins, events }) {
  const live = bins.filter((b) => b.fill >= CRITICAL_AT || b.status === "Offline");
  const history = events.filter((e) => e.status === "Critical" || e.status === "Watch").slice(0, 30);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title={`Active alerts (${live.length})`} className="lg:col-span-2">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500"><tr className="text-left"><th className="pb-2">Bin</th><th>Location</th><th>Status</th><th className="text-right">Fill</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {live.map((b) => (
              <tr key={b.bin_id}>
                <td className="py-2 font-medium">{b.bin_id}</td>
                <td className="text-slate-600">{b.place} · {b.route}</td>
                <td><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: STATUS_COLOR[b.status] + "22", color: STATUS_COLOR[b.status] }}>{b.status}</span></td>
                <td className="text-right font-medium tabular-nums">{b.fill}%</td>
              </tr>
            ))}
            {live.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No active alerts — all bins healthy.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card title="Alert history (recent)">
        <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-auto">
          {history.length === 0 && <li className="py-3 text-sm text-slate-500">No recent alerts.</li>}
          {history.map((e) => (
            <li key={e.key} className="py-2.5">
              <div className="text-sm">{e.bin_id} — <b>{e.fill}%</b> · {e.status}</div>
              <div className="text-[11px] text-slate-500">{e.at.toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function RoutesPage({ bins }) {
  const routes = {};
  bins.forEach((b) => {
    const r = b.route || "—";
    if (!routes[r]) routes[r] = { name: r, total: 0, critical: 0, avg: 0, sum: 0 };
    routes[r].total++; routes[r].sum += b.fill || 0;
    if (b.status === "Critical") routes[r].critical++;
  });
  const list = Object.values(routes).map((r) => ({ ...r, avg: r.total ? Math.round(r.sum / r.total) : 0 }))
                .sort((a, b) => b.critical - a.critical || b.avg - a.avg);
  return (
    <Card title={`Routes (${list.length})`}>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500"><tr className="text-left"><th className="pb-2">Route</th><th>Bins</th><th>Critical</th><th>Average fill</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((r) => (
            <tr key={r.name}>
              <td className="py-2 font-medium">{r.name}</td>
              <td className="text-slate-600">{r.total}</td>
              <td><span className="text-xs px-2 py-0.5 rounded-full"
                       style={{ background: (r.critical ? STATUS_COLOR.Critical : STATUS_COLOR.Optimal) + "22",
                                color: r.critical ? STATUS_COLOR.Critical : STATUS_COLOR.Optimal }}>{r.critical}</span></td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${r.avg}%`, background: r.avg >= CRITICAL_AT ? STATUS_COLOR.Critical : r.avg >= WATCH_AT ? STATUS_COLOR.Watch : STATUS_COLOR.Optimal }} />
                  </div>
                  <span className="text-xs tabular-nums">{r.avg}%</span>
                </div>
              </td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No bins yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function AnalyticsPage({ bins, trend = [] }) {
  // ---- aggregates ----
  const total      = bins.length;
  const active     = bins.filter((b) => b.online).length;
  const critical   = bins.filter((b) => b.status === "Critical").length;
  const watch      = bins.filter((b) => b.status === "Watch").length;
  const offline    = bins.filter((b) => b.status === "Offline").length;
  const avgFill    = total ? Math.round(bins.reduce((s, b) => s + (b.fill || 0), 0) / total) : 0;
  const avgBattery = (() => {
    const w = bins.filter((b) => typeof b.battery === "number");
    return w.length ? Math.round(w.reduce((s, b) => s + b.battery, 0) / w.length) : 0;
  })();
  const avgRssi = (() => {
    const w = bins.filter((b) => typeof b.rssi === "number" && b.rssi !== 0);
    return w.length ? Math.round(w.reduce((s, b) => s + b.rssi, 0) / w.length) : 0;
  })();

  // ---- status distribution (donut) ----
  const status = { Optimal: 0, Watch: 0, Critical: 0, Offline: 0 };
  bins.forEach((b) => status[b.status]++);
  const pieData = Object.entries(status).map(([k, v]) => ({ name: k, value: v, color: STATUS_COLOR[k] }));

  // ---- route buckets ----
  const byRoute = {};
  bins.forEach((b) => {
    const r = b.route || "—";
    if (!byRoute[r]) byRoute[r] = { route: r, total: 0, avg: 0, sum: 0, critical: 0 };
    byRoute[r].total++; byRoute[r].sum += b.fill || 0;
    if (b.status === "Critical") byRoute[r].critical++;
  });
  const routeBars = Object.values(byRoute)
    .map((r) => ({ ...r, avg: r.total ? Math.round(r.sum / r.total) : 0 }))
    .sort((a, b) => b.avg - a.avg);

  // ---- fill distribution ----
  const buckets = [
    { range: "0-20%",  max: 20,  count: 0, color: "#10b981" },
    { range: "21-40%", max: 40,  count: 0, color: "#10b981" },
    { range: "41-60%", max: 60,  count: 0, color: "#f59e0b" },
    { range: "61-80%", max: 80,  count: 0, color: "#f59e0b" },
    { range: "81-100%",max: 100, count: 0, color: "#ef4444" },
  ];
  bins.forEach((b) => { const i = buckets.findIndex((x) => b.fill <= x.max); if (i >= 0) buckets[i].count++; });

  // ---- battery distribution ----
  const battBuckets = [
    { range: "0-25%",   max: 25,  count: 0, color: "#ef4444" },
    { range: "26-50%",  max: 50,  count: 0, color: "#f59e0b" },
    { range: "51-75%",  max: 75,  count: 0, color: "#84cc16" },
    { range: "76-100%", max: 100, count: 0, color: "#10b981" },
  ];
  bins.forEach((b) => {
    if (typeof b.battery !== "number") return;
    const i = battBuckets.findIndex((x) => b.battery <= x.max);
    if (i >= 0) battBuckets[i].count++;
  });

  // ---- top fullest bins ----
  const topFull = [...bins].sort((a, b) => (b.fill || 0) - (a.fill || 0)).slice(0, 6)
    .map((b) => ({ name: b.bin_id, fill: b.fill || 0, color: b.fill >= CRITICAL_AT ? "#ef4444" : b.fill >= WATCH_AT ? "#f59e0b" : "#10b981" }));

  // ---- signal strength per bin ----
  const rssiBars = bins
    .filter((b) => typeof b.rssi === "number" && b.rssi !== 0)
    .map((b) => ({ name: b.bin_id, rssi: b.rssi, color: b.rssi >= -65 ? "#10b981" : b.rssi >= -75 ? "#f59e0b" : "#ef4444" }))
    .slice(0, 8);

  const noData = total === 0;

  if (noData) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
        <BarChart3 className="h-10 w-10 mx-auto text-slate-300 mb-2" />
        <div className="font-medium text-slate-600">No analytics yet</div>
        <div className="text-xs">Once your bins start reporting telemetry, the charts will populate automatically.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ============ Top KPI strip ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AnalyticsStat label="Total Bins"      value={total}             icon={Trash2}         tint="emerald" />
        <AnalyticsStat label="Average Fill"    value={`${avgFill}%`}     icon={Gauge}          tint={avgFill >= CRITICAL_AT ? "rose" : avgFill >= WATCH_AT ? "amber" : "emerald"} />
        <AnalyticsStat label="Critical Bins"   value={critical}          icon={AlertTriangle}  tint="rose" />
        <AnalyticsStat label="Active / Online" value={`${active}/${total}`} icon={CheckCircle2} tint="emerald" />
      </div>

      {/* ============ Fleet average over time (the big hero chart) ============ */}
      <Card title="Fleet average fill — live trend" actions={<span className="text-xs text-slate-500">{trend.length} samples</span>}>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={trend.length ? trend : [{ t: "—", avg: 0, critical: 0 }]} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#10b981" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCrit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
              <RLegend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="avg" name="Avg fill %" stroke="#10b981" strokeWidth={2.5} fill="url(#gradAvg)" isAnimationActive={false} />
              <Area type="monotone" dataKey="critical" name="Critical bins" stroke="#ef4444" strokeWidth={2}  fill="url(#gradCrit)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ============ Status donut + Fill distribution ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Bin status breakdown">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3} isAnimationActive={false}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                </Pie>
                <Tooltip />
                <RLegend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Fill level distribution">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={buckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" axisLine={false} tickLine={false} fontSize={11} stroke="#94a3b8" />
                <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,.1)" }} contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                  {buckets.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ============ Top fullest bins (horizontal) + Battery health ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top fullest bins" actions={<span className="text-xs text-slate-500">live</span>}>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={topFull} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={70} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,.1)" }} contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="fill" radius={[0, 8, 8, 0]}>
                  {topFull.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={`Battery health — fleet avg ${avgBattery}%`}>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={battBuckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" axisLine={false} tickLine={false} fontSize={11} stroke="#94a3b8" />
                <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,.1)" }} contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                  {battBuckets.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ============ Average fill per route + Signal strength ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Average fill per route">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={routeBars} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRoute" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#0ea5e9" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0369a1" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="route" axisLine={false} tickLine={false} fontSize={11} stroke="#94a3b8" />
                <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} unit="%" />
                <Tooltip cursor={{ fill: "rgba(148,163,184,.1)" }} contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="avg" name="Avg fill %" radius={[8, 8, 0, 0]} fill="url(#gradRoute)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={`WiFi signal per bin — fleet avg ${avgRssi || "—"} dBm`}>
          <div style={{ width: "100%", height: 260 }}>
            {rssiBars.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-slate-500">No signal data reported yet</div>
            ) : (
              <ResponsiveContainer>
                <BarChart data={rssiBars} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[-100, -30]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit=" dBm" />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={70} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,.1)" }} contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
                  <Bar dataKey="rssi" radius={[0, 8, 8, 0]}>
                    {rssiBars.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ============ Routes summary table ============ */}
      <Card title="Route hotspots">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="text-left">
              <th className="pb-2">Route</th><th>Bins</th><th>Critical</th><th>Avg fill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {routeBars.map((r) => (
              <tr key={r.route}>
                <td className="py-2 font-medium">{r.route}</td>
                <td className="text-slate-600">{r.total}</td>
                <td>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (r.critical ? STATUS_COLOR.Critical : STATUS_COLOR.Optimal) + "22", color: r.critical ? STATUS_COLOR.Critical : STATUS_COLOR.Optimal }}>{r.critical}</span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full" style={{ width: `${r.avg}%`, background: r.avg >= CRITICAL_AT ? STATUS_COLOR.Critical : r.avg >= WATCH_AT ? STATUS_COLOR.Watch : STATUS_COLOR.Optimal }} />
                    </div>
                    <span className="text-xs tabular-nums">{r.avg}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* Compact KPI tile for Analytics */
function AnalyticsStat({ label, value, icon: Icon, tint = "emerald" }) {
  const tints = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
    rose:    { bg: "bg-rose-50",    text: "text-rose-600",    ring: "ring-rose-100"    },
    amber:   { bg: "bg-amber-50",   text: "text-amber-600",   ring: "ring-amber-100"   },
    sky:     { bg: "bg-sky-50",     text: "text-sky-600",     ring: "ring-sky-100"     },
  };
  const t = tints[tint] || tints.emerald;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg grid place-items-center ${t.bg} ring-1 ${t.ring}`}>
        <Icon className={`h-5 w-5 ${t.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-semibold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function ReportsPage({ bins }) {
  const total = bins.length;
  const critical = bins.filter((b) => b.status === "Critical").length;
  const watch = bins.filter((b) => b.status === "Watch").length;
  const optimal = bins.filter((b) => b.status === "Optimal").length;
  const offline = bins.filter((b) => b.status === "Offline").length;
  const avg = total ? Math.round(bins.reduce((s, b) => s + (b.fill || 0), 0) / total) : 0;
  const csv = "bin_id,bin_name,route,ward,fill,status\n" +
    bins.map((b) => `${b.bin_id},${b.bin_name},${b.route},${b.ward},${b.fill},${b.status}`).join("\n");
  const download = () => {
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `smartbin-snapshot-${Date.now()}.csv`; a.click();
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Fleet snapshot">
        <ul className="text-sm space-y-2">
          <li className="flex justify-between"><span>Total bins</span><b>{total}</b></li>
          <li className="flex justify-between"><span>Average fill</span><b>{avg}%</b></li>
          <li className="flex justify-between"><span>Critical</span><b className="text-rose-600">{critical}</b></li>
          <li className="flex justify-between"><span>Watch</span><b className="text-amber-600">{watch}</b></li>
          <li className="flex justify-between"><span>Optimal</span><b className="text-emerald-600">{optimal}</b></li>
          <li className="flex justify-between"><span>Offline</span><b className="text-slate-500">{offline}</b></li>
        </ul>
      </Card>
      <Card title="Export">
        <p className="text-sm text-slate-600 mb-3">Download the current fleet state as a CSV.</p>
        <button onClick={download} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-sm font-medium">Download CSV</button>
      </Card>
    </div>
  );
}

function UsersPage() {
  const users = [
    { name: "Admin",     email: "admin@smartbin.local",     role: "Owner",    status: "Active" },
    { name: "Operator 1", email: "op1@smartbin.local",       role: "Operator", status: "Active" },
    { name: "Viewer",    email: "viewer@smartbin.local",    role: "Viewer",   status: "Active" },
  ];
  return (
    <Card title={`Users (${users.length})`}>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500"><tr className="text-left"><th className="pb-2">Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((u) => (
            <tr key={u.email}>
              <td className="py-2 font-medium">{u.name}</td>
              <td className="text-slate-600">{u.email}</td>
              <td><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{u.role}</span></td>
              <td><span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{u.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-3">User management is read-only here; backed by an identity provider in production (Cognito/Okta).</p>
    </Card>
  );
}

function DevicesPage({ bins }) {
  return (
    <Card title={`Devices (${bins.length})`}>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500"><tr className="text-left"><th className="pb-2">Bin</th><th>Thing</th><th>Signal</th><th>Battery</th><th>Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {bins.map((b) => (
            <tr key={b.bin_id}>
              <td className="py-2 font-medium">{b.bin_id}</td>
              <td className="text-slate-600 font-mono text-xs">{b.thing_name || `esp32-smartbin-${b.bin_id}`}</td>
              <td>{b.rssi != null ? `${b.rssi} dBm` : "—"}</td>
              <td>{b.battery != null ? `${b.battery}%` : "—"}</td>
              <td><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: STATUS_COLOR[b.status] + "22", color: STATUS_COLOR[b.status] }}>{b.online ? "Online" : "Offline"}</span></td>
            </tr>
          ))}
          {bins.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No devices yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function SettingsPage() {
  const [theme, setTheme] = useState("Light");
  const [accent, setAccent] = useState("Emerald");
  const [sound, setSound] = useState(true);
  const [refresh, setRefresh] = useState(3);
  const [units, setUnits] = useState("Metric (cm, kg)");
  const [lang, setLang] = useState("English");

  const Pill = ({ active, label, onClick, color }) => (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}>
      {color && <span className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle" style={{ background: color }} />}
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Appearance">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-500 mb-2">Theme</div>
            <div className="flex gap-2 flex-wrap">
              {["Light","Dark","System"].map((t) =>
                <Pill key={t} label={t} active={theme === t} onClick={() => setTheme(t)} />)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-2">Accent color</div>
            <div className="flex gap-2 flex-wrap">
              {[
                { l: "Emerald", c: "#10b981" }, { l: "Sky", c: "#0ea5e9" },
                { l: "Indigo", c: "#6366f1" }, { l: "Rose", c: "#f43f5e" }, { l: "Amber", c: "#f59e0b" },
              ].map((o) =>
                <Pill key={o.l} label={o.l} color={o.c} active={accent === o.l} onClick={() => setAccent(o.l)} />)}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Notifications">
        <div className="space-y-4">
          <Row label="Critical-bin sound alert" sub="Beep when a bin crosses the critical fill threshold">
            <button onClick={() => setSound(!sound)}
              className={`relative w-12 h-7 rounded-full transition ${sound ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 ${sound ? "right-0.5" : "left-0.5"} h-6 w-6 bg-white rounded-full shadow transition`} />
            </button>
          </Row>
          <Row label="Browser notifications" sub="System push when a bin needs collection">
            <button onClick={() => Notification.requestPermission().catch(() => {})}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">Enable</button>
          </Row>
        </div>
      </Card>

      <Card title="Data">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-500 mb-2">Auto-refresh every</div>
            <div className="flex gap-2 flex-wrap">
              {[3, 5, 10, 30].map((s) =>
                <Pill key={s} label={`${s} s`} active={refresh === s} onClick={() => setRefresh(s)} />)}
            </div>
          </div>
          <Row label="Units" sub="Distance and weight">
            <select value={units} onChange={(e) => setUnits(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
              <option>Metric (cm, kg)</option><option>Imperial (in, lb)</option>
            </select>
          </Row>
          <Row label="Language" sub="Interface language">
            <select value={lang} onChange={(e) => setLang(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5">
              <option>English</option><option>हिन्दी</option><option>తెలుగు</option>
            </select>
          </Row>
        </div>
      </Card>

      <Card title="Thresholds">
        <div className="space-y-3">
          <Row label="Watch level" sub="Yellow at fill ≥">
            <div className="text-base font-semibold tabular-nums">{WATCH_AT}%</div>
          </Row>
          <Row label="Critical level" sub="Red + alert at fill ≥">
            <div className="text-base font-semibold tabular-nums text-rose-600">{CRITICAL_AT}%</div>
          </Row>
          <p className="text-[11px] text-slate-500">Defaults match the firmware alert threshold.</p>
        </div>
      </Card>

      <Card title="About" className="lg:col-span-2">
        <div className="text-sm text-slate-600">SmartBin Control Center · industrial waste-management dashboard.</div>
        <div className="text-xs text-slate-400 mt-1">Build {new Date().toISOString().slice(0, 10)}</div>
      </Card>
    </div>
  );
}

function Row({ label, sub, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function ComingSoon({ page }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
      <div className="text-lg font-medium text-slate-700">{page}</div>
      <div className="text-sm mt-1">This section is wired into the sidebar and ready to fill in next.</div>
    </div>
  );
}

/* =========================================================================
   Bins page (registration + list, light theme)
   ========================================================================= */
const EMPTY_FORM = { bin_id:"", bin_name:"", place:"", ward:"", route:"", capacity:"200", latitude:"", longitude:"" };

function BinsPage({ existing, onRegistered, demo }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dupId = existing.some((b) => b.bin_id.toLowerCase() === form.bin_id.trim().toLowerCase());
  const dupName = existing.some((b) => (b.bin_name||"").toLowerCase() === form.bin_name.trim().toLowerCase());
  const validId = /^[A-Za-z0-9_-]{2,32}$/.test(form.bin_id.trim());
  const canSubmit = Object.values(form).every((v) => v) && validId && !dupId && !dupName && !busy;

  async function submit(e) {
    e.preventDefault(); setError(""); setResult(null); if (!canSubmit) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/bins`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ ...form, capacity:+form.capacity, latitude:+form.latitude, longitude:+form.longitude }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Registration failed");
      setResult(j); setForm(EMPTY_FORM); onRegistered();
    } catch (err) {
      setError(demo ? "API not reachable (demo mode)." : err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-600" /><h2 className="font-semibold">Register a new bin</h2></div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bin ID" v={form.bin_id} on={set("bin_id")} err={form.bin_id && !validId ? "2-32 chars, no spaces" : dupId ? "already exists" : ""} />
          <Input label="Bin name" v={form.bin_name} on={set("bin_name")} err={dupName ? "already exists" : ""} />
          <Input label="Place" v={form.place} on={set("place")} />
          <Input label="Ward" v={form.ward} on={set("ward")} />
          <Input label="Route" v={form.route} on={set("route")} />
          <Input label="Capacity (cm)" type="number" v={form.capacity} on={set("capacity")} />
          <Input label="Latitude" v={form.latitude} on={set("latitude")} />
          <Input label="Longitude" v={form.longitude} on={set("longitude")} />
        </div>
        {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">{error}</div>}
        <button type="submit" disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white px-4 py-2.5 font-medium">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy ? "Provisioning…" : "Register bin"}
        </button>
      </form>

      <div className="space-y-4">
        {result && (
          <div className="bg-white rounded-xl border border-emerald-200 p-5 space-y-2">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /><h3 className="font-semibold">Provisioned</h3></div>
            <div className="text-xs">Thing <code className="text-emerald-700">{result.thing_name}</code> · save the cert/key (shown once).</div>
            {["certificate_pem","private_key"].map((k) => (
              <div key={k}>
                <div className="text-[11px] text-slate-500">{k}</div>
                <textarea readOnly value={result.credentials?.[k] || ""} className="w-full h-20 text-[10px] font-mono rounded bg-slate-50 border border-slate-200 p-2" />
              </div>
            ))}
          </div>
        )}
        <Card title={`Registered bins (${existing.length})`}>
          <ul className="divide-y divide-slate-100 max-h-96 overflow-auto">
            {existing.map((b) => (
              <li key={b.bin_id} className="py-2.5 flex items-center justify-between">
                <div><div className="text-sm font-medium">{b.bin_name}</div><div className="text-[11px] text-slate-500 font-mono">{b.bin_id} · {b.route} · {b.ward}</div></div>
                <span className="text-[11px] text-slate-500">{b.place}</span>
              </li>
            ))}
            {existing.length === 0 && <li className="py-4 text-center text-slate-500 text-sm">None yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Input({ label, v, on, err, type = "text" }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input type={type} value={v} onChange={on}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${err ? "border-rose-300 focus:ring-rose-200" : "border-slate-200 focus:ring-emerald-200"}`} />
      {err && <span className="text-[10px] text-rose-500">{err}</span>}
    </label>
  );
}