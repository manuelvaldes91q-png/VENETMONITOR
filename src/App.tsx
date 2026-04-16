import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Wifi, 
  Server, 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Bell, 
  BellOff, 
  Activity,
  LogOut,
  ShieldCheck,
  Network,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Terminal,
  Cpu,
  Brain,
  Sparkles,
  Zap,
  MessageSquare,
  Database,
  Download,
  History,
  Lock
} from 'lucide-react';
import { analyzeNetworkHealth } from './services/geminiService';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast, Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { format } from 'date-fns';

// --- Types ---
interface Device {
  id: string;
  name: string;
  type: 'antenna' | 'vps' | 'router';
  ip: string;
  apiPort?: number;
  username?: string;
  password?: string;
  mac?: string;
  status: 'up' | 'down';
  lastSeen?: string;
  telegramEnabled: boolean;
}

interface MonitoringLog {
  id: string;
  deviceId: string;
  timestamp: string;
  status: 'up' | 'down';
  latency: number;
}

interface Provisioning {
  id: string;
  ip: string;
  mac: string;
  deviceName: string;
  dhcpLease: boolean;
  arpEnabled: boolean;
  speedLimit: string;
  interfaceName: string;
  createdAt: string;
}

interface AppSettings {
  telegramBotToken: string;
  telegramChatId: string;
}

