import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, TrendingUp, BarChart2, Briefcase, Menu, X } from "lucide-react";
import { useSearchStocks } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans dark text-foreground">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight shrink-0">
            <BarChart2 className="w-6 h-6" />
            <span>Borsa Analiz</span>
          </Link>

          <div className="flex-1 max-w-xl mx-auto w-full relative group">
            <SearchBar />
          </div>

          <div className="flex items-center gap-4 shrink-0 hidden md:flex text-muted-foreground text-sm font-medium">
            <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
              <TrendingUp className="w-4 h-4" /> Piyasalar
            </Link>
            <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Briefcase className="w-4 h-4" /> Portföy
            </Link>
          </div>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-6">
        {children}
      </main>
      
      <footer className="border-t border-border bg-card mt-auto">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Borsa Analiz. Tüm veriler gecikmeli olabilir.</p>
        </div>
      </footer>
    </div>
  );
}

function SearchBar() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [_, setLocation] = useLocation();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading } = useSearchStocks(
    { q: debouncedQuery },
    { query: { enabled: debouncedQuery.length > 1 } }
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Hisse senedi veya şirket ara (Örn: AAPL, THYAO)"
          className="w-full h-10 bg-background border border-border rounded-md pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
      </div>

      {isOpen && query.length > 1 && (
        <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Aranıyor...</div>
          ) : results && results.length > 0 ? (
            <ul className="py-2">
              {results.map((result) => (
                <li key={`${result.symbol}-${result.exchange}`}>
                  <button
                    className="w-full text-left px-4 py-2 hover:bg-muted transition-colors flex items-center justify-between"
                    onClick={() => {
                      setLocation(`/stock/${result.symbol}`);
                      setIsOpen(false);
                      setQuery("");
                    }}
                  >
                    <div>
                      <div className="font-medium text-foreground">{result.symbol}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{result.shortname || result.longname}</div>
                    </div>
                    <div className="text-xs text-muted-foreground bg-background px-2 py-1 rounded border border-border">
                      {result.exchange}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">Sonuç bulunamadı.</div>
          )}
        </div>
      )}
    </div>
  );
}
