"""Kamera akış yönetimi.

- Gözcü: Hikvision IP PTZ → RTSP (CAT6 üzerinden)
- Avcı: Arducam B01675MP → MIPI CSI-2 (/dev/video0) — UDP olarak PC'ye iletilebilir

Bu modül sadece OpenCV `VideoCapture` sarmalayıcısı sağlar.
Düşük gecikmeli UDP yayını gerçek deploy'da GStreamer pipeline ile yapılır
(README'deki örnek `gst-launch-1.0` komutuna bakın). OpenCV/cv2 yüklü
değilse modül "yok" durumunda kalır — vision pipeline mock frame üretir."""
from __future__ import annotations
import logging

log = logging.getLogger(__name__)

try:
    import cv2  # type: ignore
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    log.warning("cv2 bulunamadı — kamera mock modu (frame üretilmeyecek)")


class CameraSource:
    def __init__(self, source: str | int):
        self.source = source
        self.cap = None
        if HAS_CV2:
            try:
                self.cap = cv2.VideoCapture(source)
                if not self.cap.isOpened():
                    log.error("Kamera açılamadı: %s", source)
                    self.cap = None
                else:
                    log.info("Kamera açıldı: %s", source)
            except Exception as e:
                log.error("Kamera açılırken hata: %s", e)

    def read(self):
        if not self.cap:
            return None
        ok, frame = self.cap.read()
        if not ok:
            return None
        return frame

    def release(self):
        if self.cap:
            self.cap.release()
            self.cap = None
