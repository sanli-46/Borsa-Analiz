import { Router, type IRouter } from "express";
import YahooFinanceClass from "yahoo-finance2";
import {
  SearchStocksQueryParams,
  GetStockQuoteParams,
  GetStockHistoryParams,
  GetStockHistoryQueryParams,
  GetStockFinancialsParams,
  GetStockIndicatorsParams,
  GetStockIndicatorsQueryParams,
  GetStockNewsParams,
  GetStockSummaryParams,
} from "@workspace/api-zod";
import { heavyLimiter, watchlistLimiter } from "../lib/rate-limit";
import { analysisCache, summaryCache, watchlistCache } from "../lib/cache";

const yahooFinance = new YahooFinanceClass();
const router: IRouter = Router();

const UPSTREAM_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new Error("Upstream request timed out")),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(handle));
}

const ALLOWED_ANALYSIS_PERIODS = new Set([
  "1mo", "3mo", "6mo", "1y", "2y", "5y",
]);

function formatNumber(n: unknown): number | undefined {
  if (n == null || typeof n !== "number" || isNaN(n)) return undefined;
  return n;
}

// Calculate SMA
function calculateSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

// Calculate EMA
function calculateEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(ema);
    } else {
      ema = prices[i] * k + (ema! * (1 - k));
      result.push(ema);
    }
  }
  return result;
}

// Calculate RSI
function calculateRSI(prices: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];

  if (prices.length < period + 1) {
    return prices.map(() => null);
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push(rsi);

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push(rsiVal);
  }

  return result;
}

// Calculate MACD
function calculateMACD(
  prices: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number | null; signal: number | null; histogram: number | null }[] {
  const ema12 = calculateEMA(prices, fast);
  const ema26 = calculateEMA(prices, slow);

  const macdLine: (number | null)[] = ema12.map((e12, i) => {
    const e26 = ema26[i];
    if (e12 == null || e26 == null) return null;
    return e12 - e26;
  });

  const macdValues = macdLine.filter((v): v is number => v != null);
  const signalEma = calculateEMA(macdValues, signal);

  let sigIdx = 0;
  const signalLine: (number | null)[] = macdLine.map((v) => {
    if (v == null) return null;
    return signalEma[sigIdx++] ?? null;
  });

  return macdLine.map((macd, i) => {
    const sig = signalLine[i];
    return {
      macd,
      signal: sig,
      histogram: macd != null && sig != null ? macd - sig : null,
    };
  });
}

// Calculate Bollinger Bands
function calculateBollingerBands(
  prices: number[],
  period = 20,
  stdDev = 2
): { upper: number | null; middle: number | null; lower: number | null }[] {
  const sma = calculateSMA(prices, period);

  return prices.map((price, i) => {
    const middle = sma[i];
    if (middle == null) return { upper: null, middle: null, lower: null };

    const slice = prices.slice(Math.max(0, i - period + 1), i + 1);
    const variance =
      slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
    const sd = Math.sqrt(variance);

    return {
      upper: middle + stdDev * sd,
      middle,
      lower: middle - stdDev * sd,
    };
  });
}

// Calculate Stochastic Oscillator
function calculateStochastic(
  highs: number[], lows: number[], closes: number[], kPeriod = 14, dPeriod = 3
): { k: number | null; d: number | null }[] {
  const kValues: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) { kValues.push(null); continue; }
    const slice_h = highs.slice(i - kPeriod + 1, i + 1);
    const slice_l = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice_h);
    const lowestLow = Math.min(...slice_l);
    const k = highestHigh === lowestLow ? 50 : ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
  }
  const dValues: (number | null)[] = [];
  for (let i = 0; i < kValues.length; i++) {
    const validK = kValues.slice(Math.max(0, i - dPeriod + 1), i + 1).filter((v): v is number => v != null);
    dValues.push(validK.length === dPeriod ? validK.reduce((a, b) => a + b, 0) / dPeriod : null);
  }
  return kValues.map((k, i) => ({ k, d: dValues[i] }));
}

// Calculate ATR
function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const trValues: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { trValues.push(highs[0] - lows[0]); continue; }
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trValues.push(tr);
  }
  const result: (number | null)[] = [];
  let atr: number | null = null;
  for (let i = 0; i < trValues.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) { atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period; }
    else { atr = ((atr! * (period - 1)) + trValues[i]) / period; }
    result.push(atr);
  }
  return result;
}

// Find swing highs and lows
function findSwingPoints(highs: number[], lows: number[], dates: string[], lookback = 3) {
  const swingHighs: { date: string; price: number; index: number }[] = [];
  const swingLows: { date: string; price: number; index: number }[] = [];
  for (let i = lookback; i < highs.length - lookback; i++) {
    const isSwingHigh = highs.slice(i - lookback, i).every(h => h <= highs[i]) &&
      highs.slice(i + 1, i + lookback + 1).every(h => h <= highs[i]);
    const isSwingLow = lows.slice(i - lookback, i).every(l => l >= lows[i]) &&
      lows.slice(i + 1, i + lookback + 1).every(l => l >= lows[i]);
    if (isSwingHigh) swingHighs.push({ date: dates[i], price: highs[i], index: i });
    if (isSwingLow) swingLows.push({ date: dates[i], price: lows[i], index: i });
  }
  return { swingHighs, swingLows };
}

// Cluster support/resistance levels
function clusterLevels(points: number[], currentPrice: number, tolerance = 0.025): number[] {
  const clusters: number[][] = [];
  for (const p of points) {
    const existing = clusters.find(c => Math.abs(c[0] - p) / currentPrice < tolerance);
    if (existing) existing.push(p);
    else clusters.push([p]);
  }
  return clusters
    .filter(c => c.length >= 1)
    .map(c => c.reduce((a, b) => a + b, 0) / c.length)
    .sort((a, b) => a - b);
}

