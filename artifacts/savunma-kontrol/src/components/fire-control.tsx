import { useState } from "react";
import { SystemState } from "@/lib/system-state";

interface FireControlProps {
  state: SystemState;
  onFire: () => void;
  onToggleSafety: () => void;
}

export function FireControl({ state, onFire, onToggleSafety }: FireControlProps) {
  const [fireHold, setFireHold] = useState(false);
  const canFire = !state.emergencyStop && !state.safetyOn && state.ammoCount > 0 && state.lockedTargetId !== null;

  const handleFireDown = () => {
    if (!canFire) return;
    setFireHold(true);
  };
  const handleFireUp = () => {
    if (!fireHold) return;
    setFireHold(false);
    if (canFire) onFire();
  };

  return (
    <div className="p-3 terminal-border" style={{ background: "rgba(0,15,0,0.8)" }}>
      <div className="text-xs text-muted-foreground tracking-widest mb-3">ATEŞ KONTROL</div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="text-center p-2" style={{ border: "1px solid #1a3a1a" }}>
          <div className="text-xs text-muted-foreground mb-1">MERMİ</div>
          <div className="text-2xl font-bold text-green-bright">{state.ammoCount}</div>
          <div className="text-xs text-muted-foreground">/ {state.maxAmmo}</div>
          <div className="mt-1 h-1.5 w-full" style={{ background: "#0d1f0d" }}>
            <div
              className="h-full transition-all"
              style={{
                width: `${(state.ammoCount / state.maxAmmo) * 100}%`,
                background: state.ammoCount > 6 ? "#00ff41" : "#ff2222",
                boxShadow: `0 0 4px ${state.ammoCount > 6 ? "#00ff41" : "#ff2222"}`,
              }}
            />
          </div>
        </div>
        <div className="text-center p-2" style={{ border: "1px solid #1a3a1a" }}>
          <div className="text-xs text-muted-foreground mb-1">ATILAN</div>
          <div className="text-2xl font-bold text-amber-bright">{state.shotsFired}</div>
          <div className="text-xs text-muted-foreground">mermi</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground tracking-widest">GÜVENLİK KİLİDİ</span>
          <button
            onClick={onToggleSafety}
            disabled={state.emergencyStop}
            className="text-xs font-bold px-2 py-0.5 transition-all"
            style={{
              border: `1px solid ${state.safetyOn ? "#00ff41" : "#ff2222"}`,
              color: state.safetyOn ? "#00ff41" : "#ff2222",
              background: state.safetyOn ? "rgba(0,255,65,0.1)" : "rgba(255,34,34,0.1)",
            }}
          >
            {state.safetyOn ? "■ KİLİTLİ" : "□ AÇIK"}
          </button>
        </div>
        {!state.safetyOn && (
          <div className="text-xs text-red-bright blink px-2 py-1" style={{ border: "1px solid #330000", background: "rgba(50,0,0,0.5)" }}>
            ⚠ GÜVENLİK DEVRE DIŞI
          </div>
        )}
      </div>

      <div className="mb-3 text-xs">
        <div className="flex justify-between mb-1">
          <span className="text-muted-foreground">HEDEFLENMİŞ</span>
          <span style={{ color: state.lockedTargetId ? "#00ff41" : "#333" }}>
            {state.lockedTargetId
              ? (state.targets.find(t => t.id === state.lockedTargetId)?.label || "—")
              : "YOK"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">MESAFE</span>
          <span className="text-green-bright">
            {state.lockedTargetId
              ? `${state.targets.find(t => t.id === state.lockedTargetId)?.distance.toFixed(1) || 0}m`
              : "—"}
          </span>
        </div>
      </div>

      <button
        onMouseDown={handleFireDown}
        onMouseUp={handleFireUp}
        onMouseLeave={() => setFireHold(false)}
        disabled={!canFire}
        className="w-full py-4 font-bold tracking-widest text-sm transition-all relative overflow-hidden"
        style={{
          border: `2px solid ${canFire ? (fireHold ? "#ff6600" : "#ff2222") : "#330000"}`,
          background: canFire
            ? (fireHold ? "rgba(255,100,0,0.4)" : "rgba(255,34,34,0.15)")
            : "rgba(30,0,0,0.5)",
          color: canFire ? (fireHold ? "#ff6600" : "#ff2222") : "#330000",
          boxShadow: canFire ? (fireHold ? "0 0 20px rgba(255,100,0,0.6)" : "0 0 8px rgba(255,34,34,0.3)") : "none",
          textShadow: canFire ? `0 0 8px ${fireHold ? "#ff6600" : "#ff2222"}` : "none",
        }}
      >
        {!canFire && state.safetyOn ? "🔒 KİLİT AÇIK DEĞİL" :
          !canFire && !state.lockedTargetId ? "⊕ HEDEF SEÇİN" :
          !canFire && state.ammoCount === 0 ? "✕ MERMİ YOK" :
          fireHold ? "● ATEŞ EDİYOR..." : "▶ ATEŞ"}
      </button>

      {!canFire && !state.emergencyStop && state.mode === "OTONOM" && (
        <div className="mt-2 text-xs text-muted-foreground text-center">
          Otonom modda sistem otomatik ateş eder
        </div>
      )}
    </div>
  );
}
