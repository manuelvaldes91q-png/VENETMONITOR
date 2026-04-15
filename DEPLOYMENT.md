# 🚀 Guía de Instalación en Google Cloud VPS

Esta guía te ayudará a instalar el **MikroTik Monitor & AI Oracle** en tu VPS de Google Cloud.

## 1. Requisitos Previos

Asegúrate de tener instalado lo siguiente en tu VPS (Ubuntu recomendado):

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js (Versión 20 o superior)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 para mantener la app corriendo 24/7
sudo npm install -g pm2
```

## 2. Preparar el Proyecto

1. **Sube los archivos** a tu VPS usando SCP, SFTP o Git.
2. **Entra a la carpeta** del proyecto:
   ```bash
   cd /ruta/de/tu/proyecto
   ```
3. **Instala las dependencias**:
   ```bash
   npm install
   ```

## 3. Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
nano .env
```

Pega y completa los siguientes datos:

```env
# Puerto de la aplicación
PORT=3000

# Configuración de Firebase (Copia esto de tu consola de Firebase)
FIREBASE_PROJECT_ID=tu-proyecto-id
FIREBASE_CLIENT_EMAIL=tu-email-de-servicio@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# API Key de Gemini (Google AI)
GEMINI_API_KEY=tu_api_key_aqui

# URL de tu App (Para el Webhook de Telegram)
APP_URL=http://tu_ip_publica:3000
```

## 4. Construcción y Ejecución

1. **Construye el Frontend**:
   ```bash
   npm run build
   ```

2. **Inicia el Servidor con PM2**:
   ```bash
   pm2 start server.ts --interpreter tsx --name "mikrotik-monitor"
   ```

3. **Configura PM2 para que inicie al reiniciar el VPS**:
   ```bash
   pm2 startup
   pm2 save
   ```

## 5. Configuración del Firewall en Google Cloud

Para que puedas acceder a la web y que Telegram pueda enviar mensajes, debes abrir el puerto **3000**:

1. Ve a la consola de Google Cloud -> **VPC Network** -> **Firewall**.
2. Haz clic en **Create Firewall Rule**.
3. Nombre: `allow-mikrotik-monitor`.
4. Targets: **All instances in the network**.
5. Source IP ranges: `0.0.0.0/0`.
6. Protocols and ports: Selecciona **TCP** y escribe `3000`.
7. Haz clic en **Create**.

## 6. Configuración Final del Bot

1. Abre tu aplicación en el navegador: `http://tu_ip_vps:3000`.
2. Ve a la pestaña **Configuración**.
3. Ingresa tu **Bot Token** y **Chat ID**.
4. Haz clic en **"Configurar Webhook Automáticamente"**.

---
**¡Listo!** Tu sistema ahora está vigilando tu red MikroTik desde la nube de Google de forma eficiente.
