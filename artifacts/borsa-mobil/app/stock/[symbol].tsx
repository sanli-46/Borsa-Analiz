import { Feather } from "@expo/vector-icons";
import {
  useGetStockFinancials,
  useGetStockHistory,
  useGetStockNews,
  useGetStockQuote,
  useGetStockSummary,
  type StockQuote,
  type StockSummary,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Line, Path, Polyline } from "react-native-svg";

import { AnalysisSection } from "@/components/AnalysisSection";
import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatDate, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

type Section = "overview" | "chart" | "analysis" | "financials" | "news";

const SECTIONS: { id: Section; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "overview", label: "Genel", icon: "info" },
  { id: "chart", label: "Grafik", icon: "bar-chart-2" },
  { id: "analysis", label: "Analiz", icon: "activity" },
  { id: "financials", label: "Finansal", icon: "dollar-sign" },
  { id: "news", label: "Haber", icon: "file-text" },
];

export default function StockDetail() {
  const { symbol: rawSymbol, section: initialSection } = useLocalSearchParams<{
    symbol: string;
    section?: Section;
  }>();
  const symbol = (rawSymbol || "").toUpperCase();
  const colors = useColors();
  const navigation = useNavigation();
  const [section, setSection] = useState<Section>(
    initialSection && SECTIONS.some((s) => s.id === initialSection)
      ? initialSection
      : "overview",
  );

  const { data: quote, isLoading: quoteLoading, dataUpdatedAt } = useGetStockQuote(symbol, {
    query: {
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      enabled: !!symbol,
    } as never,
  });
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          if (!Array.isArray(key) || key.length === 0) return false;
          const head = key[0];
          if (typeof head === "string" && head.includes("/stock/")) return true;
          if (head === "analysis" && key[1] === symbol) return true;
          return false;
        },
      });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);
  const { data: summary } = useGetStockSummary(symbol, {
    query: { staleTime: 5 * 60_000, enabled: !!symbol } as never,
  });

  useLayoutEffect(() => {
    navigation.setOptions({ title: symbol });
  }, [navigation, symbol]);

  if (quoteLoading || !quote) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isPos = (quote.regularMarketChangePercent ?? 0) >= 0;
  const changeColor = isPos ? colors.positive : colors.negative;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      {/* Price hero */}
      <View style={[styles.hero, { borderBottomColor: colors.border }]}>
        <View style={styles.heroTop}>
          <Text style={[styles.heroSymbol, { color: colors.foreground }]}>
            {quote.symbol}
          </Text>
          {quote.exchange && (
            <View style={[styles.exchangeBadge, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.exchangeText, { color: colors.mutedForeground }]}>
                {quote.exchange}
              </Text>
            </View>
          )}
        </View>
        {quote.longName && (
          <Text
            style={[styles.heroName, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {quote.longName}
          </Text>
        )}
        <Text style={[styles.heroPrice, { color: colors.foreground }]}>
          {formatCurrency(quote.regularMarketPrice, quote.currency)}
        </Text>
        <View style={styles.heroChangeRow}>
          <Feather
            name={isPos ? "trending-up" : "trending-down"}
            size={16}
            color={changeColor}
          />
          <Text style={[styles.heroChange, { color: changeColor }]}>
            {isPos ? "+" : ""}
            {formatCurrency(quote.regularMarketChange, quote.currency)}
          </Text>
          <Text style={[styles.heroChange, { color: changeColor }]}>
            ({formatPercent(quote.regularMarketChangePercent)})
          </Text>
        </View>
        <View style={styles.heroLiveRow}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.liveText, { color: colors.mutedForeground }]}>
            Anlık · {formatTime(dataUpdatedAt || Date.now())}
          </Text>
        </View>
      </View>

      {/* Section tabs */}
      <View style={[styles.sections, { borderBottomColor: colors.border }]}>
        {SECTIONS.map((s) => {
          const active = section === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setSection(s.id);
              }}
              style={({ pressed }) => [
                styles.sectionTab,
                {
                  borderBottomColor: active ? colors.primary : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather
                name={s.icon}
                size={14}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.sectionLabel,
                  { color: active ? colors.primary : colors.mutedForeground },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === "overview" && <OverviewSection quote={quote} summary={summary} />}
      {section === "chart" && <ChartSection symbol={symbol} currency={quote.currency} />}
      {section === "analysis" && <AnalysisSection symbol={symbol} currency={quote.currency} />}
      {section === "financials" && <FinancialsSection symbol={symbol} />}
      {section === "news" && <NewsSection symbol={symbol} />}
    </ScrollView>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: color || colors.foreground }]}>{value}</Text>
    </View>
  );
}

function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {title && (
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      )}
      {children}
    </View>
  );
}

