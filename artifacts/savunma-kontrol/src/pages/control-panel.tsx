import { useState, useEffect, useCallback, useRef } from "react";
import {
  SystemState, INITIAL_STATE, SystemMode, ThreatType,
  Target, createLog, LogEntry, SystemStatus,
} from "@/lib/system-state";
import {
  serverTargetToUI,
  type ServerMessage,
} from "@/lib/protocol";
import { useHardwareConnection } from "@/hooks/use-connection";
import { Header } from "@/components/header";
import { ModeSelector } from "@/components/mode-selector";
import { CameraView } from "@/components/camera-view";
import { MotorPanel } from "@/components/motor-panel";
import { TargetPanel } from "@/components/target-panel";
import { FireControl } from "@/components/fire-control";
import { SensorPanel } from "@/components/sensor-panel";
import { SystemLog } from "@/components/system-log";

const TARGET_LABELS = ["HAVA-A1", "HAVA-B2", "HAVA-C3", "UHA-01", "UHA-02", "KUŞ-X", "BILINMEYEN-7"];
const THREAT_TYPES: ThreatType[] = ["DUSMAN", "DUSMAN", "BILINMEYEN", "DOST", "DUSMAN"];

function generateTarget(): Target {
  return {
    id: Math.random().toString(36).slice(2),
    type: THREAT_TYPES[Math.floor(Math.random() * THREAT_TYPES.length)],
    x: 0.15 + Math.random() * 0.7,
    y: 0.15 + Math.random() * 0.55,
    distance: 50 + Math.random() * 350,
    confidence: 60 + Math.random() * 38,
    label: TARGET_LABELS[Math.floor(Math.random() * TARGET_LABELS.length)],
    speed: 20 + Math.random() * 120,
    heading: Math.random() * 360,
    locked: false,
    priority: Math.floor(Math.random() * 10),
  };
}

function addLog(state: SystemState, level: LogEntry["level"], message: string): LogEntry[] {
  const logs = [...state.logs, createLog(level, message)];
  return logs.slice(-80);
}

