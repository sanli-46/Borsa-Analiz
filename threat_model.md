# Threat Model

## Project Overview

Borsa Analiz, Türk perakende yatırımcıları için ABD ve BIST hisselerine ilişkin fiyat, finansal tablo, haber ve teknik analiz verilerini sunan bir web uygulamasıdır. Üretimdeki yüzey; React + Vite istemcisi (`artifacts/borsa`) ile Express 5 tabanlı API sunucusundan (`artifacts/api-server`) oluşur. API, verileri doğrudan `yahoo-finance2` üzerinden üçüncü taraf Yahoo Finance kaynaklarından alır. Mevcut üretim mimarisinde kullanıcı hesabı, oturum, yönetici paneli veya aktif veritabanı tabanlı kullanıcı verisi bulunmaz.

## Assets

- **API kullanılabilirliği** — Uygulamanın asıl değeri canlı piyasa verisi sunmasıdır. Uzun süren veya pahalı isteklerle API’nin yavaşlatılması doğrudan hizmet kesintisine yol açar.
- **Üçüncü taraf veri tedarik zinciri güveni** — Hisse profilleri, şirket web sitesi alanları, haber bağlantıları ve piyasa verileri Yahoo Finance üzerinden gelir. Bu veri istemciye yansıtıldığı için güvenilmeyen dış veri olarak ele alınmalıdır.
- **Sunucu kaynakları ve outbound kapasite** — Node süreci, event loop zamanı, bellek ve Yahoo Finance’e açılan outbound istekler korunmalıdır. Bunların tüketilmesi tüm kullanıcıları etkiler.
- **Uygulama logları** — İstek kayıtları ve hata logları hata ayıklama için gereklidir; yetkisiz veri sızıntısı veya aşırı log büyümesi operasyonel risk yaratır.

## Trust Boundaries

- **Tarayıcı → API** — Tüm rota parametreleri, query parametreleri ve istek hacmi istemciden gelir ve güvenilmezdir.
- **API → Yahoo Finance** — Sunucu, istemci girdilerinden etkilenen semboller ve sorgu seçenekleriyle üçüncü taraf servise istek atar. Bu sınır SSRF kadar güçlü bir risk yaratmasa da kullanılabilirlik ve veri güveni riskleri taşır.
- **API → İstemci** — Haber linkleri, şirket sitesi URL’leri, metin açıklamalar ve fiyat verileri üçüncü taraf kaynaktan gelip doğrudan istemciye taşınır.
- **Üretim ↔ Dev-only artifacts** — `artifacts/mockup-sandbox` yalnızca geliştirme/deney ortamıdır ve üretim taramasında kapsam dışıdır; üretimde erişilebilirliği gösterilmedikçe incelenmemelidir.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/stock.ts`, `artifacts/borsa/src/main.tsx`, `artifacts/borsa/src/App.tsx`
- Highest-risk code areas: `artifacts/api-server/src/routes/stock.ts`, `artifacts/borsa/src/components/analysis-panel.tsx`, `artifacts/borsa/src/pages/stock.tsx`, `lib/api-client-react/src/custom-fetch.ts`
- Public surfaces: tüm `/api/stock/*` ve `/api/healthz` uçları ile `/` ve `/stock/:symbol` istemci rotaları
- Authenticated/admin surfaces: yok
- Dev-only areas usually ignored: `artifacts/mockup-sandbox/**`, build/dist çıktıları, `lib/db/**` (üretim veri akışında kullanılmadığı sürece)

## Threat Categories

### Tampering

İstemciden gelen `symbol`, `q`, `period`, `interval` ve `market` girdileri API davranışını etkiler. Uygulama, her üretim endpoint’inde beklenen türü ve izin verilen değer kümesini sunucu tarafında zorlamalı; OpenAPI dışında bırakılan uçlar da aynı doğrulama standardını korumalıdır. Üçüncü taraf verileri güvenilir kabul edilmemeli, özellikle URL alanları istemciye aktarılmadan önce güvenli şema ve kullanım bağlamı açısından doğrulanmalıdır.

### Information Disclosure

Uygulama kullanıcı hesabı veya özel portföy verisi tutmasa da üçüncü taraf kaynaklardan gelen metin ve URL alanlarını istemciye yansıtır. Bu nedenle istemci, dış bağlantıları aktif içerik çalıştırabilecek şemalara dönüştürmemeli; API hata yanıtları ve loglar da gereksiz iç detayları açığa çıkarmamalıdır. Üretimde debug-only hata ayrıntıları dönülmemelidir.

### Denial of Service

Tüm API yüzeyi herkese açıktır ve bazı uçlar hem CPU hem de outbound istek açısından pahalıdır (`summary`, `analysis`, `watchlist`, `history`, `indicators`). Uygulama, bu uçlarda istek hacmini sınırlandırmalı, upstream çağrılara timeout uygulamalı ve yavaş/başarısız üçüncü taraf servislerin Node sürecini sınırsız süre meşgul etmesini engellemelidir. Ağır hesaplama veya geniş veri toplama uçları özellikle oran sınırlama, önbellekleme veya eşdeğer koruma gerektirir.

### Elevation of Privilege

Klasik yetki yükseltme yüzeyi bu projede sınırlıdır çünkü kullanıcı rolleri ve yönetici işlemleri yoktur. Buna rağmen sunucu tarafında girdi doğrulaması atlanan bir uç, beklenmeyen yürütme yolları veya kaynak tüketimi üzerinden saldırgana normal kullanıcıdan daha yüksek etki alanı sağlayabilir. Bu nedenle üretim endpoint’leri arasında güvenlik kontrolleri tutarlı olmalıdır.
