// WebSocket istemcisi — RPi servisi (veya PC köprüsü) ile çift yönlü kanal.
// Otomatik yeniden bağlanma + üstel geri çekilme.
import type { Command, ServerMessage } from "./protocol";

export type ConnStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ConnectionEvents {
  onStatus: (s: ConnStatus, info?: string) => void;
  onMessage: (m: ServerMessage) => void;
}

export class HardwareConnection {
  private url = "";
  private ws: WebSocket | null = null;
  private events!: ConnectionEvents;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private wantOpen = false;
  private pingTimer: number | null = null;

  attach(events: ConnectionEvents) {
    this.events = events;
  }

  connect(url: string) {
    this.disconnect();
    this.url = url;
    this.wantOpen = true;
    this.reconnectAttempt = 0;
    this.open();
  }

  disconnect() {
    this.wantOpen = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* yoksay */ }
      this.ws = null;
    }
    this.events?.onStatus("disconnected");
  }

  send(cmd: Command): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(cmd));
      return true;
    } catch {
      return false;
    }
  }

  // ───── internal ─────
  private open() {
    if (!this.url) return;
    this.events?.onStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.events?.onStatus("error", String((e as Error).message));
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.events?.onStatus("connected", this.url);
      // ping ile bağlantı tazeliği
      this.pingTimer = window.setInterval(() => {
        this.send({ action: "ping" });
      }, 5000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === "string" ? ev.data : "") as ServerMessage;
        if (data && (data as { type?: string }).type) {
          this.events?.onMessage(data);
        }
      } catch {
        /* JSON değil, yoksay */
      }
    };

    ws.onerror = () => {
      this.events?.onStatus("error", "WebSocket hatası");
    };

    ws.onclose = () => {
      if (this.pingTimer !== null) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.ws = null;
      if (this.wantOpen) {
        this.events?.onStatus("connecting", "yeniden bağlanılıyor…");
        this.scheduleReconnect();
      } else {
        this.events?.onStatus("disconnected");
      }
    };
  }

  private scheduleReconnect() {
    if (!this.wantOpen) return;
    const delay = Math.min(15000, 500 * Math.pow(1.6, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }
}

// Tek paylaşımlı bağlantı (singleton)
export const hardwareConnection = new HardwareConnection();

const STORAGE_KEY = "ahs.hardwareUrl";

export function getStoredUrl(): string {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}
export function setStoredUrl(url: string) {
  try { localStorage.setItem(STORAGE_KEY, url); } catch { /* ignore */ }
}
