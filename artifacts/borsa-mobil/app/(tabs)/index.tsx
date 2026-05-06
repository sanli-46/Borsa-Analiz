import { Feather } from "@expo/vector-icons";
import { useGetWatchlist } from "@workspace/api-client-react";
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

type MarketTab = "all" | "us" | "bist";

const TABS: { id: MarketTab; label: string }[] = [
  { id: "all", label: "Öne Çıkanlar" },
  { id: "us", label: "ABD" },
  { id: "bist", label: "BIST" },
];

const REFRESH_MS = 30_000;

export default function MarketsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MarketTab>("all");

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useGetWatchlist({
    query: {
      refetchInterval: REFRESH_MS,
      staleTime: REFRESH_MS,
    } as never,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (activeTab === "all") return data;
    if (activeTab === "bist") return data.filter((s) => s.symbol?.endsWith(".IS"));
    return data.filter((s) => !s.symbol?.endsWith(".IS"));
  }, [data, activeTab]);

  const onTabPress = (id: MarketTab) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setActiveTab(id);
  };

  const onRowPress = (symbol: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/stock/${encodeURIComponent(symbol)}` as never);
  };

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
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
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={32} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>Veri alınamadı</Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Tekrar Dene</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 16,
          }}
          refreshControl={
            <RefreshControl
              refreshing={!!isFetching && !isLoading}
              onRefresh={() => refetch()}
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
            const isPos = (item.change ?? 0) >= 0;
            const cleanSymbol = item.symbol?.replace(".IS", "");
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
                    {item.shortName || ""}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.price, { color: colors.foreground }]}>
                    {formatCurrency(item.price, item.currency)}
                  </Text>
                  <View
                    style={[
                      styles.changePill,
                      {
                        backgroundColor: isPos
                          ? "rgba(34, 197, 94, 0.12)"
                          : "rgba(239, 68, 68, 0.12)",
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
                      {formatPercent(item.changePercent)}
                    </Text>
                  </View>
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
  brand: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: { fontFamily: "Inter_500Medium", fontSize: 11 },
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
