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
    queueType TEXT DEFAULT 'default-small',
    interfaceName TEXT,
    lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Manual Migrations (Safety for VPS updates)
try {
  db.exec("ALTER TABLE provisioning ADD COLUMN routerId TEXT");
  console.log("Migration: Added routerId to provisioning");
} catch (e) {}

try {
  db.exec("ALTER TABLE provisioning ADD COLUMN queueType TEXT DEFAULT 'default-small'");
  console.log("Migration: Added queueType to provisioning");
} catch (e) {}

// Robust Unique Enforcement: MAC and IP must be unique globally in the provisioning system
try {
  // 1. Delete duplicates by IP (keep oldest)
  db.exec(`
    DELETE FROM provisioning 
    WHERE rowid NOT IN (
      SELECT MIN(rowid) 
      FROM provisioning 
      GROUP BY ip
    );
  `);
  // 2. Delete duplicates by MAC (keep oldest)
  db.exec(`
    DELETE FROM provisioning 
    WHERE rowid NOT IN (
      SELECT MIN(rowid) 
      FROM provisioning 
      GROUP BY mac
    );
  `);
  // 3. Create the indices
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_prov_mac ON provisioning(mac)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_prov_ip ON provisioning(ip)");
  console.log("Migration: Global unique indices for MAC and IP enforced.");
} catch (e) {
  console.error("Migration error:", e.message);
}

