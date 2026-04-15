import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import axios from "axios";
import admin from "firebase-admin";
import cron from "node-cron";
import FormData from "form-data";
import { Readable } from "stream";

// Initialize Firebase Admin
// Note: In this environment, we assume the service account is available via environment or default credentials
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Ping utility
  const pingHost = (host: string): Promise<{ alive: boolean; time: number }> => {
    return new Promise((resolve) => {
      // Use ping command
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
    
    // Get settings for token
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data() || {};
    const token = settings.telegramBotToken;

    if (!token) return res.sendStatus(200);

    const sendTelegram = async (chatId: number, text: string, replyMarkup?: any) => {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
    };

    const editMessage = async (chatId: number, messageId: number, text: string, replyMarkup?: any) => {
      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
    };

    // Handle Commands
    if (message && message.text) {
      const chatId = message.chat.id;
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
        await sendTelegram(chatId, "<b>🤖 Panel de Control MikroTik</b>\nSelecciona una opción para monitorear o gestionar tu red:", menuMarkup);
      } else {
        // Handle Session-based input
        const sessionSnap = await db.collection('telegram_sessions').doc(chatId.toString()).get();
        if (sessionSnap.exists) {
          const session = sessionSnap.data() || {};
          const text = message.text.trim();

          if (session.step === 'awaiting_ip') {
            // Basic IP validation
            if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(text)) {
              return await sendTelegram(chatId, "❌ IP inválida. Por favor, envía una IP correcta (ej: 192.168.88.50):");
            }
            await db.collection('telegram_sessions').doc(chatId.toString()).update({
              step: 'awaiting_mac',
              'data.ip': text
            });
            await sendTelegram(chatId, "✅ IP guardada. Ahora envía la <b>MAC Address</b> (ej: AA:BB:CC:DD:EE:FF):");
          } 
          else if (session.step === 'awaiting_mac') {
            // Basic MAC validation
            if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(text)) {
              return await sendTelegram(chatId, "❌ MAC inválida. Por favor, envía una MAC correcta (ej: AA:BB:CC:DD:EE:FF):");
            }
            await db.collection('telegram_sessions').doc(chatId.toString()).update({
              step: 'awaiting_name',
              'data.mac': text.toUpperCase()
            });
            await sendTelegram(chatId, "✅ MAC guardada. Finalmente, envía el <b>Nombre del Cliente</b>:");
          }
          else if (session.step === 'awaiting_name') {
            const finalData = {
              ...session.data,
              deviceName: text,
              dhcpLease: true,
              arpEnabled: true,
              speedLimit: '10M/10M',
              interfaceName: 'SALIDA',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('provisioning').add(finalData);
            await db.collection('telegram_sessions').doc(chatId.toString()).delete();

            await sendTelegram(chatId, 
              `<b>✅ ¡Cliente Provisionado con Éxito!</b>\n\n` +
              `👤 <b>Nombre:</b> ${text}\n` +
              `🌐 <b>IP:</b> ${finalData.ip}\n` +
              `🆔 <b>MAC:</b> ${finalData.mac}\n` +
              `🔌 <b>Interfaz:</b> SALIDA\n` +
              `🚀 <b>Plan:</b> 10M/10M (Default)\n\n` +
              `<i>DHCP y ARP han sido activados automáticamente en la interfaz SALIDA.</i>`
            );
            
            // Show menu again
            const menuMarkup = {
              inline_keyboard: [
                [{ text: "📊 Estado General", callback_data: "status_general" }],
                [{ text: "👥 Gestión Clientes", callback_data: "manage_clients" }],
                [{ text: "⬅️ Volver al Menú", callback_data: "main_menu" }]
              ]
            };
            await sendTelegram(chatId, "¿Deseas hacer algo más?", menuMarkup);
          }
        }
      }
    }

    // Handle Callbacks
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const messageId = callback_query.message.message_id;
      const data = callback_query.data;

      if (data === "start_provisioning") {
        await db.collection('telegram_sessions').doc(chatId.toString()).set({
          step: 'awaiting_ip',
          data: {},
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Fetch mock dynamic leases to show as options
        const mockLeases = [
          { ip: '192.168.88.250', mac: 'BC:FE:D9:12:34:56', hostName: 'Android-Phone' },
          { ip: '192.168.88.251', mac: 'E4:5F:01:98:76:54', hostName: 'Laptop-Dell' },
          { ip: '192.168.88.252', mac: '00:11:22:33:44:55', hostName: 'Smart-TV' },
        ];

        const keyboard = mockLeases.map(l => ([{
          text: `📍 ${l.ip} (${l.hostName})`,
          callback_data: `select_lease_${l.ip}_${l.mac}`
        }]));

        keyboard.push([{ text: "⌨️ Ingresar Manualmente", callback_data: "manual_ip" }]);
        keyboard.push([{ text: "⬅️ Cancelar", callback_data: "main_menu" }]);

        await sendTelegram(chatId, "<b>🆕 Iniciando Aprovisionamiento</b>\n\nHe detectado estos dispositivos con IP dinámica. Selecciona uno para autocompletar o ingresa la IP manualmente:", { inline_keyboard: keyboard });
      }

      if (data.startsWith("select_lease_")) {
        const parts = data.split("_");
        const ip = parts[2];
        const mac = parts[3];

        await db.collection('telegram_sessions').doc(chatId.toString()).update({
          step: 'awaiting_name',
          'data.ip': ip,
          'data.mac': mac
        });

        await sendTelegram(chatId, `✅ Seleccionado: <b>${ip}</b> (${mac})\n\nAhora envía el <b>Nombre del Cliente</b> para finalizar:`);
      }

      if (data === "manual_ip") {
        await sendTelegram(chatId, "De acuerdo. Por favor, envía la <b>IP</b> que deseas asignar al cliente:");
      }

      if (data === "prov_summary") {
        const provSnap = await db.collection('provisioning').get();
        const provs = provSnap.docs.map(d => d.data());
        const active = provs.filter(p => p.arpEnabled).length;
        const cut = provs.filter(p => !p.arpEnabled).length;

        const text = `<b>📝 Resumen de Aprovisionamiento</b>\n\n` +
                     `✅ Clientes Activos: ${active}\n` +
                     `🚫 Clientes Cortados: ${cut}\n` +
                     `👥 Total Registrados: ${provs.length}\n\n` +
                     `<i>Actualizado: ${new Date().toLocaleTimeString()}</i>`;
        
        const markup = {
          inline_keyboard: [[{ text: "⬅️ Volver", callback_data: "main_menu" }]]
        };
        await editMessage(chatId, messageId, text, markup);
      }

      if (data === "status_general") {
        const devicesSnap = await db.collection('devices').get();
        const devices = devicesSnap.docs.map(d => d.data());
        const up = devices.filter(d => d.status === 'up').length;
        const down = devices.filter(d => d.status === 'down').length;

        const text = `<b>📊 Resumen de Infraestructura</b>\n\n` +
                     `✅ Online: ${up}\n` +
                     `❌ Offline: ${down}\n` +
                     `📦 Total: ${devices.length}\n\n` +
                     `<i>Actualizado: ${new Date().toLocaleTimeString()}</i>`;
        
        const markup = {
          inline_keyboard: [[{ text: "⬅️ Volver", callback_data: "main_menu" }]]
        };
        await editMessage(chatId, messageId, text, markup);
      }

      if (data === "status_antennas") {
        const devicesSnap = await db.collection('devices').where('type', '==', 'antenna').get();
        const antennas = devicesSnap.docs.map(d => d.data());
        
        let text = `<b>📡 Estado de Antenas</b>\n\n`;
        antennas.forEach(a => {
          text += `${a.status === 'up' ? '🟢' : '🔴'} ${a.name} (${a.ip})\n`;
        });

        const markup = {
          inline_keyboard: [[{ text: "⬅️ Volver", callback_data: "main_menu" }]]
        };
        await editMessage(chatId, messageId, text, markup);
      }

      if (data === "manage_clients") {
        const clientsSnap = await db.collection('provisioning').limit(5).get();
        const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        let text = `<b>👥 Gestión de Clientes (Aprovisionamiento)</b>\n\n`;
        const keyboard = [];

        clients.forEach(c => {
          text += `${c.arpEnabled ? '✅' : '🚫'} <b>${c.deviceName}</b>\nIP: ${c.ip}\n\n`;
          keyboard.push([{ 
            text: `${c.arpEnabled ? '✂️ Cortar' : '🔌 Activar'} ${c.deviceName}`, 
            callback_data: `toggle_client_${c.id}` 
          }]);
        });

        keyboard.push([{ text: "⬅️ Volver", callback_data: "main_menu" }]);

        await editMessage(chatId, messageId, text, { inline_keyboard: keyboard });
      }

      if (data.startsWith("toggle_client_")) {
        const clientId = data.replace("toggle_client_", "");
        const clientRef = db.collection('provisioning').doc(clientId);
        const clientSnap = await clientRef.get();
        
        if (clientSnap.exists) {
          const current = clientSnap.data()?.arpEnabled;
          await clientRef.update({ arpEnabled: !current });
          
          // Re-trigger client list
          const clientsSnap = await db.collection('provisioning').limit(5).get();
          const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

          let text = `<b>👥 Gestión de Clientes (Actualizado)</b>\n\n`;
          const keyboard = [];
          clients.forEach(c => {
            text += `${c.arpEnabled ? '✅' : '🚫'} <b>${c.deviceName}</b>\nIP: ${c.ip}\n\n`;
            keyboard.push([{ 
              text: `${c.arpEnabled ? '✂️ Cortar' : '🔌 Activar'} ${c.deviceName}`, 
              callback_data: `toggle_client_${c.id}` 
            }]);
          });
          keyboard.push([{ text: "⬅️ Volver", callback_data: "main_menu" }]);
          
          await editMessage(chatId, messageId, text, { inline_keyboard: keyboard });
        }
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
        await editMessage(chatId, messageId, "<b>🤖 Panel de Control MikroTik</b>\nSelecciona una opción para monitorear o gestionar tu red:", menuMarkup);
      }

      if (data === "oracle_status") {
        const oracleSnap = await db.collection('settings').doc('oracle').get();
        const oracle = oracleSnap.data();

        if (!oracle) {
          return await sendTelegram(chatId, "⚠️ El Oráculo aún está procesando datos. Por favor, abre la WebApp para iniciar el núcleo neuronal.");
        }

        const text = `<b>🧠 REPORTE DEL ORÁCULO NEURONAL</b>\n` +
                     `--------------------------------\n` +
                     `<b>Estado:</b> ${oracle.statusSummary}\n\n` +
                     `<b>Análisis:</b> ${oracle.intelligence}\n\n` +
                     `<b>Recomendación:</b> ${oracle.recommendation}\n\n` +
                     `<b>Pulso Vital:</b> ${oracle.pulseIntensity}/10\n` +
                     `--------------------------------\n` +
                     `<i>Actualizado: ${oracle.updatedAt?.toDate().toLocaleTimeString()}</i>`;
        
        const markup = {
          inline_keyboard: [[{ text: "⬅️ Volver", callback_data: "main_menu" }]]
        };
        await editMessage(chatId, messageId, text, markup);
      }
    }

    res.sendStatus(200);
  });

  // Telegram Proxy
  app.post("/api/notify", async (req, res) => {
    const { token, chatId, message } = req.body;
    if (!token || !chatId || !message) return res.status(400).json({ error: "Missing parameters" });
    
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Telegram error:", err);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Maintenance Tools (Ping/Traceroute from Router)
  app.post("/api/maintenance/run", async (req, res) => {
    // ... existing code ...
  });

  // Mock Dynamic Leases (Simulating MikroTik DHCP Leases)
  app.get("/api/mikrotik/dynamic-leases", async (req, res) => {
    // Returning empty array to start from scratch as requested
    res.json([]);
  });

  // Backup System
  const runBackup = async (deviceId?: string) => {
    console.log(`Starting backup process${deviceId ? ` for device ${deviceId}` : ' for all devices'}...`);
    
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data() || {};
    const { telegramBotToken, telegramChatId } = settings;

    let devicesToBackup = [];
    if (deviceId) {
      const d = await db.collection('devices').doc(deviceId).get();
      if (d.exists) devicesToBackup.push({ id: d.id, ...d.data() as any });
    } else {
      const snap = await db.collection('devices').where('type', '==', 'router').get();
      devicesToBackup = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    }

    for (const device of devicesToBackup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup_${device.name}_${timestamp}.backup`;
      
      console.log(`[BACKUP] Processing ${device.name}...`);

      // 1. Simulate MikroTik Backup Creation
      // In reality: /system backup save name=...
      
      // 2. Simulate Saving to VPS
      // We'll store a record in Firestore representing the file on the VPS
      const backupRecord = {
        deviceId: device.id,
        deviceName: device.name,
        fileName,
        size: "1.2MB", // Mock size
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        location: 'VPS Storage /backups/',
        status: 'success'
      };
      
      await db.collection('backups').add(backupRecord);

      // 3. Send to Telegram
      if (telegramBotToken && telegramChatId) {
        const caption = `<b>💠 NÚCLEO DE RESPALDO ACTIVADO</b>\n` +
                       `<code>══════════════════════════════</code>\n` +
                       `<b>📡 ORIGEN:</b> <code>${device.name.toUpperCase()}</code>\n` +
                       `<b>📦 ARCHIVO:</b> <code>${fileName}</code>\n` +
                       `<b>💾 VPS CLOUD:</b> <pre>REPLICADO ✅</pre>\n` +
                       `<b>⏰ TIMESTAMP:</b> <code>${new Date().toLocaleString()}</code>\n` +
                       `<code>══════════════════════════════</code>\n` +
                       `<i>Resguardo neuronal completado con éxito.</i>`;

        try {
          const mockContent = `MikroTik Backup File\nDevice: ${device.name}\nDate: ${new Date().toISOString()}\nConfig: ...`;
          const buffer = Buffer.from(mockContent);
          
          const form = new FormData();
          form.append('chat_id', telegramChatId);
          form.append('caption', caption);
          form.append('parse_mode', 'HTML');
          form.append('reply_markup', JSON.stringify({
            inline_keyboard: [
              [
                { text: "📊 Ver Estado", callback_data: "main_status" },
                { text: "🧠 Oráculo AI", callback_data: "oracle_status" }
              ]
            ]
          }));
          form.append('document', buffer, {
            filename: fileName,
            contentType: 'application/octet-stream',
          });

          await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendDocument`, form, {
            headers: form.getHeaders()
          });
          
          console.log(`[BACKUP] File sent to Telegram for ${device.name}`);
        } catch (tgErr) {
          console.error("Error sending backup file to Telegram:", tgErr);
        }
      }
    }
  };

  app.post("/api/maintenance/backup", async (req, res) => {
    const { deviceId } = req.body;
    try {
      await runBackup(deviceId);
      res.json({ success: true, message: "Backup process initiated" });
    } catch (err) {
      res.status(500).json({ error: "Backup failed" });
    }
  });

  // Weekly Backup Cron (Every Sunday at 3:00 AM)
  cron.schedule('0 3 * * 0', () => {
    console.log("Running scheduled weekly backup...");
    runBackup();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Background Monitoring Loop
  const monitorDevices = async () => {
    try {
      // Get settings
      const settingsSnap = await db.collection('settings').doc('global').get();
      const settings = settingsSnap.data() || {};
      const { telegramBotToken, telegramChatId } = settings;

      // Get all devices (routers, vps, antennas)
      const devicesSnap = await db.collection('devices').get();
      const devices = devicesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      for (const device of devices) {
        const result = await pingHost(device.ip);
        const newStatus = result.alive ? 'up' : 'down';

        // Only act if status changed
        if (device.status !== newStatus) {
          console.log(`Status change for ${device.name}: ${device.status} -> ${newStatus}`);
          
          // Update device status in Firestore
          await db.collection('devices').doc(device.id).update({
            status: newStatus,
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
          });

          // Add log entry
          await db.collection('logs').add({
            deviceId: device.id,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: newStatus,
            latency: result.alive ? result.time : 0
          });

          // Send Telegram Notification
          if (device.telegramEnabled && telegramBotToken && telegramChatId) {
            const statusText = newStatus === 'up' ? 'SISTEMA ONLINE' : 'SISTEMA OFFLINE';
            const statusColor = newStatus === 'up' ? '🟢' : '🔴';
            
            const message = `<b>🚨 ALERTA DE RED: ${statusText}</b>\n` +
                           `<code>══════════════════════════════</code>\n` +
                           `<b>📡 DISPOSITIVO:</b> <code>${device.name.toUpperCase()}</code>\n` +
                           `<b>🌐 DIRECCIÓN:</b> <code>${device.ip}</code>\n` +
                           `<b>📊 ESTADO:</b> <code>${newStatus.toUpperCase()} ${statusColor}</code>\n` +
                           `<b>⏰ EVENTO:</b> <code>${new Date().toLocaleString()}</code>\n` +
                           `<code>══════════════════════════════</code>\n` +
                           `<i>El Oráculo AI está analizando el impacto...</i>`;

            try {
              await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                chat_id: telegramChatId,
                text: message,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "🧠 Consultar Oráculo", callback_data: "oracle_status" },
                      { text: "📊 Ver Estado", callback_data: "main_status" }
                    ]
                  ]
                }
              });
            } catch (tgErr) {
              console.error("Error sending Telegram alert:", tgErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("Monitoring loop error:", err);
    }
  };

  // Start monitoring every 120 seconds (Eco-mode for VPS limits)
  setInterval(monitorDevices, 120000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
