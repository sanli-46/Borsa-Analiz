import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from "recharts";
import { formatNumber, formatDate } from "@/lib/format";

export function IndicatorsChart({ data, type }: { data: any[], type: 'rsi' | 'macd' }) {
  if (!data || data.length === 0) return <div className="p-4 text-center text-muted-foreground">Veri bulunamadı.</div>;

  const chartData = data.map(item => ({
    ...item,
    dateStr: formatDate(item.date)
  }));

  if (type === 'rsi') {
    return (
      <div className="h-[250px] w-full">
        <h4 className="font-bold text-sm mb-2">RSI (14)</h4>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }} />
            <Tooltip 
              contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontFamily: "var(--font-mono)" }}
              itemStyle={{ color: "hsl(var(--primary))" }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            />
            {/* Overbought/Oversold lines */}
            <Line type="step" dataKey={() => 70} stroke="hsl(var(--destructive))" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            <Line type="step" dataKey={() => 30} stroke="hsl(var(--success))" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-5))" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'macd') {
    return (
      <div className="h-[250px] w-full mt-6">
        <h4 className="font-bold text-sm mb-2">MACD (12, 26, 9)</h4>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => val.toFixed(2)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }} />
            <Tooltip 
              contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontFamily: "var(--font-mono)" }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            />
            <Bar dataKey="histogram" name="Histogram">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.histogram > 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macd" name="MACD" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="signal" name="Sinyal" stroke="hsl(var(--chart-4))" dot={false} strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
