import { SystemMode, SystemState } from "@/lib/system-state";

interface ModeSelectorProps {
  state: SystemState;
  onModeChange: (mode: SystemMode) => void;
  onReset: () => void;
}

const MODES: { mode: SystemMode; label: string; desc: string; color: string }[] = [
  { mode: "MANUEL", label: "MANUEL", desc: "Operatör kontrolü", color: "#ffb000" },
  { mode: "OTONOM", label: "OTONOM", desc: "AI hedefleme + Dost/Düşman", color: "#00ff41" },
  { mode: "SURU", label: "SÜRÜ SAVUNMA", desc: "Kural tabanlı çoklu tehdit", color: "#00aaff" },
];

export function ModeSelector({ state, onModeChange, onReset }: ModeSelectorProps) {
  return (
    <div className="p-3 terminal-border" style={{ background: "rgba(0,15,0,0.8)" }}>
      <div className="text-xs text-muted-foreground tracking-widest mb-2">ÇALIŞMA MODU</div>
      <div className="flex flex-col gap-1">
        {MODES.map(({ mode, label, desc, color }) => {
          const isActive = state.mode === mode;
          return (
            <button
              key={mode}
              onClick={() => !state.emergencyStop && onModeChange(mode)}
              disabled={state.emergencyStop}
              className="flex items-center justify-between px-3 py-2 text-left transition-all"
              style={{
                border: isActive ? `1px solid ${color}` : "1px solid transparent",
                background: isActive ? `${color}18` : "transparent",
                opacity: state.emergencyStop ? 0.4 : 1,
              }}
            >
              <div>
                <div className="text-xs font-bold tracking-widest" style={{ color: isActive ? color : "#4a8a4a" }}>
                  {isActive ? "▶ " : "  "}{label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
              </div>
              {isActive && <div className="w-2 h-2 rounded-full blink" style={{ background: color }} />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground tracking-widest mb-2">SİSTEM</div>
        <button
          onClick={onReset}
          disabled={!state.emergencyStop}
          className="w-full px-3 py-1.5 text-xs font-bold tracking-widest transition-all"
          style={{
            border: state.emergencyStop ? "1px solid #00ff41" : "1px solid #2a4a2a",
            color: state.emergencyStop ? "#00ff41" : "#2a4a2a",
            background: state.emergencyStop ? "rgba(0,255,65,0.1)" : "transparent",
          }}
        >
          ↺ SİSTEMİ SIFIRLA
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground tracking-widest mb-2">BAĞLANTI</div>
        <div className="flex flex-col gap-1 text-xs">
          {[
            { label: "ESP32 UART", status: !state.emergencyStop },
            { label: "RPi5 ZMQ", status: !state.emergencyStop },
            { label: "GÖZCÜ CAM", status: !state.emergencyStop },
            { label: "AVCI CAM", status: !state.emergencyStop },
            { label: "LiDAR", status: !state.emergencyStop },
          ].map(({ label, status }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span style={{ color: status ? "#00ff41" : "#ff2222" }}>
                {status ? "● BAĞLI" : "○ KESİK"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
