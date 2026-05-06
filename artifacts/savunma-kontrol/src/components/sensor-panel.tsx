import { SystemState } from "@/lib/system-state";

interface SensorPanelProps {
  state: SystemState;
}

function Gauge({ label, value, max, unit, color, decimals = 1 }: {
  label: string; value: number; max: number; unit: string; color?: string; decimals?: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const c = color || "#00ff41";
  const segments = 20;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground tracking-wider">{label}</span>
        <span className="font-bold" style={{ color: c }}>{value.toFixed(decimals)}{unit}</span>
      </div>
      <div className="flex gap-0.5">
        {[...Array(segments)].map((_, i) => (
          <div
            key={i}
            className="flex-1 h-2 transition-all"
            style={{
              background: i < Math.round(pct / (100 / segments)) ? c : "#0d1f0d",
              boxShadow: i < Math.round(pct / (100 / segments)) ? `0 0 3px ${c}` : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function SensorPanel({ state }: SensorPanelProps) {
  const { sensors, lockedTargetId, targets } = state;
  const locked = targets.find(t => t.id === lockedTargetId);

  const ballisticAngle = locked
    ? Math.atan2(locked.distance * 9.81, Math.pow(80 / 3.6, 2)) * (180 / Math.PI)
    : 0;

  return (
    <div className="p-3 terminal-border" style={{ background: "rgba(0,15,0,0.8)" }}>
      <div className="text-xs text-muted-foreground tracking-widest mb-3">SENSÖR & BALİSTİK</div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground tracking-wider">LiDAR MESAFE</span>
          <span className={`text-xs ${sensors.lidarValid ? "text-green-bright" : "text-muted-foreground"}`}>
            {sensors.lidarValid ? "● GEÇERLİ" : "○ BEKLEME"}
          </span>
        </div>
        <div
          className="text-center py-2 font-bold"
          style={{
            border: "1px solid #1a3a1a",
            background: "rgba(0,10,0,0.5)",
            color: sensors.lidarValid ? "#00ff41" : "#2a4a2a",
            textShadow: sensors.lidarValid ? "0 0 10px rgba(0,255,65,0.6)" : "none",
            fontSize: "1.5rem",
          }}
        >
          {sensors.lidarDistance.toFixed(2)}
          <span className="text-sm ml-1">m</span>
        </div>
      </div>

      <Gauge label="FPS (YOLOv8)" value={sensors.fps} max={60} unit=" fps" />
      <Gauge label="GECIKME" value={sensors.latencyMs} max={100} unit="ms" color={sensors.latencyMs > 50 ? "#ff2222" : "#00ff41"} decimals={0} />

      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground tracking-widest mb-2">BALİSTİK HESAPLAMA</div>
        {locked ? (
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">MESAFE</span>
              <span className="text-green-bright font-bold">{locked.distance.toFixed(1)}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">EĞİK ATI.AÇ.</span>
              <span className="text-amber-bright font-bold">{ballisticAngle.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DÜŞÜŞ DÜZELT.</span>
              <span className="text-amber-bright font-bold">+{(locked.distance * 0.02).toFixed(1)}cm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">UÇUŞ SÜRESİ</span>
              <span className="text-green-bright font-bold">{(locked.distance / 22).toFixed(2)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">HEDEF HIZ</span>
              <span className="text-amber-bright font-bold">{locked.speed.toFixed(0)}km/h</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-2">
            Hesaplama için hedef kilitlemek gerekli
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground tracking-widest mb-2">GÜÇ SİSTEMİ</div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">48V GK (Motor)</span>
            <span className="text-green-bright">48.2V / 12.4A</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">5V GK (Mantık)</span>
            <span className="text-green-bright">5.01V / 3.8A</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">HPA TÜPÜ</span>
            <span className="text-amber-bright">2340 PSI</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">REGÜLATÖR</span>
            <span className="text-green-bright">8.5 bar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
