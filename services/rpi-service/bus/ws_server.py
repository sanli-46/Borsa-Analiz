"""FastAPI WebSocket sunucusu.

Tarayıcı operatör arayüzü (veya yerel test) doğrudan bu uca bağlanabilir.
ZMQ köprüsünden geçmek istemeyen geliştirme akışları için pratik."""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Awaitable, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger(__name__)

CommandHandler = Callable[[dict], Awaitable[dict]]


class WsServer:
    def __init__(self):
        self.app = FastAPI(title="AHS-MK1 RPi Service")
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
        )
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

        @self.app.get("/healthz")
        async def healthz():
            return {"status": "ok", "clients": len(self._clients)}

    def attach(self, on_command: CommandHandler) -> None:
        @self.app.websocket("/ws")
        async def ws(websocket: WebSocket):
            await websocket.accept()
            async with self._lock:
                self._clients.add(websocket)
            log.info("WS bağlantı (toplam=%d)", len(self._clients))
            try:
                while True:
                    raw = await websocket.receive_text()
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        await websocket.send_text(json.dumps(
                            {"type": "ack", "ok": False, "reason": "json"}
                        ))
                        continue
                    ack = await on_command(msg)
                    await websocket.send_text(json.dumps(ack))
            except WebSocketDisconnect:
                pass
            except Exception as e:
                log.warning("WS hata: %s", e)
            finally:
                async with self._lock:
                    self._clients.discard(websocket)
                log.info("WS koptu (toplam=%d)", len(self._clients))

    async def broadcast(self, payload: dict) -> None:
        if not self._clients:
            return
        msg = json.dumps(payload)
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)
