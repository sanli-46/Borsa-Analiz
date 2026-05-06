import { SystemState, Target, ThreatType } from "@/lib/system-state";

interface TargetPanelProps {
  state: SystemState;
  onLockTarget: (id: string | null) => void;
  onClassifyTarget: (id: string, type: ThreatType) => void;
}

const threatStyle: Record<ThreatType, { color: string; bg: string; label: string }> = {
  DOST: { color: "#00ff41", bg: "rgba(0,255,65,0.08)", label: "DOST" },
  DUSMAN: { color: "#ff2222", bg: "rgba(255,34,34,0.08)", label: "DÜŞMAN" },
  BILINMEYEN: { color: "#ffb000", bg: "rgba(255,176,0,0.08)", label: "BİLİNMEYEN" },
};

function ThreatBar({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-1">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-1.5 flex-1" style={{
          background: i < Math.round(confidence / 20) ? "#ff2222" : "#1a1a1a",
          boxShadow: i < Math.round(confidence / 20) ? "0 0 3px #ff2222" : "none",
        }} />
      ))}
    </div>
  );
}

export function TargetPanel({ state, onLockTarget, onClassifyTarget }: TargetPanelProps) {
  return (
    <div className="p-3 terminal-border flex flex-col" style={{ background: "rgba(0,15,0,0.8)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground tracking-widest">TESPİT EDİLEN HEDEFLER</span>
        <span className="text-xs font-bold text-amber-bright">{state.targets.length} HEDEF</span>
      </div>

      {state.targets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground py-4">
          <div className="text-center">
            <div className="mb-1">◎</div>
            <div>Hedef tespit edilmedi</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: "220px" }}>
          {[...state.targets]
            .sort((a, b) => b.priority - a.priority)
            .map(target => {
              const ts = threatStyle[target.type];
              const isLocked = target.id === state.lockedTargetId;
              return (
                <div
                  key={target.id}
                  className="px-2 py-1.5 cursor-pointer transition-all"
                  style={{
                    border: isLocked ? `1px solid ${ts.color}` : "1px solid #1a3a1a",
                    background: isLocked ? ts.bg : "transparent",
                  }}
                  onClick={() => onLockTarget(isLocked ? null : target.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold" style={{ color: ts.color }}>
                      {isLocked ? "⊕ " : "○ "}{target.label}
                    </span>
                    <span className="text-xs font-bold" style={{ color: ts.color }}>{ts.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground mb-1">
                    <span>{target.distance.toFixed(0)}m</span>
                    <span>{target.speed.toFixed(0)}km/h</span>
                    <span>{target.heading.toFixed(0)}°</span>
                  </div>
                  <ThreatBar confidence={target.confidence} />
                  <div className="flex gap-1 mt-1.5">
                    {(["DOST", "DUSMAN", "BILINMEYEN"] as ThreatType[]).map(t => (
                      <button
                        key={t}
                        onClick={e => { e.stopPropagation(); onClassifyTarget(target.id, t); }}
                        className="flex-1 text-xs py-0.5 transition-all"
                        style={{
                          border: `1px solid ${target.type === t ? threatStyle[t].color : "#1a3a1a"}`,
                          color: target.type === t ? threatStyle[t].color : "#2a4a2a",
                          background: target.type === t ? threatStyle[t].bg : "transparent",
                          fontSize: "9px",
                        }}
                      >
                        {t === "BILINMEYEN" ? "BLN" : t.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-border">
        <div className="text-xs text-muted-foreground tracking-widest mb-1">SÜRÜ ÖNCELİK</div>
        <div className="flex gap-2 text-xs">
          <div className="flex items-center gap-1"><span style={{ color: "#ff2222" }}>■</span><span className="text-muted-foreground">Yüksek: {state.targets.filter(t => t.priority >= 8).length}</span></div>
          <div className="flex items-center gap-1"><span style={{ color: "#ffb000" }}>■</span><span className="text-muted-foreground">Orta: {state.targets.filter(t => t.priority >= 4 && t.priority < 8).length}</span></div>
          <div className="flex items-center gap-1"><span style={{ color: "#00ff41" }}>■</span><span className="text-muted-foreground">Düşük: {state.targets.filter(t => t.priority < 4).length}</span></div>
        </div>
      </div>
    </div>
  );
}
