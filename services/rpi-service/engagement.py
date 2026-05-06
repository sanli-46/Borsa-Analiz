"""Çekirdek angajman / durum makinesi.

UI komutlarını alır, ESP32'ye UART komutuna çevirir, vision sonuçlarını
hedef listesi olarak yayınlar, otonom modda öncelik sırasına göre kilit
ve ateş kararı üretir."""
from __future__ import annotations
import asyncio
import logging
import time
from dataclasses import asdict
from typing import Optional

from protocol import (
    Telemetry, TargetsMsg, LogMsg, AckMsg, Motors, Sensors, Target,
    Mode, Threat,
)

log = logging.getLogger(__name__)


class Engagement:
    """Sistemin merkezi mantık katmanı.

    `serial_link`   — ESP32 ile UART köprüsü (komut/telemetri)
    `lidar`         — Mesafe ölçer
    `detector`      — YOLOv8 (ya da mock) — periyodik infer çağrılır
    `broadcasters`  — telemetri yayıncıları listesi (WebSocket + ZMQ)
    """

    def __init__(self, serial_link, lidar, detector, broadcast_fn):
        self.serial = serial_link
        self.lidar = lidar
        self.detector = detector
        self.broadcast = broadcast_fn  # async fn(dict)
        self.serial_in: asyncio.Queue[str] = asyncio.Queue(maxsize=1024)

        self.mode: Mode = "MANUEL"
        self.status: str = "HAZIR"
        self.safety_on: bool = True
        self.estop: bool = False
        self.ammo: int = 24
        self.shots_fired: int = 0
        self.motors = Motors()
        self.sensors = Sensors()
        self.targets: list[Target] = []
        self.locked_id: Optional[str] = None
        self._last_uart_ts = time.time()

    # ─────────────────────────────────────────────────────────────
    # Komut işleyici (WS + ZMQ ortak giriş noktası)
    # ─────────────────────────────────────────────────────────────
    async def handle_command(self, msg: dict) -> dict:
        action = (msg or {}).get("action", "")
        ok, reason = True, None
        try:
            if action == "set_mode":
                self.mode = msg.get("mode", "MANUEL")
                self.locked_id = None
                self._log("INFO", f"Mod değiştirildi: {self.mode}")

            elif action == "emergency_stop":
                self.serial.send("E")
                self.estop = True
                self.status = "DURDURULDU"
                self.locked_id = None
                self._log("ERROR", "⬛ ACİL STOP — tüm sistemler durduruldu")

            elif action == "reset":
                self.serial.send("R")
                self.estop = False
                self.status = "HAZIR"
                self._log("SUCCESS", "Sistem sıfırlandı")

            elif action == "set_motors":
                pan = float(msg.get("pan", self.motors.pan))
                tilt = float(msg.get("tilt", self.motors.tilt))
                if not (-180 <= pan <= 180): raise ValueError("pan range")
                if not (-45 <= tilt <= 45):  raise ValueError("tilt range")
                self.serial.send(f"M {pan:.2f} {tilt:.2f}")

            elif action == "magazine_step":
                steps = int(msg.get("steps", 1))
                self.serial.send(f"Z {steps}")

            elif action == "home_motors":
                self.serial.send("H")
                self._log("INFO", "Motorlar sıfır pozisyona")

            elif action == "lock_target":
                tid = msg.get("target_id")
                self.locked_id = tid if tid else None
                for t in self.targets:
                    t.locked = (t.id == tid)
                if tid:
                    target = next((t for t in self.targets if t.id == tid), None)
                    self.status = "KILITLEME"
                    self._log("WARN", f"Hedef kilitlendi: {target.label if target else tid}")
                else:
                    self.status = "TARAMA"
                    self._log("INFO", "Kilit kaldırıldı")

            elif action == "classify_target":
                tid = msg.get("target_id")
                threat: Threat = msg.get("threat", "BILINMEYEN")
                for t in self.targets:
                    if t.id == tid:
                        t.type = threat
                        self._log("INFO", f"{t.label} sınıflandırıldı: {threat}")

            elif action == "fire":
                if self.safety_on: ok, reason = False, "safety"
                elif self.ammo == 0: ok, reason = False, "empty"
                elif not self.locked_id: ok, reason = False, "no_lock"
                else:
                    self.serial.send("F")
                    # Telemetri ESP32'den gelene kadar tahminle güncelle
                    self.ammo = max(0, self.ammo - 1)
                    self.shots_fired += 1
                    target = next((t for t in self.targets if t.id == self.locked_id), None)
                    self._log("WARN", f"ATIŞ → {target.label if target else '?'}  ammo={self.ammo}")

            elif action == "set_safety":
                on = bool(msg.get("safety", True))
                self.safety_on = on
                self.serial.send(f"S {1 if on else 0}")
                self._log("SUCCESS" if on else "ERROR",
                          "Güvenlik kilidi AKTİF" if on else "⚠ Güvenlik kilidi AÇIK")

            elif action == "ping":
                pass

            else:
                ok, reason = False, "unknown_action"
        except Exception as e:
            log.exception("Komut işlenemedi: %s", action)
            ok, reason = False, str(e)

        return asdict(AckMsg(action=action, ok=ok, reason=reason))

    # ─────────────────────────────────────────────────────────────
    # ESP32'den gelen satırları işle
    # ─────────────────────────────────────────────────────────────
    async def serial_consumer(self) -> None:
        while True:
            line = await self.serial_in.get()
            now = time.time()
            # Telemetri paketleri arası geçen süre = effective UART latency
            if line.startswith("T "):
                dt_ms = (now - self._last_uart_ts) * 1000.0
                # küçük EMA ile yumuşat
                self.sensors.latency_ms = 0.7 * self.sensors.latency_ms + 0.3 * dt_ms
            self._last_uart_ts = now
            try:
                self._parse_serial_line(line)
            except Exception as e:
                log.warning("UART satırı parse edilemedi: %r (%s)", line, e)

    def _parse_serial_line(self, line: str) -> None:
        if not line:
            return
        head = line[0]
        if head == "T":
            # T <pan> <tilt> <mag> <ammo> <safety> <estop> <uptime_ms>
            # NOT: 8. alan ESP32 uptime'ıdır, gecikme değil. Gecikmeyi
            # telemetri paketleri arası geçen süre olarak hesaplıyoruz.
            parts = line.split()
            if len(parts) >= 8:
                self.motors.pan      = float(parts[1])
                self.motors.tilt     = float(parts[2])
                self.motors.magazine = float(parts[3])
                self.ammo            = int(parts[4])
                self.safety_on       = bool(int(parts[5]))
                self.estop           = bool(int(parts[6]))
                # parts[7] uptime — bilgi amaçlı, kullanmıyoruz
        elif line.startswith("L "):
            # L <LEVEL> <message>
            try:
                _, lvl, *rest = line.split(" ", 2)
                self._log(lvl if lvl in ("INFO","WARN","ERROR","SUCCESS") else "INFO",
                          rest[0] if rest else "")
            except ValueError:
                pass
        elif line.startswith("ERR "):
            self._log("ERROR", f"ESP32: {line[4:]}")
        elif line == "PONG":
            pass

    # ─────────────────────────────────────────────────────────────
    # Vision / sensör döngüsü (ana logic tick)
    # ─────────────────────────────────────────────────────────────
    async def perception_loop(self, hz: float) -> None:
        period = 1.0 / max(1.0, hz)
        while True:
            t0 = time.time()
            # 1) Vision infer (mock veya gerçek frame)
            new_targets = self.detector.infer(None)
            # 2) Önceden kilitli olan hedefin kimliğini koru (mock id'ler değişebilir)
            if self.locked_id and not any(t.id == self.locked_id for t in new_targets):
                # kilit kaybedildi
                self.locked_id = None
                if self.status == "KILITLEME":
                    self.status = "TARAMA"
            self.targets = new_targets
            for t in self.targets:
                t.locked = (t.id == self.locked_id)

            # 3) LiDAR — hedef varsa mesafe oku
            dist, valid = self.lidar.measure()
            if valid:
                self.sensors.lidar_distance = dist
                self.sensors.lidar_valid = True
                if self.locked_id:
                    for t in self.targets:
                        if t.id == self.locked_id:
                            t.distance = dist
            else:
                # Vision'dan gelen mesafe varsa onu kullan
                lk = next((t for t in self.targets if t.id == self.locked_id), None)
                self.sensors.lidar_distance = lk.distance if lk else 0.0
                self.sensors.lidar_valid = bool(lk)

            self.sensors.fps = self.detector.fps

            # 4) Otonom karar
            if self.mode in ("OTONOM", "SURU") and not self.estop:
                await self._autonomous_step()

            # 5) Yayın
            await self._broadcast_state()

            dt = time.time() - t0
            await asyncio.sleep(max(0.0, period - dt))

    async def _autonomous_step(self) -> None:
        if self.locked_id is None:
            enemies = [t for t in self.targets if t.type == "DUSMAN"]
            if enemies:
                top = max(enemies, key=lambda t: t.priority)
                self.locked_id = top.id
                top.locked = True
                self.status = "KILITLEME"
                self._log("WARN", f"Otonom kilit: {top.label} (öncelik={top.priority})")
                # Motorları hedefe çevir (basit normalize → derece eşleme)
                pan = (top.x - 0.5) * 90.0
                tilt = (0.5 - top.y) * 30.0
                self.serial.send(f"M {pan:.2f} {tilt:.2f}")
        elif not self.safety_on and self.ammo > 0:
            target = next((t for t in self.targets if t.id == self.locked_id), None)
            if target and target.type == "DUSMAN":
                # ateş et
                self.serial.send("F")
                self.ammo = max(0, self.ammo - 1)
                self.shots_fired += 1
                self._log("WARN", f"OTONOM ATIŞ → {target.label}")

    # ─────────────────────────────────────────────────────────────
    async def _broadcast_state(self) -> None:
        tlm = Telemetry(
            mode=self.mode, status=self.status, safety_on=self.safety_on,
            emergency_stop=self.estop, ammo=self.ammo, max_ammo=24,
            shots_fired=self.shots_fired, motors=self.motors, sensors=self.sensors,
        )
        await self.broadcast(asdict(tlm))
        await self.broadcast(asdict(TargetsMsg(targets=self.targets, locked_id=self.locked_id)))

    def _log(self, level: str, message: str) -> None:
        log.info("[%s] %s", level, message)
        # Yayın main loop'ta yapılacağı için fire-and-forget bir task
        asyncio.create_task(self.broadcast(asdict(LogMsg(level=level, message=message))))  # type: ignore[arg-type]
