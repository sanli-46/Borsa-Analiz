/*
 * AHS-MK1 — Otonom Hava Savunma Sistemi
 * ESP32 Firmware (DevKit V1)
 *
 * Sorumluluklar:
 *  - 3× kapalı çevrim (enkoderli) step motor sürüş (Pan / Tilt / Şarjör)
 *      JKON EC86-45 (4.5 Nm) × 2 + JKON EC57-23 (2.3 Nm) × 1, EC808D sürücüler
 *  - MOSFET tetiklemeli selenoid (atış)
 *  - Donanımsal Acil Stop kontağı izleme (NC, mantar buton)
 *  - UART2 üzerinden RPi5 Python servisi ile ASCII satır tabanlı protokol
 *
 * Protokol (RPi → ESP32):
 *   M <pan_deg> <tilt_deg>\n   Pan/Tilt hedef açıları (-180..180 / -45..45)
 *   Z <step>\n                 Şarjör step ilerlet (1=bir mermi)
 *   H\n                        Tüm motorları sıfır pozisyona döndür
 *   F\n                        Tek atış (selenoid darbesi)
 *   S 0|1\n                    Güvenlik kilidi (1=kilitli, atış engelli)
 *   E\n                        Yazılım acil stop
 *   R\n                        Reset/Re-arm
 *   P\n                        Ping (cevap: PONG)
 *
 * Protokol (ESP32 → RPi, satır başında etiket):
 *   T <pan> <tilt> <mag> <ammo> <safety> <estop> <ms>\n   Telemetri (50 Hz)
 *   OK <komut>\n               Komut başarıyla yürütüldü
 *   ERR <komut> <neden>\n      Komut reddedildi
 *   L <seviye> <mesaj>\n       Log (INFO/WARN/ERROR)
 *   PONG\n                     Ping cevabı
 *
 * Pin atamalarını config.h içinden değiştirin.
 * Bağımlılıklar: AccelStepper (Mike McCauley), ESP32 Arduino Core ≥ 2.0.0
 */

#include <Arduino.h>
#include <AccelStepper.h>
#include "config.h"

// ───────────────────────────────────────────────────────────────────────
// Motorlar
// ───────────────────────────────────────────────────────────────────────
AccelStepper panMotor (AccelStepper::DRIVER, PAN_STEP_PIN,  PAN_DIR_PIN);
AccelStepper tiltMotor(AccelStepper::DRIVER, TILT_STEP_PIN, TILT_DIR_PIN);
AccelStepper magMotor (AccelStepper::DRIVER, MAG_STEP_PIN,  MAG_DIR_PIN);

// ───────────────────────────────────────────────────────────────────────
// Sistem durumu
// ───────────────────────────────────────────────────────────────────────
struct SystemState {
  float panTargetDeg   = 0.0f;
  float tiltTargetDeg  = 0.0f;
  long  magStepsTarget = 0;
  uint16_t ammo        = MAX_AMMO;
  bool  safetyOn       = true;
  bool  emergencyStop  = false;
  unsigned long lastTelemetryMs = 0;
  unsigned long firingUntilMs   = 0;
} sys;

// ───────────────────────────────────────────────────────────────────────
// UART / komut tampon
// ───────────────────────────────────────────────────────────────────────
HardwareSerial& host = Serial2;          // RPi haberleşmesi
char  rxBuf[128];
size_t rxLen = 0;

// ───────────────────────────────────────────────────────────────────────
// Yardımcılar
// ───────────────────────────────────────────────────────────────────────
inline long degToSteps(float deg, float stepsPerDeg) {
  return (long)(deg * stepsPerDeg);
}
inline float stepsToDeg(long steps, float stepsPerDeg) {
  return (float)steps / stepsPerDeg;
}

void sendLine(const String& s) {
  host.print(s);
  host.print('\n');
}
void sendOk (const char* cmd) { sendLine(String("OK ")  + cmd); }
void sendErr(const char* cmd, const char* why) { sendLine(String("ERR ") + cmd + " " + why); }
void sendLog(const char* lvl, const String& msg) { sendLine(String("L ") + lvl + " " + msg); }

