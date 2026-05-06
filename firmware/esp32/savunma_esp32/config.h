/*
 * AHS-MK1 ESP32 Pin & Parametre Yapılandırması
 *
 * Aşağıdaki tüm pin numaralarını sahaya bağladığınız kablolama
 * şemasına göre güncelleyin. Verilen değerler ESP32 DevKit V1
 * için makul başlangıç ataması olup test edilmiştir.
 *
 * Driver: JKON EC808D (5000 pulse/tur), CW/CCW direnç dengeli.
 * Motor: JKON EC86-45 × 2 (Pan, Tilt), EC57-23 × 1 (Şarjör)
 * Level shifter: Adafruit BSS138 (3.3V ESP32 → 5V driver lojiği)
 */

#pragma once

// ─── UART (RPi5 ↔ ESP32) ───────────────────────────────────────────
#define UART_BAUD          115200
#define UART_TX_PIN        17     // ESP32 TX2 → RPi RX (GPIO15)
#define UART_RX_PIN        16     // ESP32 RX2 ← RPi TX (GPIO14)

// ─── Step motor sürücü (EC808D) pinleri ────────────────────────────
// LSD modülü üzerinden 5V'a level shifted bağlanmalı
#define PAN_STEP_PIN       25
#define PAN_DIR_PIN        26
#define TILT_STEP_PIN      14
#define TILT_DIR_PIN       27
#define MAG_STEP_PIN       32
#define MAG_DIR_PIN        33

// ENA tüm sürücüler için ortak (aktif düşük)
#define DRIVER_ENA_PIN     13

// ─── Selenoid (MOSFET kapı) ─────────────────────────────────────────
#define SOLENOID_PIN       23     // BSS138 → düşük yan N-MOSFET (örn IRLZ44N)
#define SOLENOID_PULSE_MS  35     // Hızlı tahliye valfi tetikleme süresi

// ─── Acil stop (NC mantar buton, GND'ye çekili) ─────────────────────
#define ESTOP_PIN          22     // INPUT_PULLUP — buton açılınca HIGH

// ─── Onboard durum LED'i ────────────────────────────────────────────
#define STATUS_LED_PIN     2

// ─── Mekanik dönüştürme oranları ────────────────────────────────────
// Driver mikrostep ayarı + dişli oranınıza göre güncelleyin.
// Örnek: 5000 pulse/tur × dişli oranı 4:1 → tur başına 20000 pulse
//        20000 pulse / 360° = 55.555 pulse/derece
#define PAN_STEPS_PER_DEG    55.5556f
#define TILT_STEPS_PER_DEG   55.5556f
#define MAG_STEPS_PER_DEG    13.8889f   // Şarjör için 5000 pulse / 360°
#define MAG_STEPS_PER_SLOT   ( (long)(360.0f / 12.0f * MAG_STEPS_PER_DEG) ) // 12 yuvalı şarjör

// ─── Hız & ivme (AccelStepper) ──────────────────────────────────────
// Yarışma anında ani manevralar için ivme yüksek tutuldu;
// motor adım kaçırırsa enkoder fark verir → düşürün.
#define PAN_MAX_SPEED      8000.0f
#define PAN_ACCEL          16000.0f
#define TILT_MAX_SPEED     6000.0f
#define TILT_ACCEL         12000.0f
#define MAG_MAX_SPEED      4000.0f
#define MAG_ACCEL          8000.0f

// ─── Sistem ─────────────────────────────────────────────────────────
#define MAX_AMMO              24      // Şarjör kapasitesi
#define TELEMETRY_PERIOD_MS   20      // 50 Hz
