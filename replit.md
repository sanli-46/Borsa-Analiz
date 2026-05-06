# Replit Monorepo — Borsa Analiz + AHS-MK1 Savunma Sistemi

İki bağımsız ürün barındıran pnpm monorepo'su:
- **Borsa Analiz** — ABD ve BIST hisseleri için teknik/temel analiz uygulaması (web + Expo mobil)
- **AHS-MK1** — Otonom hava savunma kulesi kontrol paneli + saha donanım katmanı (ESP32, RPi5, ZMQ köprü)

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — Borsa API (port 8080)
- `pnpm --filter @workspace/borsa run dev` — Borsa web frontend
- `pnpm --filter @workspace/borsa-mobil run dev` — Borsa Expo mobil uygulaması
- `pnpm --filter @workspace/savunma-kontrol run dev` — AHS-MK1 kontrol paneli
- `pnpm run typecheck` — tüm paketleri typecheck et
- `pnpm --filter @workspace/api-spec run codegen` — OpenAPI → hook + Zod
- AHS-MK1 saha servisleri:
  - `cd services/rpi-service && pip install -r requirements.txt && python main.py` (RPi5)
  - `cd services/pc-bridge && npm install && RPI_HOST=<ip> npm start` (Operatör PC'si)
- Gerekli env: yok (Borsa); RPi servisi için `services/rpi-service/README.md`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Borsa API: Express 5, yahoo-finance2 v3, Orval (OpenAPI codegen), esbuild
- Borsa frontend: React + Vite + TanStack Query + Wouter + Recharts
- AHS-MK1 frontend: React + Vite + Wouter (`artifacts/savunma-kontrol`, path `/savunma-kontrol/`)
- AHS-MK1 RPi servisi: Python 3.11+, FastAPI, pyzmq, pyserial, ultralytics (opsiyonel)
- AHS-MK1 PC köprüsü: Node.js, ws, zeromq

## Where things live

### Borsa Analiz
- `artifacts/api-server/src/routes/stock.ts` — tüm hisse API endpointleri
- `artifacts/borsa/src/pages/home.tsx` — web ana sayfa, piyasa sekmeleri
- `artifacts/borsa/src/pages/stock.tsx` — web hisse detay
- `artifacts/borsa/src/components/analysis-panel.tsx` — teknik analiz paneli
- `lib/api-spec/openapi.yaml` — OpenAPI spec
- `artifacts/borsa-mobil/app/(tabs)/index.tsx` — mobil piyasalar (watchlist)
- `artifacts/borsa-mobil/app/(tabs)/search.tsx` — mobil hisse arama
- `artifacts/borsa-mobil/app/stock/[symbol].tsx` — mobil hisse detay (Genel/Grafik/Analiz/Finansal/Haber)
- `artifacts/borsa-mobil/components/AnalysisSection.tsx` — mobil teknik analiz paneli (web ile birebir kapsamda)

### AHS-MK1 (Savunma Sistemi)
- `artifacts/savunma-kontrol/src/pages/control-panel.tsx` — ana kontrol arayüzü, sim ↔ canlı geçişi
- `artifacts/savunma-kontrol/src/lib/protocol.ts` — sunucu mesaj sözleşmesi (Python ile birebir)
- `artifacts/savunma-kontrol/src/lib/connection.ts` — WebSocket istemci (auto-reconnect)
- `artifacts/savunma-kontrol/src/hooks/use-connection.ts` — React entegrasyon hook'u
- `firmware/esp32/savunma_esp32/` — ESP32 Arduino firmware (motorlar, selenoid, e-stop)
- `services/rpi-service/` — RPi5 Python servisi (UART + LiDAR + YOLOv8 + ZMQ + WebSocket)
- `services/rpi-service/protocol.py` — sunucu mesaj sözleşmesi (TS ile birebir)
- `services/pc-bridge/index.mjs` — operatör PC'sinde WebSocket↔ZMQ köprüsü

## Architecture decisions

### Borsa
- yahoo-finance2 v3 default export sınıftır — `new YahooFinanceClass()` ile instantiate
- `/stock/analysis/:symbol` OpenAPI dışında — codegen'den bağımsız
- `lib/api-zod/src/index.ts` yalnızca `export * from "./generated/api"` içermeli

### AHS-MK1
- **Üç katmanlı veri yolu**: Tarayıcı ↔ WebSocket ↔ PC köprüsü ↔ ZMQ ↔ RPi5 ↔ UART ↔ ESP32
- Tarayıcı doğrudan ZMQ konuşamadığı için PC'de küçük Node köprüsü; rapor uyumlu kalır
- RPi servisi WebSocket'i de açar — köprüsüz dev/test için
- `protocol.py` ve `protocol.ts` birebir aynı şema; **iki tarafta birden değiştirin**
- Donanım sürücü kütüphaneleri (pyserial/smbus2/ultralytics/cv2) yoksa otomatik **mock moduna** düşer; UI tam pipeline ile konuşuyormuş gibi çalışır
- Frontend bağlı değilken simülasyon timer'ları çalışır; bağlanınca tamamı durur, state sunucudan gelir
- ESP32 protokolü satır-tabanlı ASCII (ör. `M 12.5 -3.0\n`), 50 Hz telemetri (`T pan tilt mag ammo safety estop ms\n`)
- Donanımsal acil stop hattı (NC mantar buton) ESP32 ISR ile izlenir — yazılım atlatamaz

## Product

### Borsa Analiz
- Öne Çıkanlar / ABD / BIST sekmeli ana sayfa, canlı hisse arama
- Hisse detay: Genel Bakış / Finansallar / Analiz / Haberler
- Teknik Analiz: AL/SAT/NÖTR sinyalleri, formasyon tespiti, destek/direnç, Fibonacci, RSI, MACD, Bollinger

### AHS-MK1
- 3 mod: MANUEL (operatör), OTONOM (AI hedefleme + Dost/Düşman), SÜRÜ (kural tabanlı çoklu tehdit)
- Çift kamera görünümü (gözcü PTZ + avcı namlu), hedef bounding box overlay
- Motor kontrol: Pan ±180°, Tilt ±45°, şarjör pozisyon
- Hedef sınıflandırma (Dost/Düşman/Bilinmeyen), kilit, otomatik öncelik
- LiDAR mesafe + balistik düzeltme, FPS/gecikme telemetrisi
- Mermi sayacı, güvenlik kilidi, ACİL STOP, sistem logu
- Bağlantı durumu rozeti (BAĞLI DEĞİL / BAĞLANIYOR / DONANIM AKTİF)

## User preferences

- Tüm UI ve dokümantasyon Türkçe
- Koyu terminal estetiği (yeşil-amber-kırmızı, monospace)
- Borsa: hem ABD hem BIST destekli
- AHS-MK1: gerçek saha donanımı hedefli — mock fallback dev için, üretimde ESP32+RPi+kameralarla çalışır

## Gotchas

- Borsa codegen çalıştırılırsa `lib/api-zod/src/index.ts` bozulur — sadece `export * from "./generated/api"` bırak
- Borsa backend'i değiştirince workflow restart şart (esbuild build gerekir, HMR yok)
- AHS-MK1 protokolünü değiştirince **hem `protocol.py` hem `protocol.ts`** güncellenmeli
- AHS-MK1 ESP32 pin atamaları `firmware/esp32/savunma_esp32/config.h` içinde — kablolamaya göre değiştir
- AHS-MK1 motor `*_STEPS_PER_DEG` değerleri dişli oranınıza göre kalibre edilmeli
- ZMQ köprüsü PC'de çalışırken RPi yine WS açar; tarayıcı ya köprüye ya doğrudan RPi'ye bağlanabilir

## Pointers

- `pnpm-workspace` skill: workspace yapısı, TypeScript setup
- `firmware/esp32/README.md` — ESP32 yükleme ve UART protokolü
- `services/rpi-service/README.md` — Python servisi kurulum, env, systemd, GStreamer örneği
- `services/pc-bridge/README.md` — WebSocket↔ZMQ köprü, Windows pm2 servisi
- yahoo-finance2 docs: https://github.com/gadicc/yahoo-finance2
