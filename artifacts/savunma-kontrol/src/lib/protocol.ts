// Sunucu (RPi Python servisi) ile birebir aynı mesaj sözleşmesi.
// Bu dosya `services/rpi-service/protocol.py` ile senkron tutulmalıdır.

import type { SystemMode, ThreatType, Target as UITarget, LogEntry } from "./system-state";

// ───── Komutlar (UI → server) ────────────────────────────────────────
export type CommandAction =
  | "set_mode"
  | "emergency_stop"
  | "reset"
  | "set_motors"
  | "magazine_step"
  | "home_motors"
  | "lock_target"
  | "classify_target"
  | "fire"
  | "set_safety"
  | "ping";

export interface Command {
  action: CommandAction;
  mode?: SystemMode;
  pan?: number;
  tilt?: number;
  target_id?: string | null;
  threat?: ThreatType;
  safety?: boolean;
  steps?: number;
}

// ───── Sunucudan gelen mesajlar (server → UI) ────────────────────────
export interface ServerTelemetry {
  type: "telemetry";
  ts: number;
  mode: SystemMode;
  status: string;
  safety_on: boolean;
  emergency_stop: boolean;
  ammo: number;
  max_ammo: number;
  shots_fired: number;
  motors: { pan: number; tilt: number; magazine: number };
  sensors: {
    lidar_distance: number;
    lidar_valid: boolean;
    fps: number;
    latency_ms: number;
  };
}

export interface ServerTarget {
  id: string;
  label: string;
  type: ThreatType;
  x: number;
  y: number;
  distance: number;
  speed: number;
  heading: number;
  confidence: number;
  priority: number;
  locked: boolean;
}

export interface ServerTargetsMsg {
  type: "targets";
  ts: number;
  targets: ServerTarget[];
  locked_id: string | null;
}

export interface ServerLogMsg {
  type: "log";
  ts: number;
  level: LogEntry["level"];
  message: string;
}

export interface ServerAck {
  type: "ack";
  action: string;
  ok: boolean;
  reason?: string;
  ts: number;
}

export type ServerMessage = ServerTelemetry | ServerTargetsMsg | ServerLogMsg | ServerAck;

// ───── Sunucu hedefini UI hedefine çevir ─────────────────────────────
export function serverTargetToUI(t: ServerTarget): UITarget {
  return {
    id: t.id,
    label: t.label,
    type: t.type,
    x: t.x,
    y: t.y,
    distance: t.distance,
    confidence: t.confidence,
    speed: t.speed,
    heading: t.heading,
    locked: t.locked,
    priority: t.priority,
  };
}
