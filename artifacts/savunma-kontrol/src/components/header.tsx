import { SystemState } from "@/lib/system-state";
import { ConnectionSettings } from "./connection-settings";
import type { ConnStatus } from "@/lib/connection";

interface HeaderProps {
  state: SystemState;
  onEmergencyStop: () => void;
  connStatus: ConnStatus;
  connUrl: string;
  connInfo: string;
  onConnect: (url: string) => void;
  onDisconnect: () => void;
}

const statusColor: Record<string, string> = {
  HAZIR: "text-green-bright",
  TARAMA: "text-amber-bright",
  KILITLEME: "text-amber-bright",
  ATIS: "text-red-bright",
  "YENİDEN_YUKLE": "text-amber-bright",
  DURDURULDU: "text-red-bright",
};

const modeColor: Record<string, string> = {
  MANUEL: "text-amber-bright",
  OTONOM: "text-green-bright",
  SURU: "#00aaff",
};

export function Header({ state, onEmergencyStop, connStatus, connUrl, connInfo, onConnect, onDisconnect }: HeaderProps) {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 8);
  const dateStr = now.toLocaleDateString("tr-TR");

  return (
    <div className="flex items-center justify-between px-4 py-2 terminal-border-bright glow-green" style={{ background: "rgba(0,20,0,0.9)", borderTop: "none", borderLeft: "none", borderRight: "none" }}>
      <div className="flex items-center gap-6">
        <div>
          <div className="text-xs text-muted-foreground tracking-widest">SİSTEM KİMLİĞİ</div>
          <div className="text-green-bright font-bold text-sm tracking-wider">AHS-MK1 // OTONOM HAVA SAVUNMA</div>
        </div>
        <div className="w-px h-8 bg-border" />
        <div>
          <div className="text-xs text-muted-foreground">DURUM</div>
          <div className={`font-bold text-sm tracking-widest ${statusColor[state.status] || "text-green-bright"}`}>
            {state.status.replace("_", " ")}
            {state.status === "TARAMA" || state.status === "KILITLEME" ? <span className="blink ml-1">▮</span> : null}
          </div>
        </div>
        <div className="w-px h-8 bg-border" />
        <div>
          <div className="text-xs text-muted-foreground">MOD</div>
          <div className="font-bold text-sm tracking-widest" style={{ color: modeColor[state.mode] }}>
            {state.mode === "SURU" ? "SÜRÜ SAVUNMA" : state.mode}
          </div>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">FPS </span>
            <span className="text-green-bright">{state.sensors.fps}</span>
          </div>
          <div>
            <span className="text-muted-foreground">GECİKME </span>
            <span className="text-green-bright">{state.sensors.latencyMs}ms</span>
          </div>
          <div>
            <span className="text-muted-foreground">HEDEF </span>
            <span className="text-amber-bright">{state.targets.length}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ConnectionSettings
          status={connStatus}
          url={connUrl}
          info={connInfo}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
        <div className="text-right text-xs text-muted-foreground">
          <div>{dateStr}</div>
          <div className="text-green-bright font-bold">{timeStr}</div>
        </div>

        {state.emergencyStop ? (
          <div className="px-4 py-2 text-xs font-bold tracking-widest text-red-bright blink" style={{ border: "2px solid #ff2222" }}>
            ACİL STOP AKTİF
          </div>
        ) : (
          <button
            onClick={onEmergencyStop}
            className="px-4 py-2 text-xs font-bold tracking-widest text-white transition-all pulse-red"
            style={{ background: "#cc0000", border: "2px solid #ff2222" }}
          >
            ⬛ ACİL STOP
          </button>
        )}
      </div>
    </div>
  );
}