function OverviewSection({
  quote,
  summary,
}: {
  quote: StockQuote;
  summary: StockSummary | undefined;
}) {
  const colors = useColors();
  const cur = quote.currency;
  const sigColor = (sig?: string) => {
    const s = (sig || "").toUpperCase();
    if (s.includes("AL") || s.includes("BUY")) return colors.positive;
    if (s.includes("SAT") || s.includes("SELL")) return colors.negative;
    return colors.warning;
  };

  return (
    <View style={styles.contentPad}>
      {summary?.overallSignal && (
        <Card title="Genel Sinyal">
          <View style={styles.signalRow}>
            <View
              style={[
                styles.signalBadge,
                { backgroundColor: sigColor(summary.overallSignal) + "22", borderColor: sigColor(summary.overallSignal) },
              ]}
            >
              <Text style={[styles.signalText, { color: sigColor(summary.overallSignal) }]}>
                {summary.overallSignal}
              </Text>
            </View>
            {summary.analystRating && (
              <Text style={[styles.subdued, { color: colors.mutedForeground }]}>
                Analist: {summary.analystRating}
              </Text>
            )}
          </View>
        </Card>
      )}

      <Card title="Günlük Veriler">
        <StatRow label="Açılış" value={formatCurrency(quote.regularMarketOpen, cur)} />
        <StatRow label="Gün En Yüksek" value={formatCurrency(quote.regularMarketDayHigh, cur)} />
        <StatRow label="Gün En Düşük" value={formatCurrency(quote.regularMarketDayLow, cur)} />
        <StatRow label="Önceki Kapanış" value={formatCurrency(quote.regularMarketPreviousClose, cur)} />
        <StatRow label="Hacim" value={formatNumber(quote.regularMarketVolume)} />
      </Card>

      <Card title="52 Hafta">
        <StatRow label="En Yüksek" value={formatCurrency(quote.fiftyTwoWeekHigh, cur)} />
        <StatRow label="En Düşük" value={formatCurrency(quote.fiftyTwoWeekLow, cur)} />
        {summary?.weeklyChange != null && (
          <StatRow
            label="Haftalık Değişim"
            value={formatPercent(summary.weeklyChange)}
            color={summary.weeklyChange >= 0 ? colors.positive : colors.negative}
          />
        )}
        {summary?.monthlyChange != null && (
          <StatRow
            label="Aylık Değişim"
            value={formatPercent(summary.monthlyChange)}
            color={summary.monthlyChange >= 0 ? colors.positive : colors.negative}
          />
        )}
        {summary?.yearlyChange != null && (
          <StatRow
            label="Yıllık Değişim"
            value={formatPercent(summary.yearlyChange)}
            color={summary.yearlyChange >= 0 ? colors.positive : colors.negative}
          />
        )}
      </Card>

      <Card title="Değerleme">
        <StatRow label="Piyasa Değeri" value={formatNumber(quote.marketCap)} />
        <StatRow label="F/K (TTM)" value={quote.trailingPE != null ? quote.trailingPE.toFixed(2) : "-"} />
        <StatRow label="F/K (İleri)" value={quote.forwardPE != null ? quote.forwardPE.toFixed(2) : "-"} />
        <StatRow label="PD/DD" value={quote.priceToBook != null ? quote.priceToBook.toFixed(2) : "-"} />
        <StatRow label="HBK (TTM)" value={quote.trailingEps != null ? quote.trailingEps.toFixed(2) : "-"} />
        <StatRow
          label="Temettü Verimi"
          value={quote.dividendYield != null ? formatPercent(quote.dividendYield) : "-"}
        />
        <StatRow label="Beta" value={quote.beta != null ? quote.beta.toFixed(2) : "-"} />
      </Card>

      {summary?.currentRsi != null && (
        <Card title="Teknik Özet">
          <StatRow
            label="RSI (14)"
            value={summary.currentRsi.toFixed(2)}
            color={
              summary.currentRsi > 70
                ? colors.negative
                : summary.currentRsi < 30
                  ? colors.positive
                  : colors.warning
            }
          />
          {summary.priceVsSma50 != null && (
            <StatRow
              label="SMA 50'ye göre"
              value={formatPercent(summary.priceVsSma50)}
              color={summary.priceVsSma50 >= 0 ? colors.positive : colors.negative}
            />
          )}
          {summary.priceVsSma200 != null && (
            <StatRow
              label="SMA 200'e göre"
              value={formatPercent(summary.priceVsSma200)}
              color={summary.priceVsSma200 >= 0 ? colors.positive : colors.negative}
            />
          )}
          {summary.volatility != null && (
            <StatRow label="Volatilite" value={formatPercent(summary.volatility)} />
          )}
        </Card>
      )}

      {(quote.sector || quote.industry) && (
        <Card title="Şirket">
          {quote.sector && <StatRow label="Sektör" value={quote.sector} />}
          {quote.industry && <StatRow label="Endüstri" value={quote.industry} />}
          {quote.country && <StatRow label="Ülke" value={quote.country} />}
        </Card>
      )}
    </View>
  );
}