// Detect chart patterns
function detectPatterns(
  swingHighs: { date: string; price: number; index: number }[],
  swingLows: { date: string; price: number; index: number }[],
  closes: number[],
  dates: string[]
): { name: string; nameTr: string; type: "bullish" | "bearish" | "neutral"; confidence: number; description: string; startDate: string; endDate: string }[] {
  const patterns: { name: string; nameTr: string; type: "bullish" | "bearish" | "neutral"; confidence: number; description: string; startDate: string; endDate: string }[] = [];
  const recentHighs = swingHighs.slice(-5);
  const recentLows = swingLows.slice(-5);

  // Double Top
  if (recentHighs.length >= 2) {
    const [h1, h2] = recentHighs.slice(-2);
    const diff = Math.abs(h1.price - h2.price) / h1.price;
    if (diff < 0.03 && h2.index > h1.index) {
      const lowBetween = recentLows.find(l => l.index > h1.index && l.index < h2.index);
      if (lowBetween && (h1.price - lowBetween.price) / h1.price > 0.04) {
        patterns.push({ name: "Double Top", nameTr: "Çift Tepe", type: "bearish", confidence: Math.round((1 - diff / 0.03) * 100 * 0.8), description: "İki benzer zirve oluşmuştur. Fiyatın düşmesi beklenir.", startDate: h1.date, endDate: h2.date });
      }
    }
  }

  // Double Bottom
  if (recentLows.length >= 2) {
    const [l1, l2] = recentLows.slice(-2);
    const diff = Math.abs(l1.price - l2.price) / l1.price;
    if (diff < 0.03 && l2.index > l1.index) {
      const highBetween = recentHighs.find(h => h.index > l1.index && h.index < l2.index);
      if (highBetween && (highBetween.price - l1.price) / l1.price > 0.04) {
        patterns.push({ name: "Double Bottom", nameTr: "Çift Dip", type: "bullish", confidence: Math.round((1 - diff / 0.03) * 100 * 0.8), description: "İki benzer dip oluşmuştur. Fiyatın yükselmesi beklenir.", startDate: l1.date, endDate: l2.date });
      }
    }
  }

  // Head and Shoulders
  if (recentHighs.length >= 3) {
    const [left, head, right] = recentHighs.slice(-3);
    const shoulderDiff = Math.abs(left.price - right.price) / left.price;
    if (head.price > left.price && head.price > right.price && shoulderDiff < 0.05) {
      patterns.push({ name: "Head & Shoulders", nameTr: "Baş ve Omuzlar", type: "bearish", confidence: Math.round((1 - shoulderDiff / 0.05) * 85), description: "Klasik dönüş formasyonu. Sol omuz, baş ve sağ omuz oluşmuştur. Düşüş sinyali.", startDate: left.date, endDate: right.date });
    }
  }

  // Inverse Head and Shoulders
  if (recentLows.length >= 3) {
    const [left, head, right] = recentLows.slice(-3);
    const shoulderDiff = Math.abs(left.price - right.price) / left.price;
    if (head.price < left.price && head.price < right.price && shoulderDiff < 0.05) {
      patterns.push({ name: "Inv. Head & Shoulders", nameTr: "Ters Baş ve Omuzlar", type: "bullish", confidence: Math.round((1 - shoulderDiff / 0.05) * 85), description: "Ters dönüş formasyonu. Yükseliş sinyali verir.", startDate: left.date, endDate: right.date });
    }
  }

  // Triangle patterns (using last 20 candles trend)
  if (closes.length >= 20) {
    const recent = closes.slice(-20);
    const recentHighPrices = recentHighs.filter(h => h.index >= closes.length - 20).map(h => h.price);
    const recentLowPrices = recentLows.filter(l => l.index >= closes.length - 20).map(l => l.price);
    if (recentHighPrices.length >= 2 && recentLowPrices.length >= 2) {
      const highTrend = recentHighPrices[recentHighPrices.length - 1] - recentHighPrices[0];
      const lowTrend = recentLowPrices[recentLowPrices.length - 1] - recentLowPrices[0];
      const rangeNow = recent[recent.length - 1];
      if (highTrend < -rangeNow * 0.02 && lowTrend > rangeNow * 0.02) {
        patterns.push({ name: "Symmetrical Triangle", nameTr: "Simetrik Üçgen", type: "neutral", confidence: 72, description: "Fiyat daralan bir kanalda hareket ediyor. Kırılış yönü belirleyici olacak.", startDate: dates[closes.length - 20], endDate: dates[dates.length - 1] });
      } else if (highTrend > -rangeNow * 0.005 && lowTrend > rangeNow * 0.015) {
        patterns.push({ name: "Ascending Triangle", nameTr: "Yükselen Üçgen", type: "bullish", confidence: 68, description: "Direnç düz, dip noktaları yükseliyor. Yukarı kırılış beklenir.", startDate: dates[closes.length - 20], endDate: dates[dates.length - 1] });
      } else if (highTrend < -rangeNow * 0.015 && lowTrend < rangeNow * 0.005) {
        patterns.push({ name: "Descending Triangle", nameTr: "Alçalan Üçgen", type: "bearish", confidence: 68, description: "Destek düz, tepe noktaları alçalıyor. Aşağı kırılış beklenir.", startDate: dates[closes.length - 20], endDate: dates[dates.length - 1] });
      }
    }
  }

  // Flag/Pennant (strong move followed by consolidation)
  if (closes.length >= 15) {
    const prePeriod = closes.slice(-15, -5);
    const postPeriod = closes.slice(-5);
    const preMove = (prePeriod[prePeriod.length - 1] - prePeriod[0]) / prePeriod[0];
    const postRange = (Math.max(...postPeriod) - Math.min(...postPeriod)) / postPeriod[0];
    if (preMove > 0.06 && postRange < 0.03) {
      patterns.push({ name: "Bull Flag", nameTr: "Boğa Bayrağı", type: "bullish", confidence: 70, description: "Güçlü yükselişin ardından küçük konsolidasyon. Devam yükselmesi beklenir.", startDate: dates[closes.length - 15], endDate: dates[dates.length - 1] });
    } else if (preMove < -0.06 && postRange < 0.03) {
      patterns.push({ name: "Bear Flag", nameTr: "Ayı Bayrağı", type: "bearish", confidence: 70, description: "Güçlü düşüşün ardından küçük konsolidasyon. Düşüşün devamı beklenir.", startDate: dates[closes.length - 15], endDate: dates[dates.length - 1] });
    }
  }

  return patterns;
}

