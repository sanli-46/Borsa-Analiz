import { SystemState } from "@/lib/system-state";

interface MotorPanelProps {
  state: SystemState;
  onPanChange: (val: number) => void;
  onTiltChange: (val: number) => void;
  onMagazineStep: () => void;
  onHomeMotors: () => void;
}

function MotorGauge({ label, value, min, max, unit, color }: {
  label: string; value: number; min: number; max: number; unit: string; color?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const c = color || "#00ff41";
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground tracking-wider">{label}</span>
        <span style={{ color: c }} className="font-bold">{value.toFixed(1)}{unit}</span>
      </div>
      <div className="h-2 w-full" style={{ background: "#0d1f0d", border: "1px solid #1a3a1a" }}>
        <div className="h-full transition-all duration-150" style={{ width: `${pct}%`, background: c, boxShadow: `0 0 4px ${c}` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

export function MotorPanel({ state, onPanChange, onTiltChange, onMagazineStep, onHomeMotors }: MotorPanelProps) {
  const disabled = state.emergencyStop || state.mode !== "MANUEL";

  return (
    <div className="p-3 terminal-border" style={{ background: "rgba(0,15,0,0.8)" }}>
      <div className="text-xs text-muted-foreground tracking-widest mb-3">MOTOR KONTROL</div>

      {state.mode !== "MANUEL" && !state.emergencyStop && (
        <div className="mb-3 px-2 py-1 text-xs text-amber-bright" style={{ border: "1px solid #663300", background: "rgba(100,50,0,0.2)" }}>
          ⚡ Otonom mod aktif — manuel devre dışı
        </div>
      )}

      <div className="mb-3">
        <MotorGauge label="PAN (YAW)" value={state.motors.pan} min={-180} max={180} unit="°" />
        <input
          type="range" min={-180} max={180} step={0.5}
          value={state.motors.pan}
          disabled={disabled}
          onChange={e => onPanChange(Number(e.target.value))}
          className="w-full h-1 appearance-none cursor-pointer"
          style={{ accentColor: "#00ff41", opacity: disabled ? 0.3 : 1 }}
        />
      </div>

      <div className="mb-3">
        <MotorGauge label="TILT (PİTCH)" value={state.motors.tilt} min={-45} max={45} unit="°" color="#ffb000" />
        <input
          type="range" min={-45} max={45} step={0.5}
          value={state.motors.tilt}
          disabled={disabled}
          onChange={e => onTiltChange(Number(e.target.value))}
          className="w-full h-1 appearance-none cursor-pointer"
          style={{ accentColor: "#ffb000", opacity: disabled ? 0.3 : 1 }}
        />
      </div>

      <div className="mb-3">
        <MotorGauge label="ŞARJÖR POZ." value={state.motors.magazine} min={0} max={360} unit="°" color="#00aaff" />
        <div className="text-xs text-muted-foreground mt-1">Mühimmat: {state.ammoCount}/{state.maxAmmo}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={onMagazineStep}
          disabled={disabled}
          className="px-2 py-1.5 text-xs font-bold tracking-wider transition-all"
          style={{
            border: "1px solid #004488",
            color: disabled ? "#1a3a1a" : "#00aaff",
            background: disabled ? "transparent" : "rgba(0,100,200,0.1)",
          }}
        >
          ↻ ŞARJÖR +1
        </button>
        <button
          onClick={onHomeMotors}
          disabled={state.emergencyStop}
          className="px-2 py-1.5 text-xs font-bold tracking-wider transition-all"
          style={{
            border: "1px solid #003300",
            color: state.emergencyStop ? "#1a3a1a" : "#00ff41",
            background: "transparent",
          }}
        >
          ⌂ SIFIR POS.
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground tracking-widest mb-2">ENCODER OKUMASI</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { label: "M1 PAN", val: `${state.motors.pan.toFixed(1)}°` },
            { label: "M2 TILT", val: `${state.motors.tilt.toFixed(1)}°` },
            { label: "M3 ŞARJÖR", val: `${state.motors.magazine.toFixed(0)}°` },
          ].map(({ label, val }) => (
            <div key={label} className="text-center">
              <div className="text-muted-foreground">{label}</div>
              <div className="text-green-bright font-bold">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
