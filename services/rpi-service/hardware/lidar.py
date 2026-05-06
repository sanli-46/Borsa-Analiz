"""SparkFun LiDAR Lite-v3 (40m, 500Hz) I²C sürücü sarmalayıcısı.

`smbus2` yoksa veya cihaz erişilemezse mock değer döndürür."""
from __future__ import annotations
import logging
import time

log = logging.getLogger(__name__)

try:
    from smbus2 import SMBus  # type: ignore
    HAS_SMBUS = True
except ImportError:
    HAS_SMBUS = False
    log.warning("smbus2 bulunamadı — LiDAR mock modu")

REG_ACQ_COMMAND = 0x00
REG_STATUS      = 0x01
REG_DISTANCE_HI = 0x0F
REG_DISTANCE_LO = 0x10


class Lidar:
    def __init__(self, bus: int, addr: int, force_mock: bool = False):
        self.addr = addr
        self._mock = force_mock or not HAS_SMBUS
        self._bus = None
        self._last_distance = 0.0
        if not self._mock:
            try:
                self._bus = SMBus(bus)
                log.info("LiDAR Lite-v3 I²C bus=%d addr=0x%02X açıldı", bus, addr)
            except Exception as e:
                log.error("LiDAR I²C açılamadı: %s — mock'a dönülüyor", e)
                self._mock = True

    def measure(self) -> tuple[float, bool]:
        """Tek atış mesafe ölçümü → (metre, geçerli_mi)."""
        if self._mock or not self._bus:
            # Sürekli sabit 0; gerçek hedef takibinde vision modülü mesafe atar
            return 0.0, False
        try:
            self._bus.write_byte_data(self.addr, REG_ACQ_COMMAND, 0x04)
            # Ölçüm hazır olana kadar bekle
            for _ in range(20):
                status = self._bus.read_byte_data(self.addr, REG_STATUS)
                if not (status & 0x01):
                    break
                time.sleep(0.001)
            hi = self._bus.read_byte_data(self.addr, REG_DISTANCE_HI)
            lo = self._bus.read_byte_data(self.addr, REG_DISTANCE_LO)
            cm = (hi << 8) | lo
            self._last_distance = cm / 100.0
            return self._last_distance, True
        except Exception as e:
            log.warning("LiDAR ölçüm hatası: %s", e)
            return self._last_distance, False
