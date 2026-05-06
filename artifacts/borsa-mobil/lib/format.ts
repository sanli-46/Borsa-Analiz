export function formatCurrency(value: number | null | undefined, currency?: string | null): string {
  if (value == null || isNaN(value)) return "-";
  const code = (currency || "USD").toUpperCase();
  const symbol = code === "TRY" ? "₺" : code === "USD" ? "$" : code === "EUR" ? "€" : "";
  const abs = Math.abs(value);
  const fractionDigits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  const formatted = value.toLocaleString("tr-TR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return symbol ? `${symbol}${formatted}` : `${formatted} ${code}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value: number | Date | null | undefined): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
