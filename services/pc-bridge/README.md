# AHS-MK1 — PC Bridge

Ana Görev Bilgisayarı (operatör PC'si) üzerinde çalışan küçük bir Node.js
süreci. **Tarayıcı ↔ ZeroMQ** köprüsüdür:

```
Tarayıcı (kontrol paneli)
    ↕ WebSocket (ws://localhost:8000)
PC Bridge  (bu servis)
    ↕ ZeroMQ (tcp://<rpi_ip>:5555  REP/REQ)
    ↕ ZeroMQ (tcp://<rpi_ip>:5556  PUB/SUB)
RPi5 Servisi
```

Tarayıcılar doğrudan ZMQ konuşamaz — bu yüzden köprüye ihtiyaç var.
Köprü çok hafif: sadece JSON mesajlarını her iki yönde geçirir.

## Kurulum & çalıştırma

```bash
cd services/pc-bridge
npm install
RPI_HOST=192.168.1.50 npm start
```

## Yapılandırma

| Env | Varsayılan | Açıklama |
|---|---|---|
| `PC_BRIDGE_PORT` | `8000` | Tarayıcı WS portu |
| `RPI_HOST` | `192.168.1.50` | RPi'nin LAN IP'si |
| `RPI_CMD_PORT` | `5555` | RPi ZMQ REP |
| `RPI_TLM_PORT` | `5556` | RPi ZMQ PUB |

## Tarayıcıdan bağlantı

Kontrol panelinde sağ üstte **bağlantı durumu** rozetine tıklayın, URL'yi
girin (örn. `ws://localhost:8000`) → Bağlan.

## Windows servis olarak çalıştırma

`pm2` ya da `nssm` ile arka plan servisi yapın:

```powershell
npm install -g pm2
pm2 start index.mjs --name ahs-pc-bridge
pm2 save
pm2 startup
```
