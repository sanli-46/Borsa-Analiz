import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, BarChart, LineChart,
  ReferenceDot, Legend,
} from "recharts";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  XCircle, Info, Activity, BarChart2, Target, Layers,
} from "lucide-react";

type AnalysisData = {
  symbol: string;
  currentPrice: number;
  trend: "uptrend" | "downtrend" | "sideways";
  overallSignal: string;
  buyCount: number;
  sellCount: number;
  neutralCount: number;
  currentRsi: number | null;
  currentAtr: number | null;
  atrPercent: number | null;
  signals: { name: string; value: string; signal: "buy" | "sell" | "neutral"; detail: string }[];
  patterns: { name: string; nameTr: string; type: "bullish" | "bearish" | "neutral"; confidence: number; description: string; startDate: string; endDate: string }[];
  swingHighs: { date: string; price: number; index: number }[];
  swingLows: { date: string; price: number; index: number }[];
  support: number[];
  resistance: number[];
  fibonacci: { trend: string; high: number; low: number; levels: { ratio: number; label: string; price: number }[] };
  pivotPoints: { pivot: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
  chartData: {
    date: string; open: number; high: number; low: number; close: number; volume: number;
    sma20: number | null; sma50: number | null; sma200: number | null;
    ema20: number | null; ema50: number | null;
    bb_upper: number | null; bb_middle: number | null; bb_lower: number | null;
    rsi: number | null; stoch_k: number | null; stoch_d: number | null;
    macd: number | null; macd_signal: number | null; macd_hist: number | null;
    atr: number | null;
  }[];
};

function useAnalysis(symbol: string, period = "6mo") {
  return useQuery<AnalysisData>({
    queryKey: ["analysis", symbol, period],
    queryFn: async () => {
      const res = await fetch(`/api/stock/analysis/${encodeURIComponent(symbol)}?period=${period}`);
      if (!res.ok) throw new Error("Analiz verisi alınamadı");
      return res.json();
    },
    staleTime: 120000,
  });
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 11 },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
  itemStyle: { fontFamily: "var(--font-mono)" },
};

