import { useEffect, useState } from "react";
import type { ConnStatus } from "@/lib/connection";

interface Props {
  status: ConnStatus;
  url: string;
  info: string;
  onConnect: (url: string) => void;
  onDisconnect: () => void;
}

const statusConfig: Record<ConnStatus, { label: string; color: string; dot: string }> = {
  disconnected: { label: "BAĞLI DEĞİL",  color: "#888",     dot: "#444" },
  connecting:   { label: "BAĞLANIYOR…",  color: "#ffb000",  dot: "#ffb000" },
  connected:    { label: "DONANIM AKTİF", color: "#00ff41", dot: "#00ff41" },
  error:        { label: "HATA",          color: "#ff2222",  dot: "#ff2222" },
};

export function ConnectionSettings({ status, url, info, onConnect, onDisconnect }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(url || "ws://localhost:8000");

  useEffect(() => {
    if (url) setDraft(url);
  }, [url]);

  const cfg = statusConfig[status];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={info || cfg.label}
        className="flex items-center gap-2 px-3 py-1 text-xs font-bold tracking-wider transition-colors"
        style={{
          border: `1px solid ${cfg.color}`,
          color: cfg.color,
          background: "rgba(0,0,0,0.4)",
          fontFamily: "monospace",
        }}
      >
        <span
          className={status === "connecting" ? "blink" : ""}
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: cfg.dot,
            boxShadow: status === "connected" ? `0 0 6px ${cfg.dot}` : "none",
          }}
        />
        {cfg.label}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            background: "#001500",
            border: "1px solid #00ff41",
            padding: 12,
            minWidth: 320,
            zIndex: 1000,
            fontFamily: "monospace",
            boxShadow: "0 4px 18px rgba(0,255,65,0.15)",
          }}
        >
          <div style={{ color: "#00ff41", fontSize: 11, marginBottom: 8, letterSpacing: 1 }}>
            DONANIM KÖPRÜSÜ (RPi5 / PC Bridge)
          </div>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ws://192.168.1.50:8000"
            spellCheck={false}
            style={{
              width: "100%",
              background: "#000",
              border: "1px solid #1a3a1a",
              color: "#00ff41",
              padding: "6px 8px",
              fontSize: 12,
              fontFamily: "monospace",
              outline: "none",
            }}
          />
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
            ws://&lt;rpi-host&gt;:8765/ws  veya  ws://&lt;pc-bridge&gt;:8000
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              onClick={() => { onConnect(draft); setOpen(false); }}
              style={{
                flex: 1, padding: "6px 10px", fontSize: 11, fontWeight: "bold",
                background: "rgba(0,255,65,0.1)", color: "#00ff41",
                border: "1px solid #00ff41", cursor: "pointer", letterSpacing: 1,
              }}
            >
              ▶ BAĞLAN
            </button>
            <button
              onClick={() => { onDisconnect(); setOpen(false); }}
              style={{
                flex: 1, padding: "6px 10px", fontSize: 11, fontWeight: "bold",
                background: "rgba(255,34,34,0.1)", color: "#ff2222",
                border: "1px solid #ff2222", cursor: "pointer", letterSpacing: 1,
              }}
            >
              ■ KOPAR
            </button>
          </div>

          {info && (
            <div style={{ fontSize: 10, color: "#888", marginTop: 8, wordBreak: "break-all" }}>
              {info}
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #1a3a1a", fontSize: 10, color: "#666", lineHeight: 1.5 }}>
            <div>• Bağlı: gerçek ESP32 / LiDAR / kameralardan veri</div>
            <div>• Bağlı değil: simülasyon modu</div>
          </div>
        </div>
      )}
    </div>
  );
}
