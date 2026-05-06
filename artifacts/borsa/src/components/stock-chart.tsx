import { useState } from "react";
import { useGetStockHistory } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line } from "recharts";
import { formatCurrency, formatDate } from "@/lib/format";

type Period = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

const PERIODS: { label: string; value: Period; interval: string }[] = [
  { label: "1G", value: "1d", interval: "5m" },
  { label: "5G", value: "5d", interval: "15m" },
  { label: "1A", value: "1mo", interval: "1d" },
  { label: "3A", value: "3mo", interval: "1d" },
  { label: "6A", value: "6mo", interval: "1d" },
  { label: "1Y", value: "1y", interval: "1wk" },
  { label: "2Y", value: "2y", interval: "1wk" },
  { label: "5Y", value: "5y", interval: "1mo" },
];

export function StockChart({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState<Period>("1mo");
  const selectedPeriod = PERIODS.find(p => p.value === period)!;

  const { data: history, isLoading } = useGetStockHistory(
    symbol, 
    { period: selectedPeriod.value as any, interval: selectedPeriod.interval as any },
    { query: { enabled: !!symbol } }
  );

  if (isLoading) {
    return <div className="w-full h-full flex items-center justify-center text-muted-foreground">Grafik Yükleniyor...</div>;
  }

  if (!history || !history.candles || history.candles.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-muted-foreground">Veri bulunamadı.</div>;
  }

  const data = history.candles.map(c => ({
    ...c,
    dateStr: formatDate(c.date)
  }));

  const isPositive = data.length > 0 && data[data.length - 1].close >= data[0].close;
  const strokeColor = isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const fillColor = isPositive ? "hsl(var(--success) / 0.2)" : "hsl(var(--destructive) / 0.2)";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">Fiyat Grafiği</h3>
        <div className="flex bg-muted/50 rounded p-1 border border-border">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                period === p.value 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis 
              dataKey="dateStr" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              minTickGap={30}
            />
            <YAxis 
              domain={['auto', 'auto']} 
              axisLine={false} 
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
              tickFormatter={(val) => formatCurrency(val, history.currency || "USD").replace(/[^0-9.,]/g, '')}
              width={50}
              orientation="right"
            />
            <Tooltip 
              contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              itemStyle={{ color: "hsl(var(--foreground))", fontFamily: "var(--font-mono)" }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
              formatter={(value: number) => [formatCurrency(value, history.currency || "USD"), "Fiyat"]}
            />
            <Area type="monotone" dataKey="close" stroke={strokeColor} strokeWidth={2} fillOpacity={1} fill="url(#colorClose)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
