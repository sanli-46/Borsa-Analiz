import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatNumber } from "@/lib/format";

export function FinancialsChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  const chartData = [...data].reverse().map(item => ({
    ...item,
    year: item.date.substring(0, 4)
  }));

  return (
    <div className="h-[400px]">
      <h3 className="font-bold text-sm mb-6">Gelir Tablosu Özeti</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={(val) => formatNumber(val)} 
            tick={{ fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }} 
          />
          <Tooltip 
            cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
            contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontFamily: "var(--font-mono)" }}
            formatter={(val: number) => formatNumber(val)}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} />
          <Bar dataKey="totalRevenue" name="Toplam Gelir" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
          <Bar dataKey="grossProfit" name="Brüt Kar" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
          <Bar dataKey="netIncome" name="Net Kar" fill="hsl(var(--success))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
