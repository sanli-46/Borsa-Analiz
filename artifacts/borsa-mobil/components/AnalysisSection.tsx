import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Line, Path, Polyline, Rect } from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatPercent, formatTime } from "@/lib/format";

type Signal = "buy" | "sell" | "neutral";
type IndicatorSignal = { name: string; value: string; signal: Signal; detail: string };
type Pattern = {
  name: string;
  nameTr: string;
  type: "bullish" | "bearish" | "neutral";
  confidence: number;
  description: string;
  startDate: string;
  endDate: string;
};
type ChartRow = {
  date: string;
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
};

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
  signals: IndicatorSignal[];
  patterns: Pattern[];
  support: number[];
  resistance: number[];
  fibonacci: {
    trend: string;
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
};

const PERIODS = [
  { id: "3mo", label: "3A" },
  { id: "6mo", label: "6A" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
] as const;

const ANALYSIS_REFRESH = 5 * 60 * 1000;

function fetchAnalysis(symbol: string, period: string): Promise<AnalysisData> {
  const base = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
  const url = `${base}/api/stock/analysis/${encodeURIComponent(symbol)}?period=${period}`;
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error("Analiz verisi alınamadı");
    return r.json();
  });
}

export function AnalysisSection({
  symbol,
  currency,
}: {
  symbol: string;
  currency?: string;
}) {
  const colors = useColors();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("6mo");

  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } =
    useQuery<AnalysisData>({
      queryKey: ["analysis", symbol, period],
      queryFn: () => fetchAnalysis(symbol, period),
      staleTime: ANALYSIS_REFRESH,
      refetchInterval: ANALYSIS_REFRESH,
      refetchIntervalInBackground: false,
    });

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingVertical: 60 }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.subdued, { color: colors.mutedForeground, marginTop: 12 }]}>
          Analiz hesaplanıyor...
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.contentPad}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.destructive, alignItems: "center", gap: 12 },
          ]}
        >
          <Feather name="alert-triangle" size={28} color={colors.destructive} />
          <Text style={[styles.subdued, { color: colors.foreground }]}>
            Analiz verisi yüklenemedi
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
              Tekrar Dene
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const sigUp = data.overallSignal.includes("AL");
  const sigDown = data.overallSignal.includes("SAT");
  const sigColor = sigUp ? colors.positive : sigDown ? colors.negative : colors.warning;
  const trendIcon =
    data.trend === "uptrend" ? "trending-up" : data.trend === "downtrend" ? "trending-down" : "minus";
  const trendColor =
    data.trend === "uptrend"
      ? colors.positive
      : data.trend === "downtrend"
        ? colors.negative
        : colors.warning;
  const trendLabel =
    data.trend === "uptrend"
      ? "Yükselen Trend"
      : data.trend === "downtrend"
        ? "Düşen Trend"
        : "Yatay Seyir";

  return (
    <View style={styles.contentPad}>
      {/* Status bar */}
      <View
        style={[
          styles.statusBar,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.statusLeft}>
          {isFetching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={[styles.liveDot, { backgroundColor: colors.positive }]} />
          )}
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {isFetching
              ? "Hesaplamalar güncelleniyor..."
              : "Tüm göstergeler güncel"}
          </Text>
        </View>
        {dataUpdatedAt > 0 && (
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {formatTime(dataUpdatedAt)}
          </Text>
        )}
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => {
          const active = period === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setPeriod(p.id);
              }}
              style={({ pressed }) => [
                styles.periodChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.periodLabel,
                  { color: active ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Signal Hero */}
      <View
        style={[
          styles.signalHero,
          { backgroundColor: colors.card, borderColor: sigColor },
        ]}
      >
        <Text style={[styles.heroLabel, { color: colors.mutedForeground }]}>
          GENEL SİNYAL
        </Text>
        <Text style={[styles.heroSignal, { color: sigColor }]}>
          {data.overallSignal}
        </Text>
        <View style={styles.countsRow}>
          <View style={styles.countCell}>
            <Text style={[styles.countNum, { color: colors.positive }]}>
              {data.buyCount}
            </Text>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>AL</Text>
          </View>
          <View style={[styles.countDivider, { backgroundColor: colors.border }]} />
          <View style={styles.countCell}>
            <Text style={[styles.countNum, { color: colors.warning }]}>
              {data.neutralCount}
            </Text>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>NÖTR</Text>
          </View>
          <View style={[styles.countDivider, { backgroundColor: colors.border }]} />
          <View style={styles.countCell}>
            <Text style={[styles.countNum, { color: colors.negative }]}>
              {data.sellCount}
            </Text>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>SAT</Text>
          </View>
        </View>
      </View>

      {/* Trend / RSI / ATR strip */}
      <View style={styles.miniGrid}>
        <View style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>TREND</Text>
          <View style={styles.miniValueRow}>
            <Feather name={trendIcon} size={14} color={trendColor} />
            <Text style={[styles.miniValue, { color: trendColor }]}>{trendLabel}</Text>
          </View>
        </View>
        <View style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>RSI (14)</Text>
          <Text
            style={[
              styles.miniValueLg,
              {
                color:
                  data.currentRsi != null && data.currentRsi > 70
                    ? colors.negative
                    : data.currentRsi != null && data.currentRsi < 30
                      ? colors.positive
                      : colors.foreground,
              },
            ]}
          >
            {data.currentRsi?.toFixed(1) ?? "-"}
          </Text>
          <Text style={[styles.miniSubText, { color: colors.mutedForeground }]}>
            {data.currentRsi != null && data.currentRsi > 70
              ? "Aşırı Alım"
              : data.currentRsi != null && data.currentRsi < 30
                ? "Aşırı Satım"
                : "Nötr"}
          </Text>
        </View>
        <View style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>ATR (14)</Text>
          <Text style={[styles.miniValueLg, { color: colors.foreground }]}>
            {data.currentAtr ? formatCurrency(data.currentAtr, currency) : "-"}
          </Text>
          <Text style={[styles.miniSubText, { color: colors.mutedForeground }]}>
            {data.atrPercent != null
              ? `±${data.atrPercent.toFixed(2)}% günlük`
              : ""}
          </Text>
        </View>
      </View>

      {/* Price chart with overlays */}
      <PriceOverlayChart data={data.chartData} support={data.support} resistance={data.resistance} currency={currency} />

      {/* Support / Resistance */}
      <LevelsCard
        title="Destek & Direnç"
        icon="layers"
        currency={currency}
        currentPrice={data.currentPrice}
        rows={[
          ...data.resistance.map((p, i) => ({
            label: `Direnç ${data.resistance.length - i}`,
            price: p,
            type: "resistance" as const,
          })),
          ...data.support
            .slice()
            .reverse()
            .map((p, i) => ({
              label: `Destek ${i + 1}`,
              price: p,
              type: "support" as const,
            })),
        ]}
      />

      {/* Fibonacci */}
      <FibonacciCard fib={data.fibonacci} currency={currency} currentPrice={data.currentPrice} />

      {/* Pivot Points */}
      <PivotCard pivot={data.pivotPoints} currency={currency} currentPrice={data.currentPrice} />

      {/* Pattern detection */}
      <PatternsCard patterns={data.patterns} />

      {/* Signal cards */}
      <SignalCards signals={data.signals} />

      {/* RSI / Stochastic / MACD */}
      <IndicatorChart
        title="RSI (14) — Güç Endeksi"
        data={data.chartData.map((c) => c.rsi)}
        domain={[0, 100]}
        refLines={[
          { value: 70, color: "destructive", label: "70" },
          { value: 30, color: "positive", label: "30" },
          { value: 50, color: "border", label: "50" },
        ]}
        primaryColor="rsi"
      />
      <IndicatorChart
        title="Stochastic (14, 3)"
        data={data.chartData.map((c) => c.stoch_k)}
        secondaryData={data.chartData.map((c) => c.stoch_d)}
        domain={[0, 100]}
        refLines={[
          { value: 80, color: "destructive", label: "80" },
          { value: 20, color: "positive", label: "20" },
        ]}
        primaryColor="stoch"
      />
      <MacdChart data={data.chartData} />
    </View>
  );
}