void enableDrivers(bool on) {
  // EC808D ENA aktif düşük (genellikle); donanımına göre HIGH/LOW invert et.
  digitalWrite(DRIVER_ENA_PIN, on ? LOW : HIGH);
}

void setEmergencyStop(bool on, const char* reason) {
  if (sys.emergencyStop == on) return;
  sys.emergencyStop = on;
  if (on) {
    panMotor.stop(); tiltMotor.stop(); magMotor.stop();
    digitalWrite(SOLENOID_PIN, LOW);
    enableDrivers(false);
    sendLog("ERROR", String("E-STOP AKTIF: ") + reason);
  } else {
    enableDrivers(true);
    sendLog("INFO", "E-STOP temizlendi");
  }
}

// ───────────────────────────────────────────────────────────────────────
// Komut çözücü
// ───────────────────────────────────────────────────────────────────────
void handleCommand(char* line) {
  if (!line || !*line) return;
  char cmd = line[0];
  char* args = (line[1] == ' ') ? line + 2 : line + 1;

  switch (cmd) {
    case 'P': {                                          // Ping
      sendLine("PONG");
      return;
    }
    case 'E': {                                          // E-stop (yazılım)
      setEmergencyStop(true, "yazilim");
      sendOk("E");
      return;
    }
    case 'R': {                                          // Reset
      setEmergencyStop(false, "reset");
      sendOk("R");
      return;
    }
  }

  if (sys.emergencyStop) { sendErr(String(cmd).c_str(), "estop"); return; }

  switch (cmd) {
    case 'M': {                                          // Pan/Tilt hedef
      float p = NAN, t = NAN;
      if (sscanf(args, "%f %f", &p, &t) != 2) { sendErr("M", "parse"); return; }
      if (p < -180 || p > 180 || t < -45 || t > 45)     { sendErr("M", "range"); return; }
      sys.panTargetDeg  = p;
      sys.tiltTargetDeg = t;
      panMotor .moveTo(degToSteps(p, PAN_STEPS_PER_DEG));
      tiltMotor.moveTo(degToSteps(t, TILT_STEPS_PER_DEG));
      sendOk("M");
      break;
    }
    case 'Z': {                                          // Şarjör ilerlet
      int s = 0;
      if (sscanf(args, "%d", &s) != 1) { sendErr("Z", "parse"); return; }
      sys.magStepsTarget += (long)s * MAG_STEPS_PER_SLOT;
      magMotor.moveTo(sys.magStepsTarget);
      sendOk("Z");
      break;
    }
    case 'H': {                                          // Sıfır pozisyon (tüm motorlar)
      sys.panTargetDeg = sys.tiltTargetDeg = 0;
      sys.magStepsTarget = 0;
      panMotor .moveTo(0);
      tiltMotor.moveTo(0);
      magMotor .moveTo(0);
      sendOk("H");
      break;
    }
    case 'F': {                                          // Atış
      if (sys.safetyOn)        { sendErr("F", "safety"); return; }
      if (sys.ammo == 0)       { sendErr("F", "empty");  return; }
      digitalWrite(SOLENOID_PIN, HIGH);
      sys.firingUntilMs = millis() + SOLENOID_PULSE_MS;
      sys.ammo--;
      // Otomatik şarjör bir slot ilerlet
      sys.magStepsTarget += MAG_STEPS_PER_SLOT;
      magMotor.moveTo(sys.magStepsTarget);
      sendOk("F");
      break;
    }
    case 'S': {                                          // Güvenlik
      int v = 1;
      if (sscanf(args, "%d", &v) != 1) { sendErr("S", "parse"); return; }
      sys.safetyOn = (v != 0);
      sendOk("S");
      break;
    }
    default:
      sendErr(String(cmd).c_str(), "unknown");
  }
}

