"""ZeroMQ köprüsü — Ana Görev Bilgisayarı (PC) ile haberleşme.

Raporda belirtildiği gibi PC ↔ RPi haberleşmesi ZMQ üzerinden yapılır.
İki socket açılır:
  - REP  (komutlar)   PC bir komut REQ'ler, biz `engagement` katmanına iletir,
                      sonucu `ack` mesajı olarak döndürürüz.
  - PUB  (telemetri)  Telemetri ve hedef güncellemeleri broadcast.

Tarayıcı doğrudan ZMQ konuşamadığı için PC tarafında küçük bir
Node.js köprü servisi (services/pc-bridge) WebSocket↔ZMQ çevirir."""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Awaitable, Callable

import zmq
import zmq.asyncio

log = logging.getLogger(__name__)

CommandHandler = Callable[[dict], Awaitable[dict]]


class ZmqServer:
    def __init__(self, cmd_bind: str, tlm_bind: str):
        self._ctx = zmq.asyncio.Context.instance()
        self._cmd_bind = cmd_bind
        self._tlm_bind = tlm_bind
        self._rep: zmq.asyncio.Socket | None = None
        self._pub: zmq.asyncio.Socket | None = None
        self._task: asyncio.Task | None = None

    async def start(self, on_command: CommandHandler) -> None:
        self._rep = self._ctx.socket(zmq.REP)
        self._rep.bind(self._cmd_bind)
        self._pub = self._ctx.socket(zmq.PUB)
        self._pub.bind(self._tlm_bind)
        log.info("ZMQ REP %s | PUB %s", self._cmd_bind, self._tlm_bind)
        self._task = asyncio.create_task(self._serve(on_command))

    async def _serve(self, on_command: CommandHandler) -> None:
        assert self._rep
        while True:
            try:
                raw = await self._rep.recv_string()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await self._rep.send_string(json.dumps(
                        {"type": "ack", "ok": False, "reason": "json"}
                    ))
                    continue
                ack = await on_command(msg)
                await self._rep.send_string(json.dumps(ack))
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.exception("ZMQ REP hata: %s", e)
                try:
                    await self._rep.send_string(json.dumps(
                        {"type": "ack", "ok": False, "reason": str(e)}
                    ))
                except Exception:
                    pass

    async def publish(self, topic: str, payload: dict) -> None:
        if not self._pub:
            return
        try:
            await self._pub.send_string(f"{topic} {json.dumps(payload)}")
        except Exception as e:
            log.warning("ZMQ PUB hata: %s", e)

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        if self._rep: self._rep.close()
        if self._pub: self._pub.close()