const CHART_PERIODS = [
  { label: "3A", value: "3mo" },
  { label: "6A", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
];

import { useState } from "react";

export function AnalysisPanel({ symbol, currency }: { symbol: string; currency?: string }) {
  const [period, setPeriod] = useState("6mo");
  const [showBB, setShowBB] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  const { data, isLoading, error } = useAnalysis(symbol, period);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <div className="p-8 text-center text-destructive">Analiz verisi yüklenemedi.</div>;
  }

  const { chartData, signals, patterns, support, resistance, fibonacci, pivotPoints,
    overallSignal, buyCount, sellCount, neutralCount, trend } = data;

  const cur = currency || "USD";
  const fmt = (v: number) => formatCurrency(v, cur);
  const fmtD = (d: string) => {
    try { return new Date(d).toLocaleDateString("tr-TR", { month: "short", day: "numeric" }); }
    catch { return d; }
  };

  // Subsample chart data for performance
  const step = chartData.length > 200 ? Math.ceil(chartData.length / 200) : 1;
  const chartSample = chartData.filter((_, i) => i % step === 0);
  const displayData = chartSample.map(d => ({ ...d, dateStr: fmtD(d.date) }));

  // Signal colors
  const signalColor = overallSignal.includes("AL") ? "text-green-400" : overallSignal === "SAT" || overallSignal === "GÜÇLÜ SAT" ? "text-red-400" : "text-yellow-400";
  const trendIcon = trend === "uptrend" ? <TrendingUp className="w-4 h-4 text-green-400" /> : trend === "downtrend" ? <TrendingDown className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-yellow-400" />;
  const trendLabel = trend === "uptrend" ? "Yükselen Trend" : trend === "downtrend" ? "Düşen Trend" : "Yatay Seyir";

  const swingHighSet = new Set(data.swingHighs.map(h => h.date));
  const swingLowSet = new Set(data.swingLows.map(l => l.date));

  return (
    <div className="space-y-6">

      {/* === SIGNAL DASHBOARD === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 col-span-2 md:col-span-1 flex flex-col items-center justify-center gap-1">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Genel Sinyal</div>
          <div className={`text-2xl font-black tracking-tight ${signalColor}`}>{overallSignal}</div>
          <div className="flex gap-2 mt-1">
            <span className="text-xs text-green-400 font-mono">{buyCount} AL</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-yellow-400 font-mono">{neutralCount} NÖTR</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-red-400 font-mono">{sellCount} SAT</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center justify-center gap-1">
          <div className="text-xs text-muted-foreground">Trend</div>
          <div className="flex items-center gap-1.5 font-semibold text-sm">{trendIcon}{trendLabel}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center justify-center gap-1">
          <div className="text-xs text-muted-foreground">RSI (14)</div>
          <div className={`text-xl font-bold font-mono ${data.currentRsi != null && data.currentRsi > 70 ? "text-red-400" : data.currentRsi != null && data.currentRsi < 30 ? "text-green-400" : "text-foreground"}`}>
            {data.currentRsi?.toFixed(1) ?? "-"}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.currentRsi != null && data.currentRsi > 70 ? "Aşırı Alım" : data.currentRsi != null && data.currentRsi < 30 ? "Aşırı Satım" : "Nötr"}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center justify-center gap-1">
          <div className="text-xs text-muted-foreground">ATR (14)</div>
          <div className="text-xl font-bold font-mono">{data.currentAtr ? fmt(data.currentAtr) : "-"}</div>
          <div className="text-xs text-muted-foreground">{data.atrPercent != null ? `±%${data.atrPercent.toFixed(2)} günlük dalgalanma` : ""}</div>
        </div>
      </div>

      {/* === MAIN PRICE CHART WITH OVERLAYS === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4" />Fiyat Grafiği + Göstergeler</h3>
          <div className="flex flex-wrap gap-2">
            <div className="flex bg-muted/50 rounded p-0.5 border border-border">
              {CHART_PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${period === p.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[
                { label: "BB", val: showBB, set: setShowBB, color: "text-purple-400" },
                { label: "SMA", val: showSMA, set: setShowSMA, color: "text-yellow-400" },
                { label: "EMA", val: showEMA, set: setShowEMA, color: "text-blue-400" },
                { label: "Hacim", val: showVolume, set: setShowVolume, color: "text-muted-foreground" },
              ].map(btn => (
                <button key={btn.label} onClick={() => btn.set(!btn.val)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${btn.val ? `border-current ${btn.color} bg-current/10` : "border-border text-muted-foreground"}`}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={30} />
              <YAxis orientation="right" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickFormatter={(v) => fmt(v).replace(/[^0-9.,]/g, '')} width={55} domain={["auto", "auto"]} />
              {showVolume && (
                <Bar dataKey="volume" yAxisId="vol" opacity={0.25} fill="hsl(var(--muted-foreground))" isAnimationActive={false} />
              )}
              {support.map((s, i) => (
                <ReferenceLine key={`s${i}`} y={s} stroke="#22c55e" strokeDasharray="4 3" strokeWidth={1} label={{ value: `D${i + 1}: ${fmt(s)}`, position: "insideLeft", fontSize: 9, fill: "#22c55e" }} />
              ))}
              {resistance.map((r, i) => (
                <ReferenceLine key={`r${i}`} y={r} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} label={{ value: `D${i + 1}: ${fmt(r)}`, position: "insideLeft", fontSize: 9, fill: "#ef4444" }} />
              ))}
              {showBB && <Area type="monotone" dataKey="bb_upper" stroke="#a855f7" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} name="BB Üst" />}
              {showBB && <Area type="monotone" dataKey="bb_lower" stroke="#a855f7" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} name="BB Alt" />}
              {showSMA && <Line type="monotone" dataKey="sma20" stroke="#facc15" strokeWidth={1.5} dot={false} isAnimationActive={false} name="SMA20" />}
              {showSMA && <Line type="monotone" dataKey="sma50" stroke="#fb923c" strokeWidth={1.5} dot={false} isAnimationActive={false} name="SMA50" />}
              {showEMA && <Line type="monotone" dataKey="ema20" stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} name="EMA20" strokeDasharray="5 2" />}
              {showEMA && <Line type="monotone" dataKey="ema50" stroke="#34d399" strokeWidth={1.5} dot={false} isAnimationActive={false} name="EMA50" strokeDasharray="5 2" />}
              <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#priceGrad)" dot={(props: any) => {
                const d = displayData[props.index];
                if (!d) return <g />;
                if (swingHighSet.has(d.date)) return <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1} />;
                if (swingLowSet.has(d.date)) return <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill="#22c55e" stroke="#fff" strokeWidth={1} />;
                return <g />;
              }} isAnimationActive={false} name="Fiyat" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, name: string) => [typeof v === "number" ? (name === "Hacim" ? v.toLocaleString("tr-TR") : fmt(v)) : v, name]} />
              {showVolume && <YAxis yAxisId="vol" hide domain={[0, (max: number) => max * 6]} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block rounded"></span>Destek</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block rounded"></span>Direnç</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full inline-block"></span>Swing Tepe</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full inline-block"></span>Swing Dip</span>
          {showBB && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block rounded"></span>Bollinger Bantları</span>}
          {showSMA && <><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400 inline-block rounded"></span>SMA20</span><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded"></span>SMA50</span></>}
          {showEMA && <><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block rounded" style={{borderTop: "2px dashed #60a5fa", background: "none"}}></span>EMA20</span></>}
        </div>
      </div>

      {/* === PATTERN DETECTION === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Layers className="w-4 h-4" />Formasyon Tespiti</h3>
        {patterns.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 text-center bg-muted/20 rounded-lg">Bu periyotta belirgin bir grafik formasyonu tespit edilemedi.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {patterns.map((p, i) => (
              <div key={i} className={`rounded-lg border p-4 ${p.type === "bullish" ? "border-green-500/30 bg-green-500/5" : p.type === "bearish" ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-bold text-sm">{p.nameTr}</div>
                    <div className="text-xs text-muted-foreground">{p.name}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${p.type === "bullish" ? "bg-green-500/20 text-green-400" : p.type === "bearish" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {p.type === "bullish" ? "↑ Yükselen" : p.type === "bearish" ? "↓ Düşen" : "→ Nötr"}
                    </span>
                    <div className="text-xs text-muted-foreground">Güven: %{p.confidence}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                <div className="mt-2 text-xs text-muted-foreground">{fmtD(p.startDate)} — {fmtD(p.endDate)}</div>
                {/* Confidence bar */}
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${p.type === "bullish" ? "bg-green-400" : p.type === "bearish" ? "bg-red-400" : "bg-yellow-400"}`} style={{ width: `${p.confidence}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === INDICATOR SIGNAL TABLE === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Activity className="w-4 h-4" />Gösterge Sinyalleri</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left py-2 pr-4 font-medium">Gösterge</th>
                <th className="text-right py-2 pr-4 font-medium">Değer</th>
                <th className="text-center py-2 pr-4 font-medium">Sinyal</th>
                <th className="text-left py-2 font-medium hidden md:table-cell">Yorum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {signals.map((s, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-sm">{s.value}</td>
                  <td className="py-2.5 pr-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${s.signal === "buy" ? "bg-green-500/15 text-green-400" : s.signal === "sell" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                      {s.signal === "buy" ? <CheckCircle2 className="w-3 h-3" /> : s.signal === "sell" ? <XCircle className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {s.signal === "buy" ? "AL" : s.signal === "sell" ? "SAT" : "NÖTR"}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground hidden md:table-cell">{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === RSI + STOCHASTIC CHARTS === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RSI */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">RSI (14) — Güç Endeksi</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={28} />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="2 4" strokeWidth={1} />
                <Area type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={2} fill="#a78bfa" fillOpacity={0.1} dot={false} isAnimationActive={false} name="RSI" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [typeof v === "number" ? v.toFixed(2) : v, "RSI"]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span className="text-green-400">30 = Aşırı satım</span>
            <span className="text-red-400">70 = Aşırı alım</span>
          </div>
        </div>

        {/* Stochastic */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">Stochastic (14, 3) — Momentum</h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={28} />
                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
                <Line type="monotone" dataKey="stoch_k" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} name="%K" />
                <Line type="monotone" dataKey="stoch_d" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="%D" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [typeof v === "number" ? v.toFixed(2) : v]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 text-xs mt-1">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"></span>%K (Hızlı)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block"></span>%D (Yavaş)</span>
          </div>
        </div>
      </div>

      {/* === MACD CHART === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-bold text-sm mb-3">MACD (12, 26, 9) — Trend Momentum</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} width={45} tickFormatter={(v) => v.toFixed(2)} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              <Bar dataKey="macd_hist" name="Histogram" isAnimationActive={false}>
                {displayData.map((d, i) => (
                  <Cell key={i} fill={(d.macd_hist ?? 0) >= 0 ? "#22c55e" : "#ef4444"} opacity={0.7} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="macd" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} name="MACD" />
              <Line type="monotone" dataKey="macd_signal" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Sinyal" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, name: string) => [typeof v === "number" ? v.toFixed(4) : v, name]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-3 text-xs mt-1">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block"></span>MACD</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block"></span>Sinyal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-sm inline-block"></span>Pozitif</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-sm inline-block"></span>Negatif</span>
        </div>
      </div>

      {/* === BOLLINGER BANDS CHART === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-bold text-sm mb-3">Bollinger Bantları (20, 2σ) — Volatilite</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bbFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
              <YAxis orientation="right" axisLine={false} tickLine={false}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickFormatter={(v) => fmt(v).replace(/[^0-9.,]/g, '')} width={50} domain={["auto", "auto"]} />
              <Area type="monotone" dataKey="bb_upper" stroke="#a855f7" strokeWidth={1} fill="url(#bbFill)" dot={false} isAnimationActive={false} name="BB Üst" />
              <Area type="monotone" dataKey="bb_lower" stroke="#a855f7" strokeWidth={1} fill="url(#bbFill)" dot={false} isAnimationActive={false} name="BB Alt" />
              <Line type="monotone" dataKey="bb_middle" stroke="#a855f7" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="BB Orta (SMA20)" />
              <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} name="Fiyat" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, name: string) => [typeof v === "number" ? fmt(v) : v, name]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* === VOLUME CHART === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-bold text-sm mb-3">İşlem Hacmi</h3>
        <div style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={displayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={35}
                tickFormatter={(v) => v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
              <Bar dataKey="volume" name="Hacim" isAnimationActive={false}>
                {displayData.map((d, i) => (
                  <Cell key={i} fill={d.close >= d.open ? "#22c55e" : "#ef4444"} opacity={0.6} />
                ))}
              </Bar>
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [typeof v === "number" ? v.toLocaleString("tr-TR") : v, "Hacim"]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-3 text-xs mt-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-sm inline-block"></span>Yükselen gün</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-sm inline-block"></span>Düşen gün</span>
        </div>
      </div>

      {/* === SUPPORT/RESISTANCE + FIBONACCI + PIVOT GRID === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Support / Resistance */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Target className="w-4 h-4" />Destek & Direnç</h3>
          <div className="space-y-1.5">
            {[...resistance].reverse().map((r, i) => (
              <div key={`r${i}`} className="flex justify-between items-center py-1.5 px-3 rounded bg-red-500/10 border border-red-500/20">
                <span className="text-xs text-red-400 font-medium">Direnç {resistance.length - i}</span>
                <span className="font-mono text-sm font-semibold text-red-400">{fmt(r)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center py-1.5 px-3 rounded bg-primary/10 border border-primary/30">
              <span className="text-xs text-primary font-medium">Mevcut Fiyat</span>
              <span className="font-mono text-sm font-bold text-primary">{fmt(data.currentPrice)}</span>
            </div>
            {support.map((s, i) => (
              <div key={`s${i}`} className="flex justify-between items-center py-1.5 px-3 rounded bg-green-500/10 border border-green-500/20">
                <span className="text-xs text-green-400 font-medium">Destek {i + 1}</span>
                <span className="font-mono text-sm font-semibold text-green-400">{fmt(s)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fibonacci */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
            <Info className="w-4 h-4" />Fibonacci Geri Çekilme
          </h3>
          <div className="text-xs text-muted-foreground mb-3">
            Yön: {fibonacci.trend === "up" ? "↑ Yükselen" : "↓ Düşen"} · Aralık: {fmt(fibonacci.low)} — {fmt(fibonacci.high)}
          </div>
          <div className="space-y-1">
            {fibonacci.levels.map((l, i) => {
              const isNear = Math.abs(l.price - data.currentPrice) / data.currentPrice < 0.02;
              return (
                <div key={i} className={`flex justify-between items-center py-1 px-2 rounded text-xs ${isNear ? "bg-primary/15 border border-primary/30" : ""}`}>
                  <span className="text-muted-foreground font-medium">{l.label}</span>
                  <span className={`font-mono font-semibold ${isNear ? "text-primary" : ""}`}>{fmt(l.price)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pivot Points */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">Pivot Noktaları (Klasik)</h3>
          <div className="space-y-1.5">
            {[
              { label: "R3", val: pivotPoints.r3, color: "text-red-600" },
              { label: "R2", val: pivotPoints.r2, color: "text-red-500" },
              { label: "R1", val: pivotPoints.r1, color: "text-red-400" },
              { label: "Pivot", val: pivotPoints.pivot, color: "text-primary", bold: true },
              { label: "S1", val: pivotPoints.s1, color: "text-green-400" },
              { label: "S2", val: pivotPoints.s2, color: "text-green-500" },
              { label: "S3", val: pivotPoints.s3, color: "text-green-600" },
            ].map(p => (
              <div key={p.label} className={`flex justify-between items-center py-1 px-2 rounded text-sm ${p.bold ? "bg-muted/30 font-bold" : ""}`}>
                <span className={`font-medium text-xs ${p.color}`}>{p.label}</span>
                <span className={`font-mono ${p.color} ${p.bold ? "font-bold" : ""}`}>{fmt(p.val)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === SWING HIGHS/LOWS TABLE === */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-bold text-sm mb-3">Son Swing Noktaları (Min/Max)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Swing Tepeler (Max)</div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b border-border"><th className="text-left py-1">Tarih</th><th className="text-right py-1">Fiyat</th></tr></thead>
              <tbody>
                {data.swingHighs.slice().reverse().map((h, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 text-muted-foreground text-xs">{fmtD(h.date)}</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-red-400">{fmt(h.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Swing Dipler (Min)</div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b border-border"><th className="text-left py-1">Tarih</th><th className="text-right py-1">Fiyat</th></tr></thead>
              <tbody>
                {data.swingLows.slice().reverse().map((l, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 text-muted-foreground text-xs">{fmtD(l.date)}</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-green-400">{fmt(l.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
