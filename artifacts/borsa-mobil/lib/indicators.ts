/**
 * Tamamen client-side teknik analiz hesaplamaları.
 * Yahoo'dan gelen geçmiş mum verisi üzerinde RSI, SMA, EMA, MACD, BB, ATR,
 * Stochastic ile destek/direnç, Fibonacci, pivot ve basit formasyon tespiti.
 */

import type { Candle } from "@/lib/yahoo";

export type Signal = "buy" | "sell" | "neutral";

export interface IndicatorSignal {
  name: string;
  value: string;
  signal: Signal;
  detail: string;
}

export interface Pattern {
  name: string;
  nameTr: string;
  type: "bullish" | "bearish" | "neutral";
  confidence: number;
  description: string;
  startDate: string;
  endDate: string;
}

export interface ChartRow {
  date: string; // ISO
  close: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  rsi: number | null;
  stoch_k: number | null;
  stoch_d: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
}

export interface AnalysisData {
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
  signals: IndicatorSignal[];
  patterns: Pattern[];
  support: number[];
  resistance: number[];
  fibonacci: {
    trend: "up" | "down";
    high: number;
    low: number;
    levels: { ratio: number; label: string; price: number }[];
  };
  pivotPoints: {
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  };
  chartData: ChartRow[];
}

export interface Summary {
  overallSignal: string;
  analystRating?: string;
  weeklyChange: number | null;
  monthlyChange: number | null;
  yearlyChange: number | null;
  currentRsi: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
  volatility: number | null;
}

// ---- Temel hesaplama yardımcıları ----

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period - 1) continue;
    if (prev == null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j]!;
      prev = s / period;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

function stdev(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j]!;
    mean /= period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j]! - mean;
      v += d * d;
    }
    out[i] = Math.sqrt(v / period);
  }
  return out;
}

function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function macd(values: number[]): {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
} {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const macdLine: (number | null)[] = values.map((_, i) => {
    const a = e12[i];
    const b = e26[i];
    return a != null && b != null ? a - b : null;
  });
  const validMacd = macdLine.map((v) => (v == null ? 0 : v));
  const startIdx = macdLine.findIndex((v) => v != null);
  const sigArrInput = validMacd.slice(Math.max(startIdx, 0));
  const sig = ema(sigArrInput, 9);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < sig.length; i++) signal[i + Math.max(startIdx, 0)] = sig[i] ?? null;
  const hist: (number | null)[] = macdLine.map((m, i) => {
    const s = signal[i];
    return m != null && s != null ? m - s : null;
  });
  return { macd: macdLine, signal, hist };
}

function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    const c = candles[i]!.close;
    k[i] = hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100;
  }
  const kVals = k.map((v) => (v == null ? 0 : v));
  const startIdx = k.findIndex((v) => v != null);
  const dRaw = sma(kVals.slice(Math.max(startIdx, 0)), dPeriod);
  const d: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = 0; i < dRaw.length; i++) d[i + Math.max(startIdx, 0)] = dRaw[i] ?? null;
  return { k, d };
}

function atr(candles: Candle[], period = 14): (number | null)[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) {
      trs.push(c.high - c.low);
    } else {
      const prev = candles[i - 1]!.close;
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
    }
  }
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (trs.length < period) return out;
  let avg = 0;
  for (let i = 0; i < period; i++) avg += trs[i]!;
  avg /= period;
  out[period - 1] = avg;
  for (let i = period; i < trs.length; i++) {
    avg = (avg * (period - 1) + trs[i]!) / period;
    out[i] = avg;
  }
  return out;
}

// ---- Üst seviye hesaplama ----

function detectTrend(closes: number[], sma50: (number | null)[], sma200: (number | null)[]):
  | "uptrend"
  | "downtrend"
  | "sideways" {
  const n = closes.length - 1;
  const last = closes[n]!;
  const m50 = sma50[n];
  const m200 = sma200[n];
  if (m50 != null && m200 != null) {
    if (last > m50 && m50 > m200) return "uptrend";
    if (last < m50 && m50 < m200) return "downtrend";
  } else if (m50 != null) {
    if (last > m50 * 1.02) return "uptrend";
    if (last < m50 * 0.98) return "downtrend";
  }
  return "sideways";
}

