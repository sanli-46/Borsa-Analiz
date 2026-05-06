"""YOLOv8 tabanlı hedef tespit modülü.

`ultralytics` yoksa veya CUDA hızlandırma elverişsizse mock detektör çalışır
(rastgele hedefler üretir). Bu sayede UI ve mantık katmanı, model dağıtımı
gerçek olmasa da geliştirilebilir/sergilenebilir.

Gerçek deploy'da:
- Ana Görev Bilgisayarı (CUDA'lı NVIDIA GPU) üzerinde çalışması tavsiye edilir.
  RPi5 üstünde mümkün ama FPS düşer; bu durumda model versiyonu n/s seçilmeli.
"""
from __future__ import annotations
import logging
import random
import time
import uuid
from typing import Optional

from protocol import Target

log = logging.getLogger(__name__)

try:
    from ultralytics import YOLO  # type: ignore
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False


# YOLOv8 COCO sınıflarından hava savunma için anlamlı olanlar
RELEVANT_COCO = {
    0: ("KISI", "BILINMEYEN"),
    14: ("KUS", "BILINMEYEN"),
    4: ("UCAK", "DUSMAN"),
    5: ("OTOBUS", "BILINMEYEN"),
}


class Detector:
    def __init__(self, weights: str, conf: float, force_mock: bool = False):
        self.weights = weights
        self.conf = conf
        self._mock = force_mock or not HAS_YOLO
        self._model = None
        self._fps = 0.0
        self._t_last = time.time()
        if not self._mock:
            try:
                self._model = YOLO(weights)
                log.info("YOLOv8 modeli yüklendi: %s (conf=%.2f)", weights, conf)
            except Exception as e:
                log.error("YOLOv8 yüklenemedi (%s) — mock'a dönülüyor", e)
                self._mock = True

    @property
    def fps(self) -> float:
        return self._fps

    def infer(self, frame) -> list[Target]:
        """Frame ya gerçek bir numpy görüntü, ya None (mock üretir)."""
        t0 = time.time()
        try:
            if self._mock or self._model is None or frame is None:
                targets = self._mock_detect()
            else:
                targets = self._real_detect(frame)
        finally:
            dt = max(1e-3, time.time() - t0)
            # üstel hareketli ortalama
            self._fps = 0.7 * self._fps + 0.3 * (1.0 / dt)
        return targets

    # ───────── implementasyonlar ─────────
    def _real_detect(self, frame) -> list[Target]:
        results = self._model.predict(frame, conf=self.conf, verbose=False)
        out: list[Target] = []
        if not results:
            return out
        r = results[0]
        h, w = frame.shape[:2]
        for box in r.boxes:
            cls = int(box.cls[0])
            conf_v = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cx = ((x1 + x2) / 2) / w
            cy = ((y1 + y2) / 2) / h
            label, threat = RELEVANT_COCO.get(cls, (f"CLS{cls}", "BILINMEYEN"))
            out.append(Target(
                id=str(uuid.uuid4())[:8],
                label=label,
                type=threat,            # type: ignore[arg-type]
                x=cx, y=cy,
                distance=0.0,           # LiDAR fusion'da doldurulur
                speed=0.0, heading=0.0,
                confidence=conf_v * 100.0,
                priority=int(conf_v * 10),
            ))
        return out

    # ───────── mock: rastgele hedefler ─────────
    _mock_targets: list[Target] = []
    _mock_last_spawn: float = 0.0

    def _mock_detect(self) -> list[Target]:
        now = time.time()
        # küçük bir simülasyon: hedefler hareket eder, ara sıra yenisi gelir
        for t in self._mock_targets:
            t.x = max(0.05, min(0.95, t.x + random.uniform(-0.01, 0.01)))
            t.y = max(0.05, min(0.9, t.y + random.uniform(-0.005, 0.005)))
            t.distance = max(5.0, t.distance + random.uniform(-2.0, 2.0))
        if now - self._mock_last_spawn > 4 and len(self._mock_targets) < 4 and random.random() > 0.5:
            self._mock_targets.append(Target(
                id=str(uuid.uuid4())[:8],
                label=random.choice(["UHA-01", "HAVA-A1", "KUS-X", "BLN-7"]),
                type=random.choice(["DUSMAN", "DUSMAN", "BILINMEYEN", "DOST"]),  # type: ignore
                x=random.uniform(0.15, 0.85), y=random.uniform(0.2, 0.7),
                distance=random.uniform(50, 380),
                speed=random.uniform(20, 150),
                heading=random.uniform(0, 360),
                confidence=random.uniform(60, 96),
                priority=random.randint(2, 9),
            ))
            self._mock_last_spawn = now
        # Bazı hedefler kaybolsun
        if random.random() > 0.97 and self._mock_targets:
            self._mock_targets.pop(random.randrange(len(self._mock_targets)))
        return list(self._mock_targets)
