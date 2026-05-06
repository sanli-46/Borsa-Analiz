import { useEffect, useRef } from "react";
import { SystemState, Target } from "@/lib/system-state";

interface CameraViewProps {
  label: string;
  type: "govcu" | "avci";
  state: SystemState;
  onTargetClick?: (target: Target) => void;
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTarget(ctx: CanvasRenderingContext2D, t: Target, w: number, h: number, locked: boolean) {
  const px = t.x * w;
  const py = t.y * h;
  const bw = 80;
  const bh = 50;

  const color = t.type === "DOST" ? "#00ff41" : t.type === "DUSMAN" ? "#ff2222" : "#ffb000";
  ctx.strokeStyle = color;
  ctx.lineWidth = locked && t.locked ? 2 : 1;
  ctx.globalAlpha = 0.85;

  const cornerSize = 8;
  ctx.beginPath();
  ctx.moveTo(px - bw / 2, py - bh / 2 + cornerSize);
  ctx.lineTo(px - bw / 2, py - bh / 2);
  ctx.lineTo(px - bw / 2 + cornerSize, py - bh / 2);
  ctx.moveTo(px + bw / 2 - cornerSize, py - bh / 2);
  ctx.lineTo(px + bw / 2, py - bh / 2);
  ctx.lineTo(px + bw / 2, py - bh / 2 + cornerSize);
  ctx.moveTo(px + bw / 2, py + bh / 2 - cornerSize);
  ctx.lineTo(px + bw / 2, py + bh / 2);
  ctx.lineTo(px + bw / 2 - cornerSize, py + bh / 2);
  ctx.moveTo(px - bw / 2 + cornerSize, py + bh / 2);
  ctx.lineTo(px - bw / 2, py + bh / 2);
  ctx.lineTo(px - bw / 2, py + bh / 2 - cornerSize);
  ctx.stroke();

  if (locked && t.locked) {
    ctx.strokeStyle = color;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(px - bw / 2 - 4, py - bh / 2 - 4, bw + 8, bh + 8);
    ctx.setLineDash([]);
  }

  ctx.fillStyle = color;
  ctx.font = "9px monospace";
  ctx.globalAlpha = 0.9;
  ctx.fillText(`${t.label} | ${t.type}`, px - bw / 2, py - bh / 2 - 4);
  ctx.fillText(`${t.distance.toFixed(0)}m | ${t.confidence.toFixed(0)}%`, px - bw / 2, py + bh / 2 + 11);
  ctx.globalAlpha = 1;
}

export function CameraView({ label, type, state, onTargetClick }: CameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (timestamp: number) => {
      const dt = timestamp - timeRef.current;
      timeRef.current = timestamp;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#030a03";
      ctx.fillRect(0, 0, w, h);

      if (state.emergencyStop) {
        ctx.fillStyle = "rgba(255,0,0,0.05)";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#ff2222";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, w, h);
        ctx.fillStyle = "#ff2222";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("ACİL STOP AKTİF", w / 2, h / 2 - 10);
        ctx.fillText("KAMERA DONDURULDU", w / 2, h / 2 + 10);
        ctx.textAlign = "left";
        return;
      }

      // Subtle noise
      const t = timestamp / 1000;
      const noise = ctx.createImageData(w, h);
      if (Math.random() < 0.05) {
        for (let i = 0; i < noise.data.length; i += 4) {
          const v = Math.random() < 0.003 ? Math.random() * 30 : 0;
          noise.data[i] = v * 0.3;
          noise.data[i + 1] = v;
          noise.data[i + 2] = v * 0.1;
          noise.data[i + 3] = 255;
        }
        ctx.putImageData(noise, 0, 0);
      }

      // Scanlines
      for (let y = 0; y < h; y += 4) {
        ctx.fillStyle = "rgba(0,255,65,0.015)";
        ctx.fillRect(0, y, w, 1);
      }

      // Grid
      ctx.strokeStyle = "rgba(0,255,65,0.08)";
      ctx.lineWidth = 0.5;
      const gridSize = type === "govcu" ? 40 : 30;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y2 = 0; y2 < h; y2 += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(w, y2); ctx.stroke();
      }

      // Main crosshair
      const cx = w / 2, cy = h / 2;
      ctx.strokeStyle = "rgba(0,255,65,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 8, cy);
      ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 20, cy);
      ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 8);
      ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();

      // Range rings (govcu only)
      if (type === "govcu") {
        [60, 100, 140].forEach((r, i) => {
          ctx.strokeStyle = `rgba(0,255,65,${0.06 - i * 0.015})`;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        });
      }

      // Scan line for avci
      if (type === "avci" && state.mode !== "MANUEL") {
        const scanY = ((t * 60) % h);
        ctx.fillStyle = "rgba(0,255,65,0.06)";
        ctx.fillRect(0, scanY, w, 2);
      }

      // Draw targets
      for (const target of state.targets) {
        if (type === "avci" && !target.locked) continue;
        drawTarget(ctx, target, w, h, target.id === state.lockedTargetId);
      }

      // Locked target crosshair for avci
      if (type === "avci") {
        const locked = state.targets.find(t2 => t2.id === state.lockedTargetId);
        if (locked) {
          drawCrosshair(ctx, locked.x * w, locked.y * h, 15, "#ff2222");
        } else {
          drawCrosshair(ctx, cx, cy, 12, "rgba(0,255,65,0.4)");
        }
      }

      // Radar sweep for govcu in otonom mode
      if (type === "govcu" && state.mode === "OTONOM") {
        const angle = (t * 0.7) % (Math.PI * 2);
        const sweepLen = 120;
        const grad = ctx.createLinearGradient(
          cx, cy,
          cx + Math.cos(angle) * sweepLen,
          cy + Math.sin(angle) * sweepLen
        );
        grad.addColorStop(0, "rgba(0,255,65,0.25)");
        grad.addColorStop(1, "rgba(0,255,65,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, sweepLen, angle - 0.4, angle);
        ctx.closePath();
        ctx.fill();
      }

      // Compass (govcu)
      if (type === "govcu") {
        const panDeg = state.motors.pan;
        ctx.fillStyle = "rgba(0,255,65,0.7)";
        ctx.font = "9px monospace";
        ctx.fillText(`PAN:${panDeg.toFixed(1)}°`, 6, h - 22);
        ctx.fillText(`TILT:${state.motors.tilt.toFixed(1)}°`, 6, h - 10);
      }

      // Zoom indicator (avci)
      if (type === "avci") {
        ctx.fillStyle = "rgba(0,255,65,0.7)";
        ctx.font = "9px monospace";
        ctx.fillText("ZOOM: 12mm", 6, h - 10);
        const locked = state.targets.find(t2 => t2.id === state.lockedTargetId);
        if (locked) {
          ctx.fillStyle = "#ff2222";
          ctx.fillText(`KİLİT: ${locked.label}`, 6, h - 22);
        }
      }

      // Timestamp
      ctx.fillStyle = "rgba(0,255,65,0.4)";
      ctx.font = "8px monospace";
      ctx.fillText(new Date().toISOString().slice(11, 19), w - 58, 12);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [state, type]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTargetClick) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const hit = state.targets.find(t =>
      Math.abs(t.x - mx) < 0.12 && Math.abs(t.y - my) < 0.12
    );
    if (hit) onTargetClick(hit);
  };

  return (
    <div className="flex flex-col" style={{ background: "rgba(0,10,0,0.9)" }}>
      <div className="flex items-center justify-between px-2 py-1 terminal-border" style={{ borderBottom: "1px solid #1a3a1a" }}>
        <span className="text-xs font-bold text-green-bright tracking-widest">{label}</span>
        <div className="flex items-center gap-2 text-xs">
          {!state.emergencyStop && (
            <span className="text-green-bright"><span className="blink">●</span> CANLI</span>
          )}
          <span className="text-muted-foreground">UDP/RTSP</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="w-full cursor-crosshair scan-line"
        style={{ display: "block", aspectRatio: "4/3", height: "auto" }}
        onClick={handleClick}
      />
    </div>
  );
}
