# Borsa Analiz

Türk perakende yatırımcıları için ABD ve BIST hisselerini analiz eden profesyonel borsa analiz uygulaması.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API sunucusunu başlat (port 8080)
- `pnpm --filter @workspace/borsa run dev` — Frontend'i başlat
- `pnpm run typecheck` — tüm paketleri typecheck et
- `pnpm --filter @workspace/api-spec run codegen` — OpenAPI spec'ten hook ve Zod şemaları üret
- Gerekli env: yok (yahoo-finance2 API key gerektirmez)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (artifacts/api-server, port 8080, path /api)
- Frontend: React + Vite + TanStack Query + Wouter (artifacts/borsa, path /)
- Market data: yahoo-finance2 v3 (API key gereksiz)
- Charts: Recharts
- API codegen: Orval (OpenAPI → hooks + Zod)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/stock.ts` — tüm hisse API endpointleri
- `artifacts/borsa/src/pages/home.tsx` — ana sayfa, piyasa sekmeleri (Öne Çıkanlar / ABD / BIST)
- `artifacts/borsa/src/pages/stock.tsx` — hisse detay sayfası (4 sekme)
- `artifacts/borsa/src/components/analysis-panel.tsx` — kapsamlı teknik analiz paneli
- `artifacts/borsa/src/components/stock-chart.tsx` — fiyat grafiği
- `lib/api-spec/openapi.yaml` — OpenAPI spec (kaynak doğrusu)

## Architecture decisions

- yahoo-finance2 v3 breaking change: default export sınıftır, `new YahooFinanceClass()` ile instantiate edilmeli
- `/stock/analysis/:symbol` endpoint'i OpenAPI spec dışında (doğrudan fetch ile çağrılır) — codegen'den bağımsız tutmak için
- `lib/api-zod/src/index.ts` yalnızca `export * from "./generated/api"` içermeli; codegen çalıştırılırsa elle düzeltmek gerekir
- Piyasa sekmeleri: watchlist endpoint'i `?market=us|bist|all` query param alır, frontend React Query ile doğrudan çağırır
- Turkish stocks: `.IS` suffix kullanır (örn. `THYAO.IS`)

## Product

- Ana sayfa: Öne Çıkanlar / ABD Borsası (65+ hisse) / BIST Türkiye (60+ hisse) sekmeleri, tıklanabilir satırlar
- Hisse detay: Genel Bakış, Finansallar, Analiz, Haberler sekmeleri
- Teknik Analiz paneli: Sinyal tablosu (AL/SAT/NÖTR), formasyon tespiti (Çift Tepe/Dip, Baş-Omuzlar, Üçgen, Bayrak), destek/direnç seviyeleri, Fibonacci geri çekilme, Pivot noktaları, RSI, Stochastic, MACD, Bollinger Bantları, Hacim grafiği, Swing Min/Max noktaları
- Arama: canlı hisse arama, sonuçlara tıklayınca analiz sayfasına gider

## User preferences

- Uygulama Türkçe — tüm etiketler ve açıklamalar Türkçe
- Koyu tema (dark terminal style)
- Hem ABD hem BIST piyasalarını destekle

## Gotchas

- Codegen (`pnpm --filter @workspace/api-spec run codegen`) çalıştırılırsa `lib/api-zod/src/index.ts` bozulur; sadece `export * from "./generated/api"` bırak
- Backend'i değiştirince workflow'u yeniden başlat (HMR yok, esbuild build gerekir)
- Yahoo Finance zaman zaman rate limit verebilir; `watchlist` batches (20'li gruplar) halinde çeker

## Pointers

- `pnpm-workspace` skill: workspace yapısı, TypeScript setup
- yahoo-finance2 docs: https://github.com/gadicc/yahoo-finance2