// GET /stock/analysis/:symbol — full technical analysis
router.get("/stock/analysis/:symbol", heavyLimiter, async (req, res): Promise<void> => {
  const rawSymbol = req.params.symbol;
  if (!rawSymbol || typeof rawSymbol !== "string" || rawSymbol.length > 20) {
    res.status(400).json({ error: "Geçersiz hisse senedi sembolü." });
    return;
  }
  const symbol = decodeURIComponent(rawSymbol).toUpperCase();

  const rawPeriod = (req.query.period as string) || "6mo";
  if (!ALLOWED_ANALYSIS_PERIODS.has(rawPeriod)) {
    res.status(400).json({ error: "Geçersiz dönem. İzin verilen değerler: 1mo, 3mo, 6mo, 1y, 2y, 5y." });
    return;
  }
  const period = rawPeriod;

  const cacheKey = `analysis:${symbol}:${period}`;
  const cached = analysisCache.get(cacheKey);
  if (cached !== undefined) {
    res.json(cached);
    return;
  }

  try {
    const historical = await withTimeout(
      yahooFinance.chart(symbol, {
        period1: getPeriodStart(period),
        interval: "1d",
      }),
      UPSTREAM_TIMEOUT_MS
    );

    const rawQuotes = (historical.quotes || []).filter(
      (q: Record<string, unknown>) => q.open != null && q.close != null && q.high != null && q.low != null
    );

    const dates = rawQuotes.map((q: Record<string, unknown>) =>
      q.date instanceof Date ? q.date.toISOString() : String(q.date)
    );
    const opens = rawQuotes.map((q: Record<string, unknown>) => Number(q.open));
    const highs = rawQuotes.map((q: Record<string, unknown>) => Number(q.high));
    const lows = rawQuotes.map((q: Record<string, unknown>) => Number(q.low));
    const closes = rawQuotes.map((q: Record<string, unknown>) => Number(q.close));
    const volumes = rawQuotes.map((q: Record<string, unknown>) => Number(q.volume || 0));

    // Calculate all indicators
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const rsiAll = calculateRSI(closes);
    const macdAll = calculateMACD(closes);
    const bbAll = calculateBollingerBands(closes);
    const stochAll = calculateStochastic(highs, lows, closes);
    const atrAll = calculateATR(highs, lows, closes);

    // Swing points
    const { swingHighs, swingLows } = findSwingPoints(highs, lows, dates, 3);

    // Support / Resistance
    const allSwingPrices = [
      ...swingHighs.map(h => h.price),
      ...swingLows.map(l => l.price),
    ];
    const currentPrice = closes[closes.length - 1];
    const allLevels = clusterLevels(allSwingPrices, currentPrice, 0.025);
    const support = allLevels.filter(l => l < currentPrice).slice(-4);
    const resistance = allLevels.filter(l => l > currentPrice).slice(0, 4);

    // Fibonacci retracement
    const recentHigh = Math.max(...highs.slice(-60));
    const recentLow = Math.min(...lows.slice(-60));
    const fibTrend = closes[closes.length - 1] > closes[closes.length - 10] ? "up" : "down";
    const fibRange = recentHigh - recentLow;
    const fibLevels = [
      { ratio: 0, label: "0%", price: fibTrend === "up" ? recentLow : recentHigh },
      { ratio: 0.236, label: "23.6%", price: fibTrend === "up" ? recentLow + 0.236 * fibRange : recentHigh - 0.236 * fibRange },
      { ratio: 0.382, label: "38.2%", price: fibTrend === "up" ? recentLow + 0.382 * fibRange : recentHigh - 0.382 * fibRange },
      { ratio: 0.5, label: "50%", price: fibTrend === "up" ? recentLow + 0.5 * fibRange : recentHigh - 0.5 * fibRange },
      { ratio: 0.618, label: "61.8%", price: fibTrend === "up" ? recentLow + 0.618 * fibRange : recentHigh - 0.618 * fibRange },
      { ratio: 0.786, label: "78.6%", price: fibTrend === "up" ? recentLow + 0.786 * fibRange : recentHigh - 0.786 * fibRange },
      { ratio: 1, label: "100%", price: fibTrend === "up" ? recentHigh : recentLow },
    ];

    // Pivot points (yesterday's OHLC based)
    const lastIdx = closes.length - 1;
    const pivH = highs[lastIdx], pivL = lows[lastIdx], pivC = closes[lastIdx];
    const pivot = (pivH + pivL + pivC) / 3;
    const pivotPoints = {
      pivot: pivot,
      r1: 2 * pivot - pivL, r2: pivot + (pivH - pivL), r3: pivH + 2 * (pivot - pivL),
      s1: 2 * pivot - pivH, s2: pivot - (pivH - pivL), s3: pivL - 2 * (pivH - pivot),
    };

    // Patterns
    const patterns = detectPatterns(swingHighs, swingLows, closes, dates);

    // Current indicator values
    const currentRsi = rsiAll[rsiAll.length - 1];
    const currentMacd = macdAll[macdAll.length - 1];
    const currentBb = bbAll[bbAll.length - 1];
    const currentStoch = stochAll[stochAll.length - 1];
    const currentAtr = atrAll[atrAll.length - 1];
    const currentSma20 = sma20[sma20.length - 1];
    const currentSma50 = sma50[sma50.length - 1];
    const currentSma200 = sma200[sma200.length - 1];
    const currentEma20 = ema20[ema20.length - 1];
    const currentEma50 = ema50[ema50.length - 1];

    // Signals
    const signals: { name: string; value: string; signal: "buy" | "sell" | "neutral"; detail: string }[] = [];

    if (currentRsi != null) {
      signals.push({
        name: "RSI (14)",
        value: currentRsi.toFixed(1),
        signal: currentRsi > 70 ? "sell" : currentRsi < 30 ? "buy" : currentRsi > 55 ? "buy" : currentRsi < 45 ? "sell" : "neutral",
        detail: currentRsi > 70 ? "Aşırı alım bölgesi" : currentRsi < 30 ? "Aşırı satım bölgesi" : "Nötr bölge",
      });
    }
    if (currentMacd?.macd != null && currentMacd.signal != null) {
      const bullish = currentMacd.macd > currentMacd.signal;
      signals.push({
        name: "MACD",
        value: currentMacd.histogram?.toFixed(3) ?? "-",
        signal: bullish ? "buy" : "sell",
        detail: bullish ? "MACD sinyal çizgisinin üstünde" : "MACD sinyal çizgisinin altında",
      });
    }
    if (currentBb?.upper != null && currentBb.lower != null) {
      const pct = (currentPrice - currentBb.lower) / (currentBb.upper - currentBb.lower);
      signals.push({
        name: "Bollinger Bantları",
        value: `%${(pct * 100).toFixed(0)}`,
        signal: pct > 0.85 ? "sell" : pct < 0.15 ? "buy" : "neutral",
        detail: pct > 0.85 ? "Üst banda yakın" : pct < 0.15 ? "Alt banda yakın" : "Bant ortasında",
      });
    }
    if (currentStoch?.k != null) {
      signals.push({
        name: "Stochastic %K",
        value: currentStoch.k.toFixed(1),
        signal: currentStoch.k > 80 ? "sell" : currentStoch.k < 20 ? "buy" : "neutral",
        detail: currentStoch.k > 80 ? "Aşırı alım" : currentStoch.k < 20 ? "Aşırı satım" : "Nötr",
      });
    }
    if (currentSma20 != null) {
      signals.push({
        name: "SMA 20",
        value: currentSma20.toFixed(2),
        signal: currentPrice > currentSma20 ? "buy" : "sell",
        detail: currentPrice > currentSma20 ? "Fiyat SMA20 üstünde" : "Fiyat SMA20 altında",
      });
    }
    if (currentSma50 != null) {
      signals.push({
        name: "SMA 50",
        value: currentSma50.toFixed(2),
        signal: currentPrice > currentSma50 ? "buy" : "sell",
        detail: currentPrice > currentSma50 ? "Fiyat SMA50 üstünde" : "Fiyat SMA50 altında",
      });
    }
    if (currentSma200 != null) {
      signals.push({
        name: "SMA 200",
        value: currentSma200.toFixed(2),
        signal: currentPrice > currentSma200 ? "buy" : "sell",
        detail: currentPrice > currentSma200 ? "Fiyat SMA200 üstünde (Boğa piyasası)" : "Fiyat SMA200 altında (Ayı piyasası)",
      });
    }
    if (currentEma20 != null && currentEma50 != null) {
      signals.push({
        name: "EMA 20/50 Kesişim",
        value: currentEma20 > currentEma50 ? "Golden" : "Death",
        signal: currentEma20 > currentEma50 ? "buy" : "sell",
        detail: currentEma20 > currentEma50 ? "EMA20 > EMA50: Altın kesişim (yükseliş)" : "EMA20 < EMA50: Ölüm kesişimi (düşüş)",
      });
    }

    const buyCount = signals.filter(s => s.signal === "buy").length;
    const sellCount = signals.filter(s => s.signal === "sell").length;
    const neutralCount = signals.filter(s => s.signal === "neutral").length;
    const overallSignal = buyCount >= sellCount + 2 ? "GÜÇLÜ AL" : buyCount > sellCount ? "AL" : sellCount >= buyCount + 2 ? "GÜÇLÜ SAT" : sellCount > buyCount ? "SAT" : "NÖTR";

    // Trend
    const trend = currentSma20 != null && currentSma50 != null
      ? (currentPrice > currentSma20 && currentSma20 > currentSma50 ? "uptrend" : currentPrice < currentSma20 && currentSma20 < currentSma50 ? "downtrend" : "sideways")
      : "sideways";

    // Chart data (combined for overlay charts)
    const chartData = dates.map((date, i) => ({
      date,
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i],
      sma20: sma20[i],
      sma50: sma50[i],
      sma200: sma200[i],
      ema20: ema20[i],
      ema50: ema50[i],
      bb_upper: bbAll[i]?.upper ?? null,
      bb_middle: bbAll[i]?.middle ?? null,
      bb_lower: bbAll[i]?.lower ?? null,
      rsi: rsiAll[i],
      stoch_k: stochAll[i]?.k ?? null,
      stoch_d: stochAll[i]?.d ?? null,
      macd: macdAll[i]?.macd ?? null,
      macd_signal: macdAll[i]?.signal ?? null,
      macd_hist: macdAll[i]?.histogram ?? null,
      atr: atrAll[i],
    }));

    const responseBody = {
      symbol,
      currentPrice,
      trend,
      overallSignal,
      buyCount,
      sellCount,
      neutralCount,
      currentRsi,
      currentAtr,
      atrPercent: currentAtr != null ? (currentAtr / currentPrice) * 100 : null,
      signals,
      patterns,
      swingHighs: swingHighs.slice(-10),
      swingLows: swingLows.slice(-10),
      support,
      resistance,
      fibonacci: { trend: fibTrend, high: recentHigh, low: recentLow, levels: fibLevels },
      pivotPoints,
      chartData,
    };
    analysisCache.set(cacheKey, responseBody);
    res.json(responseBody);
  } catch (err) {
    req.log.error({ err }, "Failed to run analysis");
    res.status(500).json({ error: "Failed to run analysis" });
  }
});