// ───────────────────────────────────────────────────────────────────────
// E-STOP donanımsal izleme (NC mantar buton, açıldığında HIGH okunur)
// ───────────────────────────────────────────────────────────────────────
void IRAM_ATTR estopISR() {
  // ISR içinde minimum iş — durumu değiştiren mantık loop()'ta
}

void pollEstop() {
  static int prev = HIGH;
  int v = digitalRead(ESTOP_PIN);
  if (v != prev) {
    prev = v;
    if (v == HIGH) setEmergencyStop(true, "donanim");   // NC açıldı
  }
}

// ───────────────────────────────────────────────────────────────────────
// Telemetri yayını (≈ 50 Hz)
// ───────────────────────────────────────────────────────────────────────
void sendTelemetry() {
  unsigned long now = millis();
  if (now - sys.lastTelemetryMs < TELEMETRY_PERIOD_MS) return;
  sys.lastTelemetryMs = now;

  float pan  = stepsToDeg(panMotor .currentPosition(), PAN_STEPS_PER_DEG);
  float tilt = stepsToDeg(tiltMotor.currentPosition(), TILT_STEPS_PER_DEG);
  float mag  = stepsToDeg(magMotor .currentPosition(), MAG_STEPS_PER_DEG);

  char buf[96];
  snprintf(buf, sizeof(buf), "T %.2f %.2f %.1f %u %d %d %lu",
           pan, tilt, mag, sys.ammo,
           sys.safetyOn ? 1 : 0, sys.emergencyStop ? 1 : 0, now);
  sendLine(buf);
}

// ───────────────────────────────────────────────────────────────────────
// Selenoid darbe sonu
// ───────────────────────────────────────────────────────────────────────
void updateSolenoid() {
  if (sys.firingUntilMs && millis() >= sys.firingUntilMs) {
    digitalWrite(SOLENOID_PIN, LOW);
    sys.firingUntilMs = 0;
  }
}

// ───────────────────────────────────────────────────────────────────────
// UART satır okuma
// ───────────────────────────────────────────────────────────────────────
void readSerial() {
  while (host.available()) {
    char c = (char)host.read();
    if (c == '\r') continue;
    if (c == '\n' || rxLen >= sizeof(rxBuf) - 1) {
      rxBuf[rxLen] = 0;
      if (rxLen > 0) handleCommand(rxBuf);
      rxLen = 0;
    } else {
      rxBuf[rxLen++] = c;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────
// Setup / Loop
// ───────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  host.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);

  pinMode(DRIVER_ENA_PIN, OUTPUT);
  pinMode(SOLENOID_PIN,   OUTPUT);
  pinMode(ESTOP_PIN,      INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);

  digitalWrite(SOLENOID_PIN, LOW);
  enableDrivers(true);

  panMotor .setMaxSpeed(PAN_MAX_SPEED);  panMotor .setAcceleration(PAN_ACCEL);
  tiltMotor.setMaxSpeed(TILT_MAX_SPEED); tiltMotor.setAcceleration(TILT_ACCEL);
  magMotor .setMaxSpeed(MAG_MAX_SPEED);  magMotor .setAcceleration(MAG_ACCEL);

  attachInterrupt(digitalPinToInterrupt(ESTOP_PIN), estopISR, CHANGE);

  sendLog("INFO", "ESP32 firmware basladi (AHS-MK1)");
  sendLog("INFO", String("UART2 baud=") + UART_BAUD);
}

void loop() {
  readSerial();
  pollEstop();
  if (!sys.emergencyStop) {
    panMotor .run();
    tiltMotor.run();
    magMotor .run();
  }
  updateSolenoid();
  sendTelemetry();

  // Status LED — yavaş yanıp sönme normal, hızlı = e-stop
  static unsigned long ledMs = 0;
  unsigned long period = sys.emergencyStop ? 100 : 1000;
  if (millis() - ledMs >= period) {
    ledMs = millis();
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }
}
