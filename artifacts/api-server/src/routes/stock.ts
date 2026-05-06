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

const yahooFinance = new YahooFinanceClass();
const router: IRouter = Router();

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
      website: profile.website as string,
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
      (summary.incomeStatementHistory?.incomeStatementHistory as Record<string, unknown>[]) || []
    ).map((s: Record<string, unknown>) => ({
      date: s.endDate instanceof Date ? s.endDate.toISOString().split("T")[0] : String(s.endDate),
      totalRevenue: formatNumber(s.totalRevenue),
      grossProfit: formatNumber(s.grossProfit),
      operatingIncome: formatNumber(s.operatingIncome),
      netIncome: formatNumber(s.netIncome),
      ebitda: formatNumber(s.ebitda),
    }));

    const balanceSheets = (
      (summary.balanceSheetHistory?.balanceSheetStatements as Record<string, unknown>[]) || []
    ).map((s: Record<string, unknown>) => ({
      date: s.endDate instanceof Date ? s.endDate.toISOString().split("T")[0] : String(s.endDate),
      totalAssets: formatNumber(s.totalAssets),
      totalLiab: formatNumber(s.totalLiab),
      totalStockholderEquity: formatNumber(s.totalStockholderEquity),
      cash: formatNumber(s.cash),
      totalDebt: formatNumber(s.longTermDebt),
    }));

    const cashFlows = (
      (summary.cashflowStatementHistory?.cashflowStatements as Record<string, unknown>[]) || []
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

    const news = (result.news || []).map((n: Record<string, unknown>) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      providerPublishTime:
        n.providerPublishTime instanceof Date
          ? n.providerPublishTime.getTime() / 1000
          : Number(n.providerPublishTime),
      type: n.type,
      thumbnail:
        (n.thumbnail as { resolutions?: { url?: string }[] })?.resolutions?.[0]
          ?.url,
      relatedTickers: n.relatedTickers || [],
    }));

    res.json(news);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch news");
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// GET /stock/summary/:symbol
router.get("/stock/summary/:symbol", async (req, res): Promise<void> => {
  const params = GetStockSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const symbol = Array.isArray(params.data.symbol)
    ? params.data.symbol[0]
    : params.data.symbol;

  try {
    // Fetch quote and 1-year history in parallel
    const [quoteSummary, historical] = await Promise.all([
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
    ]);

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

    res.json({
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
    });
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
router.get("/stock/watchlist", async (req, res): Promise<void> => {
  const market = (req.query.market as string) || "all";

  let symbols: string[];
  if (market === "us") {
    symbols = US_SYMBOLS;
  } else if (market === "bist") {
    symbols = BIST_SYMBOLS;
  } else {
    // default: top picks from both
    symbols = [
      "AAPL","MSFT","GOOGL","AMZN","NVDA","TSLA","META","JPM","V","NFLX",
      "THYAO.IS","GARAN.IS","AKBNK.IS","EREGL.IS","SASA.IS","ASELS.IS","BIMAS.IS","KCHOL.IS","TUPRS.IS","TCELL.IS",
    ];
  }

  try {
    // Fetch in batches of 20 to avoid rate limiting
    const batchSize = 20;
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
      batches.map((batch) => yahooFinance.quote(batch))
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

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch watchlist");
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

export default router;
