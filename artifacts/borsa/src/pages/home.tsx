import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import { TrendingUp, TrendingDown, Activity, Globe, Flag } from "lucide-react";
import { Layout } from "@/components/layout";

type WatchlistItem = {
  symbol: string;
  shortName?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  marketCap?: number;
  currency?: string;
};

function useMarketWatchlist(market: string) {
  return useQuery<WatchlistItem[]>({
    queryKey: ["watchlist", market],
    queryFn: async () => {
      const res = await fetch(`/api/stock/watchlist?market=${market}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 60000,
  });
}

type MarketTab = "all" | "us" | "bist";

export default function Home() {
  const [activeTab, setActiveTab] = useState<MarketTab>("all");
  const [, setLocation] = useLocation();

  const { data: watchlist, isLoading, error } = useMarketWatchlist(activeTab);

  const tabs: { id: MarketTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "all", label: "Öne Çıkanlar", icon: <Activity className="w-4 h-4" />, desc: "Her iki piyasadan öne çıkan hisseler" },
    { id: "us", label: "ABD Borsası", icon: <Globe className="w-4 h-4" />, desc: "S&P 500, Nasdaq ve NYSE hisseleri" },
    { id: "bist", label: "BIST (Türkiye)", icon: <Flag className="w-4 h-4" />, desc: "Borsa İstanbul hisseleri" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Market Overview Cards */}
        <section>
          <h1 className="text-2xl font-bold tracking-tight mb-4">Piyasa Özeti</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-sm text-muted-foreground font-medium mb-1">BIST 100</div>
              <div className="flex justify-between items-baseline">
                <div className="text-2xl font-semibold">XU100.IS</div>
                <button
                  onClick={() => setLocation("/stock/XU100.IS")}
                  className="text-primary text-xs hover:underline"
                >
                  Analiz Et
                </button>
              </div>
            </div>
            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-sm text-muted-foreground font-medium mb-1">S&P 500</div>
              <div className="flex justify-between items-baseline">
                <div className="text-2xl font-semibold">SPY</div>
                <button
                  onClick={() => setLocation("/stock/SPY")}
                  className="text-primary text-xs hover:underline"
                >
                  Analiz Et
                </button>
              </div>
            </div>
            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-sm text-muted-foreground font-medium mb-1">Nasdaq 100</div>
              <div className="flex justify-between items-baseline">
                <div className="text-2xl font-semibold">QQQ</div>
                <button
                  onClick={() => setLocation("/stock/QQQ")}
                  className="text-primary text-xs hover:underline"
                >
                  Analiz Et
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Market Tabs */}
        <section>
          <div className="flex items-center gap-1 mb-4 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-muted-foreground mb-3">
            {tabs.find((t) => t.id === activeTab)?.desc}
            {watchlist && !isLoading && (
              <span className="ml-2 text-primary font-medium">{watchlist.length} hisse</span>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="space-y-0">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0 animate-pulse">
                    <div className="w-16 h-4 bg-muted rounded" />
                    <div className="flex-1 h-4 bg-muted rounded" />
                    <div className="w-20 h-4 bg-muted rounded" />
                    <div className="w-16 h-4 bg-muted rounded" />
                    <div className="w-16 h-4 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-8 text-center text-destructive">
                Veri alınamadı. Lütfen tekrar deneyin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/50 border-b border-border uppercase tracking-wide">
                    <tr>
                      <th className="px-6 py-3 font-medium">#</th>
                      <th className="px-6 py-3 font-medium">Sembol</th>
                      <th className="px-6 py-3 font-medium">Şirket</th>
                      <th className="px-6 py-3 font-medium text-right">Fiyat</th>
                      <th className="px-6 py-3 font-medium text-right">Değişim</th>
                      <th className="px-6 py-3 font-medium text-right">Değişim %</th>
                      <th className="px-6 py-3 font-medium text-right hidden lg:table-cell">Piyasa Değeri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist?.map((item, idx) => {
                      const isPos = (item.change ?? 0) >= 0;
                      return (
                        <tr
                          key={item.symbol}
                          onClick={() => setLocation(`/stock/${item.symbol}`)}
                          className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-3.5 text-xs text-muted-foreground font-mono w-10">
                            {idx + 1}
                          </td>
                          <td className="px-6 py-3.5 font-semibold text-primary font-mono">
                            {item.symbol?.replace(".IS", "")}
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground max-w-[200px] truncate">
                            {item.shortName || "-"}
                          </td>
                          <td className="px-6 py-3.5 font-semibold text-right font-mono">
                            {item.price != null ? formatCurrency(item.price, item.currency) : "-"}
                          </td>
                          <td className={`px-6 py-3.5 font-medium text-right font-mono ${isPos ? "text-green-400" : "text-red-400"}`}>
                            {item.change != null
                              ? `${isPos ? "+" : ""}${formatCurrency(item.change, item.currency)}`
                              : "-"}
                          </td>
                          <td className={`px-6 py-3.5 font-medium text-right ${isPos ? "text-green-400" : "text-red-400"}`}>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                              isPos ? "bg-green-400/10" : "bg-red-400/10"
                            }`}>
                              {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {item.changePercent != null ? formatPercent(item.changePercent) : "-"}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground text-right text-xs hidden lg:table-cell">
                            {item.marketCap ? formatNumber(item.marketCap) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {watchlist?.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                          Hisse verisi bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground text-right">
            Herhangi bir hisseye tıklayarak detayli analizini gorebilirsiniz.
          </div>
        </section>
      </div>
    </Layout>
  );
}