function PriceOverlayChart({
  data,
  support,
  resistance,
  currency,
}: {
  data: ChartRow[];
  support: number[];
  resistance: number[];
  currency?: string;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [showBB, setShowBB] = useState(true);
  const [showSMA, setShowSMA] = useState(true);

  const built = useMemo(() => {
    if (!data.length) return null;
    const W = Math.min(width - 32 - 24, 720);
    const H = 220;
    const closes = data.map((c) => c.close);
    const all: number[] = [...closes];
    if (showBB) {
      data.forEach((c) => {
        if (c.bb_upper != null) all.push(c.bb_upper);
        if (c.bb_lower != null) all.push(c.bb_lower);
      });
    }
    [...support, ...resistance].forEach((p) => all.push(p));
    const min = Math.min(...all);
    const max = Math.max(...all);
    const range = max - min || 1;
    const stepX = W / Math.max(data.length - 1, 1);
    const yOf = (v: number) => H - ((v - min) / range) * H;
    const lineFor = (vals: (number | null)[]) =>
      vals
        .map((v, i) => (v == null ? null : `${i * stepX},${yOf(v)}`))
        .filter((p): p is string => p != null)
        .join(" ");

    return {
      W,
      H,
      yOf,
      pricePoints: lineFor(closes as (number | null)[]),
      sma20: showSMA ? lineFor(data.map((c) => c.sma20)) : "",
      sma50: showSMA ? lineFor(data.map((c) => c.sma50)) : "",
      bbUpper: showBB ? lineFor(data.map((c) => c.bb_upper)) : "",
      bbLower: showBB ? lineFor(data.map((c) => c.bb_lower)) : "",
    };
  }, [data, width, showBB, showSMA, support, resistance]);

  if (!built) return null;
  const isPos = data[data.length - 1]!.close >= data[0]!.close;
  const lineColor = isPos ? colors.positive : colors.negative;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Feather name="bar-chart-2" size={14} color={colors.foreground} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Fiyat + Göstergeler
          </Text>
        </View>
        <View style={styles.toggleRow}>
          {[
            { l: "BB", v: showBB, s: setShowBB, c: "#a855f7" },
            { l: "SMA", v: showSMA, s: setShowSMA, c: "#facc15" },
          ].map((t) => (
            <Pressable
              key={t.l}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                t.s(!t.v);
              }}
              style={({ pressed }) => [
                styles.toggle,
                {
                  borderColor: t.v ? t.c : colors.border,
                  backgroundColor: t.v ? t.c + "22" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.toggleText, { color: t.v ? t.c : colors.mutedForeground }]}>
                {t.l}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        <Svg width={built.W} height={built.H}>
          {[0.25, 0.5, 0.75].map((p) => (
            <Line
              key={p}
              x1={0}
              x2={built.W}
              y1={built.H * p}
              y2={built.H * p}
              stroke={colors.border}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          ))}
          {/* Support lines */}
          {support.map((s, i) => (
            <Line
              key={`s${i}`}
              x1={0}
              x2={built.W}
              y1={built.yOf(s)}
              y2={built.yOf(s)}
              stroke={colors.positive}
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={0.6}
            />
          ))}
          {/* Resistance lines */}
          {resistance.map((r, i) => (
            <Line
              key={`r${i}`}
              x1={0}
              x2={built.W}
              y1={built.yOf(r)}
              y2={built.yOf(r)}
              stroke={colors.negative}
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={0.6}
            />
          ))}
          {/* Bollinger bands */}
          {built.bbUpper && (
            <Polyline points={built.bbUpper} fill="none" stroke="#a855f7" strokeWidth={1} opacity={0.7} />
          )}
          {built.bbLower && (
            <Polyline points={built.bbLower} fill="none" stroke="#a855f7" strokeWidth={1} opacity={0.7} />
          )}
          {/* SMA */}
          {built.sma20 && (
            <Polyline points={built.sma20} fill="none" stroke="#facc15" strokeWidth={1.5} />
          )}
          {built.sma50 && (
            <Polyline points={built.sma50} fill="none" stroke="#fb923c" strokeWidth={1.5} />
          )}
          {/* Price (last on top) */}
          <Polyline points={built.pricePoints} fill="none" stroke={lineColor} strokeWidth={2} />
        </Svg>
      </ScrollView>

      <View style={styles.legendRow}>
        <Legend color={lineColor} label="Fiyat" />
        <Legend color={colors.positive} label="Destek" />
        <Legend color={colors.negative} label="Direnç" />
        {showBB && <Legend color="#a855f7" label="Bollinger" />}
        {showSMA && <Legend color="#facc15" label="SMA20" />}
        {showSMA && <Legend color="#fb923c" label="SMA50" />}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const colors = useColors();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function LevelsCard({
  title,
  icon,
  currentPrice,
  currency,
  rows,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  currentPrice: number;
  currency?: string;
  rows: { label: string; price: number; type: "support" | "resistance" }[];
}) {
  const colors = useColors();
  if (!rows.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTitleRow}>
        <Feather name={icon} size={14} color={colors.foreground} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <View style={{ marginTop: 8 }}>
        {rows.map((row, i) => {
          const c = row.type === "support" ? colors.positive : colors.negative;
          const dist = ((row.price - currentPrice) / currentPrice) * 100;
          return (
            <View
              key={`${row.label}-${i}`}
              style={[styles.levelRow, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.levelDot, { backgroundColor: c }]} />
              <Text style={[styles.levelLabel, { color: colors.foreground }]}>{row.label}</Text>
              <Text style={[styles.levelPrice, { color: c }]}>
                {formatCurrency(row.price, currency)}
              </Text>
              <Text style={[styles.levelDist, { color: colors.mutedForeground }]}>
                {formatPercent(dist)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FibonacciCard({
  fib,
  currentPrice,
  currency,
}: {
  fib: AnalysisData["fibonacci"];
  currentPrice: number;
  currency?: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTitleRow}>
        <Feather name="git-branch" size={14} color={colors.foreground} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Fibonacci ({fib.trend === "up" ? "Yükselen" : "Düşen"})
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        {fib.levels.map((lvl) => {
          const dist = ((lvl.price - currentPrice) / currentPrice) * 100;
          const isClose = Math.abs(dist) < 1;
          return (
            <View
              key={lvl.label}
              style={[styles.levelRow, { borderBottomColor: colors.border }]}
            >
              <Text
                style={[
                  styles.fibRatio,
                  { color: isClose ? colors.primary : colors.mutedForeground },
                ]}
              >
                {lvl.label}
              </Text>
              <Text
                style={[
                  styles.levelPrice,
                  { color: isClose ? colors.primary : colors.foreground },
                ]}
              >
                {formatCurrency(lvl.price, currency)}
              </Text>
              <Text style={[styles.levelDist, { color: colors.mutedForeground }]}>
                {formatPercent(dist)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PivotCard({
  pivot,
  currentPrice,
  currency,
}: {
  pivot: AnalysisData["pivotPoints"];
  currentPrice: number;
  currency?: string;
}) {
  const colors = useColors();
  const rows = [
    { label: "R3", value: pivot.r3, color: colors.negative },
    { label: "R2", value: pivot.r2, color: colors.negative },
    { label: "R1", value: pivot.r1, color: colors.negative },
    { label: "Pivot", value: pivot.pivot, color: colors.warning },
    { label: "S1", value: pivot.s1, color: colors.positive },
    { label: "S2", value: pivot.s2, color: colors.positive },
    { label: "S3", value: pivot.s3, color: colors.positive },
  ];
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTitleRow}>
        <Feather name="target" size={14} color={colors.foreground} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Pivot Noktaları</Text>
      </View>
      <View style={{ marginTop: 8 }}>
        {rows.map((row) => {
          const dist = ((row.value - currentPrice) / currentPrice) * 100;
          return (
            <View
              key={row.label}
              style={[styles.levelRow, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.pivotLabel, { color: row.color }]}>{row.label}</Text>
              <Text style={[styles.levelPrice, { color: colors.foreground }]}>
                {formatCurrency(row.value, currency)}
              </Text>
              <Text style={[styles.levelDist, { color: colors.mutedForeground }]}>
                {formatPercent(dist)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PatternsCard({ patterns }: { patterns: Pattern[] }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTitleRow}>
        <Feather name="layers" size={14} color={colors.foreground} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Formasyon Tespiti</Text>
      </View>
      {patterns.length === 0 ? (
        <Text
          style={[
            styles.subdued,
            { color: colors.mutedForeground, textAlign: "center", paddingVertical: 16 },
          ]}
        >
          Belirgin bir formasyon tespit edilmedi
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 10 }}>
          {patterns.map((p, i) => {
            const c =
              p.type === "bullish"
                ? colors.positive
                : p.type === "bearish"
                  ? colors.negative
                  : colors.warning;
            return (
              <View
                key={i}
                style={[styles.patternBox, { borderColor: c + "55", backgroundColor: c + "11" }]}
              >
                <View style={styles.patternHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.patternName, { color: colors.foreground }]}>
                      {p.nameTr}
                    </Text>
                    <Text style={[styles.patternEn, { color: colors.mutedForeground }]}>
                      {p.name}
                    </Text>
                  </View>
                  <View style={[styles.patternBadge, { backgroundColor: c + "33" }]}>
                    <Text style={[styles.patternBadgeText, { color: c }]}>
                      {p.type === "bullish" ? "↑ YÜKSELEN" : p.type === "bearish" ? "↓ DÜŞEN" : "→ NÖTR"}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.patternDesc, { color: colors.mutedForeground }]}>
                  {p.description}
                </Text>
                <View style={styles.confidenceWrap}>
                  <View style={[styles.confidenceBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.confidenceFill,
                        { backgroundColor: c, width: `${p.confidence}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.confidenceText, { color: colors.mutedForeground }]}>
                    Güven %{p.confidence}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SignalCards({ signals }: { signals: IndicatorSignal[] }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTitleRow}>
        <Feather name="activity" size={14} color={colors.foreground} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Gösterge Sinyalleri
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        {signals.map((s, i) => {
          const c =
            s.signal === "buy"
              ? colors.positive
              : s.signal === "sell"
                ? colors.negative
                : colors.warning;
          const lbl = s.signal === "buy" ? "AL" : s.signal === "sell" ? "SAT" : "NÖTR";
          const ic = s.signal === "buy" ? "check-circle" : s.signal === "sell" ? "x-circle" : "minus-circle";
          return (
            <View
              key={i}
              style={[styles.sigRow, { borderBottomColor: colors.border }]}
            >
              <View style={styles.sigLeft}>
                <Text style={[styles.sigName, { color: colors.foreground }]}>{s.name}</Text>
                <Text style={[styles.sigDetail, { color: colors.mutedForeground }]}>
                  {s.detail}
                </Text>
              </View>
              <View style={styles.sigRight}>
                <Text style={[styles.sigValue, { color: colors.foreground }]}>{s.value}</Text>
                <View style={[styles.sigBadge, { backgroundColor: c + "22" }]}>
                  <Feather name={ic} size={10} color={c} />
                  <Text style={[styles.sigBadgeText, { color: c }]}>{lbl}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type IndicatorChartProps = {
  title: string;
  data: (number | null)[];
  secondaryData?: (number | null)[];
  domain: [number, number];
  refLines?: { value: number; color: "destructive" | "positive" | "border"; label: string }[];
  primaryColor: "rsi" | "stoch" | "macd";
};

function IndicatorChart({
  title,
  data,
  secondaryData,
  domain,
  refLines = [],
  primaryColor,
}: IndicatorChartProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();

  const built = useMemo(() => {
    const W = Math.min(width - 32 - 24, 720);
    const H = 120;
    const [min, max] = domain;
    const range = max - min || 1;
    const valid = data.filter((v): v is number => v != null);
    if (!valid.length) return null;
    const stepX = W / Math.max(data.length - 1, 1);
    const yOf = (v: number) => H - ((v - min) / range) * H;
    const lineFor = (vals: (number | null)[]) =>
      vals
        .map((v, i) => (v == null ? null : `${i * stepX},${yOf(v)}`))
        .filter((p): p is string => p != null)
        .join(" ");
    return {
      W,
      H,
      yOf,
      primary: lineFor(data),
      secondary: secondaryData ? lineFor(secondaryData) : "",
    };
  }, [data, secondaryData, domain, width]);

  if (!built) return null;

  const primaryStroke =
    primaryColor === "rsi" ? "#a78bfa" : primaryColor === "stoch" ? "#60a5fa" : colors.primary;
  const refColor = (k: "destructive" | "positive" | "border") =>
    k === "destructive" ? colors.destructive : k === "positive" ? colors.positive : colors.border;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom: 8 }]}>
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={built.W} height={built.H}>
          {refLines.map((r) => (
            <Line
              key={r.value}
              x1={0}
              x2={built.W}
              y1={built.yOf(r.value)}
              y2={built.yOf(r.value)}
              stroke={refColor(r.color)}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.7}
            />
          ))}
          {built.secondary && (
            <Polyline
              points={built.secondary}
              fill="none"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="4,2"
            />
          )}
          <Polyline points={built.primary} fill="none" stroke={primaryStroke} strokeWidth={2} />
        </Svg>
      </ScrollView>
    </View>
  );
}

function MacdChart({ data }: { data: ChartRow[] }) {
  const colors = useColors();
  const { width } = useWindowDimensions();

  const built = useMemo(() => {
    const W = Math.min(width - 32 - 24, 720);
    const H = 140;
    const macd = data.map((c) => c.macd);
    const signal = data.map((c) => c.macd_signal);
    const hist = data.map((c) => c.macd_hist);
    const all = [...macd, ...signal, ...hist].filter((v): v is number => v != null);
    if (!all.length) return null;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const range = max - min || 1;
    const stepX = W / Math.max(data.length - 1, 1);
    const yOf = (v: number) => H - ((v - min) / range) * H;
    const zeroY = yOf(0);
    const barW = Math.max(stepX * 0.7, 1);
    const lineFor = (vals: (number | null)[]) =>
      vals
        .map((v, i) => (v == null ? null : `${i * stepX},${yOf(v)}`))
        .filter((p): p is string => p != null)
        .join(" ");
    return {
      W,
      H,
      zeroY,
      barW,
      stepX,
      hist,
      yOf,
      macdLine: lineFor(macd),
      signalLine: lineFor(signal),
    };
  }, [data, width]);

  if (!built) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom: 8 }]}>
        MACD (12, 26, 9)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={built.W} height={built.H}>
          <Line
            x1={0}
            x2={built.W}
            y1={built.zeroY}
            y2={built.zeroY}
            stroke={colors.border}
            strokeWidth={1}
          />
          {built.hist.map((h, i) => {
            if (h == null) return null;
            const top = built.yOf(h);
            const y = Math.min(top, built.zeroY);
            const height = Math.abs(top - built.zeroY);
            return (
              <Rect
                key={i}
                x={i * built.stepX - built.barW / 2}
                y={y}
                width={built.barW}
                height={Math.max(height, 0.5)}
                fill={h >= 0 ? colors.positive : colors.negative}
                opacity={0.55}
              />
            );
          })}
          <Polyline points={built.macdLine} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
          <Polyline
            points={built.signalLine}
            fill="none"
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="4,2"
          />
        </Svg>
      </ScrollView>
      <View style={styles.legendRow}>
        <Legend color="#3b82f6" label="MACD" />
        <Legend color="#f97316" label="Sinyal" />
        <Legend color={colors.positive} label="Histogram +" />
        <Legend color={colors.negative} label="Histogram -" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentPad: { padding: 16, gap: 12 },
  center: { alignItems: "center", justifyContent: "center" },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  subdued: { fontFamily: "Inter_400Regular", fontSize: 13 },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },

  periodRow: { flexDirection: "row", gap: 8 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  periodLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  signalHero: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
  },
  heroLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  heroSignal: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: 1,
    marginVertical: 6,
  },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  countCell: { alignItems: "center", minWidth: 50 },
  countNum: { fontFamily: "Inter_700Bold", fontSize: 18 },
  countLabel: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.8, marginTop: 2 },
  countDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  miniGrid: { flexDirection: "row", gap: 8 },
  miniCard: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    gap: 4,
  },
  miniLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  miniValue: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  miniValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  miniValueLg: { fontFamily: "Inter_700Bold", fontSize: 16 },
  miniSubText: { fontFamily: "Inter_400Regular", fontSize: 10 },

  toggleRow: { flexDirection: "row", gap: 6 },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  toggleText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },

  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 2, borderRadius: 1 },
  legendLabel: { fontFamily: "Inter_400Regular", fontSize: 10 },

  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12 },
  levelPrice: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  levelDist: { fontFamily: "Inter_500Medium", fontSize: 11, minWidth: 60, textAlign: "right" },
  fibRatio: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  pivotLabel: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 12 },

  patternBox: { padding: 12, borderRadius: 10, borderWidth: 1 },
  patternHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  patternName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  patternEn: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
  patternBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  patternBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 0.5 },
  patternDesc: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  confidenceWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  confidenceBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  confidenceFill: { height: 4, borderRadius: 2 },
  confidenceText: { fontFamily: "Inter_500Medium", fontSize: 10 },

  sigRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sigLeft: { flex: 1 },
  sigName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sigDetail: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
  sigRight: { alignItems: "flex-end", gap: 4 },
  sigValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sigBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  sigBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.3 },
});