db.exec(`
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
  try {
    console.log("🚀 Iniciando motor del servidor...");
    const app = express();
    const PORT = 3000;

  app.use(express.json());

  // --- API Routes for Frontend ---

  app.get("/api/health", (req, res) => res.json({ status: "ok", db: "sqlite" }));

  // Devices
  app.get("/api/devices", (req, res) => {
    const devices = db.prepare("SELECT * FROM devices").all() as any[];
    const result = devices.map((d: any) => {
      const interfaces = db.prepare("SELECT * FROM interfaces WHERE deviceId = ?").all(d.id);
      return { 
        ...d, 
        telegramEnabled: !!d.telegramEnabled,
        interfaces: interfaces || []
      };
    });
    res.json(result);
  });

  app.post("/api/devices", (req, res) => {
    try {
      const device = req.body;
      const id = Math.random().toString(36).substring(7);
      db.prepare(`
        INSERT INTO devices (id, name, type, ip, apiPort, username, password, mac, telegramEnabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, 
        device.name, 
        device.type, 
        device.ip, 
        device.apiPort || null, 
        device.username || null, 
        device.password || null, 
        device.mac || null, 
        device.telegramEnabled ? 1 : 0
      );
      res.json({ id, ...device });
    } catch (err: any) {
      console.error("Error saving device:", err.message);
      res.status(500).json({ error: err.message });
    }
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

  // --- CORE PROVISIONING LOGIC (ATOMIC SYNC) ---
  const syncClientToMikroTik = async (clientId: string) => {
    const client = db.prepare("SELECT * FROM provisioning WHERE id = ?").get(clientId) as any;
    if (!client) return { success: false, error: "Client not found in DB" };

    const router = db.prepare("SELECT * FROM devices WHERE id = ?").get(client.routerId) as any;
    let targetApiRouter = router;
    
    // Fallback if no specific router or router is down
    if (!targetApiRouter || targetApiRouter.status !== 'up') {
      const activeRouter = db.prepare("SELECT * FROM devices WHERE type = 'router' AND status = 'up' LIMIT 1").get() as any;
      if (!activeRouter) return { success: false, error: "No active router found for sync" };
      targetApiRouter = activeRouter;
    }

    let api: any = null;
    try {
      api = new RouterOSAPI({
        host: targetApiRouter.ip,
        user: targetApiRouter.username,
        password: targetApiRouter.password,
        port: targetApiRouter.apiPort || 8728,
        timeout: 15
      });
      await api.connect();

      // 1. DHCP Lease: Robust lookup by MAC then IP
      let leaseId = null;
      let leaseObj: any = null;
      
      const leasesByMac = await api.write('/ip/dhcp-server/lease/print', [`?mac-address=${client.mac}`]);
      if (leasesByMac.length > 0) {
        leaseObj = leasesByMac[0];
        leaseId = leaseObj['.id'];
      } else {
        const leasesByIp = await api.write('/ip/dhcp-server/lease/print', [`?address=${client.ip}`]);
        if (leasesByIp.length > 0) {
          leaseObj = leasesByIp[0];
          leaseId = leaseObj['.id'];
        }
      }

      if (leaseId) {
        // ROS 6.x make-static if dynamic
        if (leaseObj.dynamic === 'true') {
          await api.write('/ip/dhcp-server/lease/make-static', [`=.id=${leaseId}`]);
        }
        // Always update comment and address (ensure alignment)
        await api.write('/ip/dhcp-server/lease/set', [
          `=.id=${leaseId}`,
          `=comment=${client.deviceName}`,
          `=address=${client.ip}`,
          `=client-id=` // Clear client-id to avoid conflicts in some ROS versions
        ]);
      } else {
        // If not found, try to add it as static lease
        await api.write('/ip/dhcp-server/lease/add', [
          `=address=${client.ip}`,
          `=mac-address=${client.mac}`,
          `=comment=${client.deviceName}`,
          `=server=all`
        ]);
      }

      // 2. ARP: Add/Set with Comment + Fixed Interface "SALIDA"
      const arpList = await api.write('/ip/arp/print', [`?address=${client.ip}`]);
      const arpInterface = client.interfaceName || 'SALIDA';
      if (arpList.length > 0) {
        await api.write('/ip/arp/set', [
          `=.id=${arpList[0]['.id']}`,
          `=disabled=${client.arpEnabled ? 'false' : 'true'}`,
          `=comment=${client.deviceName}`,
          `=mac-address=${client.mac}`,
          `=interface=${arpInterface}`
        ]);
      } else {
        await api.write('/ip/arp/add', [
          `=address=${client.ip}`,
          `=mac-address=${client.mac}`,
          `=interface=${arpInterface}`,
          `=comment=${client.deviceName}`,
          `=disabled=${client.arpEnabled ? 'false' : 'true'}`
        ]);
      }

      // 3. Simple Queue: Name, Comment, Target & Speed
      let queueId = null;
      // Search by exact name
      const qByName = await api.write('/queue/simple/print', [`?name=${client.deviceName}`]);
      if (qByName.length > 0) {
        queueId = qByName[0]['.id'];
      } else {
        // Search by target IP
        const qByIp = await api.write('/queue/simple/print', [`?target=${client.ip}/32`]);
        if (qByIp.length > 0) queueId = qByIp[0]['.id'];
      }

      if (queueId) {
        await api.write('/queue/simple/set', [
          `=.id=${queueId}`,
          `=name=${client.deviceName}`,
          `=comment=${client.deviceName}`,
          `=target=${client.ip}/32`,
          `=max-limit=${client.speedLimit}`,
          `=queue=${client.queueType || 'default-small'}/default-small`
        ]);
      } else {
        await api.write('/queue/simple/add', [
          `=name=${client.deviceName}`,
          `=comment=${client.deviceName}`,
          `=target=${client.ip}/32`,
          `=max-limit=${client.speedLimit}`,
          `=queue=${client.queueType || 'default-small'}/default-small`
        ]);
      }

      return { success: true };
    } catch (err: any) {
      console.error(`Provisioning Sync Error [${client.deviceName}]:`, err.message);
      return { success: false, error: err.message };
    } finally {
      if (api) { try { api.close(); } catch (e) {} }
    }
  };

  // Provisioning
  app.get("/api/provisioning", (req, res) => {
    const rows = db.prepare("SELECT * FROM provisioning ORDER BY createdAt DESC").all();
    res.json(rows.map((r: any) => ({ ...r, arpEnabled: !!r.arpEnabled, dhcpLease: !!r.dhcpLease })));
  });

  app.post("/api/provisioning", async (req, res) => {
    const p = req.body;
    
    // Check for duplicates before anything else
    const existingByIp = db.prepare("SELECT deviceName FROM provisioning WHERE ip = ?").get(p.ip) as any;
    if (existingByIp) {
      return res.status(400).json({ error: `La IP ${p.ip} ya está asignada al cliente: ${existingByIp.deviceName}` });
    }

    const existingByMac = db.prepare("SELECT deviceName FROM provisioning WHERE mac = ?").get(p.mac) as any;
    if (existingByMac) {
      return res.status(400).json({ error: `La MAC ${p.mac} ya está registrada por el cliente: ${existingByMac.deviceName}` });
    }

    const id = Math.random().toString(36).substring(7);
    try {
      db.prepare(`
        INSERT INTO provisioning (id, ip, mac, deviceName, routerId, speedLimit, interfaceName, arpEnabled, lastSeen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(id, p.ip, p.mac, p.deviceName, p.routerId, p.speedLimit, p.interfaceName || 'SALIDA', p.arpEnabled ? 1 : 0);
      
      // Atomic synchronization
      const syncRes = await syncClientToMikroTik(id);
      res.json({ id, ...p, syncError: syncRes.error });
    } catch (err: any) {
      console.error("Database Insert Error:", err.message);
      res.status(500).json({ error: "Error al guardar en base de datos. Verifique los datos." });
    }
  });

  app.post("/api/provisioning/cleanup", (req, res) => {
    db.prepare("DELETE FROM provisioning WHERE lastSeen < datetime('now', '-48 hours') OR lastSeen IS NULL").run();
    res.json({ success: true });
  });

  app.patch("/api/provisioning/:id", async (req, res) => {
    const { arpEnabled, speedLimit, deviceName } = req.body;
    
    if (arpEnabled !== undefined) {
      db.prepare("UPDATE provisioning SET arpEnabled = ? WHERE id = ?").run(arpEnabled ? 1 : 0, req.params.id);
    }
    if (speedLimit !== undefined) {
      db.prepare("UPDATE provisioning SET speedLimit = ? WHERE id = ?").run(speedLimit, req.params.id);
    }
    if (deviceName !== undefined) {
      db.prepare("UPDATE provisioning SET deviceName = ? WHERE id = ?").run(deviceName, req.params.id);
    }

    const syncRes = await syncClientToMikroTik(req.params.id);
    res.json({ success: syncRes.success, error: syncRes.error });
  });

  app.put("/api/provisioning/:id/sync", async (req, res) => {
    const syncRes = await syncClientToMikroTik(req.params.id);
    res.json(syncRes);
  });

  app.delete("/api/provisioning/:id", async (req, res) => {
    const client = db.prepare("SELECT * FROM provisioning WHERE id = ?").get(req.params.id) as any;
    if (!client) return res.status(404).json({ error: "Client not found" });

    const router = db.prepare("SELECT * FROM devices WHERE id = ?").get(client.routerId) as any;
    
    // Remote Cleanup on MikroTik
    if (router && router.status === 'up') {
      let api: any = null;
      try {
        api = new RouterOSAPI({
          host: router.ip, user: router.username, password: router.password,
          port: router.apiPort || 8728, timeout: 10
        });
        await api.connect();

        // 1. Delete Lease
        const leases = await api.write('/ip/dhcp-server/lease/print', [`?address=${client.ip}`]);
        for (const l of leases) await api.write('/ip/dhcp-server/lease/remove', [`=.id=${l['.id']}`]);

        // 2. Delete ARP
        const arps = await api.write('/ip/arp/print', [`?address=${client.ip}`]);
        for (const a of arps) await api.write('/ip/arp/remove', [`=.id=${a['.id']}`]);

        // 3. Delete Queue
        const queues = await api.write('/queue/simple/print', [`?target=${client.ip}/32`]);
        for (const q of queues) await api.write('/queue/simple/remove', [`=.id=${q['.id']}`]);
        
        const qByName = await api.write('/queue/simple/print', [`?name=${client.deviceName}`]);
        for (const q of qByName) await api.write('/queue/simple/remove', [`=.id=${q['.id']}`]);

      } catch (err: any) {
        console.error(`Cleanup Error for ${client.deviceName} on router:`, err.message);
      } finally {
        if (api) { try { api.close(); } catch (e) {} }
      }
    }

    // Always delete from local DB
    db.prepare("DELETE FROM provisioning WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Client and MikroTik entries removed" });
  });

  app.post("/api/provisioning/sync-all", async (req, res) => {
    const clients = db.prepare("SELECT id FROM provisioning").all() as any[];
    console.log(`[Sync All] Iniciando sincronización masiva de ${clients.length} clientes...`);
    
    let successCount = 0;
    for (const c of clients) {
      const res = await syncClientToMikroTik(c.id);
      if (res.success) successCount++;
    }
    
    res.json({ success: true, count: successCount, total: clients.length });
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
    console.log(`[Settings] Global settings updated. Telegram Token: ${req.body.telegramBotToken ? 'Present' : 'Missing'}`);
    res.json({ success: true });
  });

  app.post("/api/test-telegram", async (req, res) => {
    const { token, chatId } = req.body;
    if (!token || !chatId) return res.status(400).json({ error: "Falta Token o Chat ID" });

    try {
      const message = "<b>✅ PRUEBA DE SISTEMA MIKROTIK</b>\nSi recibes esto, las notificaciones están configuradas correctamente.";
      const chatIds = chatId.split(',').map((id: string) => id.trim());
      
      for (const cid of chatIds) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: cid,
          text: message,
          parse_mode: 'HTML'
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Telegram Test Error]:", err.response?.data || err.message);
      res.status(500).json({ 
        error: "Error de Telegram", 
        details: err.response?.data?.description || err.message 
      });
    }
  });

  // Oracle
  app.get("/api/oracle", (req, res) => {
    res.json(getSetting("oracle") || null);
  });

  // --- Router Tools (Live from MikroTik) ---
  app.get("/api/router-tools/dhcp-leases/:deviceId", async (req, res) => {
    const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(req.params.deviceId) as any;
    if (!device || device.type !== 'router') return res.status(404).json({ error: "Router no encontrado" });

    console.log(`[Manual Sync] Explorando leases en: ${device.name}`);

    try {
      const api = new RouterOSAPI({
        host: device.ip,
        user: device.username,
        password: device.password,
        port: device.apiPort || 8728,
        timeout: 15
      });
      await api.connect();
      
      const rawLeases = await api.write('/ip/dhcp-server/lease/print');
      const rawQueues = await api.write('/queue/simple/print');
      api.close();

      const leases = Array.isArray(rawLeases) ? rawLeases : (rawLeases ? [rawLeases] : []);
      const queues = Array.isArray(rawQueues) ? rawQueues : (rawQueues ? [rawQueues] : []);

      const enrichedLeases = leases.map(lease => {
        const ip = lease.address;
        const mac = lease['mac-address'] || lease.active_mac_address || lease.mac || '00:00:00:00:00:00';
        if (!ip) return null;

        const matchingQueue = queues.find(q => String(q.target || '').includes(ip));
        const speedLimit = matchingQueue ? (matchingQueue['max-limit'] || '1M/1M') : '1M/1M';

        return { 
          ...lease, 
          address: ip, 
          mac_address: mac, 
          speedLimit,
          isProvisioned: false // Frontend will check against DB
        };
      }).filter(Boolean);

      res.json(enrichedLeases);
    } catch (err: any) {
      console.error(` MikroTik Manual Sync Error:`, err.message);
      res.status(500).json({ error: `Conexión fallida: ${err.message}. Verifique IP/Usuario/API.` });
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
    res.json(global);
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

  // --- NEW: MIKROTIK PUSH WEBHOOK (Saves bandwidth by removing polling) ---
  app.post("/api/mikrotik/webhook", async (req, res) => {
    const { resource_id, status, latency = 0, type = 'device' } = req.body;
    console.log(`[Webhook] Event Received: ${resource_id} is ${status} (${latency}ms)`);
    
    // 1. Log to DB
    const device = db.prepare("SELECT * FROM devices WHERE id = ? OR name = ?").get(resource_id, resource_id) as any;
    const deviceId = device ? device.id : resource_id;
    
    db.prepare("INSERT INTO logs (deviceId, status, latency) VALUES (?, ?, ?)").run(deviceId, status, latency);
    
    if (device) {
      db.prepare("UPDATE devices SET status = ?, lastSeen = CURRENT_TIMESTAMP WHERE id = ?").run(status, device.id);
    }

    // 2. Immediate Telegram Notify
    const settings = getSetting("global") || {};
    if (settings.telegramBotToken && settings.telegramChatId) {
       const emoji = status === 'up' ? '✅' : '🚨';
       const msg = `<b>${emoji} EVENTO DETECTADO</b>\n\n<b>Recurso:</b> ${resource_id.toUpperCase()}\n<b>Estado:</b> ${status.toUpperCase()}\n<b>Latencia:</b> ${latency}ms\n<b>Timestamp:</b> ${new Date().toISOString()}`;
       
       const chatIds = settings.telegramChatId.split(',').map((id: string) => id.trim());
       for (const cid of chatIds) {
         axios.post(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
           chat_id: cid, text: msg, parse_mode: 'HTML'
         }).catch(e => console.error("Webhook Telegram Error:", e.message));
       }
    }

    res.json({ success: true });
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

  // Monitoring Loop (Sequential processing to save memory on 1GB VPS)
  const monitorDevices = async () => {
    try {
      console.log(`[${new Date().toISOString()}] Monitor: Cycle started`);
      const settings = getSetting("global") || {};
      const { telegramBotToken, telegramChatId } = settings;
      const devices = db.prepare("SELECT * FROM devices").all() as any[];
      
      let totalNetworkRX = 0;
      let totalNetworkTX = 0;

      for (const device of devices) {
        try {
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
                }).catch(e => {});
              }
            }
          }

          // Master Sync and Stats
          if (device.type === 'router' && result.alive && device.username && device.password) {
            let api: any = null;
            try {
              api = new RouterOSAPI({
                host: device.ip,
                user: device.username,
                password: device.password,
                port: device.apiPort || 8728,
                timeout: 30
              });
              await api.connect();
              
              const rawLeases = await api.write('/ip/dhcp-server/lease/print');
              const rawQueues = await api.write('/queue/simple/print');
              const rawArps = await api.write('/ip/arp/print');
              const rawResources = await api.write('/system/resource/print');
              const rawInterfaces = await api.write('/interface/print', ['=.proplist=.id,name,comment,rx-byte,tx-byte,running,disabled,type']);
              
              const leases = Array.isArray(rawLeases) ? rawLeases : (rawLeases ? [rawLeases] : []);
              const queues = Array.isArray(rawQueues) ? rawQueues : (rawQueues ? [rawQueues] : []);
              const arps = Array.isArray(rawArps) ? rawArps : (rawArps ? [rawArps] : []);
              const resources = Array.isArray(rawResources) ? rawResources : (rawResources ? [rawResources] : []);
              const interfacesList = Array.isArray(rawInterfaces) ? rawInterfaces : (rawInterfaces ? [rawInterfaces] : []);
              
              const leaseData = leases.map(lease => {
                try {
                  const ip = lease.address;
                  const mac = lease['mac-address'] || lease.mac_address || lease['active-mac-address'] || lease.mac || '00:00:00:00:00:00';
                  
                  if (!ip) return null;

                  const routerComment = lease.comment || '';
                  const routerHost = lease['host-name'] || lease.host_name || '';
                  const finalName = routerComment || routerHost || `Client ${ip}`;

                  // Match Queue
                  const matchingQueue = queues.find(q => {
                    const target = String(q.target || '');
                    const qName = String(q.name || '');
                    const qComment = String(q.comment || '');
                    return target.includes(ip) || (routerComment && (qName === routerComment || qComment === routerComment));
                  });
                  
                  const speedLimit = matchingQueue ? (matchingQueue['max-limit'] || matchingQueue.max_limit || '1M/1M') : '1M/1M';
                  
                  // Match ARP
                  const matchingArp = arps.find(a => a.address === ip);
                  const arpEnabled = (matchingArp && String(matchingArp.disabled) === 'false') ? 1 : 0;
                  
                  return { mac, ip, finalName, speedLimit, arpEnabled };
                } catch (e) {
                  return null;
                }
              }).filter(Boolean);

              // Process each lease sync inside a transaction for efficiency
              const syncTransaction = db.transaction((items) => {
                for (const item of items) {
                  try {
                    const existing = db.prepare("SELECT id FROM provisioning WHERE mac = ? AND routerId = ?").get(item.mac, device.id) as any;
                    const id = existing?.id || Math.random().toString(36).substring(7);
                    
                    db.prepare(`
                      INSERT OR REPLACE INTO provisioning (id, ip, mac, deviceName, routerId, speedLimit, interfaceName, arpEnabled, lastSeen)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `).run(id, item.ip, item.mac, item.finalName, device.id, item.speedLimit, 'SALIDA', item.arpEnabled);
                  } catch (itemErr) {
                    // Fail silently for single item
                  }
                }
              });

              syncTransaction(leaseData);
              console.log(`[${new Date().toISOString()}] Monitor: Synced ${leaseData.length} clients from ${device.name}`);

              // Router Stats
              if (resources.length > 0) {
                const data = resources[0];
                const cpu = parseFloat(data['cpu-load'] || '0');
                const ram = parseFloat(data['free-memory'] || '0') / 1024 / 1024;
                const totalRam = parseFloat(data['total-memory'] || '0') / 1024 / 1024;
                db.prepare(`INSERT OR REPLACE INTO router_stats (deviceId, cpuUsage, ramFree, ramTotal, uptime, lastUpdate) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(device.id, cpu, ram, totalRam, data['uptime'] || '');
                db.prepare(`INSERT INTO resource_history (deviceId, cpuUsage, ramFree) VALUES (?, ?, ?)`).run(device.id, cpu, ram);
              }

              // Interface Traffic & WAN Monitoring
              const now = Date.now();
              const wanStatus: any = {};
              
              for (const iface of interfacesList) {
                const nameUC = (iface.name || '').toUpperCase();
                const commentUC = (iface.comment || '').toUpperCase();

                const isWan1 = nameUC.includes("WAN1") || nameUC.includes("AIRTEK") || commentUC.includes("WAN1") || commentUC.includes("AIRTEK");
                const isWan2 = nameUC.includes("WAN2") || nameUC.includes("INTER") || commentUC.includes("WAN2") || commentUC.includes("INTER");
                
                // Traffic calculation (handling both singular and plural from different ROS versions)
                const id = `${device.id}_${iface.name}`;
                const rxBytes = parseFloat(iface['rx-byte'] || iface['rx-bytes'] || iface['rx_byte'] || '0');
                const txBytes = parseFloat(iface['tx-byte'] || iface['tx-bytes'] || iface['tx_byte'] || '0');
                let mbpsIn = 0, mbpsOut = 0;
                const lastData = lastBytesStore.get(id);
                if (lastData) {
                  const seconds = (now - lastData.time) / 1000;
                  if (seconds > 0) {
                    mbpsIn = Math.max(0, ((rxBytes - lastData.rx) * 8) / (seconds * 1024 * 1024));
                    mbpsOut = Math.max(0, ((txBytes - lastData.tx) * 8) / (seconds * 1024 * 1024));
                  }
                }
                lastBytesStore.set(id, { rx: rxBytes, tx: txBytes, time: now });
                const currentStatus = iface.running === 'true' ? 'up' : 'down';
                
                // Debug log for traffic
                if (rxBytes > 0 || txBytes > 0) {
                  console.log(`[Traffic Debug] ${device.name} -> ${iface.name}: RX=${rxBytes}, TX=${txBytes} (Calculated: ${mbpsIn.toFixed(2)} Mbps In, ${mbpsOut.toFixed(2)} Mbps Out)`);
                }
                
                // Dashboard Traffic Logic (Sum "SALIDA", "BRIDGE", "LOCAL", "LAN" or "ETHER" if running)
                const isLocal = nameUC.includes("SALIDA") || nameUC.includes("BRIDGE") || nameUC.includes("LOCAL") || nameUC.includes("LAN") || 
                                (nameUC.includes("ETHER") && iface.running === 'true' && !isWan1 && !isWan2);
                
                const ifaceTrafficWeight = isLocal ? 1 : 0;
                if (ifaceTrafficWeight > 0) {
                  totalNetworkRX += mbpsIn;
                  totalNetworkTX += mbpsOut;
                }
                
                // WAN Specific Logic
                if (isWan1 || isWan2) {
                  const wanKey = isWan1 ? "WAN1" : "WAN2";
                  const wanPrettyName = isWan1 ? "AIRTEK" : "INTER";
                  const combinedTraffic = mbpsIn + mbpsOut;
                  wanStatus[wanKey] = { 
                    status: currentStatus, 
                    name: wanPrettyName, 
                    interface: iface.name, 
                    traffic: combinedTraffic,
                    trafficStr: combinedTraffic < 1 ? `${(combinedTraffic * 1024).toFixed(1)} kbps` : `${combinedTraffic.toFixed(2)} Mbps`
                  };

                  console.log(`[WAN Monitor] Identified ${wanKey} (${wanPrettyName}) on interface: ${iface.name} [Traffic: ${(mbpsIn + mbpsOut).toFixed(2)} Mbps]`);

                  // Detect Change for Telegram
                  const lastWanStates = getSetting("wan_states") || {};
                  const lastState = lastWanStates[`${device.id}_${wanKey}`];
                  
                  if (lastState && lastState !== currentStatus) {
                    if (telegramBotToken && telegramChatId) {
                      const icon = currentStatus === 'up' ? '✅' : '❌';
                      const message = `<b>${icon} ESTADO WAN: ${wanPrettyName}</b>\nNuevo Estado: ${currentStatus.toUpperCase()}\nRouter: ${device.name}`;
                      const chatIds = telegramChatId.split(',').map((id: string) => id.trim());
                      for (const cid of chatIds) {
                        axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                          chat_id: cid,
                          text: message,
                          parse_mode: 'HTML'
                        }).catch(() => {});
                      }
                    }
                  }
                  lastWanStates[`${device.id}_${wanKey}`] = currentStatus;
                  setSetting("wan_states", lastWanStates);
                }

                db.prepare(`INSERT OR REPLACE INTO interfaces (id, deviceId, name, status, trafficIn, trafficOut, lastUpdate) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(id, device.id, iface.name, currentStatus, mbpsIn, mbpsOut);
                db.prepare(`INSERT INTO traffic_history (deviceId, interfaceName, trafficIn, trafficOut) VALUES (?, ?, ?, ?)`).run(device.id, iface.name, mbpsIn, mbpsOut);
              }

              // DNS Latency Tests per WAN (8.8.8.8 via WAN1, 9.9.9.9 via WAN2)
              if (api && Object.keys(wanStatus).length > 0) {
                try {
                  const pingResults: any = {};
                  if (wanStatus.WAN1 && wanStatus.WAN1.status === 'up') {
                    const ping1 = await api.write('/ping', [`=address=8.8.8.8`, `=count=1`, `=interface=${wanStatus.WAN1.interface}`]);
                    const time = ping1[0]?.time;
                    if (time) {
                      // ROS 6.x sometimes returns "XXms", parseFloat handles it.
                      // If it's already in ms, we don't multiply by 1000 unless it's in seconds.
                      // Usually ROS API returns raw seconds or ms string.
                      const val = parseFloat(time);
                      pingResults.wan1 = time.includes('ms') ? val : val * 1000;
                    }
                  }
                  if (wanStatus.WAN2 && wanStatus.WAN2.status === 'up') {
                    const ping2 = await api.write('/ping', [`=address=9.9.9.9`, `=count=1`, `=interface=${wanStatus.WAN2.interface}`]);
                    const time = ping2[0]?.time;
                    if (time) {
                      const val = parseFloat(time);
                      pingResults.wan2 = time.includes('ms') ? val : val * 1000;
                    }
                  }
                  
                  const globalState = getSetting("global") || {};
                  setSetting("global", { 
                    ...globalState, 
                    wan1Latency: pingResults.wan1 || 0,
                    wan2Latency: pingResults.wan2 || 0,
                    googleLatency: pingResults.wan1 || pingResults.wan2 || 0, // Fallback for overall
                    googleLatSource: device.name
                  });
                } catch (pingErr) {
                  console.error("DNS Ping Error:", pingErr);
                }
              }

              // Failover Alert Logic (Update even if only 1 WAN is found)
              if (Object.keys(wanStatus).length > 0) {
                const globalState = getSetting("global") || {};
                const currentWanInfo = { ...wanStatus, updatedAt: now };
                
                if (wanStatus.WAN1 && wanStatus.WAN2) {
                  if (wanStatus.WAN1.status === 'down' && wanStatus.WAN2.status === 'up') {
                    currentWanInfo.alert = "WAN1 (AIRTEK) CAÍDA - WAN2 (INTER) ASUMIÓ TODA LA RED";
                  } else if (wanStatus.WAN2.status === 'down' && wanStatus.WAN1.status === 'up') {
                    currentWanInfo.alert = "WAN2 (INTER) CAÍDA - WAN1 (AIRTEK) ASUMIÓ TODA LA RED";
                  }
                }
                
                setSetting("global", { ...globalState, wanStatus: currentWanInfo });
              }

            } catch (apiErr: any) {
              console.error(` MikroTik Sync Error (${device.name}):`, apiErr.message);
            } finally {
              if (api) {
                try { api.close(); } catch (e) {}
              }
            }
          }
        } catch (deviceErr) {
          console.error(` Device Monitor Error (${device.name}):`, deviceErr);
        }
      }

      // Cleanup & Global Stats
      db.prepare("DELETE FROM traffic_history WHERE timestamp < datetime('now', '-7 days')").run();
      db.prepare("DELETE FROM resource_history WHERE timestamp < datetime('now', '-7 days')").run();
      
      // Cleanup stale provisioning entries (not seen in 7 days and NOT manual entries)
      db.prepare("DELETE FROM provisioning WHERE lastSeen < datetime('now', '-7 days')").run();
      
      // Global Stats Fallback (only if no router-based latency was set)
      const currentStats = getSetting("global") || {};
      if (!currentStats.googleLatency || currentStats.googleLatency === 0) {
        const res = await pingHost("8.8.8.8");
        setSetting("global", { ...currentStats, googleLatency: Math.round(res.time), googleLatSource: "VPS (Fallback)" });
      }

      setSetting("global", { 
        ...getSetting("global"), 
        totalTrafficIn: totalNetworkRX, 
        totalTrafficOut: totalNetworkTX 
      });

      console.log(`[${new Date().toISOString()}] Monitor: Cycle finished. Total Net: ${totalNetworkRX.toFixed(2)} / ${totalNetworkTX.toFixed(2)} Mbps`);
    } catch (err: any) {
      console.error("Critical Monitor error:", err.message);
    }
  };

  // Vite setup
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite Dev Server...");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ EXITO: Servidor escuchando en puerto ${PORT}`);
    console.log(`🤖 Modo: ${process.env.NODE_ENV === 'production' ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
    
    // Monitoring Loop pulse
    const runMonitorPulse = async () => {
      await monitorDevices();
      setTimeout(runMonitorPulse, 300000); // Pulse every 5 minutes (300s)
    };

    // Start background tasks AFTER server is listening
    console.log(`📊 Iniciando monitoreo MikroTik en 2 segundos...`);
    setTimeout(runMonitorPulse, 2000);
  });
} catch (fatalErr: any) {
  console.error("❌ ERROR FATAL AL INICIAR SERVIDOR:", fatalErr.message);
  process.exit(1);
}
}

startServer();
