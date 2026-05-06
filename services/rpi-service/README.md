# AHS-MK1 — RPi5 Bridge Service

Raspberry Pi 5 üzerinde çalışan **donanım köprüsü ve algılama servisi**.

```
[Tarayıcı / PC köprüsü] ─WS/ZMQ→  [Bu servis]  ─UART→  [ESP32]
                                      ├─ I²C → LiDAR Lite-v3
                                      └─ CSI/RTSP → Kameralar (YOLOv8)
```

## Hızlı başlangıç

```bash
cd services/rpi-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# (Opsiyonel) gerçek donanım sürücüleri:
pip install ultralytics smbus2 opencv-python

# Çalıştır
python main.py
```

Varsayılan portlar:

| Bağlantı | Port | Amaç |
|---|---|---|
| WebSocket | `:8765/ws` | Tarayıcı / dev test |
| ZMQ REP | `:5555` | PC köprüsü → komut |
| ZMQ PUB | `:5556` | PC köprüsü → telemetri abone |
| Health | `GET /healthz` | Liveness |

## Yapılandırma (env değişkenleri)

| Env | Varsayılan | Açıklama |
|---|---|---|
| `AHS_SERIAL_PORT` | `/dev/ttyAMA0` | ESP32 UART |
| `AHS_SERIAL_BAUD` | `115200` | UART baud |
| `AHS_HTTP_PORT` | `8765` | WebSocket portu |
| `AHS_ZMQ_CMD` | `tcp://0.0.0.0:5555` | ZMQ REP bind |
| `AHS_ZMQ_TLM` | `tcp://0.0.0.0:5556` | ZMQ PUB bind |
| `AHS_LIDAR_BUS` | `1` | I²C bus numarası |
| `AHS_LIDAR_ADDR` | `0x62` | LiDAR I²C adresi |
| `AHS_YOLO_WEIGHTS` | `yolov8n.pt` | YOLO ağırlık dosyası |
| `AHS_YOLO_CONF` | `0.45` | Tespit confidence eşiği |
| `AHS_GOVCU_RTSP` | — | Hikvision PTZ RTSP url |
| `AHS_AVCI_DEVICE` | `/dev/video0` | Arducam CSI cihazı |
| `AHS_TELEMETRY_HZ` | `30` | Algı/telemetri tick frekansı |
| `AHS_FORCE_MOCK` | `0` | Tüm donanımı mock'a zorla |

## Mock modu

`pyserial`, `smbus2`, `ultralytics`, `cv2` paketleri yüklü değilse veya
donanım açılamıyorsa **her bileşen otomatik olarak mock'a düşer**.
Bu sayede:

- RPi olmadan dizüstünde geliştirme yapılabilir
- Yarışma öncesi UI demo'ları için tam pipeline ihtiyacı yoktur
- Saha kurulumunda `AHS_FORCE_MOCK=1` ile geçici devre dışı bırakılabilir

## Mesaj protokolü

`protocol.py` tüm mesaj şemalarını dataclass olarak tutar.
Frontend (`artifacts/savunma-kontrol/src/lib/protocol.ts`) birebir aynı
yapıyla yazılmıştır — değişiklikler iki tarafta da yapılmalı.

### Komut örnekleri (JSON)

```json
{ "action": "set_mode", "mode": "OTONOM" }
{ "action": "set_motors", "pan": 12.5, "tilt": -3.0 }
{ "action": "lock_target", "target_id": "ab12cd34" }
{ "action": "set_safety", "safety": false }
{ "action": "fire" }
{ "action": "emergency_stop" }
```

### Yayın (PUB / WS broadcast)

- `telemetry` — 30 Hz; mod, status, motorlar, sensörler, ammo
- `targets` — hedef listesi + kilit ID
- `log` — operatör log satırı
- `ack` — komutun cevabı (REP üzerinden gelir, broadcast edilmez)

## Servis olarak çalıştırma (systemd)

`/etc/systemd/system/ahs-mk1.service`:

```ini
[Unit]
Description=AHS-MK1 RPi Bridge
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/ahs/services/rpi-service
Environment="AHS_SERIAL_PORT=/dev/ttyAMA0"
ExecStart=/home/pi/ahs/services/rpi-service/.venv/bin/python main.py
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now ahs-mk1
sudo journalctl -fu ahs-mk1
```

## Düşük gecikmeli avcı kamera akışı (UDP, GStreamer)

Raporda belirtildiği gibi avcı kamerası → PC için RPi'de:

```bash
gst-launch-1.0 -v libcamerasrc ! \
  video/x-raw,width=1280,height=720,framerate=30/1 ! \
  videoconvert ! x264enc tune=zerolatency bitrate=4000 speed-preset=ultrafast ! \
  rtph264pay ! udpsink host=<PC_IP> port=5600
```

PC tarafında oynatma:

```bash
gst-launch-1.0 udpsrc port=5600 ! application/x-rtp,encoding-name=H264 ! \
  rtph264depay ! avdec_h264 ! autovideosink sync=false
```
