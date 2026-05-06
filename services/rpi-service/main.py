"""AHS-MK1 RPi5 servis giriş noktası.

Çalıştır:
    cd services/rpi-service
    pip install -r requirements.txt
    python main.py
        veya:
    uvicorn main:app --host 0.0.0.0 --port 8765

Donanım hazır değilse her bileşen otomatik olarak mock'a düşer; UI
gerçek bir pipeline ile konuşuyormuş gibi çalışmaya devam eder."""
from __future__ import annotations
import asyncio
import logging
import sys

import uvicorn

from config import CONFIG
from hardware.serial_link import SerialLink
from hardware.lidar import Lidar
from vision.detector import Detector
from bus.ws_server import WsServer
from bus.zmq_server import ZmqServer
from engagement import Engagement


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, CONFIG.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


# ──────────────────────────────────────────────────────────────────
# Servis çatısı — FastAPI app + asyncio görevleri
# ──────────────────────────────────────────────────────────────────
ws = WsServer()
app = ws.app

serial_link = SerialLink(CONFIG.serial_port, CONFIG.serial_baud, CONFIG.force_mock)
lidar = Lidar(CONFIG.lidar_bus, CONFIG.lidar_addr, CONFIG.force_mock)
detector = Detector(CONFIG.yolo_weights, CONFIG.yolo_conf, CONFIG.force_mock)
zmq_srv = ZmqServer(CONFIG.zmq_command_bind, CONFIG.zmq_telemetry_bind)
engagement: Engagement | None = None


async def broadcast(payload: dict) -> None:
    """WS'e ve ZMQ'ye aynı anda yayınla."""
    await ws.broadcast(payload)
    topic = payload.get("type", "msg")
    await zmq_srv.publish(topic, payload)


@app.on_event("startup")
async def startup() -> None:
    setup_logging()
    global engagement
    engagement = Engagement(serial_link, lidar, detector, broadcast)

    # Komut işleyiciyi her iki köprüye de bağla
    ws.attach(engagement.handle_command)
    await zmq_srv.start(engagement.handle_command)

    # ESP32 UART'ını başlat — okuma satırları kuyruğa düşer
    loop = asyncio.get_running_loop()
    serial_link.start(loop, engagement.serial_in)

    # Asyncio görevleri
    asyncio.create_task(engagement.serial_consumer())
    asyncio.create_task(engagement.perception_loop(CONFIG.telemetry_hz))

    logging.info("AHS-MK1 RPi servisi hazır — WS=%s:%d  ZMQ=%s",
                 CONFIG.http_host, CONFIG.http_port, CONFIG.zmq_command_bind)


@app.on_event("shutdown")
async def shutdown() -> None:
    serial_link.stop()
    await zmq_srv.stop()


if __name__ == "__main__":
    setup_logging()
    uvicorn.run(
        "main:app",
        host=CONFIG.http_host,
        port=CONFIG.http_port,
        log_level=CONFIG.log_level.lower(),
    )
