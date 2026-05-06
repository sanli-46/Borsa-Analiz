export type SystemMode = "MANUEL" | "OTONOM" | "SURU";
export type SystemStatus = "HAZIR" | "TARAMA" | "KILITLEME" | "ATIS" | "YENİDEN_YUKLE" | "DURDURULDU";
export type ThreatType = "DOST" | "DUSMAN" | "BILINMEYEN";

export interface Target {
  id: string;
  type: ThreatType;
  x: number;
  y: number;
  distance: number;
  confidence: number;
  label: string;
  speed: number;
  heading: number;
  locked: boolean;
  priority: number;
}

export interface MotorState {
  pan: number;
  tilt: number;
  magazine: number;
  panTarget: number;
  tiltTarget: number;
}

export interface SensorState {
  lidarDistance: number;
  lidarValid: boolean;
  ballisticCorrection: number;
  fps: number;
  latencyMs: number;
}

export interface SystemState {
  mode: SystemMode;
  status: SystemStatus;
  emergencyStop: boolean;
  safetyOn: boolean;
  ammoCount: number;
  maxAmmo: number;
  motors: MotorState;
  sensors: SensorState;
  targets: Target[];
  lockedTargetId: string | null;
  shotsFired: number;
  logs: LogEntry[];
}

export interface LogEntry {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  message: string;
}

export function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: Math.random().toString(36).slice(2),
    time: new Date().toTimeString().slice(0, 8),
    level,
    message,
  };
}

export const INITIAL_STATE: SystemState = {
  mode: "MANUEL",
  status: "HAZIR",
  emergencyStop: false,
  safetyOn: true,
  ammoCount: 24,
  maxAmmo: 24,
  motors: { pan: 0, tilt: 0, magazine: 0, panTarget: 0, tiltTarget: 0 },
  sensors: { lidarDistance: 0, lidarValid: false, ballisticCorrection: 0, fps: 0, latencyMs: 0 },
  targets: [],
  lockedTargetId: null,
  shotsFired: 0,
  logs: [
    createLog("INFO", "Sistem başlatıldı"),
    createLog("INFO", "YOLOv8 modeli yüklendi (v8n.pt)"),
    createLog("INFO", "ESP32 bağlantısı kuruldu (UART 115200)"),
    createLog("INFO", "LiDAR Lite-v3 kalibre edildi"),
    createLog("SUCCESS", "Tüm alt sistemler hazır"),
  ],
};