const PERIODS = [
  { id: "1mo", label: "1A" },
  { id: "3mo", label: "3A" },
  { id: "6mo", label: "6A" },
  { id: "1y", label: "1Y" },
  { id: "5y", label: "5Y" },
] as const;

function ChartSection({ symbol, currency }: { symbol: string; currency?: string }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<typeof PERIODS[number]["id"]>("3mo");

  const { data, isLoading } = useGetStockHistory(
    symbol,
    { period, interval: "1d" },
    { query: { staleTime: 5 * 60_000, enabled: true } as never },
  );

  const chartData = useMemo(() => {
    const candles = data?.candles || [];
    if (!candles.length) return null;
    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const chartW = Math.min(width - 40, 720);
    const chartH = 200;
    const stepX = chartW / Math.max(candles.length - 1, 1);
    const points = closes.map((v, i) => {
      const x = i * stepX;
      const y = chartH - ((v - min) / range) * chartH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const first = closes[0]!;
    const last = closes[closes.length - 1]!;
    const isPos = last >= first;
    return { points: points.join(" "), min, max, chartW, chartH, isPos, first, last };
  }, [data, width]);

  return (
    <View style={styles.contentPad}>
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

      {isLoading ? (
        <View style={[styles.center, { paddingVertical: 60 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !chartData ? (
        <Card>
          <Text style={[styles.subdued, { color: colors.mutedForeground, textAlign: "center" }]}>
            Grafik verisi alınamadı
          </Text>
        </Card>
      ) : (
        <Card>
          <View style={styles.chartHeader}>
            <View>
              <Text style={[styles.chartLabel, { color: colors.mutedForeground }]}>
                Dönem Değişimi
              </Text>
              <Text
                style={[
                  styles.chartChange,
                  { color: chartData.isPos ? colors.positive : colors.negative },
                ]}
              >
                {formatPercent(((chartData.last - chartData.first) / chartData.first) * 100)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.chartLabel, { color: colors.mutedForeground }]}>Son</Text>
              <Text style={[styles.chartChange, { color: colors.foreground }]}>
                {formatCurrency(chartData.last, currency)}
              </Text>
            </View>
          </View>

          <Svg width={chartData.chartW} height={chartData.chartH} style={{ marginTop: 12 }}>
            {[0.25, 0.5, 0.75].map((p) => (
              <Line
                key={p}
                x1={0}
                x2={chartData.chartW}
                y1={chartData.chartH * p}
                y2={chartData.chartH * p}
                stroke={colors.border}
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
            ))}
            <Polyline
              points={chartData.points}
              fill="none"
              stroke={chartData.isPos ? colors.positive : colors.negative}
              strokeWidth={2}
            />
            <Path
              d={`M 0,${chartData.chartH} L ${chartData.points.split(" ").join(" L ")} L ${chartData.chartW},${chartData.chartH} Z`}
              fill={chartData.isPos ? colors.positive : colors.negative}
              fillOpacity={0.08}
            />
          </Svg>

          <View style={[styles.chartFooter, { borderTopColor: colors.border }]}>
            <View>
              <Text style={[styles.chartLabel, { color: colors.mutedForeground }]}>Min</Text>
              <Text style={[styles.chartFooterValue, { color: colors.foreground }]}>
                {formatCurrency(chartData.min, currency)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.chartLabel, { color: colors.mutedForeground }]}>Max</Text>
              <Text style={[styles.chartFooterValue, { color: colors.foreground }]}>
                {formatCurrency(chartData.max, currency)}
              </Text>
            </View>
          </View>
        </Card>
      )}
    </View>
  );
}

function FinancialsSection({ symbol }: { symbol: string }) {
  const colors = useColors();
  const { data, isLoading } = useGetStockFinancials(symbol, {
    query: { staleTime: 10 * 60_000, enabled: true } as never,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingVertical: 60 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const income = data?.incomeStatements?.slice(0, 4) || [];
  const balance = data?.balanceSheets?.slice(0, 4) || [];
  const cashflow = data?.cashFlows?.slice(0, 4) || [];

  if (!income.length && !balance.length && !cashflow.length) {
    return (
      <View style={styles.contentPad}>
        <Card>
          <Text style={[styles.subdued, { color: colors.mutedForeground, textAlign: "center" }]}>
            Finansal veri bulunamadı
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.contentPad}>
      {income.length > 0 && (
        <Card title="Gelir Tablosu">
          {income.map((row) => (
            <View
              key={row.date}
              style={[styles.finRow, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.finDate, { color: colors.mutedForeground }]}>
                {formatDate(row.date)}
              </Text>
              <View style={styles.finGrid}>
                <FinCell label="Gelir" value={formatNumber(row.totalRevenue)} />
                <FinCell label="Brüt Kar" value={formatNumber(row.grossProfit)} />
                <FinCell label="Net Kar" value={formatNumber(row.netIncome)} />
                <FinCell label="EBITDA" value={formatNumber(row.ebitda)} />
              </View>
            </View>
          ))}
        </Card>
      )}

      {balance.length > 0 && (
        <Card title="Bilanço">
          {balance.map((row) => (
            <View
              key={row.date}
              style={[styles.finRow, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.finDate, { color: colors.mutedForeground }]}>
                {formatDate(row.date)}
              </Text>
              <View style={styles.finGrid}>
                <FinCell label="Toplam Varlık" value={formatNumber(row.totalAssets)} />
                <FinCell label="Toplam Borç" value={formatNumber(row.totalLiab)} />
                <FinCell label="Özkaynak" value={formatNumber(row.totalStockholderEquity)} />
                <FinCell label="Nakit" value={formatNumber(row.cash)} />
              </View>
            </View>
          ))}
        </Card>
      )}

      {cashflow.length > 0 && (
        <Card title="Nakit Akışı">
          {cashflow.map((row) => (
            <View
              key={row.date}
              style={[styles.finRow, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.finDate, { color: colors.mutedForeground }]}>
                {formatDate(row.date)}
              </Text>
              <View style={styles.finGrid}>
                <FinCell label="Faaliyet" value={formatNumber(row.operatingCashflow)} />
                <FinCell label="Yatırım" value={formatNumber(row.capitalExpenditures)} />
                <FinCell label="Serbest" value={formatNumber(row.freeCashflow)} />
                <FinCell label="Net Kar" value={formatNumber(row.netIncome)} />
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function FinCell({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.finCell}>
      <Text style={[styles.finCellLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.finCellValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function NewsSection({ symbol }: { symbol: string }) {
  const colors = useColors();
  const { data, isLoading } = useGetStockNews(symbol, {
    query: { staleTime: 5 * 60_000, enabled: true } as never,
  });

  const openLink = async (url?: string) => {
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        await WebBrowser.openBrowserAsync(url);
      }
    } catch {
      // invalid url
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingVertical: 60 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!data?.length) {
    return (
      <View style={styles.contentPad}>
        <Card>
          <Text style={[styles.subdued, { color: colors.mutedForeground, textAlign: "center" }]}>
            Haber bulunamadı
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.contentPad}>
      {data.map((article, idx) => (
        <Pressable
          key={`${article.link}-${idx}`}
          onPress={() => openLink(article.link)}
          style={({ pressed }) => [
            styles.newsCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.newsHeader}>
            {article.publisher && (
              <Text style={[styles.newsPublisher, { color: colors.primary }]}>
                {article.publisher}
              </Text>
            )}
            {article.providerPublishTime && (
              <Text style={[styles.newsTime, { color: colors.mutedForeground }]}>
                {formatDate(article.providerPublishTime)}
              </Text>
            )}
          </View>
          <Text
            style={[styles.newsTitle, { color: colors.foreground }]}
            numberOfLines={3}
          >
            {article.title}
          </Text>
          <View style={styles.newsFooter}>
            <Feather name="external-link" size={12} color={colors.mutedForeground} />
            <Text style={[styles.newsFooterText, { color: colors.mutedForeground }]}>
              Yeni sekmede aç
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroSymbol: { fontFamily: "Inter_700Bold", fontSize: 28 },
  exchangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  exchangeText: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.8 },
  heroName: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  heroPrice: { fontFamily: "Inter_700Bold", fontSize: 36, marginTop: 12 },
  heroChangeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  heroChange: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  heroLiveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  sections: {
    flexDirection: "row",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
  },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  contentPad: { padding: 16, gap: 12 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  statValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  subdued: { fontFamily: "Inter_400Regular", fontSize: 13 },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  signalBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  signalText: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 0.5 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  periodLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  chartHeader: { flexDirection: "row", justifyContent: "space-between" },
  chartLabel: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.5 },
  chartChange: { fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 2 },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chartFooterValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 2 },
  finRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  finDate: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },
  finGrid: { flexDirection: "row", flexWrap: "wrap" },
  finCell: { width: "50%", paddingVertical: 4 },
  finCellLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  finCellValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 2 },
  newsCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  newsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  newsPublisher: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5 },
  newsTime: { fontFamily: "Inter_400Regular", fontSize: 11 },
  newsTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 20 },
  newsFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  newsFooterText: { fontFamily: "Inter_400Regular", fontSize: 11 },
});