function findExtrema(candles: Candle[], window = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = window; i < candles.length - window; i++) {
    let isH = true;
    let isL = true;
    for (let j = 1; j <= window; j++) {
      if (candles[i]!.high <= candles[i - j]!.high || candles[i]!.high <= candles[i + j]!.high) isH = false;
      if (candles[i]!.low >= candles[i - j]!.low || candles[i]!.low >= candles[i + j]!.low) isL = false;
    }
    if (isH) highs.push(candles[i]!.high);
    if (isL) lows.push(candles[i]!.low);
  }
  return { highs, lows };
}

function dedupNearby(values: number[], tolerance = 0.015): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last == null || Math.abs(v - last) / last > tolerance) out.push(v);
  }
  return out;
}

function detectPatterns(candles: Candle[]): Pattern[] {
  const out: Pattern[] = [];
  if (candles.length < 30) return out;

  const last = candles[candles.length - 1]!;
  const closes = candles.map((c) => c.close);
  const recent = closes.slice(-20);
  const minR = Math.min(...recent);
  const maxR = Math.max(...recent);
  const range = maxR - minR;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const stdR = Math.sqrt(recent.reduce((s, v) => s + (v - avg) ** 2, 0) / recent.length);

  // Yatay konsolidasyon
  if (range / avg < 0.05) {
    out.push({
      name: "Tight Consolidation",
      nameTr: "Sıkışma / Konsolidasyon",
      type: "neutral",
      confidence: 70,
      description: "Fiyat dar bir bantta sıkışıyor; yön kararı yakın olabilir.",
      startDate: new Date(candles[candles.length - 20]!.date * 1000).toISOString(),
      endDate: new Date(last.date * 1000).toISOString(),
    });
  }

  // Yükselen / düşen kanal (basit eğim)
  const first10 = closes.slice(-30, -20);
  const last10 = closes.slice(-10);
  if (first10.length === 10 && last10.length === 10) {
    const f = first10.reduce((a, b) => a + b, 0) / 10;
    const l = last10.reduce((a, b) => a + b, 0) / 10;
    const slope = (l - f) / f;
    if (slope > 0.05) {
      out.push({
        name: "Uptrend Channel",
        nameTr: "Yükselen Kanal",
        type: "bullish",
        confidence: Math.min(90, Math.round(slope * 600)),
        description: "Son periyotta yüksek tabanlar; alıcı baskısı sürüyor.",
        startDate: new Date(candles[candles.length - 30]!.date * 1000).toISOString(),
        endDate: new Date(last.date * 1000).toISOString(),
      });
    } else if (slope < -0.05) {
      out.push({
        name: "Downtrend Channel",
        nameTr: "Düşen Kanal",
        type: "bearish",
        confidence: Math.min(90, Math.round(-slope * 600)),
        description: "Düşük tepeler ve dipler; satıcı baskısı sürüyor.",
        startDate: new Date(candles[candles.length - 30]!.date * 1000).toISOString(),
        endDate: new Date(last.date * 1000).toISOString(),
      });
    }
  }

  // Çift dip / çift tepe (kaba)
  const ext = findExtrema(candles.slice(-60), 3);
  if (ext.lows.length >= 2) {
    const sorted = [...ext.lows].sort((a, b) => a - b).slice(0, 2);
    if (sorted.length === 2 && Math.abs(sorted[0]! - sorted[1]!) / sorted[0]! < 0.02 && last.close > avg) {
      out.push({
        name: "Double Bottom",
        nameTr: "Çift Dip",
        type: "bullish",
        confidence: 65,
        description: "Yakın seviyelerde iki dip oluştu; yükselişe dönüş sinyali.",
        startDate: new Date(candles[Math.max(candles.length - 60, 0)]!.date * 1000).toISOString(),
        endDate: new Date(last.date * 1000).toISOString(),
      });
    }
  }
  if (ext.highs.length >= 2) {
    const sorted = [...ext.highs].sort((a, b) => b - a).slice(0, 2);
    if (sorted.length === 2 && Math.abs(sorted[0]! - sorted[1]!) / sorted[0]! < 0.02 && last.close < avg) {
      out.push({
        name: "Double Top",
        nameTr: "Çift Tepe",
        type: "bearish",
        confidence: 65,
        description: "Yakın seviyelerde iki tepe oluştu; düşüşe dönüş sinyali.",
        startDate: new Date(candles[Math.max(candles.length - 60, 0)]!.date * 1000).toISOString(),
        endDate: new Date(last.date * 1000).toISOString(),
      });
    }
  }

  // Yüksek volatilite
  if (stdR / avg > 0.05) {
    out.push({
      name: "High Volatility",
      nameTr: "Yüksek Oynaklık",
      type: "neutral",
      confidence: 55,
      description: "Son 20 mumda volatilite yüksek; pozisyon büyüklüğüne dikkat.",
      startDate: new Date(candles[candles.length - 20]!.date * 1000).toISOString(),
      endDate: new Date(last.date * 1000).toISOString(),
    });
  }

  return out;
}