// --- Components ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<MonitoringLog[]>([]);
  const [provisioning, setProvisioning] = useState<Provisioning[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ telegramBotToken: '', telegramChatId: '' });
  const [oracleData, setOracleData] = useState<any>(null);
  const [oracleLoading, setOracleLoading] = useState(false);

  // Auth check (Simple local storage for demo/VPS)
  useEffect(() => {
    const saved = localStorage.getItem('venet_auth');
    if (saved === 'true') setIsLoggedIn(true);
  }, []);

  const handleLogin = () => {
    // In a real VPS, you'd check this against an env var or DB
    // For now, we'll use a simple "admin123" or similar
    if (password === 'admin123') {
      setIsLoggedIn(true);
      localStorage.setItem('venet_auth', 'true');
      toast.success("Bienvenido al sistema local");
    } else {
      toast.error("Contraseña incorrecta");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('venet_auth');
  };

  // Data Fetching
  const fetchData = async () => {
    try {
      const [devsRes, logsRes, provRes, setRes, oracleRes] = await Promise.all([
        axios.get('/api/devices'),
        axios.get('/api/logs'),
        axios.get('/api/provisioning'),
        axios.get('/api/settings'),
        axios.get('/api/oracle')
      ]);
      setDevices(devsRes.data);
      setLogs(logsRes.data);
      setProvisioning(provRes.data);
      setSettings(setRes.data);
      setOracleData(oracleRes.data);
    } catch (err) {
      console.error("Fetch error", err);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      const interval = setInterval(fetchData, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  // Oracle AI Analysis
  useEffect(() => {
    if (!isLoggedIn || devices.length === 0) return;

    const runAnalysis = async () => {
      setOracleLoading(true);
      const data = await analyzeNetworkHealth(devices, logs);
      if (data) {
        setOracleData(data);
        await axios.post('/api/oracle', data);
      }
      setOracleLoading(false);
    };

    // Run every 30 mins
    const interval = setInterval(runAnalysis, 1800000);
    return () => clearInterval(interval);
  }, [isLoggedIn, devices.length]);

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 bg-[#111] border border-[#262626] rounded-2xl shadow-2xl text-center"
        >
          <div className="mb-6 flex justify-center">
            <div className="p-4 bg-blue-500/10 rounded-full">
              <Lock className="w-12 h-12 text-blue-500" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">VENET MONITOR</h1>
          <p className="text-gray-400 mb-8">Base de datos local (SQLite) activada.</p>
          <div className="space-y-4">
            <Input 
              type="password" 
              placeholder="Contraseña del Administrador" 
              className="bg-[#1a1a1a] border-[#262626] py-6 text-center"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button onClick={handleLogin} className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700">
              Entrar al Sistema
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-100 font-sans overflow-hidden">
      <Toaster position="top-right" theme="dark" />
      
      {/* Sidebar */}
      <aside className="w-64 bg-[#111] border-r border-[#262626] flex flex-col">
        <div className="p-6 border-b border-[#262626] flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Network className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">VENET <span className="text-blue-500">AI</span></h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'infrastructure', icon: Server, label: 'Infraestructura' },
            { id: 'antennas', icon: Wifi, label: 'Antenas' },
            { id: 'provisioning', icon: Zap, label: 'Aprovisionamiento' },
            { id: 'logs', icon: Activity, label: 'Logs de Eventos' },
            { id: 'settings', icon: SettingsIcon, label: 'Configuración' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#262626]">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a]">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <DashboardView devices={devices} logs={logs} oracleData={oracleData} oracleLoading={oracleLoading} />}
          {activeTab === 'infrastructure' && <InfrastructureView mode="mikrotik" devices={devices.filter(d => d.type !== 'antenna')} onRefresh={fetchData} />}
          {activeTab === 'antennas' && <InfrastructureView mode="antennas" devices={devices.filter(d => d.type === 'antenna')} onRefresh={fetchData} />}
          {activeTab === 'provisioning' && <ProvisioningView provisioning={provisioning} onRefresh={fetchData} />}
          {activeTab === 'logs' && <LogsView logs={logs} devices={devices} />}
          {activeTab === 'settings' && <SettingsView settings={settings} onRefresh={fetchData} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-Views ---

function DashboardView({ devices, logs, oracleData, oracleLoading }: any) {
  const stats = useMemo(() => {
    const up = devices.filter((d: any) => d.status === 'up').length;
    const down = devices.filter((d: any) => d.status === 'down').length;
    return { up, down, total: devices.length };
  }, [devices]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard Central</h2>
        <p className="text-zinc-400">Estado en tiempo real de tu red MikroTik y enlaces VPS.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#111] border-[#262626] hover:border-blue-500/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Dispositivos Online</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">{stats.up}</div>
            <p className="text-xs text-gray-500 mt-1">Sistemas operando correctamente</p>
          </CardContent>
        </Card>
        <Card className="bg-[#111] border-[#262626] hover:border-red-500/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Dispositivos Offline</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">{stats.down}</div>
            <p className="text-xs text-gray-500 mt-1">Requieren atención inmediata</p>
          </CardContent>
        </Card>
        <Card className="bg-[#111] border-[#262626] hover:border-purple-500/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Latencia Promedio</CardTitle>
            <Activity className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">12ms</div>
            <p className="text-xs text-gray-500 mt-1">Estabilidad de red global</p>
          </CardContent>
        </Card>
      </div>

      {/* Oracle AI Section */}
      <Card className="bg-[#111] border-[#262626] overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${oracleLoading ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 'bg-purple-500/20 text-purple-400'}`}>
            <Brain className="w-3 h-3" />
            {oracleLoading ? 'Procesando Red...' : 'Oráculo Activo'}
          </div>
        </div>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Análisis de Inteligencia Neuronal
          </CardTitle>
          <CardDescription>Diagnóstico predictivo basado en logs y estado de dispositivos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {oracleData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="p-4 bg-[#1a1a1a] rounded-xl border border-[#262626]">
                  <h4 className="text-xs font-bold text-purple-400 uppercase mb-2">Estado de Salud</h4>
                  <p className="text-lg font-medium text-white">{oracleData.statusSummary}</p>
                </div>
                <div className="p-4 bg-[#1a1a1a] rounded-xl border border-[#262626]">
                  <h4 className="text-xs font-bold text-blue-400 uppercase mb-2">Inteligencia de Red</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{oracleData.intelligence}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-blue-600/10 rounded-xl border border-blue-600/20">
                  <h4 className="text-xs font-bold text-blue-400 uppercase mb-2">Recomendación del Oráculo</h4>
                  <p className="text-sm text-white italic">"{oracleData.recommendation}"</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-[#262626]">
                  <span className="text-sm text-gray-400">Pulso Vital de la Red</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500" 
                        style={{ width: `${oracleData.pulseIntensity * 10}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-white">{oracleData.pulseIntensity}/10</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 text-zinc-700 mx-auto mb-4 animate-spin" />
              <p className="text-gray-500">El Oráculo está recolectando datos de tu red...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function InfrastructureView({ mode, devices, onRefresh }: any) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDevice, setNewDevice] = useState<Partial<Device>>({
    type: mode === 'mikrotik' ? 'router' : 'antenna',
    telegramEnabled: true
  });

  const handleAdd = async () => {
    if (!newDevice.name || !newDevice.ip) return toast.error("Nombre e IP son requeridos");
    try {
      await axios.post('/api/devices', newDevice);
      setIsAddOpen(false);
      onRefresh();
      toast.success("Dispositivo agregado");
    } catch (err) {
      toast.error("Error al guardar");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Eliminar este dispositivo?")) {
      await axios.delete(`/api/devices/${id}`);
      onRefresh();
      toast.success("Eliminado");
    }
  };

  const toggleTelegram = async (device: Device) => {
    await axios.patch(`/api/devices/${device.id}`, { telegramEnabled: !device.telegramEnabled });
    onRefresh();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">{mode === 'mikrotik' ? 'Infraestructura' : 'Antenas'}</h2>
          <p className="text-zinc-400">Gestión de equipos locales y remotos.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" /> Agregar</Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111] border-[#262626] text-white">
            <DialogHeader><DialogTitle>Nuevo Dispositivo</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewDevice({...newDevice, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>IP Address</Label>
                <Input className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewDevice({...newDevice, ip: e.target.value})} />
              </div>
              {mode === 'mikrotik' && (
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select className="w-full bg-[#1a1a1a] border-[#262626] rounded-md p-2" onChange={e => setNewDevice({...newDevice, type: e.target.value as any})}>
                    <option value="router">MikroTik Router</option>
                    <option value="vps">Servidor VPS</option>
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={newDevice.telegramEnabled} onCheckedChange={c => setNewDevice({...newDevice, telegramEnabled: c})} />
                <Label>Notificaciones Telegram</Label>
              </div>
            </div>
            <DialogFooter><Button onClick={handleAdd} className="bg-blue-600 w-full">Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-[#111] border-[#262626]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#262626]">
              <TableHead>Dispositivo</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d: Device) => (
              <TableRow key={d.id} className="border-[#262626]">
                <TableCell className="font-medium text-white">{d.name}</TableCell>
                <TableCell className="font-mono text-xs">{d.ip}</TableCell>
                <TableCell>
                  <Badge className={d.status === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
                    {d.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button onClick={() => toggleTelegram(d)}>{d.telegramEnabled ? <Bell className="w-4 h-4 text-blue-500" /> : <BellOff className="w-4 h-4 text-gray-600" />}</button>
                </TableCell>
                <TableCell className="text-right">
                  <button onClick={() => handleDelete(d.id)} className="text-gray-600 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function ProvisioningView({ provisioning, onRefresh }: any) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newProv, setNewProv] = useState<Partial<Provisioning>>({ speedLimit: '10M/10M', interfaceName: 'SALIDA' });

  const handleAdd = async () => {
    await axios.post('/api/provisioning', newProv);
    setIsAddOpen(false);
    onRefresh();
    toast.success("Cliente provisionado");
  };

  const toggleArp = async (p: Provisioning) => {
    await axios.patch(`/api/provisioning/${p.id}`, { arpEnabled: !p.arpEnabled });
    onRefresh();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Aprovisionamiento</h2>
          <p className="text-zinc-400">Gestión de clientes y cortes de servicio.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild><Button className="bg-blue-600"><Plus className="w-4 h-4 mr-2" /> Nuevo Cliente</Button></DialogTrigger>
          <DialogContent className="bg-[#111] border-[#262626] text-white">
            <DialogHeader><DialogTitle>Aprovisionar Cliente</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <Input placeholder="Nombre del Cliente" className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewProv({...newProv, deviceName: e.target.value})} />
              <Input placeholder="IP Address" className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewProv({...newProv, ip: e.target.value})} />
              <Input placeholder="MAC Address" className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewProv({...newProv, mac: e.target.value})} />
            </div>
            <DialogFooter><Button onClick={handleAdd} className="bg-blue-600 w-full">Activar Cliente</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-[#111] border-[#262626]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#262626]">
              <TableHead>Cliente</TableHead>
              <TableHead>IP / MAC</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Corte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {provisioning.map((p: Provisioning) => (
              <TableRow key={p.id} className="border-[#262626]">
                <TableCell className="font-medium text-white">{p.deviceName}</TableCell>
                <TableCell className="font-mono text-xs">{p.ip}<br/>{p.mac}</TableCell>
                <TableCell><Badge className={p.arpEnabled ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>{p.arpEnabled ? 'ACTIVO' : 'CORTADO'}</Badge></TableCell>
                <TableCell className="text-right">
                  <Switch checked={p.arpEnabled} onCheckedChange={() => toggleArp(p)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function LogsView({ logs, devices }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header><h2 className="text-3xl font-bold text-white">Logs de Eventos</h2></header>
      <Card className="bg-[#111] border-[#262626]">
        <Table>
          <TableHeader><TableRow className="border-[#262626]"><TableHead>Fecha</TableHead><TableHead>Dispositivo</TableHead><TableHead>Evento</TableHead><TableHead>Latencia</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((l: any) => (
              <TableRow key={l.id} className="border-[#262626]">
                <TableCell className="text-xs text-gray-500">{new Date(l.timestamp).toLocaleString()}</TableCell>
                <TableCell className="text-white">{devices.find((d: any) => d.id === l.deviceId)?.name || 'Desconocido'}</TableCell>
                <TableCell><Badge className={l.status === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>{l.status.toUpperCase()}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-gray-400">{l.latency}ms</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function SettingsView({ settings, onRefresh }: any) {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = async () => {
    await axios.post('/api/settings', localSettings);
    onRefresh();
    toast.success("Configuración guardada");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header><h2 className="text-3xl font-bold text-white">Configuración</h2></header>
      <Card className="bg-[#111] border-[#262626] max-w-2xl">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label>Telegram Bot Token</Label>
            <Input className="bg-[#1a1a1a] border-[#262626]" value={localSettings.telegramBotToken} onChange={e => setLocalSettings({...localSettings, telegramBotToken: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Telegram Chat ID</Label>
            <Input className="bg-[#1a1a1a] border-[#262626]" value={localSettings.telegramChatId} onChange={e => setLocalSettings({...localSettings, telegramChatId: e.target.value})} />
          </div>
          <Button onClick={handleSave} className="w-full bg-blue-600">Guardar Cambios</Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
