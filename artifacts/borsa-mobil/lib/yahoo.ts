/**
 * Yahoo Finance veri katmanı.
 *
 * Mobilde (iOS/Android) ve Expo Go üzerinde do-grudan çalışır.
 * - v8/finance/chart: Fiyat ve geçmiş veriler. Auth gerektirmez, "crumb" gerekmez.
 * - v1/finance/search: Sembol ve haber araması.
 *
 * Web'de CORS engeli olabilir; o yüzden web platformunda istekler
 * bir CORS proxy üzerinden geçiyor (corsproxy.io).
 */

import { Platform } from "react-native";

const YH1 = "https://query1.finance.yahoo.com";
const YH2 = "https://query2.finance.yahoo.com";

function withProxy(url: string): string {
  if (Platform.OS === "web") {
    return `https://corsproxy.io/?${encodeURIComponent(url)}`;
  }
  return url;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(withProxy(url), {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

// ---------- Types ----------

export type Range = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "max";
export type Interval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo";

export interface Candle {
  date: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface YahooQuoteMeta {
  currency?: string;
  symbol: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  gmtoffset?: number;
  timezone?: string;
  exchangeTimezoneName?: string;
}

export interface StockQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  currency?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface SearchResultItem {
  symbol: string;
  longname?: string;
  shortname?: string;
  exchange?: string;
  quoteType?: string;
}

export interface NewsItem {
  uuid: string;
  title: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  type?: string;
  thumbnail?: { resolutions?: { url: string; width: number; height: number }[] };
}

// ---------- v8 chart (price + history) ----------

interface ChartResponse {
  chart: {
    result?: {
      meta: YahooQuoteMeta;
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

async function chart(
  symbol: string,
  range: Range,
  interval: Interval,
): Promise<ChartResponse["chart"]["result"][number]> {
  const url =
    `${YH1}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&includePrePost=false&events=div,splits`;
  const json = await getJSON<ChartResponse>(url);
  const result = json.chart.result?.[0];
  if (!result) {
    const desc = json.chart.error?.description ?? "Sembol bulunamadı";
    throw new Error(desc);
  }
  return result;
}

export async function getQuote(symbol: string): Promise<StockQuote> {
  // 1g/1d - güncel meta + günlük tek mum yeterli
  const r = await chart(symbol, "1d", "1d");
  const m = r.meta;
  const close = m.regularMarketPrice ?? 0;
  const prev = m.chartPreviousClose ?? m.previousClose ?? close;
  const change = close - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  const q = r.indicators?.quote?.[0];
  const lastIdx = (r.timestamp?.length ?? 1) - 1;

  return {
    symbol: m.symbol,
    shortName: m.shortName,
    longName: m.longName,
    exchange: m.fullExchangeName ?? m.exchangeName,
    currency: m.currency,
    regularMarketPrice: close,
    regularMarketChange: change,
    regularMarketChangePercent: changePct,
    regularMarketOpen: q?.open?.[lastIdx] ?? undefined,
    regularMarketDayHigh: m.regularMarketDayHigh ?? q?.high?.[lastIdx] ?? undefined,
    regularMarketDayLow: m.regularMarketDayLow ?? q?.low?.[lastIdx] ?? undefined,
    regularMarketVolume: m.regularMarketVolume ?? q?.volume?.[lastIdx] ?? undefined,
    regularMarketPreviousClose: prev,
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: m.fiftyTwoWeekLow,
  };
}

export async function getQuotes(symbols: string[]): Promise<StockQuote[]> {
  // Yahoo'nun batch v7/quote endpoint'i artık crumb istiyor.
  // Onun yerine her sembol için paralel chart çağrısı.
  const settled = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  const out: StockQuote[] = [];
  settled.forEach((res, i) => {
    if (res.status === "fulfilled") {
      out.push(res.value);
    } else {
      out.push({
        symbol: symbols[i]!,
        regularMarketPrice: 0,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
      });
    }
  });
  return out;
}

export async function getHistory(
  symbol: string,
  range: Range = "6mo",
  interval: Interval = "1d",
): Promise<{ candles: Candle[]; meta: YahooQuoteMeta }> {
  const r = await chart(symbol, range, interval);
  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q?.open?.[i];
    const h = q?.high?.[i];
    const l = q?.low?.[i];
    const c = q?.close?.[i];
    const v = q?.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      date: ts[i]!,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
    });
  }
  return { candles, meta: r.meta };
}

// ---------- v1 search (sembol ve haber) ----------

interface SearchResponse {
  quotes?: {
    symbol: string;
    longname?: string;
    shortname?: string;
    exchange?: string;
    quoteType?: string;
  }[];
  news?: {
    uuid: string;
    title: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
    type?: string;
    thumbnail?: { resolutions?: { url: string; width: number; height: number }[] };
    relatedTickers?: string[];
  }[];
}

export async function searchSymbols(q: string): Promise<SearchResultItem[]> {
  if (q.trim().length < 1) return [];
  const url =
    `${YH1}/v1/finance/search?q=${encodeURIComponent(q.trim())}` +
    `&quotesCount=20&newsCount=0&listsCount=0`;
  const json = await getJSON<SearchResponse>(url);
  return (json.quotes ?? [])
    .filter((it) => it.quoteType === "EQUITY" || it.quoteType === "ETF" || it.quoteType === "INDEX")
    .map((it) => ({
      symbol: it.symbol,
      longname: it.longname,
      shortname: it.shortname,
      exchange: it.exchange,
      quoteType: it.quoteType,
    }));
}

export async function getNews(symbol: string, count = 12): Promise<NewsItem[]> {
  const url =
    `${YH1}/v1/finance/search?q=${encodeURIComponent(symbol)}` +
    `&quotesCount=0&newsCount=${count}&listsCount=0`;
  const json = await getJSON<SearchResponse>(url);
  return (json.news ?? []).map((n) => ({
    uuid: n.uuid,
    title: n.title,
    publisher: n.publisher,
    link: n.link,
    providerPublishTime: n.providerPublishTime,
    type: n.type,
    thumbnail: n.thumbnail,
  }));
}
