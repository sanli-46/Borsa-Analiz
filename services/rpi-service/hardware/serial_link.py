"""ESP32 ile UART2 üzerinden satır-tabanlı ASCII protokolü.

`SerialLink` sınıfı tek bir okuma thread'i + asyncio kuyruğu sağlar.
`send()` thread-safe. `pyserial` yüklü değilse otomatik mock'a döner."""
from __future__ import annotations
import asyncio
import logging
import threading
import time
from typing import Optional

log = logging.getLogger(__name__)

try:
    import serial  # type: ignore
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    log.warning("pyserial bulunamadı — SerialLink mock modunda çalışacak")


class SerialLink:
    def __init__(self, port: str, baud: int, force_mock: bool = False):
        self.port = port
        self.baud = baud
        self._mock = force_mock or not HAS_SERIAL
        self._ser = None
        self._stop = threading.Event()
        self._reader: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        # asyncio kuyruğu — main loop tüketir
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._queue: Optional[asyncio.Queue] = None

    # ───────── lifecycle ─────────
    def start(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
        self._loop = loop
        self._queue = queue
        if self._mock:
            log.info("SerialLink: MOCK modu (gerçek ESP32 bağlı değil)")
            self._reader = threading.Thread(target=self._mock_loop, daemon=True)
        else:
            try:
                self._ser = serial.Serial(self.port, self.baud, timeout=0.1)
                log.info("SerialLink: %s @ %d açıldı", self.port, self.baud)
            except Exception as e:
                log.error("UART açılamadı (%s) — mock'a dönülüyor: %s", self.port, e)
                self._mock = True
                self._reader = threading.Thread(target=self._mock_loop, daemon=True)
            else:
                self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def stop(self) -> None:
        self._stop.set()
        if self._ser:
            try:
                self._ser.close()
            except Exception:
                pass

    # ───────── komutlar ─────────
    def send(self, line: str) -> None:
        if not line.endswith("\n"):
            line += "\n"
        if self._mock or not self._ser:
            log.debug("UART(mock) ← %s", line.strip())
            self._mock_handle(line.strip())
            return
        with self._lock:
            try:
                self._ser.write(line.encode("ascii", errors="ignore"))
            except Exception as e:
                log.error("UART yazma hatası: %s", e)

    # ───────── okuma thread'i ─────────
    def _read_loop(self) -> None:
        buf = b""
        assert self._ser
        while not self._stop.is_set():
            try:
                chunk = self._ser.read(128)
                if not chunk:
                    continue
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    s = line.decode("ascii", errors="ignore").strip()
                    if s:
                        self._dispatch(s)
            except Exception as e:
                log.error("UART okuma hatası: %s", e)
                time.sleep(0.5)

    # ───────── mock telemetri ─────────
    def _mock_loop(self) -> None:
        # ESP32 yok — sahte 50Hz telemetri üret
        pan = tilt = mag = 0.0
        ammo = 24
        safety = 1
        estop = 0
        last = time.time()
        while not self._stop.is_set():
            now = time.time()
            t = f"T {pan:.2f} {tilt:.2f} {mag:.1f} {ammo} {safety} {estop} {int((now-last)*1000)}"
            self._dispatch(t)
            time.sleep(0.05)

    def _mock_handle(self, line: str) -> None:
        # En azından OK ACK üret ki yukarı katmanlar takılı kalmasın
        if not line:
            return
        cmd = line[0]
        self._dispatch(f"OK {cmd}")

    def _dispatch(self, line: str) -> None:
        if self._loop and self._queue:
            try:
                self._loop.call_soon_threadsafe(self._queue.put_nowait, line)
            except RuntimeError:
                pass  # loop kapanmış olabilir
