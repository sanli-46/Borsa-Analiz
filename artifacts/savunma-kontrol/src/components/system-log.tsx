import { useEffect, useRef } from "react";
import { LogEntry } from "@/lib/system-state";

interface SystemLogProps {
  logs: LogEntry[];
}

const levelStyle: Record<LogEntry["level"], { color: string; prefix: string }> = {
  INFO: { color: "#4a8a4a", prefix: "[INF]" },
  WARN: { color: "#ffb000", prefix: "[WRN]" },
  ERROR: { color: "#ff2222", prefix: "[ERR]" },
  SUCCESS: { color: "#00ff41", prefix: "[OK] " },
};

export function SystemLog({ logs }: SystemLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full terminal-border" style={{ background: "rgba(0,8,0,0.95)" }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs text-muted-foreground tracking-widest">SİSTEM LOGU</span>
        <span className="text-xs text-muted-foreground">{logs.length} kayıt</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono" style={{ maxHeight: "120px" }}>
        {logs.map(log => {
          const s = levelStyle[log.level];
          return (
            <div key={log.id} className="flex gap-2 text-xs leading-5 hover:bg-white/2">
              <span className="text-muted-foreground shrink-0">{log.time}</span>
              <span className="shrink-0 font-bold" style={{ color: s.color }}>{s.prefix}</span>
              <span style={{ color: s.color === "#4a8a4a" ? "#5a9a5a" : s.color }}>{log.message}</span>
            </div>
          );
        })}
        <div className="flex gap-2 text-xs leading-5">
          <span className="text-muted-foreground">──────</span>
          <span className="text-green-bright blink">█</span>
        </div>
      </div>
    </div>
  );
}
