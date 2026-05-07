import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { searchSymbols, type SearchResultItem } from "@/lib/yahoo";

const POPULAR: string[] = [
  "AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "META",
  "THYAO.IS", "ASELS.IS", "TUPRS.IS", "GARAN.IS",
];

type SearchResult = SearchResultItem;

export default function SearchScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>("");

  const trimmed = query.trim();

  const { data, isFetching } = useQuery<SearchResult[]>({
    queryKey: ["search", trimmed],
    queryFn: () => searchSymbols(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });

  const open = (symbol: string): void => {
    if (Platform.OS !== "web")
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/stock/${encodeURIComponent(symbol)}` as never);
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
        <Text style={[styles.title, { color: colors.foreground }]}>Hisse Ara</Text>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Sembol veya şirket adı (AAPL, THYAO)"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: colors.foreground }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {trimmed.length < 2 ? (
        <View style={styles.popularWrap}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            POPÜLER HİSSELER
          </Text>
          <View style={styles.popularGrid}>
            {POPULAR.map((s) => (
              <Pressable
                key={s}
                onPress={() => open(s)}
                style={({ pressed }) => [
                  styles.popChip,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.popText, { color: colors.foreground }]}>
                  {s.replace(".IS", "")}
                </Text>
                {s.endsWith(".IS") && (
                  <Text style={[styles.popBadge, { color: colors.primary }]}>BIST</Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : isFetching && data == null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList<SearchResult>
          data={data ?? []}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="search" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                "{query}" için sonuç bulunamadı
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item.symbol)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.card : "transparent",
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowSymbol, { color: colors.foreground }]}>
                  {item.symbol}
                </Text>
                <Text
                  style={[styles.rowName, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {item.longname ?? item.shortname ?? ""}
                </Text>
              </View>
              <View style={styles.rowMeta}>
                {item.exchange != null && (
                  <Text style={[styles.exchange, { color: colors.mutedForeground }]}>
                    {item.exchange}
                  </Text>
                )}
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, marginBottom: 14 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  popularWrap: { padding: 20 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  popularGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  popChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  popText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  popBadge: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.5 },
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  rowSymbol: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  rowName: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  exchange: { fontFamily: "Inter_500Medium", fontSize: 11 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
});
