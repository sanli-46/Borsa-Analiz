// AHS-MK1 — PC köprüsü
// Tarayıcıdaki kontrol paneli WebSocket konuşur; sahadaki RPi servisi ZMQ konuşur.
// Bu küçük süreç ikisini birbirine çevirir.
//
// Çalıştır:
//   cd services/pc-bridge && npm install && npm start
//
// Ortam değişkenleri:
//   PC_BRIDGE_PORT   (varsayılan 8000)  — tarayıcı WS portu  (ws://localhost:8000)
//   RPI_HOST         (varsayılan 192.168.1.50)
//   RPI_CMD_PORT     (varsayılan 5555)  — RPi ZMQ REP
//   RPI_TLM_PORT     (varsayılan 5556)  — RPi ZMQ PUB

import { WebSocketServer } from "ws";
import * as zmq from "zeromq";

const WS_PORT  = parseInt(process.env.PC_BRIDGE_PORT  || "8000", 10);
const RPI_HOST = process.env.RPI_HOST     || "192.168.1.50";
const CMD_PORT = parseInt(process.env.RPI_CMD_PORT || "5555", 10);
const TLM_PORT = parseInt(process.env.RPI_TLM_PORT || "5556", 10);

const RPI_CMD = `tcp://${RPI_HOST}:${CMD_PORT}`;
const RPI_TLM = `tcp://${RPI_HOST}:${TLM_PORT}`;

// ─── ZMQ tarafı ─────────────────────────────────────────────────────
// REQ soketi durumlu: send → receive sırasını ihlal edemezsin. Birden fazla
// WS mesajı eşzamanlı geldiğinde yarış olur. Tek bir komut kuyruğu ile
// serileştiriyoruz; her job sırayla send + receive yapar.
const cmdSocket = new zmq.Request({ sendTimeout: 1000, receiveTimeout: 2000 });
cmdSocket.connect(RPI_CMD);
console.log(`[bridge] ZMQ REQ → ${RPI_CMD}`);

const cmdQueue = [];
let cmdBusy = false;

async function sendCommand(payload) {
  return new Promise((resolve, reject) => {
    cmdQueue.push({ payload, resolve, reject });
    pumpQueue();
  });
}

async function pumpQueue() {
  if (cmdBusy) return;
  const job = cmdQueue.shift();
  if (!job) return;
  cmdBusy = true;
  try {
    await cmdSocket.send(JSON.stringify(job.payload));
    const [reply] = await cmdSocket.receive();
    job.resolve(reply.toString());
  } catch (e) {
    job.reject(e);
    // REQ soketi hata sonrası kararsız kalabilir → state'i temizlemek için
    // mevcut beklemeleri red et, soket otomatik yeniden bağlanır.
    while (cmdQueue.length) {
      const drop = cmdQueue.shift();
      drop.reject(new Error("cmd queue flushed: " + (e?.message || e)));
    }
  } finally {
    cmdBusy = false;
    if (cmdQueue.length) setImmediate(pumpQueue);
  }
}

const tlmSocket = new zmq.Subscriber();
tlmSocket.connect(RPI_TLM);
tlmSocket.subscribe("");                         // tüm topic'ler
console.log(`[bridge] ZMQ SUB → ${RPI_TLM}`);

// ─── WS sunucusu ────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT, host: "0.0.0.0" });
const clients = new Set();

wss.on("connection", (ws, req) => {
  clients.add(ws);
  console.log(`[bridge] WS bağlantı (${req.socket.remoteAddress}) toplam=${clients.size}`);

  ws.on("message", async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); }
    catch { ws.send(JSON.stringify({ type: "ack", ok: false, reason: "json" })); return; }

    try {
      const reply = await sendCommand(msg);
      ws.send(reply);
    } catch (e) {
      ws.send(JSON.stringify({ type: "ack", ok: false, reason: String(e?.message || e) }));
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] WS koptu, toplam=${clients.size}`);
  });
});
console.log(`[bridge] WS dinleniyor :${WS_PORT}/  (tarayıcıdan ws://localhost:${WS_PORT}/)`);

// ─── ZMQ → tüm WS clientlara fanout ─────────────────────────────────
(async () => {
  for await (const [topic, payload] of tlmSocket) {
    const text = payload?.toString() ?? "";
    // ZMQ tek mesaj olarak "topic {json}" yollar; bizde topic ayrı parça olabilir
    const msg = text.includes(" ") && !text.startsWith("{")
      ? text.slice(text.indexOf(" ") + 1)
      : text;
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }
})().catch((e) => console.error("[bridge] SUB döngüsü kapandı:", e));

// ─── Temiz kapanış ──────────────────────────────────────────────────
function shutdown() {
  console.log("[bridge] Kapanıyor…");
  try { cmdSocket.close(); } catch {}
  try { tlmSocket.close(); } catch {}
  wss.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
