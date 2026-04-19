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
  Lock,
  Settings2,
  Wrench,
  Gauge,
  Globe
} from 'lucide-react';
import { analyzeNetworkHealth, askOracle as askOracleAI } from './services/geminiService';
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
  routerId: string;
  dhcpLease: boolean;
  arpEnabled: boolean;
  speedLimit: string;
  interfaceName: string;
  lastSeen?: string;
  createdAt: string;
}

interface AppSettings {
  telegramBotToken: string;
  telegramChatId: string;
  wanStatus?: {
    WAN1?: { status: string; name: string; traffic: number };
    WAN2?: { status: string; name: string; traffic: number };
    alert?: string;
    updatedAt: number;
  };
  googleLatency?: number;
  googleLatSource?: string;
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

  // Expose setActiveTab for global navigation
  useEffect(() => {
    (window as any).setActiveTab = setActiveTab;
  }, []);

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
      const interval = setInterval(fetchData, 30000); // Poll every 30s for better responsiveness
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

  const askOracle = async (question: string) => {
    return await askOracleAI(question, { devices, logs });
  };

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
    <div className="flex h-screen hardware-grid text-gray-100 font-sans overflow-hidden relative">
      <div className="scanline" />
      <Toaster position="top-right" theme="dark" richColors />
      
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-72 bg-[#0a0a0a] border-r border-[#1a1a1a] flex-col glass-card relative z-10">
        <div className="p-8 border-b border-[#1a1a1a] relative group">
          <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-3">
            <Zap className="w-8 h-8 text-blue-500 vigilance-pulse" />
            <span className="neon-text-blue">VENET <span className="text-blue-500">PRO</span></span>
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none">Núcleo Vigilante Activo</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'oracle', icon: Brain, label: 'Oráculo AI' },
            { id: 'infrastructure', icon: Server, label: 'Infraestructura' },
            { id: 'antennas', icon: Wifi, label: 'Antenas' },
            { id: 'provisioning', icon: Zap, label: 'Aprovisionamiento' },
            { id: 'tools', icon: Wrench, label: 'Mantenimiento' },
            { id: 'logs', icon: Activity, label: 'Logs' },
            { id: 'settings', icon: SettingsIcon, label: 'Ajustes' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                : 'text-zinc-500 hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-bold text-xs uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#262626]">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-bold text-xs uppercase tracking-wider">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10 relative">
        <div className="max-w-7xl mx-auto h-full">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <DashboardView key="dash" devices={devices} logs={logs} oracleData={oracleData} />}
            {activeTab === 'oracle' && <OracleView key="oracle" devices={devices} logs={logs} oracleData={oracleData} loading={oracleLoading} onAsk={askOracle} />}
            {activeTab === 'infrastructure' && <InfrastructureView key="infra" mode="mikrotik" devices={devices.filter((d: any) => d.type !== 'antenna')} onRefresh={fetchData} />}
            {activeTab === 'antennas' && <InfrastructureView key="ant" mode="antennas" devices={devices.filter((d: any) => d.type === 'antenna')} onRefresh={fetchData} />}
            {activeTab === 'provisioning' && <ProvisioningView key="prov" provisioning={provisioning} devices={devices} onRefresh={fetchData} />}
            {activeTab === 'tools' && <MaintenanceView key="tools" devices={devices} />}
            {activeTab === 'logs' && <LogsView key="logs" logs={logs} devices={devices} />}
            {activeTab === 'settings' && <SettingsView key="settings" settings={settings} onRefresh={fetchData} />}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/80 backdrop-blur-2xl border-t border-[#262626] z-50 px-2 py-3">
        <div className="flex justify-between items-center max-w-sm mx-auto">
          {[
            { id: 'dashboard', icon: LayoutDashboard },
            { id: 'oracle', icon: Brain },
            { id: 'infrastructure', icon: Server },
            { id: 'antennas', icon: Wifi },
            { id: 'provisioning', icon: Zap },
            { id: 'tools', icon: Wrench },
            { id: 'settings', icon: SettingsIcon },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`p-3 rounded-2xl transition-all flex flex-col items-center gap-1 ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                : 'text-zinc-600'
              }`}
            >
              <item.icon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Sub-Views ---

function DashboardView({ devices, logs, oracleData, oracleLoading }: any) {
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [selectedInterface, setSelectedInterface] = useState<string>('WAN');
  const [selectedRange, setSelectedRange] = useState<string>('24h');
  const [routerStats, setRouterStats] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<any>(null);

  const stats = useMemo(() => {
    const routers = devices.filter((d: any) => d.type === 'router');
    const antennas = devices.filter((d: any) => d.type === 'antenna');
    
    return {
      routersUp: routers.filter((d: any) => d.status === 'up').length,
      routersDown: routers.filter((d: any) => d.status === 'down').length,
      antennasUp: antennas.filter((d: any) => d.status === 'up').length,
      antennasDown: antennas.filter((d: any) => d.status === 'down').length,
    };
  }, [devices]);

  useEffect(() => {
    const fetchAllStats = async () => {
      // 1. Fetch Google DNS Latency
      try {
        const gRes = await axios.get('/api/global-stats');
        setGlobalStats(gRes.data);
      } catch (e) {}

      // 2. Fetch Router Stats
      const routers = devices.filter((d: any) => d.type === 'router' && d.status === 'up');
      const results = await Promise.all(
        routers.map(async (r: any) => {
          try {
            const res = await axios.get(`/api/router-stats/${r.id}`);
            return { deviceId: r.id, name: r.name, ...res.data };
          } catch (e) { return null; }
        })
      );
      setRouterStats(results.filter(r => r !== null));
    };
    fetchAllStats();
    const inv = setInterval(fetchAllStats, 60000); // Poll every 1 min to save bandwidth
    return () => clearInterval(inv);
  }, [devices]);

  const activeRouter = routerStats[0];

  useEffect(() => {
    if (!activeRouter) return;
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`/api/router-history/${activeRouter.deviceId}?interface=${selectedInterface}&range=${selectedRange}`);
        setHistoryData(res.data);
      } catch (e) {}
    };
    fetchHistory();
    const inv = setInterval(fetchHistory, 60000);
    return () => clearInterval(inv);
  }, [activeRouter?.deviceId, selectedInterface, selectedRange]);

  const overallHealth = useMemo(() => {
    if (devices.length === 0) return 0;
    const upCount = devices.filter(d => d.status === 'up').length;
    const latencyFactor = globalStats?.googleLatency ? Math.max(0, 100 - (globalStats.googleLatency / 2)) : 50;
    const upFactor = (upCount / devices.length) * 100;
    return Math.round((upFactor * 0.7) + (latencyFactor * 0.3));
  }, [devices, globalStats]);

  const totalTraffic = useMemo(() => {
    let tx = 0, rx = 0;
    
    // Prefer Global Backend Aggregate if available
    if (globalStats?.totalTrafficIn !== undefined) {
      return { rx: globalStats.totalTrafficIn, tx: globalStats.totalTrafficOut };
    }
    
    devices.forEach(d => {
      if (d.interfaces) {
        d.interfaces.forEach((iface: any) => {
          const name = iface.name.toUpperCase();
          if (name.includes("SALIDA") || name.includes("BRIDGE") || name.includes("LOCAL") || name.includes("LAN")) {
            tx += iface.trafficOut || 0;
            rx += iface.trafficIn || 0;
          }
        });
      }
    });
    return { tx, rx };
  }, [devices]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 pb-24 md:pb-8"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="w-16 h-16 transform -rotate-90">
              <circle cx="32" cy="32" r="28" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-zinc-900" />
              <circle 
                cx="32" cy="32" r="28" fill="transparent" stroke="currentColor" strokeWidth="4" 
                className={overallHealth > 80 ? 'text-blue-500' : overallHealth > 50 ? 'text-yellow-500' : 'text-red-500'}
                strokeDasharray={`${(overallHealth / 100) * 176} 176`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-sm font-black text-white">{overallHealth}%</span>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white flex items-center gap-2 uppercase italic">
              Control Maestro
            </h2>
            <p className="text-zinc-500 text-[10px] font-bold tracking-[0.2em] uppercase neon-text-blue">Estado de Salud de Infraestructura</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-2 bg-zinc-900/50 rounded-2xl border border-zinc-800">
          <div className="text-right pr-3 border-r border-zinc-800">
            <span className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Latencia DNS</span>
            <div className="flex flex-col gap-0">
              <div className="flex items-center justify-end gap-1.5 leading-none">
                <span className="text-[7px] text-emerald-500 font-bold">W1:</span>
                <span className="text-white font-mono text-[10px] tabular-nums font-bold">
                  {globalStats?.wan1Latency ? `${Math.round(globalStats.wan1Latency)}ms` : '---'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5 leading-none">
                <span className="text-[7px] text-blue-500 font-bold">W2:</span>
                <span className="text-white font-mono text-[10px] tabular-nums font-bold">
                  {globalStats?.wan2Latency ? `${Math.round(globalStats.wan2Latency)}ms` : '---'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-1">
            <div className={`w-2 h-2 rounded-full ${globalStats?.googleLatency ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] text-zinc-400 font-medium">Google DNS ({globalStats?.googleLatSource || 'MikroTik'})</span>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      {/* Connectivity Status & WAN Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#0a0a0a]/80 border-blue-500/20 glass-card col-span-1 md:col-span-2 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 shadow-[0_0_10px_#2563eb]" />
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
              <Globe className="w-3 h-3 text-blue-500" /> Monitoreo Dual-WAN (Balanceo)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
            {/* WAN1 - AIRTEK */}
            <div className={`p-4 rounded-2xl border transition-all duration-500 ${globalStats?.wanStatus?.WAN1?.status === 'up' ? 'bg-zinc-900/40 border-emerald-500/20' : 'bg-red-500/5 border-red-500/30 animate-pulse'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">WAN1: AIRTEK</span>
                    {globalStats?.wan1Latency > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px] font-bold border border-emerald-500/20">
                        {Math.round(globalStats.wan1Latency)}ms
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-zinc-600 font-mono italic">({globalStats?.wanStatus?.WAN1?.interface || 'Buscando...'})</span>
                </div>
                <Badge className={globalStats?.wanStatus?.WAN1?.status === 'up' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/20 text-red-500'}>
                  {globalStats?.wanStatus?.WAN1?.status === 'up' ? 'EN LÍNEA' : 'CAÍDA'}
                </Badge>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-xl font-black text-white tabular-nums">
                  {globalStats?.wanStatus?.WAN1?.trafficStr || '0.0 Mbps'}
                </div>
                <Activity className={`w-4 h-4 ${globalStats?.wanStatus?.WAN1?.status === 'up' ? 'text-emerald-500 vigilance-pulse' : 'text-zinc-700'}`} />
              </div>
              {globalStats?.wanStatus?.WAN1?.status === 'down' && (
                <p className="text-[9px] text-red-400 mt-2 font-bold uppercase tracking-tighter">REVISAR CONEXIÓN FÍSICA / PROVEEDOR</p>
              )}
            </div>

            {/* WAN2 - INTER */}
            <div className={`p-4 rounded-2xl border transition-all duration-500 ${globalStats?.wanStatus?.WAN2?.status === 'up' ? 'bg-zinc-900/40 border-blue-500/20' : 'bg-red-500/5 border-red-500/30 animate-pulse'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">WAN2: INTER</span>
                    {globalStats?.wan2Latency > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[8px] font-bold border border-blue-500/20">
                        {Math.round(globalStats.wan2Latency)}ms
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-zinc-600 font-mono italic">({globalStats?.wanStatus?.WAN2?.interface || 'Buscando...'})</span>
                </div>
                <Badge className={globalStats?.wanStatus?.WAN2?.status === 'up' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-red-500/20 text-red-500'}>
                  {globalStats?.wanStatus?.WAN2?.status === 'up' ? 'EN LÍNEA' : 'CAÍDA'}
                </Badge>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-xl font-black text-white tabular-nums">
                  {globalStats?.wanStatus?.WAN2?.trafficStr || '0.0 Mbps'}
                </div>
                <Activity className={`w-4 h-4 ${globalStats?.wanStatus?.WAN2?.status === 'up' ? 'text-blue-500 vigilance-pulse' : 'text-zinc-700'}`} />
              </div>
              {globalStats?.wanStatus?.WAN2?.status === 'down' && (
                <p className="text-[9px] text-red-400 mt-2 font-bold uppercase tracking-tighter">REVISAR CONEXIÓN FÍSICA / PROVEEDOR</p>
              )}
            </div>

            {/* Failover Message */}
            {globalStats?.wanStatus?.alert && (
              <div className="col-span-1 sm:col-span-2 bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center animate-bounce">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-black text-orange-400 uppercase tracking-widest">{globalStats.wanStatus.alert}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a]/80 border-purple-500/20 glass-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
              <Activity className="w-3 h-3 text-purple-500" /> Latencia Global
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-full pb-8">
            <div className="text-5xl font-black text-white tabular-nums tracking-tighter italic">
              {globalStats?.googleLatency || 0}<span className="text-sm font-normal not-italic text-zinc-600 ml-1">ms</span>
            </div>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-4">
              Vía {globalStats?.googleLatSource || '---'}
            </p>
            <div className={`mt-4 w-24 h-1 rounded-full overflow-hidden bg-zinc-900`}>
                <div 
                  className={`h-full transition-all duration-1000 ${Number(globalStats?.googleLatency) < 60 ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : Number(globalStats?.googleLatency) < 150 ? 'bg-orange-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, (Number(globalStats?.googleLatency) / 300) * 100)}%` }}
                />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <Card className="bg-[#111] border-[#262626] border-l-4 border-l-blue-600">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Router API</CardTitle>
            <Server className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-black text-white">{stats.routersUp}</span>
              <span className="text-xs text-zinc-600 mb-1">/ {stats.routersUp + stats.routersDown}</span>
            </div>
            <div className="mt-2 text-[10px] text-green-500 font-bold bg-green-500/5 py-1 rounded inline-block">SISTEMA OK</div>
          </CardContent>
        </Card>

        <Card className="bg-[#111] border-[#262626] border-l-4 border-l-blue-400">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Trafico Red</CardTitle>
            <Activity className="w-4 h-4 text-blue-400" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-blue-400 font-bold">RX:</span>
                <span className="text-sm font-black text-white">
                  {totalTraffic.rx > 0.001 ? (totalTraffic.rx < 1 ? `${(totalTraffic.rx * 1024).toFixed(1)} kbps` : `${totalTraffic.rx.toFixed(2)} Mbps`) : '0.0 kbps'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-purple-400 font-bold">TX:</span>
                <span className="text-sm font-black text-white">
                  {totalTraffic.tx > 0.001 ? (totalTraffic.tx < 1 ? `${(totalTraffic.tx * 1024).toFixed(1)} kbps` : `${totalTraffic.tx.toFixed(2)} Mbps`) : '0.0 kbps'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111] border-[#262626] border-l-4 border-l-purple-600">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Antenas</CardTitle>
            <Wifi className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-black text-white">{stats.antennasUp}</span>
              <span className="text-xs text-zinc-600 mb-1">/ {stats.antennasUp + stats.antennasDown}</span>
            </div>
            {stats.antennasDown > 0 && <span className="text-[10px] text-red-500 font-bold">ALERTA CAÍDA</span>}
          </CardContent>
        </Card>

        <Card className="bg-[#111] border-[#262626] border-l-4 border-l-orange-600">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Carga CPU</CardTitle>
            <Cpu className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent className="p-4">
            <span className="text-2xl font-black text-white">{activeRouter?.stats?.cpuUsage || 0}%</span>
            <div className="mt-2 w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-600 rounded-full" 
                style={{ width: `${activeRouter?.stats?.cpuUsage || 0}%` }} 
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111] border-[#262626] border-l-4 border-l-emerald-600">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">RAM Libre</CardTitle>
            <Database className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-4">
            <span className="text-2xl font-black text-white">{Math.round(activeRouter?.stats?.ramFree || 0)}MB</span>
            <span className="text-[10px] block text-zinc-500 mt-1 uppercase">De {Math.round(activeRouter?.stats?.ramTotal || 0)}MB totales</span>
          </CardContent>
        </Card>
      </div>

      {/* Main Traffic Graph with Interface Selector */}
      <Card className="bg-[#111] border-[#262626] overflow-hidden">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Monitor de Tráfico Histórico
            </CardTitle>
            <CardDescription>Visualización dinámica de datos por interfaz.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 p-1 bg-zinc-900 rounded-lg">
              <button 
                onClick={() => setSelectedRange('5m')}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${selectedRange === '5m' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-white'}`}
              >5M</button>
              <button 
                onClick={() => setSelectedRange('8h')}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${selectedRange === '8h' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-white'}`}
              >8H</button>
              <button 
                onClick={() => setSelectedRange('24h')}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${selectedRange === '24h' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-white'}`}
              >24H</button>
            </div>
            <div className="flex items-center gap-2 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
              <Label className="text-[10px] text-zinc-500 uppercase font-bold ml-2">Intf:</Label>
              <select 
                className="bg-transparent border-none rounded-md px-2 py-1 text-[10px] text-white focus:ring-0"
                value={selectedInterface}
                onChange={(e) => setSelectedInterface(e.target.value)}
              >
                {activeRouter?.interfaces?.map((iface: any) => (
                  <option key={iface.id} value={iface.name} className="bg-[#111]">{iface.name}</option>
                ))}
                {!activeRouter && <option>No hay Router</option>}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData?.traffic || []}>
                <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#525252" 
                  fontSize={8} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} unit=" Mbps" />
                <Tooltip 
                  labelFormatter={(val) => new Date(val).toLocaleString()}
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="trafficIn" name="Descarga (RX)" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorIn)" />
                <Area type="monotone" dataKey="trafficOut" name="Subida (TX)" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Resource History Graph */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#111] border-[#262626]">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-orange-500" /> Historial CPU
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData?.resources || []}>
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip 
                    labelFormatter={(val) => new Date(val).toLocaleString()}
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }} 
                  />
                  <Area type="monotone" dataKey="cpuUsage" name="CPU %" stroke="#f97316" fillOpacity={1} fill="url(#colorCpu)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111] border-[#262626]">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" /> Historial RAM Libre
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData?.resources || []}>
                  <defs>
                    <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis hide />
                  <Tooltip 
                    labelFormatter={(val) => new Date(val).toLocaleString()}
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }} 
                  />
                  <Area type="monotone" dataKey="ramFree" name="RAM Libre (MB)" stroke="#10b981" fillOpacity={1} fill="url(#colorRam)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Ticker Strip */}
      {oracleData && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-600/5 border border-blue-500/20 p-2 px-4 rounded-xl flex items-center justify-between group overflow-hidden relative cursor-pointer"
          onClick={() => (window as any).setActiveTab('oracle')}
        >
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-black uppercase text-blue-500/50 tracking-[0.2em]">IA Diagnóstico:</span>
            </div>
            <p className="text-sm font-bold text-white italic truncate max-w-2xl">{oracleData.statusSummary}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest group-hover:text-blue-500 transition-colors">Ver Detalles Neurales</span>
            <Brain className="w-4 h-4 text-zinc-700 group-hover:text-blue-500 transition-colors" />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function InfrastructureView({ mode, devices, onRefresh }: any) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [deviceDetails, setDeviceDetails] = useState<any>(null);
  const [newDevice, setNewDevice] = useState<Partial<Device>>({
    type: mode === 'mikrotik' ? 'router' : 'antenna',
    telegramEnabled: true
  });

  useEffect(() => {
    if (selectedDevice) {
      const fetchDetails = async () => {
        try {
          const res = await axios.get(`/api/router-stats/${selectedDevice.id}`);
          setDeviceDetails(res.data);
        } catch (e) {
          toast.error("Error al obtener detalles del router");
        }
      };
      fetchDetails();
      const inv = setInterval(fetchDetails, 15000);
      return () => clearInterval(inv);
    }
  }, [selectedDevice]);

  const handleAdd = async () => {
    if (!newDevice.name || !newDevice.ip) return toast.error("Nombre e IP son requeridos");
    try {
      if ((newDevice as any).id) {
        await axios.patch(`/api/devices/${(newDevice as any).id}`, newDevice);
        toast.success("Dispositivo actualizado");
      } else {
        await axios.post('/api/devices', newDevice);
        toast.success("Dispositivo agregado");
      }
      setIsAddOpen(false);
      setNewDevice({
        name: '',
        ip: '',
        type: mode === 'mikrotik' ? 'router' : 'antenna',
        telegramEnabled: true
      });
      onRefresh();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Error al guardar";
      toast.error(msg);
    }
  };

  const handleEdit = (device: Device, e: React.MouseEvent) => {
    e.stopPropagation();
    setNewDevice(device);
    setIsAddOpen(true);
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
        <div className="flex gap-2">
          {selectedDevice && (
            <Button variant="outline" onClick={() => setSelectedDevice(null)} className="border-[#262626] text-gray-400">
              <LogOut className="w-4 h-4 mr-2" /> Cerrar Detalles
            </Button>
          )}
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <select 
                        className="w-full bg-[#1a1a1a] border-[#262626] rounded-md p-2 text-sm text-white" 
                        onChange={e => setNewDevice({...newDevice, type: e.target.value as any})}
                      >
                        <option value="router">MikroTik Router (API)</option>
                        <option value="vps">Servidor VPS (Ping)</option>
                      </select>
                    </div>
                    
                    {newDevice.type === 'router' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Puerto API</Label>
                          <Input 
                            type="number" 
                            placeholder="8728" 
                            className="bg-[#1a1a1a] border-[#262626]" 
                            onChange={e => setNewDevice({...newDevice, apiPort: parseInt(e.target.value)})} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Usuario</Label>
                          <Input 
                            placeholder="admin" 
                            className="bg-[#1a1a1a] border-[#262626]" 
                            onChange={e => setNewDevice({...newDevice, username: e.target.value})} 
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Contraseña</Label>
                          <Input 
                            type="password" 
                            placeholder="••••••••" 
                            className="bg-[#1a1a1a] border-[#262626]" 
                            onChange={e => setNewDevice({...newDevice, password: e.target.value})} 
                          />
                        </div>
                      </div>
                    )}
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
        </div>
      </header>

      {!selectedDevice ? (
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
                <TableRow key={d.id} className="border-[#262626] cursor-pointer hover:bg-[#1a1a1a]" onClick={() => setSelectedDevice(d)}>
                  <TableCell className="font-medium text-white">{d.name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.ip}</TableCell>
                  <TableCell>
                    <Badge className={d.status === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
                      {d.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleTelegram(d)}>{d.telegramEnabled ? <Bell className="w-4 h-4 text-blue-500" /> : <BellOff className="w-4 h-4 text-gray-600" />}</button>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <button onClick={(e) => handleEdit(d, e)} className="text-gray-600 hover:text-blue-500"><Settings2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(d.id)} className="text-gray-600 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-[#111] border-[#262626]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 italic">
                  <Cpu className="w-4 h-4 text-blue-500" /> Recursos: {selectedDevice.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-[#1a1a1a] rounded-xl border border-[#262626]">
                  <Label className="text-[10px] text-gray-500 uppercase font-extrabold block mb-2">CPU LOAD</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                        style={{ width: `${deviceDetails?.stats?.cpuUsage || 0}%` }} 
                      />
                    </div>
                    <span className="text-lg font-bold text-white">{deviceDetails?.stats?.cpuUsage || 0}%</span>
                  </div>
                </div>
                <div className="p-4 bg-[#1a1a1a] rounded-xl border border-[#262626]">
                  <Label className="text-[10px] text-gray-500 uppercase font-extrabold block mb-2">FREE RAM</Label>
                  <div className="text-2xl font-bold text-white">{Math.round(deviceDetails?.stats?.ramFree || 0)} MB</div>
                  <span className="text-xs text-gray-500">de {Math.round(deviceDetails?.stats?.ramTotal || 0)} MB totales</span>
                </div>
                <div className="p-4 bg-[#1a1a1a] rounded-xl border border-[#262626]">
                  <Label className="text-[10px] text-gray-500 uppercase font-extrabold block mb-2">UPTIME</Label>
                  <div className="text-sm font-mono text-blue-400">{deviceDetails?.stats?.uptime || 'Consultando...'}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="bg-[#111] border-[#262626]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Network className="w-4 h-4 text-green-500" /> Puertos e Interfaces
                </CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#262626]">
                    <TableHead>Interfaz</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">TX Rate (Out)</TableHead>
                    <TableHead className="text-right">RX Rate (In)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviceDetails?.interfaces?.map((iface: any) => (
                    <TableRow key={iface.id} className="border-[#262626] hover:bg-zinc-900/50">
                      <TableCell className="font-bold text-gray-200">
                        <div className="flex items-center gap-2">
                          <Network className={`w-3 h-3 ${iface.status === 'up' ? 'text-blue-500' : 'text-gray-600'}`} />
                          {iface.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] font-black ${iface.status === 'up' ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-800 text-zinc-500'}`}>
                          {iface.status === 'up' ? 'ONLINE' : 'DOWN'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-purple-400">
                        {iface.trafficOut > 0.01 ? (iface.trafficOut < 1 ? `${(iface.trafficOut * 1024).toFixed(1)} kbps` : `${iface.trafficOut.toFixed(2)} Mbps`) : '0.0 kbps'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-blue-400">
                        {iface.trafficIn > 0.01 ? (iface.trafficIn < 1 ? `${(iface.trafficIn * 1024).toFixed(1)} kbps` : `${iface.trafficIn.toFixed(2)} Mbps`) : '0.0 kbps'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!deviceDetails?.interfaces?.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-600">
                        {selectedDevice.status === 'down' ? 'Dispositivo Offline' : 'Recuperando interfaces...'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ProvisioningView({ provisioning, devices, onRefresh }: any) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newProv, setNewProv] = useState<Partial<Provisioning>>({ speedLimit: '10M/10M', interfaceName: 'SALIDA' });
  const [leases, setLeases] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [selectedRouterId, setSelectedRouterId] = useState("");

  const routers = devices.filter((d: any) => d.type === 'router' && d.status === 'up');

  // Deduplicate by IP + MAC for UI accuracy
  const uniqueProvisioning = useMemo(() => {
    const seen = new Set();
    return provisioning.filter((p: Provisioning) => {
      const key = `${p.routerId}-${p.mac}-${p.ip}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [provisioning]);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/provisioning/${id}`);
      onRefresh();
      toast.success("Cliente eliminado del panel");
    } catch (e) {
      toast.error("Error al eliminar");
    }
  };

  const handleCleanup = async () => {
    if (window.confirm("¿Limpiar clientes no vistos en 48h del panel central? (No afecta MikroTik)")) {
      try {
        await axios.post('/api/provisioning/cleanup');
        onRefresh();
        toast.success("Limpieza de base de datos completada.");
      } catch (e) {
        toast.error("Error al ejecutar limpieza.");
      }
    }
  };

  // Trigger auto-refresh for leases if a router is selected
  useEffect(() => {
    if (routers.length > 0 && !selectedRouterId) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId]);

  useEffect(() => {
    if (selectedRouterId) {
      fetchLeases(selectedRouterId);
      const inv = setInterval(() => fetchLeases(selectedRouterId), 60000);
      return () => clearInterval(inv);
    }
  }, [selectedRouterId]);

  const fetchLeases = async (routerId: string) => {
    if (!routerId) return;
    setSyncing(true);
    try {
      const res = await axios.get(`/api/router-tools/dhcp-leases/${routerId}`);
      setLeases(res.data);
      toast.success("Leases sincronizados desde MikroTik");
      // Refresh the main provisioning list to show newly discovered static leases
      onRefresh();
    } catch (e: any) {
      const msg = e.response?.data?.error || "Error al sincronizar leases";
      toast.error(msg);
    }
    setSyncing(false);
  };

  const importLease = async (lease: any) => {
    try {
      // Manual import also triggers the full MikroTik logic (Static, Comment, ARP, Queue)
      await axios.post('/api/provisioning', {
        deviceName: lease.comment || lease['host-name'] || `CLIENTE ${lease.address}`,
        ip: lease.address,
        mac: lease.mac_address,
        routerId: selectedRouterId,
        speedLimit: lease.speedLimit || '10M/10M',
        interfaceName: 'SALIDA',
        arpEnabled: 1 // Enable by default on import
      });
      onRefresh();
      toast.success(`Cliente Habilitado: ${lease.address}`);
    } catch (e) {
      toast.error("Error al habilitar cliente");
    }
  };

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

  const handleUpdateSpeed = async (id: string, currentSpeed: string) => {
    const newSpeed = window.prompt("Nueva velocidad (Ej: 20M/20M):", currentSpeed);
    if (newSpeed && newSpeed !== currentSpeed) {
      try {
        await axios.patch(`/api/provisioning/${id}`, { speedLimit: newSpeed });
        onRefresh();
        toast.success("Velocidad actualizada en MikroTik");
      } catch (err) {
        toast.error("Error al actualizar velocidad");
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white uppercase italic tracking-tighter">Aprovisionamiento</h2>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Sincronización Inteligente DHCP / ARP / Queues</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleCleanup} className="border-zinc-800 text-zinc-500 hover:text-white hover:border-red-500/50">
            <Trash2 className="w-4 h-4 mr-2" /> Limpiar Obsoletos
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button className="bg-blue-600"><Plus className="w-4 h-4 mr-2" /> Nuevo Cliente</Button></DialogTrigger>
            <DialogContent className="bg-[#111] border-[#262626] text-white">
              <DialogHeader><DialogTitle>Aprovisionar Cliente</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nombre del Cliente (DHCP/ARP/Queue)</Label>
                  <Input placeholder="Ej: Juan Perez" className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewProv({...newProv, deviceName: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>IP Address</Label>
                    <Input placeholder="192.168.88.50" className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewProv({...newProv, ip: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>MAC Address</Label>
                    <Input placeholder="AA:BB:CC..." className="bg-[#1a1a1a] border-[#262626]" onChange={e => setNewProv({...newProv, mac: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Límite Velocidad (Queues)</Label>
                    <Input placeholder="5M/5M" className="bg-[#1a1a1a] border-[#262626]" defaultValue="10M/10M" onChange={e => setNewProv({...newProv, speedLimit: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Interfaz MikroTik</Label>
                    <Input placeholder="bridge-local" className="bg-[#1a1a1a] border-[#262626]" defaultValue="SALIDA" onChange={e => setNewProv({...newProv, interfaceName: e.target.value})} />
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={handleAdd} className="bg-blue-600 w-full">Vincular y Activar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="bg-[#111] border-[#262626]">
        <div className="p-4 border-b border-[#262626] bg-[#161616] flex items-center justify-between">
          <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> MikroTik DHCP Leases (Real-Time)
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-500/50 animate-pulse">AUTO-SYNC ACTIVO</Badge>
            <select 
              className="bg-[#0a0a0a] border border-[#262626] text-xs text-white rounded px-2 py-1"
              value={selectedRouterId}
              onChange={(e) => setSelectedRouterId(e.target.value)}
            >
              <option value="">Vista de Leases...</option>
              {routers.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        
        {leases.length > 0 && (
          <div className="max-h-60 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#262626] bg-[#0d0d0d]">
                  <TableHead className="text-[10px]">Cliente / IP</TableHead>
                  <TableHead className="text-[10px]">MAC / Plan</TableHead>
                  <TableHead className="text-[10px]">Estado Sync</TableHead>
                  <TableHead className="text-right text-[10px]">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leases
                  .filter(l => String(l.dynamic) === 'true' || l.dynamic === true)
                  .map((l, idx) => {
                  const isDynamic = String(l.dynamic) === 'true' || l.dynamic === true;
                  const isProvisioned = provisioning.some((p: any) => 
                    (p.ip === l.address) || 
                    (p.mac && l.mac_address && p.mac.toLowerCase() === l.mac_address.toLowerCase())
                  );
                  const prov = provisioning.find((p: any) => 
                    (p.ip === l.address) || 
                    (p.mac && l.mac_address && p.mac.toLowerCase() === l.mac_address.toLowerCase())
                  );
                  
                  return (
                    <TableRow key={idx} className="border-[#262626] hover:bg-zinc-900/50">
                      <TableCell className="font-mono text-xs text-white">
                        <span className="text-blue-400 font-bold block">{l.comment}</span>
                        {l.address}
                      </TableCell>
                      <TableCell className="text-[10px] text-zinc-500">
                        {l.mac_address}<br/>
                        <span className="text-purple-400 font-mono">[{l.speedLimit}]</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isDynamic ? (
                            <Badge variant="outline" className="text-[8px] border-yellow-500/50 text-yellow-500">DINÁMICA</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] border-blue-500/50 text-blue-400 bg-blue-500/5">ESTÁTICA (AUTO-SYNC)</Badge>
                          )}
                          {isProvisioned ? (
                            <Badge variant="outline" className="text-[8px] border-green-500/50 text-green-500 bg-green-500/5">VINCULADO</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] border-zinc-500/50 text-zinc-500">NO VINCULADO</Badge>
                          )}
                          {l.arpEnabled === 0 && <Badge variant="danger" className="text-[8px] bg-red-500/10 text-red-500 border-red-500/20 px-1">CORTADO</Badge>}
                          {l.arpEnabled === 1 && <Badge variant="outline" className="text-[8px] border-emerald-500/20 text-emerald-500/70">ACTIVO</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isProvisioned && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-400" onClick={() => importLease(l)}>
                            Importar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="bg-[#111] border-[#262626]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#262626] bg-[#0d0d0d]">
              <TableHead className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">NOMBRE / CLIENTE</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">IDENTIFICADOR RED</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">VELOCIDAD MIKROTIK</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-zinc-500 tracking-widest text-center">ESTADO INTERNET</TableHead>
              <TableHead className="text-right text-[10px] uppercase font-black text-zinc-500 tracking-widest px-4">ACCIONES SYNC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uniqueProvisioning.map((p: Provisioning) => (
              <TableRow key={p.id} className="border-[#262626] group hover:bg-[#161616] transition-colors">
        <TableCell className="font-medium text-white px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white uppercase tracking-tight">{p.deviceName}</span>
            <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">
              Visto: {p.lastSeen ? new Date(p.lastSeen.replace(' ', 'T').includes('T') ? p.lastSeen.replace(' ', 'T') + 'Z' : p.lastSeen).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' }) : '---'}
            </span>
          </div>
        </TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 mb-1 border-blue-500/20 text-blue-400">{p.ip}</Badge>
                  <br/>
                  <span className="text-[10px] text-zinc-600 block">{p.mac}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <button 
                      onClick={() => handleUpdateSpeed(p.id, p.speedLimit)}
                      className="text-[10px] bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded hover:border-blue-500 text-blue-400 font-mono text-left w-fit"
                    >
                      {p.speedLimit}
                    </button>
                    <div className="flex gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${p.speedLimit !== '1M/1M' ? 'bg-blue-500 shadow-[0_0_5px_#3b82f6]' : 'bg-zinc-800'}`} title="Queue Configurada" />
                      <span className="text-[8px] text-zinc-600 uppercase font-black">Queue</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div 
                      onClick={() => toggleArp(p)}
                      className={`
                        cursor-pointer px-2 py-0.5 rounded text-[10px] font-black tracking-widest text-center
                        ${p.arpEnabled 
                          ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                          : 'bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse'}
                      `}
                    >
                      {p.arpEnabled ? 'HABILITADO' : 'CORTADO'}
                    </div>
                    <div className="flex gap-1 justify-center">
                      <div className={`w-1.5 h-1.5 rounded-full ${p.arpEnabled ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500 shadow-[0_0_5px_#ef4444]'}`} />
                      <span className="text-[8px] text-zinc-600 uppercase font-black">ARP</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Switch checked={p.arpEnabled} onCheckedChange={() => toggleArp(p)} className="data-[state=checked]:bg-green-500" />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-zinc-500 hover:text-green-400 hover:bg-green-500/5"
                      onClick={async () => {
                        try {
                          await axios.put(`/api/provisioning/${p.id}/sync`);
                          onRefresh();
                          toast.success("Sincronización completa MikroTik OK");
                        } catch (err) {
                          toast.error("Error al sincronizar");
                        }
                      }}
                      title="Sincronizar DHCP/ARP/Queue"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-zinc-500 hover:text-red-500 hover:bg-red-500/5"
                      onClick={() => { if(window.confirm('¿Eliminar cliente?')) handleDelete(p.id) }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function OracleView({ devices, logs, onAsk, oracleData, loading }: any) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");
  const [asking, setAsking] = useState(false);

  const handleAsk = async () => {
    if (!question) return;
    setAsking(true);
    const res = await onAsk(question, { devices, logs });
    setResponse(res);
    setAsking(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-5xl mx-auto pb-24">
      <header className="text-center space-y-2">
        <div className="inline-block p-4 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4 vigilance-pulse relative">
          <div className="absolute inset-0 bg-blue-500/5 animate-ping rounded-full" />
          <Brain className="w-16 h-16 text-blue-500 relative z-10" />
        </div>
        <h2 className="text-4xl font-black text-white tracking-tighter neon-text-blue">NÚCLEO ORÁCULO AI</h2>
        <p className="text-zinc-500 uppercase tracking-[0.4em] text-[10px] font-bold">Interfase Neural de Vigilancia Autónoma</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-[#0a0a0a]/80 border-blue-500/20 glass-card">
          <CardHeader>
            <CardTitle className="text-blue-400 flex items-center gap-2 text-sm uppercase italic tracking-widest">
              <Sparkles className="w-4 h-4" /> Diagnóstico Central del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-widest animate-pulse">Sincronizando con redes neuronales MikroTik...</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                  <h4 className="text-[10px] uppercase font-black text-zinc-500 mb-2 tracking-widest">Resumen de Estado Vital</h4>
                  <p className="text-white text-xl font-black italic group-hover:neon-text-blue transition-all">"{oracleData?.statusSummary || 'Buscando anomalías...'}"</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[10px] uppercase font-black text-zinc-500 mb-4 tracking-widest flex items-center gap-2">
                      <Terminal className="w-3 h-3" /> Inteligencia Predictiva
                    </h4>
                    <p className="text-zinc-400 leading-relaxed text-sm font-light italic border-l-2 border-zinc-800 pl-4">{oracleData?.intelligence || 'El sistema está en fase de aprendizaje de patrones.'}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] uppercase font-black text-blue-500 mb-4 tracking-widest flex items-center gap-2">
                      <Zap className="w-3 h-3" /> Acción Proactiva
                    </h4>
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 border-dashed">
                      <p className="text-white text-sm font-medium">{oracleData?.recommendation || 'No se requiere intervención manual.'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a]/80 border-blue-500/20 glass-card flex flex-col items-center justify-center p-8 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-30" />
           <div className="relative w-40 h-40 mb-6">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="80" cy="80" r="70" fill="transparent" stroke="#111" strokeWidth="1" />
                <circle 
                  cx="80" cy="80" r="70" fill="transparent" stroke="currentColor" strokeWidth="2" 
                  className="text-blue-500/20"
                  strokeDasharray="10 10"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">ESTRÉS DE RED</span>
                <div className="text-3xl font-black text-white mt-1 tabular-nums">{(oracleData?.pulseIntensity || 0) * 10}%</div>
                <div 
                  className="w-3 h-3 rounded-full mt-2 vigilance-pulse" 
                  style={{ backgroundColor: oracleData?.pulseColor || '#3b82f6', boxShadow: `0 0 15px ${oracleData?.pulseColor || '#3b82f6'}` }} 
                />
              </div>
           </div>
           <p className="text-[9px] text-zinc-500 uppercase tracking-widest text-center mt-4 border-t border-zinc-900 pt-4 w-full">Calibración en curso</p>
        </Card>
      </div>

      <Card className="bg-[#0a0a0a] border-zinc-800 hardware-grid relative overflow-hidden">
        <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />
        <CardContent className="pt-8 relative z-10">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Input 
                value={question} 
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ingresa consulta técnica al cerebro central..." 
                className="bg-[#080808] border-zinc-800 text-white font-mono text-xs h-14 pl-12 focus:border-blue-500/50"
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
              />
              <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            </div>
            <Button 
              onClick={handleAsk}
              disabled={asking}
              className="h-14 bg-blue-600 hover:bg-blue-700 px-10 font-black uppercase tracking-widest text-xs"
            >
              {asking ? <RefreshCw className="animate-spin w-5 h-5" /> : 'SINC. NEURAL'}
            </Button>
          </div>
          {response && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 p-8 bg-zinc-950 rounded-3xl border border-zinc-800 shadow-2xl relative"
            >
              <div className="absolute top-4 right-6 flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-blue-500" />
                <div className="w-1 h-1 rounded-full bg-blue-500/50" />
                <div className="w-1 h-1 rounded-full bg-blue-500/20" />
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-500 vigilance-pulse" />
                </div>
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest italic">Análisis Finalizado:</span>
              </div>
              <p className="text-zinc-100 font-mono text-sm leading-relaxed whitespace-pre-wrap">{response}</p>
              <div className="mt-8 pt-6 border-t border-zinc-900 flex justify-between items-center text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                <span>Ref: AI-ORACLE-V2.5</span>
                <span>TS: {new Date().toLocaleTimeString()}</span>
              </div>
            </motion.div>
          )}
        </CardContent>
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
            {logs.map((l: any) => {
              const device = devices.find((d: any) => d.id === l.deviceId);
              // Format correctly to ensure browser treats SQLite timestamp as UTC
              const dateStr = l.timestamp.includes('T') ? l.timestamp : l.timestamp.replace(' ', 'T') + (l.timestamp.endsWith('Z') ? '' : 'Z');
              const localTime = new Date(dateStr).toLocaleString();
              
              return (
                <TableRow key={l.id} className="border-[#262626]">
                  <TableCell className="text-xs text-gray-500">{localTime}</TableCell>
                  <TableCell className="text-white">{device?.name || 'Sincronizador'}</TableCell>
                  <TableCell><Badge className={l.status === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>{l.status.toUpperCase()}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">{l.latency}ms</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function SettingsView({ settings, onRefresh }: any) {
  const [localSettings, setLocalSettings] = useState(settings || {});

  // Sync local state when props change
  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    try {
      await axios.post('/api/settings', localSettings);
      onRefresh();
      toast.success("Configuración guardada en el cerebro central");
    } catch (e) {
      toast.error("Error al guardar configuración");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header><h2 className="text-3xl font-bold text-white">Configuración</h2></header>
      <Card className="bg-[#111] border-[#262626] max-w-2xl">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label>Telegram Bot Token</Label>
            <Input className="bg-[#1a1a1a] border-[#262626]" value={localSettings.telegramBotToken || ""} onChange={e => setLocalSettings({...localSettings, telegramBotToken: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Telegram Chat ID (Varios usuarios, separar por coma)</Label>
            <Input className="bg-[#1a1a1a] border-[#262626]" placeholder="ID1, ID2, ID3" value={localSettings.telegramChatId || ""} onChange={e => setLocalSettings({...localSettings, telegramChatId: e.target.value})} />
            <p className="text-[10px] text-zinc-500">Ejemplo: 12345678, 87654321</p>
          </div>
          <Button onClick={handleSave} className="w-full bg-blue-600">Guardar Cambios</Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MaintenanceView({ devices }: any) {
  const [selectedRouterId, setSelectedRouterId] = useState("");
  const [pingTarget, setPingTarget] = useState("8.8.8.8");
  const [pingResults, setPingResults] = useState<any[]>([]);
  const [runningTool, setRunningTool] = useState<string | null>(null);

  const routers = devices.filter((d: any) => d.type === 'router' && d.status === 'up');

  const runPing = async () => {
    if (!selectedRouterId || !pingTarget) return;
    setRunningTool('ping');
    setPingResults([]);
    try {
      const res = await axios.post('/api/router-tools/ping', { deviceId: selectedRouterId, host: pingTarget });
      setPingResults(res.data);
      toast.success("Ping finalizado");
    } catch (e) {
      toast.error("Error en el ping");
    }
    setRunningTool(null);
  };

  const runSpeedtest = async () => {
    if (!selectedRouterId) return;
    setRunningTool('speedtest');
    try {
      const res = await axios.post('/api/router-tools/speedtest', { deviceId: selectedRouterId });
      toast.info("Prueba de ancho de banda finalizada.");
      console.log(res.data);
    } catch (e) {
      toast.error("Error en speedtest");
    }
    setRunningTool(null);
  };

  const runDnsCheck = async () => {
    if (!selectedRouterId) return;
    setRunningTool('dns');
    try {
      const res = await axios.post('/api/router-tools/ping', { deviceId: selectedRouterId, host: '8.8.8.8', count: 3 });
      const avg = res.data.reduce((acc: any, curr: any) => acc + parseFloat(curr.time || '0'), 0) / 3;
      toast.info(`DNS Google Ping: ${avg.toFixed(2)}ms (Desde Mikrotik)`);
    } catch (e) {
      toast.error("Error en check DNS");
    }
    setRunningTool(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-white">Panel de Mantenimiento</h2>
        <p className="text-zinc-400">Herramientas de diagnóstico ejecutadas desde el hardware MikroTik.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Ping Tool */}
        <Card className="bg-[#111] border-[#262626] md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-500" /> HERRAMIENTA DE PING
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label className="text-[10px] text-zinc-500 uppercase">Target / Host</Label>
                <Input value={pingTarget} onChange={e => setPingTarget(e.target.value)} className="bg-[#1a1a1a] border-[#262626] text-white" />
              </div>
              <div className="w-48 space-y-2">
                <Label className="text-[10px] text-zinc-500 uppercase">Origen (Router)</Label>
                <select 
                  className="w-full h-10 bg-[#1a1a1a] border-[#262626] rounded-md px-3 text-sm text-white"
                  value={selectedRouterId}
                  onChange={(e) => setSelectedRouterId(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {routers.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={runPing} disabled={!selectedRouterId || runningTool === 'ping'} className="w-full bg-blue-600 font-bold">
              {runningTool === 'ping' ? <RefreshCw className="animate-spin w-4 h-4 mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
              EJECUTAR PING DESDE MIKROTIK
            </Button>

            {pingResults.length > 0 && (
              <div className="mt-4 p-4 bg-black rounded-lg border border-zinc-800 font-mono text-xs space-y-1">
                {pingResults.map((r, i) => (
                  <div key={i} className="text-zinc-400">
                    <span className="text-blue-500">seq={i}</span> host={r.host || pingTarget} time={r.time}s size={r.size}B status={r.status || 'OK'}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic Buttons */}
        <div className="space-y-6">
          <Card className="bg-[#111] border-[#262626]">
            <CardHeader><CardTitle className="text-sm font-bold text-white">TEST DE VELOCIDAD</CardTitle></CardHeader>
            <CardContent>
              <Button 
                onClick={runSpeedtest} 
                className="w-full bg-orange-600 hover:bg-orange-700" 
                disabled={!selectedRouterId || !!runningTool}
              >
                <Gauge className="w-4 h-4 mr-2" /> SPEEDTEST CLI (UD/Bandwidth)
              </Button>
              <p className="text-[9px] text-zinc-500 mt-2 text-center">Ejecuta un Bandwidth Test UDP hacia el objetivo.</p>
            </CardContent>
          </Card>

          <Card className="bg-[#111] border-[#262626]">
            <CardHeader><CardTitle className="text-sm font-bold text-white">DIAGNÓSTICO DNS</CardTitle></CardHeader>
            <CardContent>
              <Button 
                onClick={runDnsCheck} 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={!selectedRouterId || !!runningTool}
              >
                <Globe className="w-4 h-4 mr-2" /> PING GOOGLE DNS (8.8.8.8)
              </Button>
              <p className="text-[9px] text-zinc-500 mt-2 text-center">Mide la latencia de salida real de tu MikroTik.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
