import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { formatCurrency, formatPercent, formatTime } from "@/lib/format";
import { getQuotes, type StockQuote } from "@/lib/yahoo";

type MarketTab = "all" | "us" | "bist";

const TABS: { id: MarketTab; label: string }[] = [
  { id: "all", label: "Öne Çıkanlar" },
  { id: "us", label: "ABD" },
  { id: "bist", label: "BIST" },
];

const REFRESH_MS = 30_000;

const WATCHLIST: string[] = [
  // ABD
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
  "GOOGL",
  "META",
  "AMZN",
  "AMD",
  // BIST
  "THYAO.IS",
  "ASELS.IS",
  "GARAN.IS",
  "TUPRS.IS",
  "BIMAS.IS",
  "EREGL.IS",
];

async function fetchWatchlist(): Promise<StockQuote[]> {
  return getQuotes(WATCHLIST);
}

export default function MarketsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MarketTab>("all");

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<StockQuote[]>({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
  });

  const filtered = useMemo((): StockQuote[] => {
    const list: StockQuote[] = data ?? [];
    if (activeTab === "all") return list;
    if (activeTab === "bist") return list.filter((s) => s.symbol.endsWith(".IS"));
    return list.filter((s) => !s.symbol.endsWith(".IS"));
  }, [data, activeTab]);

  const onTabPress = (id: MarketTab): void => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    setActiveTab(id);
  };

  const onRowPress = (symbol: string): void => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(("/stock/" + encodeURIComponent(symbol)) as never);
  };

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topInset + 12, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.brand, { color: colors.primary }]}>BORSA</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              ABD & BIST piyasa takibi
            </Text>
          </View>
          <View style={styles.liveRow}>
            {isFetching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={[styles.liveDot, { backgroundColor: colors.positive }]} />
            )}
            <Text style={[styles.liveLabel, { color: colors.mutedForeground }]}>
              {dataUpdatedAt ? formatTime(dataUpdatedAt) : "Canlı"}
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => onTabPress(t.id)}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error != null ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={32} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>Veri alınamadı</Text>
          <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
            {(error as Error)?.message ?? "Yahoo Finance erişimi kontrol edin"}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Tekrar Dene</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<StockQuote>
          data={filtered}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Hisse verisi bulunamadı
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const pct = item.regularMarketChangePercent ?? 0;
            const isPos = pct >= 0;
            const cleanSymbol = item.symbol.replace(".IS", "");
            const name = item.shortName ?? item.longName ?? cleanSymbol;
            const isEmpty = (item.regularMarketPrice ?? 0) === 0;
            return (
              <Pressable
                onPress={() => onRowPress(item.symbol)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.card : "transparent",
                  },
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.symbol, { color: colors.foreground }]}>{cleanSymbol}</Text>
                  <Text
                    style={[styles.name, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.price, { color: colors.foreground }]}>
                    {isEmpty ? "—" : formatCurrency(item.regularMarketPrice, item.currency)}
                  </Text>
                  {!isEmpty && (
                    <View
                      style={[
                        styles.changePill,
                        {
                          backgroundColor: isPos
                            ? "rgba(34,197,94,0.12)"
                            : "rgba(239,68,68,0.12)",
                        },
                      ]}
                    >
                      <Feather
                        name={isPos ? "trending-up" : "trending-down"}
                        size={11}
                        color={isPos ? colors.positive : colors.negative}
                      />
                      <Text
                        style={[
                          styles.changeText,
                          { color: isPos ? colors.positive : colors.negative },
                        ]}
                      >
                        {formatPercent(pct)}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  brand: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: { fontFamily: "Inter_500Medium", fontSize: 11 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowRight: { alignItems: "flex-end" },
  symbol: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  name: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  price: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  changeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  errorSub: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
