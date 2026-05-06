import { 
  useGetStockQuote, 
  useGetStockHistory, 
  useGetStockFinancials,
  useGetStockIndicators,
  useGetStockNews,
  useGetStockSummary 
} from "@workspace/api-client-react";
import { useParams } from "wouter";
import { formatCurrency, formatPercent, formatNumber, formatDate } from "@/lib/format";
import { Layout } from "@/components/layout";
import { StockChart } from "@/components/stock-chart";
import { FinancialsChart } from "@/components/financials-chart";
import { IndicatorsChart } from "@/components/technical-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

export default function Stock() {
  const params = useParams<{ symbol: string }>();
  const symbol = params.symbol?.toUpperCase() || "";

  const { data: quote, isLoading: isQuoteLoading } = useGetStockQuote(symbol);
  const { data: summary, isLoading: isSummaryLoading } = useGetStockSummary(symbol);
  const { data: financials } = useGetStockFinancials(symbol);
  const { data: indicators } = useGetStockIndicators(symbol, { period: "6mo" });
  const { data: news } = useGetStockNews(symbol);

  if (isQuoteLoading || isSummaryLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-muted-foreground animate-pulse">Yükleniyor...</div>
        </div>
      </Layout>
    );
  }

  if (!quote) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-destructive">Hisse bulunamadı.</div>
        </div>
      </Layout>
    );
  }

  const isPositive = (quote.regularMarketChangePercent || 0) >= 0;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-card border border-border p-6 rounded-lg shadow-sm">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">{quote.symbol}</h1>
              <span className="px-2 py-1 bg-muted text-muted-foreground text-xs font-medium rounded border border-border">
                {quote.exchange}
              </span>
            </div>
            <h2 className="text-xl text-muted-foreground font-medium">{quote.longName || quote.shortName}</h2>
            <div className="text-sm text-muted-foreground mt-2">
              {quote.sector} • {quote.industry}
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold font-mono tracking-tight">
              {formatCurrency(quote.regularMarketPrice, quote.currency)}
            </div>
            <div className={`flex items-center justify-end gap-2 text-lg font-medium mt-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
              {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              <span>{quote.regularMarketChange! > 0 ? "+" : ""}{formatCurrency(quote.regularMarketChange || 0, quote.currency)}</span>
              <span>({formatPercent(quote.regularMarketChangePercent || 0)})</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Kapanış: {formatCurrency(quote.regularMarketPreviousClose || 0, quote.currency)}
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px] mb-6 bg-muted/50 border border-border">
            <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
            <TabsTrigger value="financials">Finansallar</TabsTrigger>
            <TabsTrigger value="analysis">Analiz</TabsTrigger>
            <TabsTrigger value="news">Haberler</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Chart placeholder - will implement actual component */}
                <div className="bg-card border border-border p-4 rounded-lg shadow-sm h-[400px]">
                  <StockChart symbol={symbol} />
                </div>

                <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Şirket Profili</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {quote.longBusinessSummary || "Açıklama bulunamadı."}
                  </p>
                  {quote.website && (
                    <a href={quote.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm text-primary hover:underline mt-4">
                      Web sitesine git <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="font-bold text-sm">Önemli İstatistikler</h3>
                  </div>
                  <div className="divide-y border-border">
                    <MetricRow label="Piyasa Değeri" value={quote.marketCap ? formatNumber(quote.marketCap) : "-"} />
                    <MetricRow label="F/K Oranı (Trailing)" value={quote.trailingPE?.toFixed(2) || "-"} />
                    <MetricRow label="F/K Oranı (Forward)" value={quote.forwardPE?.toFixed(2) || "-"} />
                    <MetricRow label="PD/DD" value={quote.priceToBook?.toFixed(2) || "-"} />
                    <MetricRow label="Hisse Başı Kar (EPS)" value={quote.trailingEps?.toFixed(2) || "-"} />
                    <MetricRow label="Temettü Verimi" value={quote.dividendYield ? formatPercent(quote.dividendYield * 100) : "-"} />
                    <MetricRow label="Beta" value={quote.beta?.toFixed(2) || "-"} />
                    <MetricRow label="52 Haftalık Aralık" value={`${formatCurrency(quote.fiftyTwoWeekLow || 0)} - ${formatCurrency(quote.fiftyTwoWeekHigh || 0)}`} />
                    <MetricRow label="Ort. Hacim (3A)" value={quote.averageVolume ? formatNumber(quote.averageVolume) : "-"} />
                  </div>
                </div>

                {summary?.analystRating && (
                  <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
                    <h3 className="font-bold text-sm mb-3">Analist Beklentisi</h3>
                    <div className="flex items-center gap-4">
                      <div className={`text-2xl font-bold ${
                        summary.analystRating.toLowerCase().includes('buy') ? 'text-success' : 
                        summary.analystRating.toLowerCase().includes('sell') ? 'text-destructive' : 
                        'text-muted-foreground'
                      }`}>
                        {summary.analystRating}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Hedef Fiyat</span>
                          <span>{formatCurrency(quote.targetMeanPrice || 0, quote.currency)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Tavsiye Puanı</span>
                          <span>{quote.recommendationMean?.toFixed(1) || "-"} / 5.0</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financials">
            <div className="space-y-6">
              <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
                 {financials ? <FinancialsChart data={financials.incomeStatements} /> : <div className="text-center p-8 text-muted-foreground">Finansal veri bulunamadı.</div>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="analysis">
             <div className="bg-card border border-border p-6 rounded-lg shadow-sm space-y-8">
                <IndicatorsChart data={indicators?.rsi || []} type="rsi" />
                <IndicatorsChart data={indicators?.macd || []} type="macd" />
             </div>
          </TabsContent>

          <TabsContent value="news">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {news?.map((item, i) => (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="block bg-card border border-border p-4 rounded-lg shadow-sm hover:border-primary transition-colors group">
                  <div className="flex gap-4">
                    {item.thumbnail && (
                      <img src={item.thumbnail} alt="" className="w-24 h-24 object-cover rounded bg-muted shrink-0" />
                    )}
                    <div className="flex-1 flex flex-col justify-between">
                      <h3 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-3">
                        {item.title}
                      </h3>
                      <div className="text-xs text-muted-foreground mt-2 flex justify-between items-center">
                        <span>{item.publisher}</span>
                        <span>{item.providerPublishTime ? formatDate(new Date(item.providerPublishTime * 1000).toISOString()) : ""}</span>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
              {(!news || news.length === 0) && (
                <div className="col-span-full p-8 text-center text-muted-foreground bg-card border border-border rounded-lg shadow-sm">
                  Haber bulunamadı.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2 px-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-mono">{value}</span>
    </div>
  );
}
