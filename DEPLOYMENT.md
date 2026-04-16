# 🚀 Guía de Instalación en Google Cloud VPS (Modo Local SQLite)

Esta guía te ayudará a instalar el **VENET MONITOR** en tu VPS de Google Cloud usando una base de datos local, sin necesidad de Firebase.

## 1. Requisitos Previos

Asegúrate de tener instalado lo siguiente en tu VPS (Ubuntu recomendado):

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js (Versión 20 o superior)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar herramientas de compilación (necesarias para SQLite)
sudo apt-get install -y build-essential python3

# Instalar PM2 para mantener la app corriendo 24/7
sudo npm install -g pm2
```

## 2. Preparar el Proyecto

1. **Clona tu repositorio** o sube los archivos:
   ```bash
   git clone https://github.com/tu-usuario/VENETMONITOR.git
   cd VENETMONITOR
   ```
2. **Instala las dependencias**:
   ```bash
   npm install
   ```

## 3. Configuración de Variables de Env

Crea un archivo `.env` en la raíz del proyecto:

```bash
nano .env
```

Pega lo siguiente:

```env
# Puerto de la aplicación
PORT=3000

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
   pm2 start server.ts --interpreter tsx --name "venet-monitor"
   ```

3. **Configura PM2 para el reinicio**:
   ```bash
   pm2 startup
   pm2 save
   ```

## 5. Configuración del Firewall en Google Cloud

**IMPORTANTE:** Debes abrir el puerto **3000** en la consola de Google Cloud:
1. Ve a **VPC Network** -> **Firewall**.
2. Crea una regla llamada `allow-venet`.
3. Source IP: `0.0.0.0/0`.
4. Protocols/Ports: **TCP 3000**.

## 6. Acceso al Sistema

1. Abre `http://tu_ip_vps:3000` en tu navegador.
2. La contraseña por defecto es: `admin123`.
3. Ve a **Configuración** para poner tu Token de Telegram.

---
**¡Listo!** Tu sistema ahora es 100% independiente y corre localmente en tu VPS.
