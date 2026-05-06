"""Çalışma zamanı yapılandırması — env değişkenleri ile geçersiz kılınabilir."""
from __future__ import annotations
import os
from dataclasses import dataclass


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Config:
    # WebSocket / HTTP — operatör arayüzü ya da Node köprüsü buradan bağlanır
    http_host: str = _env("AHS_HTTP_HOST", "0.0.0.0")
    http_port: int = int(_env("AHS_HTTP_PORT", "8765"))

    # ZMQ — Ana Görev Bilgisayarı (PC) ile haberleşme
    zmq_command_bind: str = _env("AHS_ZMQ_CMD",  "tcp://0.0.0.0:5555")  # REP
    zmq_telemetry_bind: str = _env("AHS_ZMQ_TLM", "tcp://0.0.0.0:5556")  # PUB

    # ESP32 UART
    serial_port: str = _env("AHS_SERIAL_PORT", "/dev/ttyAMA0")
    serial_baud: int = int(_env("AHS_SERIAL_BAUD", "115200"))

    # LiDAR Lite-v3 (I²C)
    lidar_bus: int = int(_env("AHS_LIDAR_BUS", "1"))
    lidar_addr: int = int(_env("AHS_LIDAR_ADDR", "0x62"), 16)

    # Vision
    yolo_weights: str = _env("AHS_YOLO_WEIGHTS", "yolov8n.pt")
    yolo_conf: float = float(_env("AHS_YOLO_CONF", "0.45"))
    govcu_rtsp: str = _env("AHS_GOVCU_RTSP", "rtsp://192.168.1.64:554/Streaming/Channels/101")
    avci_device: str = _env("AHS_AVCI_DEVICE", "/dev/video0")

    # Operasyonel
    telemetry_hz: float = float(_env("AHS_TELEMETRY_HZ", "30"))
    log_level: str = _env("AHS_LOG_LEVEL", "INFO")

    # Mock modu — gerçek donanım bağlı değilse otomatik aktif olur
    force_mock: bool = _env("AHS_FORCE_MOCK", "0") == "1"


CONFIG = Config()