export function analyze(symbol: string, candles: Candle[]): AnalysisData {
  const closes = candles.map((c) => c.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const std20 = stdev(closes, 20);
  const bbU = sma20.map((m, i) => (m != null && std20[i] != null ? m + 2 * std20[i]! : null));
  const bbL = sma20.map((m, i) => (m != null && std20[i] != null ? m - 2 * std20[i]! : null));
  const rsiArr = rsi(closes, 14);
  const macdRes = macd(closes);
  const stoch = stochastic(candles, 14, 3);
  const atrArr = atr(candles, 14);

  const n = candles.length - 1;
  const price = closes[n]!;
  const trend = detectTrend(closes, sma50, sma200);

  const signals: IndicatorSignal[] = [];

  // RSI sinyali
  const r = rsiArr[n];
  if (r != null) {
    let s: Signal = "neutral";
    let detail = "RSI nötr bölgede.";
    if (r > 70) {
      s = "sell";
      detail = "Aşırı alım bölgesinde, geri çekilme riski.";
    } else if (r < 30) {
      s = "buy";
      detail = "Aşırı satım bölgesinde, tepki alımı olasılığı.";
    } else if (r > 50) {
      s = "buy";
      detail = "RSI 50 üstü, alıcılar lehine.";
    } else {
      s = "sell";
      detail = "RSI 50 altı, satıcılar lehine.";
    }
    signals.push({ name: "RSI (14)", value: r.toFixed(1), signal: s, detail });
  }

  // MACD sinyali
  const m = macdRes.macd[n];
  const ms = macdRes.signal[n];
  const mh = macdRes.hist[n];
  if (m != null && ms != null && mh != null) {
    const s: Signal = mh > 0 ? "buy" : mh < 0 ? "sell" : "neutral";
    signals.push({
      name: "MACD",
      value: mh.toFixed(2),
      signal: s,
      detail:
        mh > 0
          ? "MACD sinyalin üstünde, momentum pozitif."
          : "MACD sinyalin altında, momentum negatif.",
    });
  }

  // SMA 50/200 sinyali
  const m50 = sma50[n];
  const m200 = sma200[n];
  if (m50 != null) {
    const s: Signal = price > m50 ? "buy" : "sell";
    signals.push({
      name: "Fiyat / SMA 50",
      value: ((price / m50 - 1) * 100).toFixed(2) + "%",
      signal: s,
      detail: price > m50 ? "Fiyat 50 günlük ortalamanın üstünde." : "Fiyat 50 günlük ortalamanın altında.",
    });
  }
  if (m200 != null) {
    const s: Signal = price > m200 ? "buy" : "sell";
    signals.push({
      name: "Fiyat / SMA 200",
      value: ((price / m200 - 1) * 100).toFixed(2) + "%",
      signal: s,
      detail: price > m200 ? "Uzun vadeli trend yukarı." : "Uzun vadeli trend aşağı.",
    });
  }
  if (m50 != null && m200 != null) {
    const s: Signal = m50 > m200 ? "buy" : "sell";
    signals.push({
      name: "Golden/Death Cross",
      value: m50 > m200 ? "Golden" : "Death",
      signal: s,
      detail: m50 > m200 ? "SMA 50, SMA 200 üstünde (golden cross)." : "SMA 50, SMA 200 altında (death cross).",
    });
  }

  // Bollinger sinyali
  const bu = bbU[n];
  const bl = bbL[n];
  if (bu != null && bl != null) {
    let s: Signal = "neutral";
    let detail = "Fiyat bant içinde.";
    if (price > bu) {
      s = "sell";
      detail = "Fiyat üst bandı kırdı, geri çekilme riski.";
    } else if (price < bl) {
      s = "buy";
      detail = "Fiyat alt bandı kırdı, tepki alımı olasılığı.";
    }
    signals.push({
      name: "Bollinger Bands",
      value: ((price - (bu + bl) / 2) / ((bu - bl) / 2 || 1)).toFixed(2),
      signal: s,
      detail,
    });
  }

  // Stokastik
  const sk = stoch.k[n];
  const sd = stoch.d[n];
  if (sk != null && sd != null) {
    let s: Signal = "neutral";
    let detail = "Stokastik nötr.";
    if (sk > 80 && sd > 80) {
      s = "sell";
      detail = "Stokastik aşırı alım.";
    } else if (sk < 20 && sd < 20) {
      s = "buy";
      detail = "Stokastik aşırı satım.";
    } else if (sk > sd) {
      s = "buy";
      detail = "%K, %D üstünde, momentum yukarı.";
    } else {
      s = "sell";
      detail = "%K, %D altında, momentum aşağı.";
    }
    signals.push({ name: "Stochastic", value: `${sk.toFixed(1)}/${sd.toFixed(1)}`, signal: s, detail });
  }

  const buyCount = signals.filter((s) => s.signal === "buy").length;
  const sellCount = signals.filter((s) => s.signal === "sell").length;
  const neutralCount = signals.filter((s) => s.signal === "neutral").length;
  const total = signals.length || 1;
  let overallSignal = "NÖTR";
  const buyPct = buyCount / total;
  const sellPct = sellCount / total;
  if (buyPct >= 0.7) overallSignal = "GÜÇLÜ AL";
  else if (buyPct >= 0.55) overallSignal = "AL";
  else if (sellPct >= 0.7) overallSignal = "GÜÇLÜ SAT";
  else if (sellPct >= 0.55) overallSignal = "SAT";

  // Destek / direnç
  const lookback = candles.slice(-90);
  const ext = findExtrema(lookback, 3);
  const supportRaw = dedupNearby(ext.lows.filter((v) => v < price));
  const resistanceRaw = dedupNearby(ext.highs.filter((v) => v > price));
  const support = supportRaw.slice(-3); // en yakın 3
  const resistance = resistanceRaw.slice(0, 3);

  // Fibonacci
  const recent = candles.slice(-90);
  const recentHigh = Math.max(...recent.map((c) => c.high));
  const recentLow = Math.min(...recent.map((c) => c.low));
  const idxHigh = recent.findIndex((c) => c.high === recentHigh);
  const idxLow = recent.findIndex((c) => c.low === recentLow);
  const fibTrend: "up" | "down" = idxHigh > idxLow ? "up" : "down";
  const fibRange = recentHigh - recentLow;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const fibLevels = ratios.map((r) => {
    const price =
      fibTrend === "up" ? recentHigh - fibRange * r : recentLow + fibRange * r;
    return { ratio: r, label: `${(r * 100).toFixed(1)}%`, price };
  });

  // Pivot
  const lastBar = candles[n]!;
  const pivot = (lastBar.high + lastBar.low + lastBar.close) / 3;
  const r1 = 2 * pivot - lastBar.low;
  const s1 = 2 * pivot - lastBar.high;
  const r2 = pivot + (lastBar.high - lastBar.low);
  const s2 = pivot - (lastBar.high - lastBar.low);
  const r3 = lastBar.high + 2 * (pivot - lastBar.low);
  const s3 = lastBar.low - 2 * (lastBar.high - pivot);

  // ATR
  const a = atrArr[n];
  const atrPercent = a != null && price ? (a / price) * 100 : null;

  // Chart data
  const chartData: ChartRow[] = candles.map((c, i) => ({
    date: new Date(c.date * 1000).toISOString(),
    close: c.close,
    sma20: sma20[i] ?? null,
    sma50: sma50[i] ?? null,
    sma200: sma200[i] ?? null,
    ema20: ema20[i] ?? null,
    ema50: ema50[i] ?? null,
    bb_upper: bbU[i] ?? null,
    bb_lower: bbL[i] ?? null,
    rsi: rsiArr[i] ?? null,
    stoch_k: stoch.k[i] ?? null,
    stoch_d: stoch.d[i] ?? null,
    macd: macdRes.macd[i] ?? null,
    macd_signal: macdRes.signal[i] ?? null,
    macd_hist: macdRes.hist[i] ?? null,
  }));

  return {
    symbol,
    currentPrice: price,
    trend,
    overallSignal,
    buyCount,
    sellCount,
    neutralCount,
    currentRsi: r ?? null,
    currentAtr: a ?? null,
    atrPercent,
    signals,
    patterns: detectPatterns(candles),
    support,
    resistance,
    fibonacci: {
      trend: fibTrend,
      high: recentHigh,
      low: recentLow,
      levels: fibLevels,
    },
    pivotPoints: { pivot, r1, r2, r3, s1, s2, s3 },
    chartData,
  };
}

export function summarize(candles: Candle[]): Summary {
  if (candles.length === 0) {
    return {
      overallSignal: "NÖTR",
      weeklyChange: null,
      monthlyChange: null,
      yearlyChange: null,
      currentRsi: null,
      priceVsSma50: null,
      priceVsSma200: null,
      volatility: null,
    };
  }
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  const pct = (idx: number) => {
    const ref = closes[Math.max(0, closes.length - 1 - idx)];
    return ref ? ((last - ref) / ref) * 100 : null;
  };
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsiArr = rsi(closes, 14);
  const lastSma50 = sma50[sma50.length - 1] ?? null;
  const lastSma200 = sma200[sma200.length - 1] ?? null;

  // 30 günlük volatilite (std/mean * sqrt(252))
  const tail = closes.slice(-30);
  let vol: number | null = null;
  if (tail.length > 5) {
    const rets: number[] = [];
    for (let i = 1; i < tail.length; i++) rets.push(Math.log(tail[i]! / tail[i - 1]!));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / rets.length;
    vol = Math.sqrt(v) * Math.sqrt(252) * 100;
  }

  // Genel sinyal: analyze ile aynı yaklaşımla kısa
  const signals: Signal[] = [];
  const r = rsiArr[rsiArr.length - 1];
  if (r != null) signals.push(r > 70 ? "sell" : r < 30 ? "buy" : r > 50 ? "buy" : "sell");
  if (lastSma50) signals.push(last > lastSma50 ? "buy" : "sell");
  if (lastSma200) signals.push(last > lastSma200 ? "buy" : "sell");
  const buy = signals.filter((s) => s === "buy").length;
  const sell = signals.filter((s) => s === "sell").length;
  let overall = "NÖTR";
  if (buy >= 2 && sell === 0) overall = "AL";
  else if (sell >= 2 && buy === 0) overall = "SAT";
  else if (buy > sell) overall = "AL EĞİLİMİ";
  else if (sell > buy) overall = "SAT EĞİLİMİ";

  return {
    overallSignal: overall,
    weeklyChange: pct(5),
    monthlyChange: pct(21),
    yearlyChange: pct(252),
    currentRsi: r ?? null,
    priceVsSma50: lastSma50 ? ((last - lastSma50) / lastSma50) * 100 : null,
    priceVsSma200: lastSma200 ? ((last - lastSma200) / lastSma200) * 100 : null,
    volatility: vol,
  };
}
