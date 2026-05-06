# AHS-MK1 ESP32 Firmware

Otonom hava savunma kulesinin **alt seviye gerçek zamanlı kontrol** firmware'i.
Raspberry Pi 5 üzerindeki Python servisinden UART2 üzerinden komut alır;
3 step motor (Pan / Tilt / Şarjör), selenoid valf ve donanımsal acil stop hattını yönetir.

## Donanım

| Bileşen | Model | Bağlandığı pin (varsayılan) |
|---|---|---|
| MCU | ESP32 DevKit V1 | — |
| Pan motor | JKON EC86-45 (4.5 Nm) | STEP=25, DIR=26 |
| Tilt motor | JKON EC86-45 (4.5 Nm) | STEP=14, DIR=27 |
| Şarjör motor | JKON EC57-23 (2.3 Nm) | STEP=32, DIR=33 |
| Sürücüler | JKON EC808D × 3 | ENA ortak = 13 (aktif düşük) |
| Selenoid valf | Hızlı tahliye valfi | MOSFET kapı = 23 |
| Acil stop | TIANYI XJ-174 (NC) | 22 (INPUT_PULLUP) |
| Level shifter | Adafruit BSS138 | 3.3V ↔ 5V (driver lojiği için) |
| Status LED | Onboard | 2 |
| UART2 → RPi | 115200 baud | TX=17, RX=16 |

> Pin atamaları `config.h` dosyasında. Sahaya göre değiştirin.
> EC808D ENA pininin aktif yönü (LOW/HIGH) sürücü ayarınıza göre değişebilir.

## Kütüphaneler

```
AccelStepper >= 1.64    (Mike McCauley)
ESP32 Arduino Core >= 2.0.0
```

Arduino IDE: `Boards Manager → ESP32 by Espressif`, Library Manager → `AccelStepper`.

## Yükleme

```bash
# Arduino CLI ile
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32/savunma_esp32
arduino-cli upload  --fqbn esp32:esp32:esp32 -p /dev/ttyUSB0 firmware/esp32/savunma_esp32
```

veya Arduino IDE 2.x üzerinden `savunma_esp32.ino` dosyasını açıp **Upload**.

## UART Protokolü

Satır tabanlı ASCII, `\n` ile sonlanır. 115200 8N1.

### RPi → ESP32

| Komut | Anlam |
|---|---|
| `P\n` | Ping (cevap: `PONG`) |
| `M <pan> <tilt>\n` | Pan/Tilt hedef açıları (derece, float) |
| `Z <step>\n` | Şarjörü `step` slot ilerlet |
| `H\n` | Tüm motorları sıfır pozisyona döndür (Pan + Tilt + Şarjör) |
| `F\n` | Tek atış (selenoid darbesi + şarjör otomatik ilerlet) |
| `S 0\|1\n` | Güvenlik kilidi (1=kilitli) |
| `E\n` | Yazılım acil stop |
| `R\n` | Reset / re-arm |

### ESP32 → RPi

| Çıktı | Anlam |
|---|---|
| `T <pan> <tilt> <mag> <ammo> <safety> <estop> <uptime_ms>` | Telemetri (50 Hz). Son alan: ESP32 önyükleme sonrası `millis()` (uptime), gecikme **değildir** |
| `OK <komut>` | Komut başarılı |
| `ERR <komut> <neden>` | Komut reddedildi (ör. `safety`, `estop`, `range`) |
| `L <INFO\|WARN\|ERROR> <mesaj>` | Log |
| `PONG` | Ping cevabı |

## Güvenlik notları

- **Donanımsal acil stop her zaman önce gelir.** Mantar buton açıldığında
  ESP32 motorları derhal `stop()` eder, selenoidi LOW'a çeker, sürücülerin
  ENA pinini disable eder. Yazılım hatası bunu atlatamaz.
- 220V AC bobinli kontaktör (Schneider LC1D09M7) E-stop hattının üstündedir;
  fiziksel buton ana şebekeyi de keser. Bu firmware o katmanı taklit etmez.
- `safety=1` olduğunda `F` komutu reddedilir (`ERR F safety`).
- Ammo 0 iken `F` reddedilir (`ERR F empty`).

## Mekanik kalibrasyon

`config.h` içindeki `*_STEPS_PER_DEG` değerlerini gerçek dişli oranınıza göre
güncellemezseniz açılar yanlış olur:

```
steps_per_deg = (driver_pulse_per_rev × gear_ratio) / 360
```

Örnek: EC808D 5000 pulse/tur, 4:1 dişli → `(5000 × 4) / 360 = 55.555`.