export default function ControlPanel() {
  const [state, setState] = useState<SystemState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ─────────────────────────────────────────────────────────────────
  // Donanım köprüsü — bağlıysa state'i sunucudan, değilse simülasyondan
  // ─────────────────────────────────────────────────────────────────
  const handleServerMessage = useCallback((m: ServerMessage) => {
    setState(prev => {
      switch (m.type) {
        case "telemetry": {
          const statusMap: Record<string, SystemStatus> = {
            HAZIR: "HAZIR", TARAMA: "TARAMA", KILITLEME: "KILITLEME",
            ATIS: "ATIS", YENIDEN_YUKLE: "YENİDEN_YUKLE", DURDURULDU: "DURDURULDU",
          };
          return {
            ...prev,
            mode: m.mode,
            status: statusMap[m.status] || prev.status,
            safetyOn: m.safety_on,
            emergencyStop: m.emergency_stop,
            ammoCount: m.ammo,
            maxAmmo: m.max_ammo,
            shotsFired: m.shots_fired,
            motors: {
              pan: m.motors.pan,
              tilt: m.motors.tilt,
              magazine: m.motors.magazine,
              panTarget: m.motors.pan,
              tiltTarget: m.motors.tilt,
            },
            sensors: {
              lidarDistance: m.sensors.lidar_distance,
              lidarValid: m.sensors.lidar_valid,
              ballisticCorrection: m.sensors.lidar_distance * 0.02,
              fps: Math.round(m.sensors.fps),
              latencyMs: Math.round(m.sensors.latency_ms),
            },
          };
        }
        case "targets": {
          return {
            ...prev,
            targets: m.targets.map(serverTargetToUI),
            lockedTargetId: m.locked_id,
          };
        }
        case "log": {
          return { ...prev, logs: addLog(prev, m.level, m.message) };
        }
        case "ack": {
          if (!m.ok) {
            return { ...prev, logs: addLog(prev, "ERROR", `Komut reddedildi: ${m.action} (${m.reason ?? "?"})`) };
          }
          return prev;
        }
        default: return prev;
      }
    });
  }, []);

  const conn = useHardwareConnection({ onMessage: handleServerMessage });
  const { isConnected, send } = conn;

  // Bağlandığımızda kullanıcıya bildir
  useEffect(() => {
    setState(prev => {
      if (isConnected) {
        return { ...prev, logs: addLog(prev, "SUCCESS", `Donanım köprüsü aktif: ${conn.url}`) };
      }
      if (conn.status === "disconnected" && conn.url) {
        return { ...prev, logs: addLog(prev, "WARN", "Donanım köprüsü koptu — simülasyon moduna dönüldü") };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ─────────────────────────────────────────────────────────────────
  // Telemetri simülasyonu (yalnızca bağlı değilken)
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.emergencyStop) return prev;

        const fps = Math.round(28 + Math.random() * 6);
        const latency = Math.round(8 + Math.random() * 15);
        const locked = prev.targets.find(t => t.id === prev.lockedTargetId);
        const lidarDist = locked ? locked.distance + (Math.random() - 0.5) * 2 : 0;

        const updatedTargets = prev.targets.map(t => ({
          ...t,
          x: Math.max(0.05, Math.min(0.95, t.x + (Math.random() - 0.5) * 0.015)),
          y: Math.max(0.05, Math.min(0.9, t.y + (Math.random() - 0.5) * 0.01)),
          distance: Math.max(5, t.distance + (Math.random() - 0.5) * 3),
          speed: Math.max(5, t.speed + (Math.random() - 0.5) * 5),
          heading: (t.heading + (Math.random() - 0.5) * 10 + 360) % 360,
          confidence: Math.max(40, Math.min(99, t.confidence + (Math.random() - 0.5) * 3)),
        }));

        const motors = prev.mode === "OTONOM" && locked
          ? {
              ...prev.motors,
              pan: prev.motors.pan + (Math.random() - 0.5) * 0.8,
              tilt: prev.motors.tilt + (Math.random() - 0.5) * 0.4,
            }
          : prev.motors;

        const newStatus = prev.lockedTargetId
          ? (prev.mode === "OTONOM" ? "KILITLEME" : prev.status)
          : prev.status === "KILITLEME" ? "TARAMA" : prev.status;

        return {
          ...prev,
          targets: updatedTargets,
          motors,
          sensors: {
            ...prev.sensors,
            fps,
            latencyMs: latency,
            lidarDistance: lidarDist,
            lidarValid: !!locked,
            ballisticCorrection: lidarDist * 0.02,
          },
          status: newStatus,
        } as SystemState;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Otonom mod (sim): tehdit önceliklerine göre kilit
  useEffect(() => {
    if (isConnected || state.mode !== "OTONOM" || state.emergencyStop) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.mode !== "OTONOM" || prev.emergencyStop) return prev;
        const enemies = prev.targets.filter(t => t.type === "DUSMAN");
        if (enemies.length === 0) return prev;
        const topEnemy = enemies.sort((a, b) => b.priority - a.priority)[0];
        if (prev.lockedTargetId === topEnemy.id) return prev;
        return {
          ...prev,
          lockedTargetId: topEnemy.id,
          status: "KILITLEME",
          logs: addLog(prev, "WARN", `Otonom: ${topEnemy.label} kilitlendi (öncelik: ${topEnemy.priority})`),
        };
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isConnected, state.mode, state.emergencyStop]);

  // Otonom otomatik ateş (sim)
  useEffect(() => {
    if (isConnected || state.mode !== "OTONOM" || state.emergencyStop || state.safetyOn) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.mode !== "OTONOM" || prev.emergencyStop || prev.safetyOn || !prev.lockedTargetId) return prev;
        if (prev.ammoCount === 0) return prev;
        const target = prev.targets.find(t => t.id === prev.lockedTargetId);
        if (!target || target.type !== "DUSMAN") return prev;
        const newAmmo = prev.ammoCount - 1;
        const newMag = (prev.motors.magazine + 30) % 360;
        const destroyed = Math.random() > 0.35;
        let newTargets = prev.targets;
        let newLockedId: string | null = prev.lockedTargetId;
        let newStatus: SystemState["status"] = "YENİDEN_YUKLE";
        if (destroyed) {
          newTargets = prev.targets.filter(t => t.id !== prev.lockedTargetId);
          newLockedId = null;
          newStatus = "TARAMA";
        }
        return {
          ...prev,
          ammoCount: newAmmo,
          shotsFired: prev.shotsFired + 1,
          targets: newTargets,
          lockedTargetId: newLockedId,
          status: newStatus,
          motors: { ...prev.motors, magazine: newMag },
          logs: addLog(
            prev,
            destroyed ? "SUCCESS" : "WARN",
            destroyed ? `Otonom: ${target.label} imha edildi` : `Otonom: ${target.label} ateş edildi — isabet yok`,
          ),
        };
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [isConnected, state.mode, state.emergencyStop, state.safetyOn]);

  // Sürü modu (sim)
  useEffect(() => {
    if (isConnected || state.mode !== "SURU" || state.emergencyStop) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.mode !== "SURU" || prev.emergencyStop || prev.targets.length >= 6) return prev;
        const newTarget = { ...generateTarget(), type: "DUSMAN" as ThreatType, priority: 9 };
        return {
          ...prev,
          targets: [...prev.targets, newTarget],
          logs: addLog(prev, "ERROR", `Sürü: Yeni tehdit tespit edildi — ${newTarget.label}`),
        };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isConnected, state.mode, state.emergencyStop]);

  // Rastgele hedef belirme (sim)
  useEffect(() => {
    if (isConnected || state.emergencyStop) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.emergencyStop || prev.targets.length >= 4) return prev;
        if (Math.random() > 0.3) return prev;
        const newTarget = generateTarget();
        return {
          ...prev,
          targets: [...prev.targets, newTarget],
          status: "TARAMA",
          logs: addLog(prev, "WARN", `YOLOv8: Yeni nesne tespit edildi — ${newTarget.label} (%${newTarget.confidence.toFixed(0)})`),
        };
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [isConnected, state.emergencyStop]);

  // Hedef kaybı (sim)
  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.targets.length === 0 || Math.random() > 0.25) return prev;
        const idx = Math.floor(Math.random() * prev.targets.length);
        const removed = prev.targets[idx];
        const newTargets = prev.targets.filter((_, i) => i !== idx);
        const newLockedId = prev.lockedTargetId === removed.id ? null : prev.lockedTargetId;
        return {
          ...prev,
          targets: newTargets,
          lockedTargetId: newLockedId,
          logs: addLog(prev, "INFO", `Hedef kayboldu: ${removed.label}`),
        };
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // ─────────────────────────────────────────────────────────────────
  // Aksiyon işleyicileri — bağlıysa komut gönder, değilse local mutate
  // ─────────────────────────────────────────────────────────────────
  const handleEmergencyStop = useCallback(() => {
    if (isConnected) { send({ action: "emergency_stop" }); return; }
    setState(prev => ({
      ...prev,
      emergencyStop: true,
      status: "DURDURULDU",
      lockedTargetId: null,
      logs: addLog(prev, "ERROR", "⬛ ACİL STOP AKTIF — Tüm sistemler durduruldu"),
    }));
  }, [isConnected, send]);

  const handleReset = useCallback(() => {
    if (isConnected) { send({ action: "reset" }); return; }
    setState(prev => ({
      ...prev,
      emergencyStop: false,
      status: "HAZIR",
      logs: addLog(prev, "SUCCESS", "Sistem sıfırlandı — Hazır"),
    }));
  }, [isConnected, send]);

  const handleModeChange = useCallback((mode: SystemMode) => {
    if (isConnected) { send({ action: "set_mode", mode }); return; }
    setState(prev => ({
      ...prev,
      mode,
      lockedTargetId: null,
      status: "HAZIR",
      logs: addLog(prev, "INFO", `Mod değiştirildi: ${mode}`),
    }));
  }, [isConnected, send]);

  const handlePanChange = useCallback((val: number) => {
    if (isConnected) {
      send({ action: "set_motors", pan: val, tilt: stateRef.current.motors.tilt });
      return;
    }
    setState(prev => ({ ...prev, motors: { ...prev.motors, pan: val, panTarget: val } }));
  }, [isConnected, send]);

  const handleTiltChange = useCallback((val: number) => {
    if (isConnected) {
      send({ action: "set_motors", pan: stateRef.current.motors.pan, tilt: val });
      return;
    }
    setState(prev => ({ ...prev, motors: { ...prev.motors, tilt: val, tiltTarget: val } }));
  }, [isConnected, send]);

  const handleMagazineStep = useCallback(() => {
    if (isConnected) { send({ action: "magazine_step", steps: 1 }); return; }
    setState(prev => {
      const newMag = (prev.motors.magazine + 30) % 360;
      return {
        ...prev,
        motors: { ...prev.motors, magazine: newMag },
        logs: addLog(prev, "INFO", `Şarjör ilerledi: ${newMag.toFixed(0)}°`),
      };
    });
  }, [isConnected, send]);

  const handleHomeMotors = useCallback(() => {
    if (isConnected) { send({ action: "home_motors" }); return; }
    setState(prev => ({
      ...prev,
      motors: { pan: 0, tilt: 0, magazine: 0, panTarget: 0, tiltTarget: 0 },
      logs: addLog(prev, "INFO", "Motorlar sıfır pozisyona döndü"),
    }));
  }, [isConnected, send]);

  const handleLockTarget = useCallback((id: string | null) => {
    if (isConnected) { send({ action: "lock_target", target_id: id }); return; }
    setState(prev => {
      const target = id ? prev.targets.find(t => t.id === id) : null;
      const newTargets = prev.targets.map(t => ({ ...t, locked: t.id === id }));
      return {
        ...prev,
        lockedTargetId: id,
        targets: newTargets,
        status: id ? "KILITLEME" : "TARAMA",
        logs: addLog(prev, id ? "WARN" : "INFO",
          id ? `Hedef kilitlendi: ${target?.label}` : "Kilit kaldırıldı"),
      };
    });
  }, [isConnected, send]);

  const handleClassifyTarget = useCallback((id: string, type: ThreatType) => {
    if (isConnected) { send({ action: "classify_target", target_id: id, threat: type }); return; }
    setState(prev => {
      const target = prev.targets.find(t => t.id === id);
      return {
        ...prev,
        targets: prev.targets.map(t => t.id === id ? { ...t, type } : t),
        logs: addLog(prev, "INFO", `${target?.label} sınıflandırıldı: ${type}`),
      };
    });
  }, [isConnected, send]);

  const handleFire = useCallback(() => {
    if (isConnected) { send({ action: "fire" }); return; }
    setState(prev => {
      if (!prev.lockedTargetId || prev.ammoCount === 0) return prev;
      const target = prev.targets.find(t => t.id === prev.lockedTargetId);
      const newAmmo = prev.ammoCount - 1;
      const newMag = (prev.motors.magazine + 30) % 360;
      const destroyed = Math.random() > 0.4;
      let newTargets = prev.targets;
      let newLockedId: string | null = prev.lockedTargetId;
      if (destroyed) {
        newTargets = prev.targets.filter(t => t.id !== prev.lockedTargetId);
        newLockedId = null;
      }
      return {
        ...prev,
        ammoCount: newAmmo,
        shotsFired: prev.shotsFired + 1,
        targets: newTargets,
        lockedTargetId: newLockedId,
        status: destroyed ? "TARAMA" : "YENİDEN_YUKLE",
        motors: { ...prev.motors, magazine: newMag },
        logs: addLog(prev, destroyed ? "SUCCESS" : "WARN",
          destroyed
            ? `✓ ${target?.label} imha edildi! Mesafe: ${target?.distance.toFixed(0)}m`
            : `✗ ${target?.label} ateş edildi — Iskalama. Mermi: ${newAmmo}`),
      };
    });
  }, [isConnected, send]);

  const handleToggleSafety = useCallback(() => {
    if (isConnected) { send({ action: "set_safety", safety: !stateRef.current.safetyOn }); return; }
    setState(prev => ({
      ...prev,
      safetyOn: !prev.safetyOn,
      logs: addLog(prev, prev.safetyOn ? "ERROR" : "SUCCESS",
        prev.safetyOn ? "⚠ Güvenlik kilidi AÇILDI" : "✓ Güvenlik kilidi aktif"),
    }));
  }, [isConnected, send]);

  const handleTargetClick = useCallback((target: Target) => {
    handleLockTarget(target.id);
  }, [handleLockTarget]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: "#030a03", fontFamily: "monospace" }}>
      <Header
        state={state}
        onEmergencyStop={handleEmergencyStop}
        connStatus={conn.status}
        connUrl={conn.url}
        connInfo={conn.info}
        onConnect={conn.connect}
        onDisconnect={conn.disconnect}
      />

      <div className="flex flex-1 overflow-hidden gap-0">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-0 overflow-y-auto" style={{ width: "200px", minWidth: "200px", borderRight: "1px solid #1a3a1a" }}>
          <ModeSelector
            state={state}
            onModeChange={handleModeChange}
            onReset={handleReset}
          />
        </div>

        {/* CENTER COLUMN */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 border-r border-border">
              <CameraView
                label="■ GÖZCÜ KAMERA — 4MP PTZ (CAT6)"
                type="govcu"
                state={state}
                onTargetClick={handleTargetClick}
              />
            </div>
            <div className="flex-1">
              <CameraView
                label="■ AVCI KAMERA — 5MP NAMLU (UDP)"
                type="avci"
                state={state}
                onTargetClick={handleTargetClick}
              />
            </div>
          </div>

          <div style={{ borderTop: "1px solid #1a3a1a", height: "140px", minHeight: "140px" }}>
            <SystemLog logs={state.logs} />
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col overflow-y-auto gap-0" style={{ width: "220px", minWidth: "220px", borderLeft: "1px solid #1a3a1a" }}>
          <TargetPanel
            state={state}
            onLockTarget={handleLockTarget}
            onClassifyTarget={handleClassifyTarget}
          />
          <div style={{ borderTop: "1px solid #1a3a1a" }}>
            <FireControl
              state={state}
              onFire={handleFire}
              onToggleSafety={handleToggleSafety}
            />
          </div>
        </div>

        {/* FAR RIGHT COLUMN */}
        <div className="flex flex-col overflow-y-auto gap-0" style={{ width: "200px", minWidth: "200px", borderLeft: "1px solid #1a3a1a" }}>
          <MotorPanel
            state={state}
            onPanChange={handlePanChange}
            onTiltChange={handleTiltChange}
            onMagazineStep={handleMagazineStep}
            onHomeMotors={handleHomeMotors}
          />
          <div style={{ borderTop: "1px solid #1a3a1a" }}>
            <SensorPanel state={state} />
          </div>
        </div>
      </div>
    </div>
  );
}
