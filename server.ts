import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import axios from "axios";
import cron from "node-cron";
import FormData from "form-data";
import Database from "better-sqlite3";
import fs from "fs";
import { RouterOSAPI } from 'node-routeros';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite Database
const dbPath = path.join(__dirname, "database.sqlite");
const db = new Database(dbPath);

// Store for calculating traffic rates (Mbps)
const lastBytesStore: Map<string, { rx: number; tx: number; time: number }> = new Map();

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    ip TEXT,
    apiPort INTEGER,
    username TEXT,
    password TEXT,
    mac TEXT,
    status TEXT DEFAULT 'down',
    lastSeen DATETIME,
    telegramEnabled INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    latency REAL
  );

  CREATE TABLE IF NOT EXISTS provisioning (
    id TEXT PRIMARY KEY,
    ip TEXT,
    mac TEXT,
    deviceName TEXT,
    routerId TEXT,
    dhcpLease INTEGER DEFAULT 1,
    arpEnabled INTEGER DEFAULT 1,
    speedLimit TEXT,
    interfaceName TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS interfaces (
    id TEXT PRIMARY KEY,
    deviceId TEXT,
    name TEXT,
    status TEXT,
    trafficIn REAL,
    trafficOut REAL,
    lastUpdate DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS router_stats (
    deviceId TEXT PRIMARY KEY,
    cpuUsage REAL,
    ramFree REAL,
    ramTotal REAL,
    uptime TEXT,
    lastUpdate DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS traffic_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT,
    interfaceName TEXT,
    trafficIn REAL,
    trafficOut REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resource_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT,
    cpuUsage REAL,
    ramFree REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceId TEXT,
    deviceName TEXT,
    fileName TEXT,
    size TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    location TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS telegram_sessions (
    chatId TEXT PRIMARY KEY,
    step TEXT,
    data TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Helper to get/set settings
const getSetting = (key: string) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return row ? JSON.parse(row.value) : null;
};

const setSetting = (key: string, value: any) => {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
};

// Initialize Gemini AI
const genAI: any = (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY") 
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
  : null;

// --- Local Neural Engine (Integrated AI) ---
const runLocalAnalysis = (devices: any[], logs: any[]) => {
  const downDevices = devices.filter(d => d.status === 'down');
  const avgLatency = logs.length > 0 ? logs.reduce((acc, curr) => acc + (curr.latency || 0), 0) / logs.length : 0;
  let intensity = 2, color = "#00ff00", summary = "Vigilancia local activa: Óptima.", intel = "No se detectan fugas de datos.", rec = "Todo estable.";
  if (downDevices.length > 0) {
    intensity = 8; color = "#ff4400"; summary = `CRÍTICO: ${downDevices.length} nodos caídos.`;
    intel = "Ruptura en el flujo detectada."; rec = "Verificar suministro eléctrico.";
  } else if (avgLatency > 150) { intensity = 5; color = "#ffaa00"; summary = "ALERTA: Latencia alta."; rec = "Revisar alineación de antenas."; }
  return { statusSummary: summary, intelligence: intel, recommendation: rec, pulseColor: color, pulseIntensity: intensity };
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes for Frontend ---

  app.get("/api/health", (req, res) => res.json({ status: "ok", db: "sqlite" }));

  // Devices
  app.get("/api/devices", (req, res) => {
    const rows = db.prepare("SELECT * FROM devices").all();
    res.json(rows.map((r: any) => ({ ...r, telegramEnabled: !!r.telegramEnabled })));
  });

  app.post("/api/devices", (req, res) => {
    const device = req.body;
    const id = Math.random().toString(36).substring(7);
    db.prepare(`
      INSERT INTO devices (id, name, type, ip, apiPort, username, password, mac, telegramEnabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, device.name, device.type, device.ip, device.apiPort, device.username, device.password, device.mac, device.telegramEnabled ? 1 : 0);
    res.json({ id, ...device });
  });

  app.delete("/api/devices/:id", (req, res) => {
    db.prepare("DELETE FROM devices WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/devices/:id", (req, res) => {
    const { telegramEnabled, status, ip } = req.body;
    if (telegramEnabled !== undefined) {
      db.prepare("UPDATE devices SET telegramEnabled = ? WHERE id = ?").run(telegramEnabled ? 1 : 0, req.params.id);
    }
    if (status !== undefined) {
      db.prepare("UPDATE devices SET status = ? WHERE id = ?").run(status, req.params.id);
    }
    if (ip !== undefined) {
      db.prepare("UPDATE devices SET ip = ? WHERE id = ?").run(ip, req.params.id);
    }
    res.json({ success: true });
  });

  // Provisioning
  app.get("/api/provisioning", (req, res) => {
    const rows = db.prepare("SELECT * FROM provisioning ORDER BY createdAt DESC").all();
    res.json(rows.map((r: any) => ({ ...r, arpEnabled: !!r.arpEnabled, dhcpLease: !!r.dhcpLease })));
  });

  app.post("/api/provisioning", (req, res) => {
    const p = req.body;
    const id = Math.random().toString(36).substring(7);
    db.prepare(`
      INSERT INTO provisioning (id, ip, mac, deviceName, routerId, speedLimit, interfaceName)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, p.ip, p.mac, p.deviceName, p.routerId, p.speedLimit, p.interfaceName);
    res.json({ id, ...p });
  });

  app.patch("/api/provisioning/:id", async (req, res) => {
    const { arpEnabled, speedLimit } = req.body;
    const client = db.prepare("SELECT * FROM provisioning WHERE id = ?").get(req.params.id) as any;
    if (!client) return res.status(404).json({ error: "Client not found" });

    const router = db.prepare("SELECT * FROM devices WHERE id = ?").get(client.routerId) as any;
    
    // Fallback: If no routerId, try to find a router that can reach this IP
    let activeRouter = router;
    if (!activeRouter || router.status !== 'up') {
      const allRouters = db.prepare("SELECT * FROM devices WHERE type = 'router' AND status = 'up'").all() as any[];
      activeRouter = allRouters[0]; // Take the first active one as a desperate fallback if not linked
    }

    if (activeRouter && activeRouter.status === 'up') {
      try {
        const api = new RouterOSAPI({
          host: activeRouter.ip,
          user: activeRouter.username,
          password: activeRouter.password,
          port: activeRouter.apiPort || 8728,
          timeout: 10
        });
        await api.connect();

        if (arpEnabled !== undefined) {
          const arpList = await api.write('/ip/arp/print', [`?address=${client.ip}`]);
          if (arpList.length > 0) {
            const entryId = arpList[0]['.id'];
            await api.write('/ip/arp/set', [
              `=.id=${entryId}`,
              `=disabled=${arpEnabled ? 'false' : 'true'}`
            ]);
            console.log(`MikroTik: ARP ${arpEnabled ? 'enabled' : 'disabled'} for ${client.ip}`);
          } else if (arpEnabled) {
            await api.write('/ip/arp/add', [
              `=address=${client.ip}`,
              `=mac-address=${client.mac}`,
              `=interface=${client.interfaceName || 'bridge-local'}`,
              '=comment=VENET-PRO'
            ]);
            console.log(`MikroTik: ARP created/enabled for ${client.ip}`);
          }
        }

        if (speedLimit !== undefined) {
          // Update Simple Queue
          const queueList = await api.write('/queue/simple/print', [`?target=${client.ip}/32`]);
          if (queueList.length > 0) {
            const queueId = queueList[0]['.id'];
            await api.write('/queue/simple/set', [
              `=.id=${queueId}`,
              `=max-limit=${speedLimit}`
            ]);
          } else {
            // Create if it doesn't exist
            await api.write('/queue/simple/add', [
              `=name=${client.deviceName}`,
              `=target=${client.ip}/32`,
              `=max-limit=${speedLimit}`
            ]);
          }
        }

        api.close();
      } catch (err: any) {
        console.error("MikroTik Sync Error:", err.message);
        // We continue to update DB even if ROS fails, but maybe log it?
      }
    }

    if (arpEnabled !== undefined) {
      db.prepare("UPDATE provisioning SET arpEnabled = ? WHERE id = ?").run(arpEnabled ? 1 : 0, req.params.id);
    }
    if (speedLimit !== undefined) {
      db.prepare("UPDATE provisioning SET speedLimit = ? WHERE id = ?").run(speedLimit, req.params.id);
    }
    res.json({ success: true });
  });

  // Logs
  app.get("/api/logs", (req, res) => {
    const rows = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json(rows);
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    const global = getSetting("global") || {};
    res.json(global);
  });

  app.post("/api/settings", (req, res) => {
    setSetting("global", req.body);
    res.json({ success: true });
  });

  // Oracle
  app.get("/api/oracle", (req, res) => {
    res.json(getSetting("oracle") || null);
  });

  // --- Router Tools (Live from MikroTik) ---
  app.get("/api/router-tools/dhcp-leases/:deviceId", async (req, res) => {
    const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(req.params.deviceId) as any;
    if (!device || device.type !== 'router') return res.status(404).json({ error: "Router not found" });

    try {
      const api = new RouterOSAPI({
        host: device.ip,
        user: device.username,
        password: device.password,
        port: device.apiPort || 8728,
        timeout: 20
      });
      await api.connect();
      
      const leases = await api.write('/ip/dhcp-server/lease/print');
      const queues = await api.write('/queue/simple/print');
      const arps = await api.write('/ip/arp/print');
      api.close();

      // Enriched data for the UI and DB Update
      const enrichedLeases = leases.map(lease => {
        const ip = lease.address;
        const mac = lease.mac_address;
        const name = lease.comment || lease['host-name'] || `Client ${ip}`;
        
        const matchingQueue = queues.find(q => q.target && q.target.includes(ip));
        const speedLimit = matchingQueue ? matchingQueue.max_limit : '10M/10M';
        
        const matchingArp = arps.find(a => a.address === ip);
        const arpEnabled = (matchingArp && matchingArp.disabled === 'false') ? 1 : 0;

        // Sync to DB in background
        const existing = db.prepare("SELECT * FROM provisioning WHERE mac = ?").get(mac);
        if (!existing) {
          const id = Math.random().toString(36).substring(7);
          db.prepare(`
            INSERT INTO provisioning (id, ip, mac, deviceName, routerId, speedLimit, interfaceName, arpEnabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, ip, mac, name, device.id, speedLimit, 'SALIDA', arpEnabled);
        } else {
          db.prepare(`
            UPDATE provisioning 
            SET ip = ?, deviceName = ?, routerId = ?, speedLimit = ?, arpEnabled = ?
            WHERE mac = ?
          `).run(ip, name, device.id, speedLimit, arpEnabled, mac);
        }

        return { ...lease, speedLimit, arpEnabled, comment: name };
      });

      res.json(enrichedLeases);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/router-tools/ping", async (req, res) => {
    const { deviceId, host, count = 4 } = req.body;
    const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as any;
    if (!device || device.type !== 'router') return res.status(404).json({ error: "Router not found" });

    try {
      const api = new RouterOSAPI({
        host: device.ip,
        user: device.username,
        password: device.password,
        port: device.apiPort || 8728,
        timeout: 10
      });
      await api.connect();
      const result = await api.write('/ping', [`=address=${host}`, `=count=${count}`]);
      api.close();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/router-tools/speedtest", async (req, res) => {
    const { deviceId, target } = req.body;
    const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as any;
    if (!device || device.type !== 'router') return res.status(404).json({ error: "Router not found" });

    try {
      const api = new RouterOSAPI({
        host: device.ip,
        user: device.username,
        password: device.password,
        port: device.apiPort || 8728,
        timeout: 30
      });
      await api.connect();
      // Use bandwidth-test for standard ROS, or speed-test if available
      // Defaulting to a short bandwidth test as it's more universal
      const result = await api.write('/tool/bandwidth-test', [
        `=address=${target || '8.8.8.8'}`, 
        '=duration=5s',
        '=protocol=udp',
        '=direction=both'
      ]);
      api.close();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/router-stats/:deviceId", (req, res) => {
    const stats = db.prepare("SELECT * FROM router_stats WHERE deviceId = ?").get(req.params.deviceId);
    const interfaces = db.prepare("SELECT * FROM interfaces WHERE deviceId = ?").all(req.params.deviceId);
    res.json({ stats, interfaces });
  });

  app.get("/api/router-history/:id", (req, res) => {
    const ifaceName = req.query.interface as string || 'ether1';
    const range = req.query.range as string || '24h';
    
    let limit = 50;
    if (range === '5m') limit = 5;
    if (range === '8h') limit = 100;
    if (range === '24h') limit = 300;

    const traffic = db.prepare(`
      SELECT trafficIn, trafficOut, timestamp 
      FROM traffic_history 
      WHERE deviceId = ? AND interfaceName = ? 
      ORDER BY timestamp DESC LIMIT ?
    `).all(req.params.id, ifaceName, limit);
    
    const resources = db.prepare(`
      SELECT cpuUsage, ramFree, timestamp 
      FROM resource_history 
      WHERE deviceId = ? 
      ORDER BY timestamp DESC LIMIT ?
    `).all(req.params.id, limit);

    res.json({ 
      traffic: traffic.reverse(), 
      resources: resources.reverse() 
    });
  });

  app.post("/api/oracle", (req, res) => {
    setSetting("oracle", req.body);
    res.json({ success: true });
  });

  app.get("/api/global-stats", async (req, res) => {
    const global = getSetting("global") || {};
    res.json({
      googleLatency: global.googleLatency || null
    });
  });

  // Gemini AI Native Routes
  app.post("/api/ai/analyze", async (req, res) => {
    const { devices, logs } = req.body;
    
    // If no Gemini, use Integrated Local AI
    if (!genAI) {
      return res.json(runLocalAnalysis(devices || [], logs || []));
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
    const prompt = `
      Eres el "Oráculo de Red", una inteligencia artificial avanzada diseñada para gestionar infraestructuras MikroTik.
      Analiza los siguientes datos de red y proporciona un resumen ejecutivo "inovador" y futurista.
      
      Dispositivos: ${JSON.stringify(devices)}
      Logs recientes: ${JSON.stringify((logs || []).slice(0, 20))}
      
      Tu respuesta debe ser JSON:
      {
        "statusSummary": "Frase corta potente",
        "intelligence": "Análisis profundo",
        "recommendation": "Acción proactiva",
        "pulseColor": "Hexadecimal",
        "pulseIntensity": numero 1-10
      }
    `;

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              statusSummary: { type: Type.STRING },
              intelligence: { type: Type.STRING },
              recommendation: { type: Type.STRING },
              pulseColor: { type: Type.STRING },
              pulseIntensity: { type: Type.NUMBER }
            },
            required: ["statusSummary", "intelligence", "recommendation", "pulseColor", "pulseIntensity"]
          }
        }
      });
      res.json(JSON.parse(result.response.text()));
    } catch (error: any) {
      console.error("AI Analysis Error:", error.message);
      res.status(500).json({ error: "Neural link failed" });
    }
  });

  app.post("/api/ai/ask", async (req, res) => {
    const { question, context } = req.body;
    
    // If no Gemini, use Integrated Heuristic Link
    if (!genAI) {
      const q = question.toLowerCase();
      if (q.includes("estado")) return res.json({ text: `Motor local reporta: ${runLocalAnalysis(context.devices || [], context.logs || []).statusSummary}` });
      return res.json({ text: "Consulta técnica procesada por el Núcleo Local. Se sugiere verificar logs manuales en ausencia del enlace neuronal profundo." });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const prompt = `
      Eres el Oráculo de Red. El usuario pregunta: "${question}"
      Contexto de la red: ${JSON.stringify(context)}
      Responde de forma concisa, técnica pero con un tono futurista y autoritario.
    `;

    try {
      const result = await model.generateContent(prompt);
      res.json({ text: result.response.text() });
    } catch (error: any) {
      console.error("AI Ask Error:", error.message);
      res.status(500).json({ error: "Neural link failed" });
    }
  });

  // Ping utility
  const pingHost = (host: string): Promise<{ alive: boolean; time: number }> => {
    return new Promise((resolve) => {
      const ping = spawn("ping", ["-c", "1", "-W", "2", host]);
      let output = "";
      ping.stdout.on("data", (data) => (output += data.toString()));
      ping.on("close", (code) => {
        if (code === 0) {
          const match = output.match(/time=([\d.]+) ms/);
          resolve({ alive: true, time: match ? parseFloat(match[1]) : 0 });
        } else {
          resolve({ alive: false, time: 0 });
        }
      });
    });
  };

  app.post("/api/ping", async (req, res) => {
    const { host } = req.body;
    if (!host) return res.status(400).json({ error: "Host required" });
    try {
      const result = await pingHost(host);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Ping failed" });
    }
  });

  // Telegram Webhook Handler
  app.post("/api/telegram-webhook", async (req, res) => {
    const { message, callback_query } = req.body;
    const settings = getSetting("global") || {};
    const token = settings.telegramBotToken;

    if (!token) return res.sendStatus(200);

    const sendTelegram = async (chatId: string | number, text: string, replyMarkup?: any) => {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
    };

    const editMessage = async (chatId: string | number, messageId: number, text: string, replyMarkup?: any) => {
      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
    };

    if (message && message.text) {
      const chatId = message.chat.id.toString();
      const text = message.text;

      if (text === '/start' || text === '/menu') {
        const menuMarkup = {
          inline_keyboard: [
            [{ text: "📊 Estado General", callback_data: "status_general" }],
            [{ text: "📡 Estado Antenas", callback_data: "status_antennas" }],
            [{ text: "👥 Gestión Clientes", callback_data: "manage_clients" }],
            [{ text: "🆕 Nuevo Cliente", callback_data: "start_provisioning" }],
            [{ text: "📝 Resumen Aprovisionamiento", callback_data: "prov_summary" }],
            [{ text: "🧠 Consultar Oráculo AI", callback_data: "oracle_status" }]
          ]
        };
        await sendTelegram(chatId, "<b>🤖 Panel de Control MikroTik (SQLite)</b>\nSelecciona una opción:", menuMarkup);
      } else {
        const sessionRow = db.prepare("SELECT * FROM telegram_sessions WHERE chatId = ?").get(chatId) as any;
        if (sessionRow) {
          const session = { ...sessionRow, data: JSON.parse(sessionRow.data) };
          const input = text.trim();

          if (session.step === 'awaiting_ip') {
            db.prepare("UPDATE telegram_sessions SET step = ?, data = ? WHERE chatId = ?")
              .run('awaiting_mac', JSON.stringify({ ...session.data, ip: input }), chatId);
            await sendTelegram(chatId, "✅ IP guardada. Ahora envía la <b>MAC Address</b>:");
          } else if (session.step === 'awaiting_mac') {
            db.prepare("UPDATE telegram_sessions SET step = ?, data = ? WHERE chatId = ?")
              .run('awaiting_name', JSON.stringify({ ...session.data, mac: input.toUpperCase() }), chatId);
            await sendTelegram(chatId, "✅ MAC guardada. Finalmente, envía el <b>Nombre del Cliente</b>:");
          } else if (session.step === 'awaiting_name') {
            const id = Math.random().toString(36).substring(7);
            db.prepare("INSERT INTO provisioning (id, ip, mac, deviceName, speedLimit, interfaceName) VALUES (?, ?, ?, ?, ?, ?)")
              .run(id, session.data.ip, session.data.mac, input, '10M/10M', 'SALIDA');
            db.prepare("DELETE FROM telegram_sessions WHERE chatId = ?").run(chatId);
            await sendTelegram(chatId, `<b>✅ ¡Cliente Provisionado!</b>\n👤 ${input}\n🌐 ${session.data.ip}`);
          }
        }
      }
    }

    if (callback_query) {
      const chatId = callback_query.message.chat.id.toString();
      const messageId = callback_query.message.message_id;
      const data = callback_query.data;

      if (data === "status_general") {
        const devices = db.prepare("SELECT status FROM devices").all() as any[];
        const up = devices.filter(d => d.status === 'up').length;
        const text = `<b>📊 Resumen</b>\n✅ Online: ${up}\n❌ Offline: ${devices.length - up}`;
        await editMessage(chatId, messageId, text, { inline_keyboard: [[{ text: "⬅️ Volver", callback_data: "main_menu" }]] });
      }
      
      if (data === "main_menu") {
        const menuMarkup = {
          inline_keyboard: [
            [{ text: "📊 Estado General", callback_data: "status_general" }],
            [{ text: "📡 Estado Antenas", callback_data: "status_antennas" }],
            [{ text: "👥 Gestión Clientes", callback_data: "manage_clients" }],
            [{ text: "🆕 Nuevo Cliente", callback_data: "start_provisioning" }],
            [{ text: "📝 Resumen Aprovisionamiento", callback_data: "prov_summary" }],
            [{ text: "🧠 Consultar Oráculo AI", callback_data: "oracle_status" }]
          ]
        };
        await editMessage(chatId, messageId, "<b>🤖 Panel de Control MikroTik</b>", menuMarkup);
      }
    }

    res.sendStatus(200);
  });

  // Monitoring Loop
  const monitorDevices = async () => {
    try {
      const settings = getSetting("global") || {};
      const { telegramBotToken, telegramChatId } = settings;
      const devices = db.prepare("SELECT * FROM devices").all() as any[];

      let routersForDnsCheck: any[] = [];

      for (const device of devices) {
        const result = await pingHost(device.ip);
        const newStatus = result.alive ? 'up' : 'down';

        if (device.status !== newStatus) {
          db.prepare("UPDATE devices SET status = ?, lastSeen = CURRENT_TIMESTAMP WHERE id = ?").run(newStatus, device.id);
          db.prepare("INSERT INTO logs (deviceId, status, latency) VALUES (?, ?, ?)").run(device.id, newStatus, result.alive ? result.time : 0);

          if (device.telegramEnabled && telegramBotToken && telegramChatId) {
            const message = `<b>🚨 ALERTA: ${device.name}</b>\nEstado: ${newStatus.toUpperCase()}`;
            const chatIds = telegramChatId.split(',').map((id: string) => id.trim());
            
            for (const id of chatIds) {
              axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                chat_id: id,
                text: message,
                parse_mode: 'HTML'
              }).catch(e => console.error(`TG Error for ${id}:`, e.message));
            }
          }
        }

        if (device.type === 'router' && result.alive) {
          routersForDnsCheck.push(device);
        }

        // --- MASTER AUTO-SYNC (Leases, Queues, ARP) ---
        if (device.type === 'router' && result.alive && device.username && device.password) {
          try {
            const api = new RouterOSAPI({
              host: device.ip,
              user: device.username,
              password: device.password,
              port: device.apiPort || 8728,
              timeout: 15
            });
            await api.connect();
            
            // Fetch everything we need for a full sync
            const leases = await api.write('/ip/dhcp-server/lease/print');
            const queues = await api.write('/queue/simple/print');
            const arps = await api.write('/ip/arp/print');
            
            for (const lease of leases) {
              const mac = lease.mac_address;
              const ip = lease.address;
              
              // 1. Determine Name (Priority: Lease Comment > Hostname > Default)
              const name = lease.comment || lease['host-name'] || `Client ${ip}`;
              
              // 2. Find Speed Limit from Simple Queues
              const matchingQueue = queues.find(q => q.target && q.target.includes(ip));
              const speedLimit = matchingQueue ? matchingQueue.max_limit : '10M/10M';
              
              // 3. Determine ARP Status (Enabled/Cut)
              // We assume 'Cut' if there's no active/enabled ARP entry for this IP/MAC combo
              // or if the entry is explicitly disabled (Mikrotik property 'disabled')
              const matchingArp = arps.find(a => a.address === ip);
              const arpEnabled = (matchingArp && matchingArp.disabled === 'false') ? 1 : 0;
              
              const existing = db.prepare("SELECT * FROM provisioning WHERE mac = ?").get(mac);
              
              if (!existing) {
                const id = Math.random().toString(36).substring(7);
                db.prepare(`
                  INSERT INTO provisioning (id, ip, mac, deviceName, routerId, speedLimit, interfaceName, arpEnabled)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(id, ip, mac, name, device.id, speedLimit, 'SALIDA', arpEnabled);
              } else {
                // Update existing record with Mikrotik's truth
                db.prepare(`
                  UPDATE provisioning 
                  SET ip = ?, deviceName = ?, routerId = ?, speedLimit = ?, arpEnabled = ?
                  WHERE mac = ?
                `).run(ip, name, device.id, speedLimit, arpEnabled, mac);
              }
            }
            api.close();
          } catch (e) {
            console.error(`Master Sync Error (${device.name}):`, e.message);
          }
        }

        // Fetch Stats if it's a router and online
        if (device.type === 'router' && result.alive && device.username && device.password) {
          try {
            const api = new RouterOSAPI({
              host: device.ip,
              user: device.username,
              password: device.password,
              port: device.apiPort || 8728,
              timeout: 5
            });

            await api.connect();

            // 1. Fetch Resources
            const resources = await api.write('/system/resource/print');
            if (resources && resources.length > 0) {
              const data = resources[0];
              const cpu = parseFloat(data['cpu-load'] || '0');
              const ram = parseFloat(data['free-memory'] || '0') / 1024 / 1024;
              const totalRam = parseFloat(data['total-memory'] || '0') / 1024 / 1024;

              db.prepare(`
                INSERT OR REPLACE INTO router_stats (deviceId, cpuUsage, ramFree, ramTotal, uptime, lastUpdate)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              `).run(device.id, cpu, ram, totalRam, data['uptime'] || '');

              db.prepare(`
                INSERT INTO resource_history (deviceId, cpuUsage, ramFree)
                VALUES (?, ?, ?)
              `).run(device.id, cpu, ram);
            }

            // 2. Fetch Interfaces
            const interfacesList = await api.write('/interface/print');
            if (interfacesList && interfacesList.length > 0) {
              const now = Date.now();
              for (const iface of interfacesList) {
                const id = `${device.id}_${iface.name}`;
                const rxBytes = parseFloat(iface['rx-byte'] || '0');
                const txBytes = parseFloat(iface['tx-byte'] || '0');

                let mbpsIn = 0;
                let mbpsOut = 0;

                const lastData = lastBytesStore.get(id);
                if (lastData) {
                  const seconds = (now - lastData.time) / 1000;
                  if (seconds > 0) {
                    // (Bytes * 8 = Bits) / (Seconds) / (1024*1024) = Mbps
                    mbpsIn = ((rxBytes - lastData.rx) * 8) / (seconds * 1024 * 1024);
                    mbpsOut = ((txBytes - lastData.tx) * 8) / (seconds * 1024 * 1024);
                    
                    // Sanitize against resets or negative results
                    if (mbpsIn < 0) mbpsIn = 0;
                    if (mbpsOut < 0) mbpsOut = 0;
                  }
                }

                lastBytesStore.set(id, { rx: rxBytes, tx: txBytes, time: now });

                db.prepare(`
                  INSERT OR REPLACE INTO interfaces (id, deviceId, name, status, trafficIn, trafficOut, lastUpdate)
                  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(id, device.id, iface.name, iface.running === 'true' ? 'up' : 'down', mbpsIn, mbpsOut);

                db.prepare(`
                  INSERT INTO traffic_history (deviceId, interfaceName, trafficIn, trafficOut)
                  VALUES (?, ?, ?, ?)
                `).run(device.id, iface.name, mbpsIn, mbpsOut);
              }
            }
            
            // Cleanup history older than 7 days to save VPS disk/bandwidth
            db.prepare("DELETE FROM traffic_history WHERE timestamp < datetime('now', '-7 days')").run();
            db.prepare("DELETE FROM resource_history WHERE timestamp < datetime('now', '-7 days')").run();

            api.close();
          } catch (apiErr: any) {
            console.error(`MikroTik API Error (${device.name}):`, apiErr.message);
          }
        }
      }

      // Google DNS Check From Router
      if (routersForDnsCheck.length > 0) {
        const primary = routersForDnsCheck[0];
        try {
          const api = new RouterOSAPI({
            host: primary.ip,
            user: primary.username,
            password: primary.password,
            port: primary.apiPort || 8728,
            timeout: 5
          });
          await api.connect();
          const googlePing = await api.write('/ping', ['=address=8.8.8.8', '=count=1']);
          api.close();
          const latency = googlePing[0]?.time ? parseFloat(googlePing[0].time) * 1000 : 0;
          if (latency > 0) {
            const current = getSetting("global") || {};
            setSetting("global", { ...current, googleLatency: Math.round(latency), googleLatSource: primary.name });
            console.log(`DNS Check: Latency ${latency}ms verified from MikroTik: ${primary.name}`);
          }
        } catch (e) {
          console.error(`DNS Check Error (MikroTik ${primary.name}):`, e instanceof Error ? e.message : String(e));
        }
      } else {
        // Fallback to local ping if no routers are up
        const res = await pingHost("8.8.8.8");
        const current = getSetting("global") || {};
        setSetting("global", { ...current, googleLatency: Math.round(res.time), googleLatSource: "VPS (Fallback)" });
      }

      console.log(`Monitor: Cycle finished at ${new Date().toISOString()}`);
    } catch (err) {
      console.error("Monitor error", err);
    }
  };

  setInterval(monitorDevices, 120000); 
  monitorDevices(); // Initial run on startup

  // Vite setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT} (SQLite Mode)`));
}

startServer();
