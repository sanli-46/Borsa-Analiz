"""Tüm katmanlar arası ortak mesaj sözleşmesi.

WebSocket (tarayıcı), ZMQ (PC) ve iç event-bus üzerinden geçen JSON mesajların
şemasını tek yerde tutar. Frontend `src/lib/protocol.ts` dosyası bu yapıyla
birebir aynı olmalıdır."""
from __future__ import annotations
from dataclasses import dataclass, asdict, field
from typing import Literal, Optional
import time

# ───────────────────────────────────────────────────────────────────────
# İstemciden (UI) gelen komutlar
# ───────────────────────────────────────────────────────────────────────
Mode = Literal["MANUEL", "OTONOM", "SURU"]
Threat = Literal["DOST", "DUSMAN", "BILINMEYEN"]
Status = Literal["HAZIR", "TARAMA", "KILITLEME", "ATIS", "YENIDEN_YUKLE", "DURDURULDU"]
LogLevel = Literal["INFO", "WARN", "ERROR", "SUCCESS"]


@dataclass
class Command:
    action: str
    mode: Optional[Mode] = None
    pan: Optional[float] = None
    tilt: Optional[float] = None
    target_id: Optional[str] = None
    threat: Optional[Threat] = None
    safety: Optional[bool] = None
    steps: Optional[int] = None


# ───────────────────────────────────────────────────────────────────────
# Sunucudan (RPi) yayınlanan mesajlar
# ───────────────────────────────────────────────────────────────────────
@dataclass
class Motors:
    pan: float = 0.0
    tilt: float = 0.0
    magazine: float = 0.0


@dataclass
class Sensors:
    lidar_distance: float = 0.0
    lidar_valid: bool = False
    fps: float = 0.0
    latency_ms: float = 0.0


@dataclass
class Target:
    id: str
    label: str
    type: Threat
    x: float          # 0..1 normalize görüntü piksel
    y: float
    distance: float   # metre
    speed: float      # km/h
    heading: float    # derece
    confidence: float # 0..100
    priority: int     # 0..10
    locked: bool = False


@dataclass
class Telemetry:
    type: str = "telemetry"
    ts: float = field(default_factory=time.time)
    mode: Mode = "MANUEL"
    status: Status = "HAZIR"
    safety_on: bool = True
    emergency_stop: bool = False
    ammo: int = 24
    max_ammo: int = 24
    shots_fired: int = 0
    motors: Motors = field(default_factory=Motors)
    sensors: Sensors = field(default_factory=Sensors)


@dataclass
class TargetsMsg:
    type: str = "targets"
    ts: float = field(default_factory=time.time)
    targets: list[Target] = field(default_factory=list)
    locked_id: Optional[str] = None


@dataclass
class LogMsg:
    type: str = "log"
    ts: float = field(default_factory=time.time)
    level: LogLevel = "INFO"
    message: str = ""


@dataclass
class AckMsg:
    type: str = "ack"
    action: str = ""
    ok: bool = True
    reason: Optional[str] = None
    ts: float = field(default_factory=time.time)


def to_dict(obj) -> dict:
    """dataclass → JSON-serializable dict (nested dataclass'ları da çevirir)."""
    return asdict(obj)
