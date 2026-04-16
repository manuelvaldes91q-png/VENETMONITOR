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
const MikroNode = require('mikrotik-node');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite Database
const dbPath = path.join(__dirname, "database.sqlite");
const db = new Database(dbPath);

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
    const { telegramEnabled, status } = req.body;
    if (telegramEnabled !== undefined) {
      db.prepare("UPDATE devices SET telegramEnabled = ? WHERE id = ?").run(telegramEnabled ? 1 : 0, req.params.id);
    }
    if (status !== undefined) {
      db.prepare("UPDATE devices SET status = ? WHERE id = ?").run(status, req.params.id);
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
      INSERT INTO provisioning (id, ip, mac, deviceName, speedLimit, interfaceName)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, p.ip, p.mac, p.deviceName, p.speedLimit, p.interfaceName);
    res.json({ id, ...p });
  });

  app.patch("/api/provisioning/:id", (req, res) => {
    const { arpEnabled } = req.body;
    db.prepare("UPDATE provisioning SET arpEnabled = ? WHERE id = ?").run(arpEnabled ? 1 : 0, req.params.id);
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

  app.get("/api/router-stats/:deviceId", (req, res) => {
    const stats = db.prepare("SELECT * FROM router_stats WHERE deviceId = ?").get(req.params.deviceId);
    const interfaces = db.prepare("SELECT * FROM interfaces WHERE deviceId = ?").all(req.params.deviceId);
    res.json({ stats, interfaces });
  });

  app.post("/api/oracle", (req, res) => {
    setSetting("oracle", req.body);
    res.json({ success: true });
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

      for (const device of devices) {
        const result = await pingHost(device.ip);
        const newStatus = result.alive ? 'up' : 'down';

        if (device.status !== newStatus) {
          db.prepare("UPDATE devices SET status = ?, lastSeen = CURRENT_TIMESTAMP WHERE id = ?").run(newStatus, device.id);
          db.prepare("INSERT INTO logs (deviceId, status, latency) VALUES (?, ?, ?)").run(device.id, newStatus, result.alive ? result.time : 0);

          if (device.telegramEnabled && telegramBotToken && telegramChatId) {
            const message = `<b>🚨 ALERTA: ${device.name}</b>\nEstado: ${newStatus.toUpperCase()}`;
            await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
              chat_id: telegramChatId,
              text: message,
              parse_mode: 'HTML'
            }).catch(e => console.error("TG Error", e.message));
          }
        }

        // Fetch Stats if it's a router and online
        if (device.type === 'router' && result.alive && device.username && device.password) {
          try {
            const connection = new MikroNode(device.ip, device.username, device.password, { 
              port: device.apiPort || 8728,
              timeout: 10
            });
            const client = await connection.connect();
            
            // 1. Fetch Resources
            const resData = await client.write('/system/resource/print');
            const data = resData[0];
            
            db.prepare(`
              INSERT OR REPLACE INTO router_stats (deviceId, cpuUsage, ramFree, ramTotal, uptime, lastUpdate)
              VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
              device.id,
              parseFloat(data['cpu-load'] || '0'),
              parseFloat(data['free-memory'] || '0') / 1024 / 1024,
              parseFloat(data['total-memory'] || '0') / 1024 / 1024,
              data['uptime'] || ''
            );

            // 2. Fetch Interfaces
            const interfaces = await client.write('/interface/print');
            for (const iface of interfaces) {
              const id = `${device.id}_${iface.name}`;
              db.prepare(`
                INSERT OR REPLACE INTO interfaces (id, deviceId, name, status, trafficIn, trafficOut, lastUpdate)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              `).run(
                id,
                device.id,
                iface.name,
                iface.running === 'true' ? 'up' : 'down',
                parseFloat(iface['rx-byte'] || '0') / 1024 / 1024,
                parseFloat(iface['tx-byte'] || '0') / 1024 / 1024
              );
            }

            client.close();
          } catch (apiErr: any) {
            console.error(`MikroTik API Error (${device.name}):`, apiErr.message);
          }
        }
      }
    } catch (err) {
      console.error("Monitor error", err);
    }
  };

  setInterval(monitorDevices, 30000);

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
