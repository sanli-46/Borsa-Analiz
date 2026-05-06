export function formatCurrency(value: number, currency: string = "USD") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number) {
  if (value >= 1e12) {
    return (value / 1e12).toFixed(2) + "T";
  }
  if (value >= 1e9) {
    return (value / 1e9).toFixed(2) + "B";
  }
  if (value >= 1e6) {
    return (value / 1e6).toFixed(2) + "M";
  }
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  const formatted = new Intl.NumberFormat("tr-TR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
  
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
}

export function cn(classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