// GET /stock/search
router.get("/stock/search", async (req, res): Promise<void> => {
  const parsed = SearchStocksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const results = await yahooFinance.search(parsed.data.q, {
      newsCount: 0,
      quotesCount: 10,
    });

    const quotes = (results.quotes || []).map((q: Record<string, unknown>) => ({
      symbol: q.symbol,
      shortname: q.shortname,
      longname: q.longname,
      exchange: q.exchange,
      quoteType: q.quoteType,
      sector: q.sector,
    }));

    res.json(quotes);
  } catch (err) {
    req.log.error({ err }, "Failed to search stocks");
    res.status(500).json({ error: "Failed to search stocks" });
  }
});

function sanitizeUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // not a valid URL
  }
  return undefined;
}

// GET /stock/quote/:symbol
router.get("/stock/quote/:symbol", async (req, res): Promise<void> => {
  const params = GetStockQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  try {
    const quote = await yahooFinance.quoteSummary(symbol, {
      modules: [
        "price",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "assetProfile",
        "recommendationTrend",
      ],
    });

    const price = (quote.price || {}) as Record<string, unknown>;
    const summary = (quote.summaryDetail || {}) as Record<string, unknown>;
    const stats = (quote.defaultKeyStatistics || {}) as Record<string, unknown>;
    const financial = (quote.financialData || {}) as Record<string, unknown>;
    const profile = (quote.assetProfile || {}) as Record<string, unknown>;

    const data = {
      symbol,
      longName: price.longName,
      shortName: price.shortName,
      regularMarketPrice: formatNumber(price.regularMarketPrice),
      regularMarketChange: formatNumber(price.regularMarketChange),
      regularMarketChangePercent: formatNumber(
        price.regularMarketChangePercent
      ),
      regularMarketOpen: formatNumber(price.regularMarketOpen),
      regularMarketDayHigh: formatNumber(price.regularMarketDayHigh),
      regularMarketDayLow: formatNumber(price.regularMarketDayLow),
      regularMarketVolume: formatNumber(price.regularMarketVolume),
      regularMarketPreviousClose: formatNumber(
        price.regularMarketPreviousClose
      ),
      fiftyTwoWeekHigh: formatNumber(summary.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: formatNumber(summary.fiftyTwoWeekLow),
      marketCap: formatNumber(price.marketCap),
      trailingPE: formatNumber(summary.trailingPE),
      forwardPE: formatNumber(summary.forwardPE),
      priceToBook: formatNumber(stats.priceToBook),
      trailingEps: formatNumber(stats.trailingEps),
      dividendYield: formatNumber(summary.dividendYield),
      beta: formatNumber(summary.beta),
      averageVolume: formatNumber(summary.averageVolume),
      currency: price.currency as string,
      exchange: price.exchangeName as string,
      sector: profile.sector as string,
      industry: profile.industry as string,
      country: profile.country as string,
      website: sanitizeUrl(profile.website),
      longBusinessSummary: profile.longBusinessSummary as string,
      recommendationMean: formatNumber(financial.recommendationMean),
      recommendationKey: financial.recommendationKey as string,
      numberOfAnalystOpinions: formatNumber(financial.numberOfAnalystOpinions),
      targetHighPrice: formatNumber(financial.targetHighPrice),
      targetLowPrice: formatNumber(financial.targetLowPrice),
      targetMeanPrice: formatNumber(financial.targetMeanPrice),
    };

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stock quote");
    res.status(500).json({ error: "Failed to fetch stock quote" });
  }
});

// GET /stock/history/:symbol
router.get("/stock/history/:symbol", async (req, res): Promise<void> => {
  const params = GetStockHistoryParams.safeParse(req.params);
  const query = GetStockHistoryQueryParams.safeParse(req.query);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  const period = (query.data?.period as string) || "3mo";
  const interval = (query.data?.interval as string) || "1d";

  try {
    const historical = await yahooFinance.chart(symbol, {
      period1: getPeriodStart(period),
      interval: interval as "1d" | "1wk" | "1mo",
    });

    const quotes = historical.quotes || [];
    const candles = quotes
      .filter(
        (q: Record<string, unknown>) =>
          q.open != null && q.high != null && q.low != null && q.close != null
      )
      .map((q: Record<string, unknown>) => ({
        date: q.date instanceof Date ? q.date.toISOString() : String(q.date),
        open: Number(q.open),
        high: Number(q.high),
        low: Number(q.low),
        close: Number(q.close),
        volume: Number(q.volume || 0),
      }));

    res.json({
      symbol,
      candles,
      currency: historical.meta?.currency,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stock history");
    res.status(500).json({ error: "Failed to fetch stock history" });
  }
});

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "1d":
      return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    case "5d":
      return new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    case "1mo":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3mo":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "6mo":
      return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case "1y":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "2y":
      return new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    case "5y":
      return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    case "10y":
      return new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "max":
      return new Date("2000-01-01");
    default:
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

// GET /stock/financials/:symbol
router.get("/stock/financials/:symbol", async (req, res): Promise<void> => {
  const params = GetStockFinancialsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
      ],
    });

    const incomeStatements = (
      (summary.incomeStatementHistory?.incomeStatementHistory as unknown as Record<string, unknown>[]) || []
    ).map((s: Record<string, unknown>) => ({
      date: s.endDate instanceof Date ? s.endDate.toISOString().split("T")[0] : String(s.endDate),
      totalRevenue: formatNumber(s.totalRevenue),
      grossProfit: formatNumber(s.grossProfit),
      operatingIncome: formatNumber(s.operatingIncome),
      netIncome: formatNumber(s.netIncome),
      ebitda: formatNumber(s.ebitda),
    }));

    const balanceSheets = (
      (summary.balanceSheetHistory?.balanceSheetStatements as unknown as Record<string, unknown>[]) || []
    ).map((s: Record<string, unknown>) => ({
      date: s.endDate instanceof Date ? s.endDate.toISOString().split("T")[0] : String(s.endDate),
      totalAssets: formatNumber(s.totalAssets),
      totalLiab: formatNumber(s.totalLiab),
      totalStockholderEquity: formatNumber(s.totalStockholderEquity),
      cash: formatNumber(s.cash),
      totalDebt: formatNumber(s.longTermDebt),
    }));

    const cashFlows = (
      (summary.cashflowStatementHistory?.cashflowStatements as unknown as Record<string, unknown>[]) || []
    ).map((s: Record<string, unknown>) => ({
      date: s.endDate instanceof Date ? s.endDate.toISOString().split("T")[0] : String(s.endDate),
      operatingCashflow: formatNumber(s.totalCashFromOperatingActivities),
      capitalExpenditures: formatNumber(s.capitalExpenditures),
      freeCashflow: formatNumber(s.freeCashFlow),
      netIncome: formatNumber(s.netIncome),
    }));

    res.json({ symbol, incomeStatements, balanceSheets, cashFlows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch financials");
    res.status(500).json({ error: "Failed to fetch financials" });
  }
});

// GET /stock/indicators/:symbol
router.get("/stock/indicators/:symbol", async (req, res): Promise<void> => {
  const params = GetStockIndicatorsParams.safeParse(req.params);
  const query = GetStockIndicatorsQueryParams.safeParse(req.query);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  const period = (query.data?.period as string) || "3mo";

  try {
    const historical = await yahooFinance.chart(symbol, {
      period1: getPeriodStart(period),
      interval: "1d",
    });

    const quotes = (historical.quotes || []).filter(
      (q: Record<string, unknown>) => q.close != null
    );
    const dates = quotes.map((q: Record<string, unknown>) =>
      q.date instanceof Date ? q.date.toISOString() : String(q.date)
    );
    const closes = quotes.map((q: Record<string, unknown>) => Number(q.close));

    const rsiValues = calculateRSI(closes);
    const macdValues = calculateMACD(closes);
    const bbValues = calculateBollingerBands(closes);
    const sma20Values = calculateSMA(closes, 20);
    const sma50Values = calculateSMA(closes, 50);
    const sma200Values = calculateSMA(closes, 200);
    const ema12Values = calculateEMA(closes, 12);
    const ema26Values = calculateEMA(closes, 26);

    const rsi = dates
      .map((date: string, i: number) =>
        rsiValues[i] != null ? { date, value: rsiValues[i] as number } : null
      )
      .filter(Boolean) as { date: string; value: number }[];

    const macd = dates
      .map((date: string, i: number) => {
        const m = macdValues[i];
        if (!m || m.macd == null || m.signal == null || m.histogram == null)
          return null;
        return {
          date,
          macd: m.macd as number,
          signal: m.signal as number,
          histogram: m.histogram as number,
        };
      })
      .filter(Boolean) as {
      date: string;
      macd: number;
      signal: number;
      histogram: number;
    }[];

    const bollingerBands = dates
      .map((date: string, i: number) => {
        const bb = bbValues[i];
        if (!bb || bb.upper == null || bb.middle == null || bb.lower == null)
          return null;
        return {
          date,
          upper: bb.upper as number,
          middle: bb.middle as number,
          lower: bb.lower as number,
          price: closes[i],
        };
      })
      .filter(Boolean) as {
      date: string;
      upper: number;
      middle: number;
      lower: number;
      price: number;
    }[];

    const sma20 = dates
      .map((date: string, i: number) =>
        sma20Values[i] != null
          ? { date, value: sma20Values[i] as number }
          : null
      )
      .filter(Boolean) as { date: string; value: number }[];

    const sma50 = dates
      .map((date: string, i: number) =>
        sma50Values[i] != null
          ? { date, value: sma50Values[i] as number }
          : null
      )
      .filter(Boolean) as { date: string; value: number }[];

    const sma200 = dates
      .map((date: string, i: number) =>
        sma200Values[i] != null
          ? { date, value: sma200Values[i] as number }
          : null
      )
      .filter(Boolean) as { date: string; value: number }[];

    const ema12 = dates
      .map((date: string, i: number) =>
        ema12Values[i] != null
          ? { date, value: ema12Values[i] as number }
          : null
      )
      .filter(Boolean) as { date: string; value: number }[];

    const ema26 = dates
      .map((date: string, i: number) =>
        ema26Values[i] != null
          ? { date, value: ema26Values[i] as number }
          : null
      )
      .filter(Boolean) as { date: string; value: number }[];

    res.json({
      symbol,
      rsi,
      macd,
      bollingerBands,
      sma20,
      sma50,
      sma200,
      ema12,
      ema26,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch indicators");
    res.status(500).json({ error: "Failed to fetch indicators" });
  }
});

// GET /stock/news/:symbol
router.get("/stock/news/:symbol", async (req, res): Promise<void> => {
  const params = GetStockNewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  try {
    const result = await yahooFinance.search(symbol, {
      newsCount: 15,
      quotesCount: 0,
    });

    const news = (result.news || [])
      .map((n: Record<string, unknown>) => ({
        title: n.title,
        publisher: n.publisher,
        link: sanitizeUrl(n.link),
        providerPublishTime:
          n.providerPublishTime instanceof Date
            ? n.providerPublishTime.getTime() / 1000
            : Number(n.providerPublishTime),
        type: n.type,
        thumbnail:
          (n.thumbnail as { resolutions?: { url?: string }[] })?.resolutions?.[0]
            ?.url,
        relatedTickers: n.relatedTickers || [],
      }))
      .filter((n): n is typeof n & { link: string } => typeof n.link === "string");

    res.json(news);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch news");
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// GET /stock/summary/:symbol
router.get("/stock/summary/:symbol", heavyLimiter, async (req, res): Promise<void> => {
  const params = GetStockSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  const cacheKey = `summary:${symbol}`;
  const cached = summaryCache.get(cacheKey);
  if (cached !== undefined) {
    res.json(cached);
    return;
  }

  try {
    // Fetch quote and 1-year history in parallel
    const [quoteSummary, historical] = await withTimeout(
      Promise.all([
        yahooFinance.quoteSummary(symbol, {
          modules: [
            "price",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "assetProfile",
          ],
        }),
        yahooFinance.chart(symbol, {
          period1: getPeriodStart("1y"),
          interval: "1d",
        }),
      ]),
      UPSTREAM_TIMEOUT_MS
    );

    const price = (quoteSummary.price || {}) as Record<string, unknown>;
    const summary = (quoteSummary.summaryDetail || {}) as Record<string, unknown>;
    const stats = (quoteSummary.defaultKeyStatistics || {}) as Record<string, unknown>;
    const financial = (quoteSummary.financialData || {}) as Record<string, unknown>;
    const profile = (quoteSummary.assetProfile || {}) as Record<string, unknown>;

    const quotes = (historical.quotes || []).filter(
      (q: Record<string, unknown>) => q.close != null
    );
    const closes = quotes.map((q: Record<string, unknown>) => Number(q.close));
    const currentPrice = closes[closes.length - 1] || 0;

    // Calculate changes
    const weekAgoClose = closes[Math.max(0, closes.length - 6)];
    const monthAgoClose = closes[Math.max(0, closes.length - 22)];
    const yearAgoClose = closes[0];

    const weeklyChange =
      weekAgoClose ? ((currentPrice - weekAgoClose) / weekAgoClose) * 100 : 0;
    const monthlyChange =
      monthAgoClose
        ? ((currentPrice - monthAgoClose) / monthAgoClose) * 100
        : 0;
    const yearlyChange =
      yearAgoClose ? ((currentPrice - yearAgoClose) / yearAgoClose) * 100 : 0;

    // Volatility (std dev of daily returns)
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const avgReturn =
      returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      (returns.length || 1);
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

    // Volume avg
    const volumes = quotes.slice(-30).map((q: Record<string, unknown>) => Number(q.volume || 0));
    const avgVolume30d =
      volumes.reduce((a: number, b: number) => a + b, 0) / (volumes.length || 1);

    // SMA comparisons
    const sma50Values = calculateSMA(closes, 50);
    const sma200Values = calculateSMA(closes, 200);
    const sma50 = sma50Values[sma50Values.length - 1];
    const sma200 = sma200Values[sma200Values.length - 1];
    const priceVsSma50 = sma50 ? ((currentPrice - sma50) / sma50) * 100 : 0;
    const priceVsSma200 = sma200
      ? ((currentPrice - sma200) / sma200) * 100
      : 0;

    // RSI
    const rsiValues = calculateRSI(closes);
    const currentRsi = rsiValues[rsiValues.length - 1];

    // Overall signal
    let bullishSignals = 0;
    let bearishSignals = 0;
    if (priceVsSma50 > 0) bullishSignals++;
    else bearishSignals++;
    if (priceVsSma200 > 0) bullishSignals++;
    else bearishSignals++;
    if (currentRsi != null && currentRsi > 50) bullishSignals++;
    else if (currentRsi != null) bearishSignals++;
    if (financial.recommendationKey === "buy" || financial.recommendationKey === "strong_buy")
      bullishSignals++;
    else if (
      financial.recommendationKey === "sell" ||
      financial.recommendationKey === "strong_sell"
    )
      bearishSignals++;

    const overallSignal =
      bullishSignals > bearishSignals
        ? "AL"
        : bullishSignals < bearishSignals
          ? "SAT"
          : "NÖTR";

    const quote = {
      symbol,
      longName: price.longName,
      shortName: price.shortName,
      regularMarketPrice: formatNumber(price.regularMarketPrice),
      regularMarketChange: formatNumber(price.regularMarketChange),
      regularMarketChangePercent: formatNumber(
        price.regularMarketChangePercent
      ),
      regularMarketOpen: formatNumber(price.regularMarketOpen),
      regularMarketDayHigh: formatNumber(price.regularMarketDayHigh),
      regularMarketDayLow: formatNumber(price.regularMarketDayLow),
      regularMarketVolume: formatNumber(price.regularMarketVolume),
      regularMarketPreviousClose: formatNumber(
        price.regularMarketPreviousClose
      ),
      fiftyTwoWeekHigh: formatNumber(summary.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: formatNumber(summary.fiftyTwoWeekLow),
      marketCap: formatNumber(price.marketCap),
      trailingPE: formatNumber(summary.trailingPE),
      forwardPE: formatNumber(summary.forwardPE),
      priceToBook: formatNumber(stats.priceToBook),
      trailingEps: formatNumber(stats.trailingEps),
      dividendYield: formatNumber(summary.dividendYield),
      beta: formatNumber(summary.beta),
      averageVolume: formatNumber(summary.averageVolume),
      currency: price.currency as string,
      exchange: price.exchangeName as string,
      sector: profile.sector as string,
      industry: profile.industry as string,
      country: profile.country as string,
      longBusinessSummary: profile.longBusinessSummary as string,
      recommendationMean: formatNumber(financial.recommendationMean),
      recommendationKey: financial.recommendationKey as string,
      numberOfAnalystOpinions: formatNumber(financial.numberOfAnalystOpinions),
      targetHighPrice: formatNumber(financial.targetHighPrice),
      targetLowPrice: formatNumber(financial.targetLowPrice),
      targetMeanPrice: formatNumber(financial.targetMeanPrice),
    };

    const responseBody = {
      symbol,
      quote,
      weeklyChange,
      monthlyChange,
      yearlyChange,
      volatility,
      avgVolume30d,
      priceVsSma50,
      priceVsSma200,
      currentRsi,
      analystRating: financial.recommendationKey as string,
      overallSignal,
    };
    summaryCache.set(cacheKey, responseBody);
    res.json(responseBody);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stock summary");
    res.status(500).json({ error: "Failed to fetch stock summary" });
  }
});

const US_SYMBOLS = [
  "AAPL","MSFT","GOOGL","AMZN","NVDA","TSLA","META","BRK-B","JPM","V",
  "UNH","XOM","JNJ","WMT","MA","PG","HD","CVX","MRK","LLY",
  "ABBV","PFE","KO","BAC","PEP","COST","TMO","AVGO","ORCL","CSCO",
  "ACN","MCD","ABT","NKE","DIS","ADBE","CRM","AMD","INTC","QCOM",
  "TXN","AMGN","PM","NEE","RTX","HON","UPS","GS","MS","BLK",
  "NFLX","PYPL","SQ","UBER","LYFT","SNAP","TWTR","RBLX","HOOD","COIN",
  "SPY","QQQ","GLD","SLV","USO"
];

const BIST_SYMBOLS = [
  "THYAO.IS","GARAN.IS","AKBNK.IS","EREGL.IS","SASA.IS","ASELS.IS","BIMAS.IS","KCHOL.IS",
  "YKBNK.IS","SAHOL.IS","TUPRS.IS","TCELL.IS","ARCLK.IS","TOASO.IS","FROTO.IS","VESTL.IS",
  "KOZAL.IS","ENKAI.IS","EKGYO.IS","HALKB.IS","VAKBN.IS","ISBTR.IS","PGSUS.IS","DOAS.IS",
  "MGROS.IS","CCOLA.IS","ULKER.IS","LOGO.IS","NETAS.IS","OYAKC.IS","TTKOM.IS","SISE.IS",
  "PETKM.IS","KORDS.IS","ALARK.IS","BANVT.IS","BRYAT.IS","DOHOL.IS","EGEEN.IS","FENER.IS",
  "GLYHO.IS","HEKTS.IS","INDES.IS","JANTS.IS","KARSN.IS","AGHOL.IS","MAVI.IS","ODAS.IS",
  "PRZMA.IS","QUAGR.IS","RYGYO.IS","SKBNK.IS","TNZTP.IS","USDTR.IS","ZRGYO.IS","DENGE.IS",
  "KONTR.IS","LIDER.IS","MMCAS.IS","NTGAZ.IS"
];

// GET /stock/watchlist?market=us|bist|all
router.get("/stock/watchlist", watchlistLimiter, async (req, res): Promise<void> => {
  const rawMarket = (req.query.market as string) || "all";
  const market = rawMarket === "us" ? "us" : rawMarket === "bist" ? "bist" : "all";

  const cacheKey = `watchlist:${market}`;
  const cached = watchlistCache.get(cacheKey);
  if (cached !== undefined) {
    res.json(cached);
    return;
  }

  let symbols: string[];
  if (market === "us") {
    symbols = US_SYMBOLS;
  } else if (market === "bist") {
    symbols = BIST_SYMBOLS;
  } else {
    symbols = [
      "AAPL","MSFT","GOOGL","AMZN","NVDA","TSLA","META","JPM","V","NFLX",
      "THYAO.IS","GARAN.IS","AKBNK.IS","EREGL.IS","SASA.IS","ASELS.IS","BIMAS.IS","KCHOL.IS","TUPRS.IS","TCELL.IS",
    ];
  }

  try {
    const batchSize = 20;
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }

    const batchResults = await withTimeout(
      Promise.all(batches.map((batch) => yahooFinance.quote(batch))),
      UPSTREAM_TIMEOUT_MS
    );

    const allQuotes = batchResults.flatMap((q) =>
      Array.isArray(q) ? q : [q]
    );

    const results = allQuotes
      .filter((q: Record<string, unknown>) => q.regularMarketPrice != null)
      .map((q: Record<string, unknown>) => ({
        symbol: q.symbol,
        shortName: q.shortName,
        price: formatNumber(q.regularMarketPrice),
        change: formatNumber(q.regularMarketChange),
        changePercent: formatNumber(q.regularMarketChangePercent),
        marketCap: formatNumber(q.marketCap),
        currency: q.currency,
      }));

    watchlistCache.set(cacheKey, results);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch watchlist");
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

export default router;
