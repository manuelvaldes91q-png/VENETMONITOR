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
  ShieldAlert,
  Rocket,
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
  Send,
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
  queueType: string;
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
      // Automatic polling disabled for Zero-Traffic mode. 
      // Status updates are handled via Push Webhooks from MikroTik.
    }
  }, [isLoggedIn]);

  // Oracle AI Analysis - (Manual trigger only now for Lite mode)
  const runAnalysis = async () => {
    if (!isLoggedIn || devices.length === 0) return;
    setOracleLoading(true);
    const data = await analyzeNetworkHealth(devices, logs);
    if (data) {
      setOracleData(data);
      await axios.post('/api/oracle', data);
    }
    setOracleLoading(false);
  };

  const askOracle = async (question: string) => {
    return await askOracleAI(question, { devices, logs });
  };

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-[#00ff00] p-4 font-mono">
        <div className="w-full max-w-md terminal-box border-2 border-[#00ff00]">
          <div className="terminal-header mb-6">
            <span className="text-[10px] font-bold">[ VNET-OS ACCESS PROTOCOL ]</span>
            <Terminal className="w-4 h-4" />
          </div>
          <div className="p-4 space-y-6 text-center">
            <div>
              <div className="inline-block p-4 border border-[#00ff00] mb-4">
                <Lock className="w-8 h-8" />
              </div>
              <h1 className="text-xl font-bold tracking-[0.2em] mb-1">AUTH_REQUIRED</h1>
              <p className="text-[10px] text-[#008800] uppercase">Base de datos local (SQLite) activada.</p>
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute -top-2 left-3 bg-black px-2 text-[8px] font-bold">PASSWORD_INPUT</span>
                <input 
                  type="password" 
                  placeholder="********" 
                  className="w-full bg-black border border-[#004400] px-4 py-3 text-center text-[#00ff00] focus:border-[#00ff00] outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              <button onClick={handleLogin} className="w-full py-4 text-sm bg-[#00ff00] text-black font-black uppercase hover:opacity-90 transition-all">
                Access System
              </button>
            </div>
            <div className="text-[9px] text-[#004400] flex justify-between">
              <span>TRAFFIC_OPT: ENABLED</span>
              <span>DEV_MODE: OFF</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-[#00ff00] font-mono overflow-hidden relative">
      <Toaster position="top-right" theme="dark" richColors />
      
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 bg-black border-r border-[#004400] flex-col relative z-10">
        <div className="p-6 border-b border-[#004400]">
          <h1 className="text-xl font-black tracking-tighter flex items-center gap-2">
            <span className="text-black bg-[#00ff00] px-1 px-1.5">V</span>
            <span>VENET <span className="text-[10px] border border-[#00ff00] px-1 ml-1 font-normal">CLI-V1</span></span>
          </h1>
          <p className="text-[9px] text-[#008800] font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
            <Activity className="w-2 h-2 animate-pulse" /> OPTIMIZED MODE
          </p>
        </div>
        
        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: '01. RESUMEN' },
            { id: 'oracle', icon: Brain, label: '02. ORACULO_AI' },
            { id: 'infrastructure', icon: Server, label: '03. MIKROTIK' },
            { id: 'antennas', icon: Wifi, label: '04. ANTENAS' },
            { id: 'provisioning', icon: Zap, label: '05. SERVIDUMB' },
            { id: 'tools', icon: Wrench, label: '06. TOOLS' },
            { id: 'logs', icon: Activity, label: '07. HISTORY' },
            { id: 'settings', icon: SettingsIcon, label: '08. SETTINGS' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 transition-all border ${
                activeTab === item.id 
                ? 'bg-[#003300] border-[#00ff00] text-white' 
                : 'text-[#008800] border-transparent hover:border-[#004400] hover:text-[#00ff00]'
              }`}
            >
              <item.icon className="w-3 h-3" />
              <span className="font-bold text-[9px] uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#004400]">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-[#004400] hover:text-red-500 transition-colors"
          >
            <LogOut className="w-3 h-3" />
            <span className="font-bold text-[9px] uppercase tracking-widest">Logout.sh</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto h-full">
            {activeTab === 'dashboard' && <DashboardView devices={devices} logs={logs} settings={settings} />}
            {activeTab === 'oracle' && <OracleView devices={devices} logs={logs} onAsk={askOracle} oracleData={oracleData} loading={oracleLoading} onManualTrigger={runAnalysis} />}
            {activeTab === 'infrastructure' && <InfrastructureView mode="mikrotik" devices={devices.filter((d: any) => d.type !== 'antenna')} onRefresh={fetchData} />}
            {activeTab === 'antennas' && <InfrastructureView mode="antennas" devices={devices.filter((d: any) => d.type === 'antenna')} onRefresh={fetchData} />}
            {activeTab === 'provisioning' && <ProvisioningView provisioning={provisioning} devices={devices} onRefresh={fetchData} />}
            {activeTab === 'tools' && <MaintenanceView devices={devices} />}
            {activeTab === 'logs' && <LogsView logs={logs} devices={devices} />}
            {activeTab === 'settings' && <SettingsView settings={settings} onRefresh={fetchData} />}
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t-2 border-[#00ff00] z-50 px-1 py-1">
        <div className="flex justify-around items-center">
          {[
            { id: 'dashboard', icon: Terminal },
            { id: 'oracle', icon: Terminal },
            { id: 'infrastructure', icon: Terminal },
            { id: 'antennas', icon: Terminal },
            { id: 'provisioning', icon: Terminal },
            { id: 'tools', icon: Terminal },
            { id: 'settings', icon: Terminal },
          ].map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`p-2 transition-none flex flex-col items-center gap-1 border-t-2 mt-[-2px] ${
                activeTab === item.id 
                ? 'border-[#00ff00] text-[#00ff00] bg-[#00ff00]/10' 
                : 'border-transparent text-[#004400]'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-[7px] font-black">{String(idx + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Sub-Views ---

function DashboardView({ devices, settings }: any) {
  const [globalStats, setGlobalStats] = useState<any>(null);

  const stats = useMemo(() => {
    const routers = devices.filter((d: any) => d.type === 'router');
    const antennas = devices.filter((d: any) => d.type === 'antenna');
    return {
      routersUp: routers.filter((d: any) => d.status === 'up').length,
      routersDown: routers.filter((d: any) => d.status === 'down').length,
      antennasUp: antennas.filter((d: any) => d.status === 'up').length,
      antennasDown: antennas.filter((d: any) => d.status === 'down').length,
      total: devices.length
    };
  }, [devices]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const gRes = await axios.get('/api/global-stats');
        setGlobalStats(gRes.data);
      } catch (e) {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // 30s light heart-beat
    return () => clearInterval(interval);
  }, [devices]);

  return (
    <div className="space-y-6 select-none">
      <header className="flex justify-between items-end border-b border-[#004400] pb-4">
        <div>
          <h2 className="text-2xl font-black tracking-[0.3em] uppercase underline decoration-double">LINK_GATEWAY</h2>
          <p className="text-[9px] text-[#008800] font-bold uppercase tracking-widest mt-1">[ CLOUD_PASSIVE_GATEWAY / ZERO_TRAFFIC_POLL ]</p>
        </div>
        <div className="terminal-box py-1 px-3 border-[#00ff00]">
          <span className="text-[8px] text-[#008800] block">LAST_EVENT</span>
          <span className="text-sm font-bold uppercase text-[#00ff00]">PUSH_READY</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['WAN1', 'WAN2'].map(wan => {
          const data = globalStats?.wanStatus?.[wan];
          const status = data?.status || 'waiting';
          const isUp = status === 'up';
          const isDown = status === 'down';
          const isWaiting = status === 'waiting';

          return (
            <div key={wan} className={`terminal-box border-l-4 ${
              isUp ? 'border-l-[#00ff00]' : 
              isDown ? 'border-l-red-600' : 
              'border-l-orange-500 animate-pulse'
            }`}>
              <div className="flex justify-between items-center px-1">
                <div>
                  <h3 className="text-[9px] text-[#008800] uppercase font-bold">{wan} :: {data?.name || 'LINK'}</h3>
                  <div className={`text-xl font-black mt-1 ${
                    isUp ? 'text-[#00ff00]' : 
                    isDown ? 'text-red-600' : 
                    'text-orange-500'
                  }`}>
                    {isUp ? 'OPERATIVE' : isDown ? 'NO_SIGNAL' : 'WAITING_SIGNAL'}
                  </div>
                </div>
                <div className="text-[10px] font-bold">
                  [{isUp ? 'UP' : isDown ? 'DOWN' : '??'}]
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'RT_STATUS', val: `${stats.routersUp}/${stats.routersUp + stats.routersDown}`, color: 'text-[#00ff00]' },
          { label: 'ANT_STATUS', val: `${stats.antennasUp}/${stats.antennasUp + stats.antennasDown}`, color: 'text-[#00ff00]' },
          { label: 'PUSH_NODES', val: devices.length, color: 'text-white' },
          { label: 'CORE_GATEWAY', val: 'STANDBY', color: 'text-[#008800]' },
        ].map((s, i) => (
          <div key={i} className="terminal-box py-2 flex flex-col items-center justify-center border-dashed border-[#004400]">
            <span className="text-[8px] font-bold text-[#008800] uppercase">{s.label}</span>
            <div className={`text-lg font-black ${s.color}`}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="terminal-box p-4 border-[#004400] bg-[#001100]/20">
         <div className="flex items-start gap-3">
            <Terminal className="w-4 h-4 text-[#00ff00] mt-1" />
            <div className="space-y-1">
               <h4 className="text-[10px] font-bold uppercase text-[#00ff00]">Modo Pasarela MikroTik Activo</h4>
               <p className="text-[9px] text-[#008800] leading-relaxed">
                  El sistema no genera tráfico saliente por monitoreo. El estado de WANs y Antenas se actualiza únicamente vía PUSH Webhook desde el MikroTik local. 
                  Asegúrate de que tus scripts de Netwatch estén enviando notificaciones al endpoint del VPS para ver cambios aquí.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}

function InfrastructureView({ mode, devices, onRefresh }: any) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [cliDevice, setCliDevice] = useState<Device | null>(null);
  const [newDevice, setNewDevice] = useState<Partial<Device>>({
    type: mode === 'mikrotik' ? 'router' : 'antenna',
    telegramEnabled: true
  });

  const handleAdd = async () => {
    if (!newDevice.name || !newDevice.ip) return toast.error("EX_ERR: REQ_FIELDS_NULL");
    try {
      if ((newDevice as any).id) {
        await axios.patch(`/api/devices/${(newDevice as any).id}`, newDevice);
        toast.success("ENTRY_UPDATED");
      } else {
        await axios.post('/api/devices', newDevice);
        toast.success("ENTRY_CREATED");
      }
      setIsAddOpen(false);
      setNewDevice({ type: mode === 'mikrotik' ? 'router' : 'antenna', telegramEnabled: true });
      onRefresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "SYS_FAILURE");
    }
  };

  const getMikroTikScript = (device: Device) => {
    const isWan = device.name.toUpperCase().includes('WAN');
    const host = isWan ? (device.name.toUpperCase().includes('WAN1') ? '8.8.8.8' : '9.9.9.9') : device.ip;
    
    const baseUrl = `${window.location.origin}/api/mikrotik/webhook`;
    
    return `/tool netwatch add host=${host} interval=30s comment="${device.name}" \\
    up-script="/tool fetch url=\\"${baseUrl}?resource_id=${device.name}&status=up\\" keep-result=no" \\
    down-script="/tool fetch url=\\"${baseUrl}?resource_id=${device.name}&status=down\\" keep-result=no"`;
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center terminal-box border-b-2 border-b-[#00ff00] p-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-widest">{mode === 'mikrotik' ? 'INFR_MIKROTIK' : 'NODE_EQUIPMENT'}</h2>
          <p className="text-[9px] text-[#008800] font-bold uppercase">NODES_MOUNTED: {devices.length}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <button className="terminal-btn flex items-center gap-2">
                <Plus className="w-3 h-3" /> REGISTER_HARDWARE
              </button>
            </DialogTrigger>
            <DialogContent className="bg-black border-2 border-[#00ff00] text-[#00ff00] font-mono rounded-none">
              <DialogHeader><DialogTitle className="text-[#00ff00] font-bold uppercase">SYS_REGISTRY::V01</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-[#008800]">Identity (Ej: WAN1, Antena-01)</Label>
                  <input value={newDevice.name || ''} className="terminal-input w-full" onChange={e => setNewDevice({...newDevice, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-[#008800]">Network_IP (IP de la Antena)</Label>
                  <input value={newDevice.ip || ''} className="terminal-input w-full" onChange={e => setNewDevice({...newDevice, ip: e.target.value})} />
                </div>
              </div>
              <DialogFooter><button onClick={handleAdd} className="terminal-btn w-full py-4 text-sm bg-[#00ff00] text-black">COMMIT_CHANGES</button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="terminal-box p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="terminal-header text-[10px] border-b border-[#004400]">
              <th className="p-3">EQUIPMENT_ID</th>
              <th className="p-3">NETWORK_ADDR</th>
              <th className="p-3 text-center">STATUS</th>
              <th className="p-3 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d: Device) => (
              <tr key={d.id} className="border-b border-[#002200] hover:bg-[#003300]/20 text-[11px] font-bold">
                <td className="p-3 flex items-center gap-2">
                   {d.type === 'router' ? <Server className="w-3 h-3 text-[#008800]" /> : <Wifi className="w-3 h-3 text-[#008800]" />}
                   <span>{d.name.toUpperCase()}</span>
                </td>
                <td className="p-3 text-[#008800]">{d.ip}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 border ${d.status === 'up' ? 'border-[#00ff00] text-[#00ff00]' : 'border-red-600 text-red-600'}`}>
                    {d.status.toUpperCase()}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                   <button 
                     onClick={() => setCliDevice(d)} 
                     className="text-[#00ff00] hover:underline"
                   >
                     [CLI]
                   </button>
                   <button onClick={() => axios.delete(`/api/devices/${d.id}`).then(onRefresh)} className="text-[#004400] hover:text-red-500">[DEL]</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!cliDevice} onOpenChange={() => setCliDevice(null)}>
        <DialogContent className="bg-black border-2 border-[#00ff00] text-[#00ff00] font-mono rounded-none max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#00ff00] font-bold uppercase">MIKROTIK_CLI_CONFIG :: {cliDevice?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <p className="text-[10px] text-[#008800]">Pega este código en la terminal de tu MikroTik (New Terminal) para que este equipo sea monitoreado:</p>
             <pre className="bg-[#001100] p-4 text-[9px] text-[#00ff00] border border-[#004400] overflow-x-auto whitespace-pre-wrap decoration-none">
                {cliDevice ? getMikroTikScript(cliDevice) : ''}
             </pre>
             <div className="p-2 border border-[#004400] bg-yellow-500/10 text-[8px] text-yellow-500">
                IMPORTANTE: Este script usa Netwatch. Tu MikroTik necesita tener acceso a Internet para enviar la notificación fetch al VPS.
             </div>
          </div>
          <DialogFooter>
             <button onClick={() => setCliDevice(null)} className="terminal-btn px-6 text-sm">CERRAR</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProvisioningView({ provisioning, devices, onRefresh }: any) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newProv, setNewProv] = useState<Partial<Provisioning>>({ speedLimit: '10M/10M', interfaceName: 'SALIDA', queueType: 'default-small' });
  const [leases, setLeases] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [selectedRouterId, setSelectedRouterId] = useState("");

  const routers = devices.filter((d: any) => d.type === 'router' && d.status === 'up');

  const uniqueProvisioning = useMemo(() => {
    const seen = new Set();
    return provisioning.filter((p: Provisioning) => {
      const key = `${p.routerId}-${p.mac}-${p.ip}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [provisioning]);

  useEffect(() => {
    if (routers.length > 0 && !selectedRouterId) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId]);

  useEffect(() => {
    if (selectedRouterId) {
      fetchLeases(selectedRouterId);
      const inv = setInterval(() => fetchLeases(selectedRouterId), 300000); // 5 min
      return () => clearInterval(inv);
    }
  }, [selectedRouterId]);

  const fetchLeases = async (routerId: string) => {
    if (!routerId) return;
    setSyncing(true);
    try {
      const res = await axios.get(`/api/router-tools/dhcp-leases/${routerId}`);
      setLeases(res.data);
      onRefresh();
    } catch (e: any) {
      toast.error("Error al sincronizar leases");
    }
    setSyncing(false);
  };

  const importLease = (lease: any) => {
    const existing = provisioning.find(p => p.mac === lease.mac_address || p.ip === lease.address);
    if (existing) {
      setNewProv({ ...existing, routerId: selectedRouterId });
    } else {
      setNewProv({
        deviceName: (lease.comment || lease['host-name'] || '').toUpperCase() || 'NUEVO CLIENTE',
        ip: lease.address,
        mac: lease.mac_address,
        routerId: selectedRouterId,
        speedLimit: '10M/10M',
        queueType: 'default-small',
        interfaceName: 'SALIDA',
        arpEnabled: 1
      });
    }
    setIsAddOpen(true);
  };

  const handleAdd = async () => {
    if (!newProv.deviceName) return toast.error("Nombre requerido");
    setSyncing(true);
    try {
      await axios.post('/api/provisioning', newProv);
      toast.success("Cliente Activado");
      setIsAddOpen(false);
      onRefresh();
    } catch (e: any) {
      toast.error("Error de aprovisionamiento");
    } finally {
      setSyncing(false);
    }
  };
  const toggleArp = async (p: Provisioning) => {
    await axios.patch(`/api/provisioning/${p.id}`, { arpEnabled: !p.arpEnabled });
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center terminal-box p-4 border-b-2 border-[#00ff00]">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-widest">QUEUE_MANAGER</h2>
          <p className="text-[9px] text-[#008800] font-bold uppercase">DHCP / ARP / TRAFFIC_FILTER</p>
        </div>
        <div className="flex gap-2">
           <button className="terminal-btn flex items-center gap-2" onClick={() => fetchLeases(selectedRouterId)}>
             <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} /> DHCP_SYNC
          </button>
          <button className="terminal-btn bg-[#00ff00] text-black" onClick={() => setIsAddOpen(true)}>
            [+] MANUAL_ACTIVATE
          </button>
        </div>
      </header>

      {leases.filter(l => l.dynamic === 'true' || l.dynamic === true).length > 0 && (
        <div className="terminal-box border-[#00ff00]/30 p-0">
          <div className="bg-[#003300]/20 p-2 text-[9px] font-bold uppercase border-b border-[#00ff00]/30">DETECTION_ALERT: UNPROVISIONED_LEASES_FOUND</div>
          <table className="w-full">
            <tbody>
              {leases.filter(l => l.dynamic === 'true' || l.dynamic === true).map((l, i) => (
                <tr key={i} className="border-b border-[#002200] text-[10px]">
                  <td className="p-3 font-bold text-[#00ff00]">{l.comment || l['host-name'] || 'NONAME'}</td>
                  <td className="p-3 text-[#008800]">{l.address}</td>
                  <td className="p-3 text-right">
                    <button className="terminal-btn py-1 text-[8px]" onClick={() => importLease(l)}>PROV.EXE</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="terminal-box p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="terminal-header text-[10px] border-b border-[#004400]">
              <th className="p-3">CLIENT_ID</th>
              <th className="p-3">NETWORK_BIND</th>
              <th className="p-3">BW_PROFILE</th>
              <th className="p-3 text-center">LINK</th>
              <th className="p-3 text-right">MNT</th>
            </tr>
          </thead>
          <tbody>
            {uniqueProvisioning.map((p: any) => (
              <tr key={p.id} className="border-b border-[#002200] hover:bg-[#003300]/20 text-[11px] font-bold">
                <td className="p-3 uppercase truncate max-w-[120px]">{p.deviceName}</td>
                <td className="p-3 text-[#008800] font-mono text-[9px]">
                  {p.ip}<br/>{p.mac}
                </td>
                <td className="p-3 text-[#00ff00] text-[10px]">{p.speedLimit}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 border ${p.arpEnabled ? 'border-[#00ff00] text-[#00ff00]' : 'border-red-600 text-red-600'}`}>
                    {p.arpEnabled ? 'ALIVE' : 'SUSP'}
                  </span>
                </td>
                <td className="p-3 text-right">
                   <div className="flex justify-end gap-2">
                      <button onClick={() => axios.patch(`/api/provisioning/${p.id}`, { arpEnabled: !p.arpEnabled }).then(onRefresh)} className="text-[#004400] hover:text-[#00ff00]">
                        {p.arpEnabled ? '[OFF]' : '[ON]'}
                      </button>
                      <button onClick={() => axios.put(`/api/provisioning/${p.id}/sync`).then(() => toast.success("SYNC_OK"))} className="text-[#004400] hover:text-blue-500">[SNYC]</button>
                      <button onClick={() => confirm("DELETE?") && axios.delete(`/api/provisioning/${p.id}`).then(onRefresh)} className="text-[#004400] hover:text-red-500">[DEL]</button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-black border-2 border-[#00ff00] text-[#00ff00] font-mono rounded-none">
          <DialogHeader><DialogTitle className="text-[#00ff00] uppercase font-bold tracking-widest">PROV_PROTOCOL_INIT :: V2</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-1">
               <Label className="text-[10px] uppercase text-[#008800]">Entity_Identity</Label>
               <input value={newProv.deviceName || ''} className="terminal-input w-full" onChange={e => setNewProv({...newProv, deviceName: e.target.value})} />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-[#008800]">Static_IP</Label>
                  <input value={newProv.ip || ''} className="terminal-input w-full" onChange={e => setNewProv({...newProv, ip: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-[#008800]">Limit_BW (RX/TX)</Label>
                  <input value={newProv.speedLimit || ''} className="terminal-input w-full" onChange={e => setNewProv({...newProv, speedLimit: e.target.value})} />
                </div>
             </div>
          </div>
          <DialogFooter><button onClick={handleAdd} disabled={syncing} className="terminal-btn w-full py-4 bg-[#00ff00] text-black">DEPLOY_QUEUE</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OracleView({ devices, logs, onAsk, oracleData, loading, onManualTrigger }: any) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const handleAsk = async () => {
    if (!question) return;
    setAsking(true);
    await onAsk(question);
    setAsking(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto h-full flex flex-col pt-4">
      <div className="terminal-box border-[#00ff00] p-0 flex-1 flex flex-col">
        <div className="terminal-header">
           <span className="text-[10px] font-bold">ORACLE_BRAIN_V2.0 :: KERNEL_ACTIVE</span>
           <Brain className="w-4 h-4" />
        </div>
        
        <div className="flex-1 p-6 space-y-6 overflow-y-auto font-mono text-xs">
           <div className="space-y-2">
             <div className="text-[#008800] uppercase font-bold tracking-tighter">{">>"} SYS_DIAGNOSTIC_FEED:</div>
             <div className="terminal-box border-dashed border-[#004400] bg-[#001100]/30 min-h-[100px] flex items-center justify-center text-center">
               {loading ? (
                 <div className="flex items-center gap-3 animate-pulse">
                   <RefreshCw className="w-3 h-3 animate-spin" />
                   <span>PROCESSING_NEURAL_LAYERS...</span>
                 </div>
               ) : (
                 <p className="italic text-white max-w-lg">"{oracleData?.statusSummary || 'WAITING_FOR_INPUT_COMMAND...'}"</p>
               )}
             </div>
           </div>

           <div className="flex gap-4">
             <button onClick={onManualTrigger} className="terminal-btn flex-1 bg-[#00ff00] text-black font-black">
               EXEC_DEEP_ANALYZE.sh
             </button>
           </div>

           <div className="space-y-2 pt-6 border-t border-[#002200]">
             <div className="text-[#008800] uppercase font-bold tracking-tighter">{">>"} INTERACTIVE_SHELL:</div>
             <div className="flex gap-2">
               <span className="text-[#00ff00]">$</span>
               <input 
                 value={question} 
                 onChange={e => setQuestion(e.target.value)}
                 placeholder="QUERY_THE_SYSTEM..."
                 className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[#00ff00] caret-[#00ff00]"
                 onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
               />
               <button onClick={handleAsk} disabled={asking} className="text-[#00ff00] hover:underline underline-offset-4">
                 [EXEC]
               </button>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function LogsView({ logs = [], devices = [] }: any) {
  return (
    <div className="space-y-6">
      <header className="border-b border-[#004400] pb-2">
        <h2 className="text-xl font-bold tracking-widest uppercase">SYS_LOG_VIEWER</h2>
      </header>
      <div className="terminal-box p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="terminal-header text-[9px]">
              <th className="p-3">TIMESTAMP</th>
              <th className="p-3">RESOURCE_ID</th>
              <th className="p-3 text-center">EVENT</th>
              <th className="p-3 text-right">LTCY</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[10px]">
            {Array.isArray(logs) && logs.length > 0 ? logs.map((l: any) => {
              const device = devices.find((d: any) => d.id === l.deviceId);
              let localTime = "??:??:??";
              try {
                if (l.timestamp) {
                  const dateStr = l.timestamp.includes('T') ? l.timestamp : l.timestamp.replace(' ', 'T') + (l.timestamp.endsWith('Z') ? '' : 'Z');
                  localTime = new Date(dateStr).toLocaleTimeString();
                }
              } catch (e) {}

              const status = (l.status || 'unknown').toUpperCase();
              
              return (
                <tr key={l.id || Math.random()} className="border-b border-[#002200] text-[#008800]">
                  <td className="p-3 opacity-60">{localTime}</td>
                  <td className="p-3 text-white">{device?.name?.toUpperCase() || 'SYS_EVENT'}</td>
                  <td className="p-3 text-center">
                    <span className={status === 'UP' ? 'text-[#00ff00]' : 'text-red-600'}>[{status}]</span>
                  </td>
                  <td className="p-3 text-right">{l.latency || 0}ms</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={4} className="p-8 text-center text-[#004400] italic">
                  NO_LOG_ENTRIES_FOUND_IN_BUFFER
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsView({ settings, onRefresh }: any) {
  const [localSettings, setLocalSettings] = useState(settings || {});
  useEffect(() => { if (settings) setLocalSettings(settings); }, [settings]);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const handleTestTelegram = async () => {
    if (!localSettings.telegramBotToken || !localSettings.telegramChatId) return toast.error("TOKEN_NULL");
    setTestingTelegram(true);
    try {
      await axios.post('/api/test-telegram', { token: localSettings.telegramBotToken, chatId: localSettings.telegramChatId });
      toast.success("TELEGRAM_TEST_SENT");
    } catch (e: any) {
      toast.error("TELEGRAM_ERR");
    } finally { setTestingTelegram(false); }
  };

  const handleSave = async () => {
    try {
      await axios.post('/api/settings', localSettings);
      onRefresh();
      toast.success("CORE_SETTINGS_SAVED");
    } catch (e) { toast.error("SAVE_ERR"); }
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-[#004400] pb-2">
        <h2 className="text-xl font-bold uppercase tracking-widest">SYS_CONTROL_PANEL</h2>
      </header>
      <div className="terminal-box max-w-2xl p-6 space-y-6 border-dashed">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-[#008800]">{">>"} TELEGRAM_BOT_TOKEN</Label>
            <input 
              className="terminal-input w-full font-mono text-xs" 
              placeholder="123456:ABC..."
              value={localSettings.telegramBotToken || ""} 
              onChange={e => setLocalSettings({...localSettings, telegramBotToken: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-[#008800]">{">>"} TELEGRAM_CHAT_ID</Label>
            <input 
              className="terminal-input w-full font-mono text-xs" 
              placeholder="-100123456..." 
              value={localSettings.telegramChatId || ""} 
              onChange={e => setLocalSettings({...localSettings, telegramChatId: e.target.value})} 
            />
          </div>
        </div>
        
        <div className="flex gap-4 pt-4">
          <button onClick={handleTestTelegram} disabled={testingTelegram} className="terminal-btn flex-1 border-[#004400] text-[#008800] hover:border-[#00ff00]">
            TEST_NOTIFY.exe
          </button>
          <button onClick={handleSave} className="terminal-btn flex-1 bg-[#00ff00] text-black">
            SAV_PROTOCOL_COMMIT
          </button>
        </div>
      </div>

      <div className="terminal-box max-w-4xl border-dashed border-[#004400]">
        <div className="terminal-header text-[10px] uppercase font-bold text-[#00ff00]">MIKROTIK_PUSH_CONFIGURATION (CLI)</div>
        <div className="p-4 space-y-4">
           <p className="text-[10px] text-[#008800] uppercase font-bold">Copia y pega estos comandos en tu terminal MikroTik para activar el monitoreo reactivo y ahorrar datos:</p>
           
           <div className="space-y-4">
             <div>
               <Label className="text-[9px] text-zinc-500 font-mono"># 01. WAN1 MONITOR (PING 8.8.8.8)</Label>
               <pre className="bg-[#001100] p-3 text-[9px] text-[#00ff00] overflow-x-auto border border-[#004400]">
{`/tool netwatch add host=8.8.8.8 interval=30s \\
    up-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook\\" http-method=post http-data=\\"{\\\\\\"resource_id\\\\\\":\\\\\\"WAN1\\\\\\",\\\\\\"status\\\\\\":\\\\\\"up\\\\\\"}\\" keep-result=no" \\
    down-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook\\" http-method=post http-data=\\"{\\\\\\"resource_id\\\\\\":\\\\\\"WAN1\\\\\\",\\\\\\"status\\\\\\":\\\\\\"down\\\\\\"}\\" keep-result=no"`}
               </pre>
             </div>

             <div>
               <Label className="text-[9px] text-zinc-500 font-mono"># 02. WAN2 MONITOR (PING 9.9.9.9)</Label>
               <pre className="bg-[#001100] p-3 text-[9px] text-[#00ff00] overflow-x-auto border border-[#004400]">
{`/tool netwatch add host=9.9.9.9 interval=30s \\
    up-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook\\" http-method=post http-data=\\"{\\\\\\"resource_id\\\\\\":\\\\\\"WAN2\\\\\\",\\\\\\"status\\\\\\":\\\\\\"up\\\\\\"}\\" keep-result=no" \\
    down-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook\\" http-method=post http-data=\\"{\\\\\\"resource_id\\\\\\":\\\\\\"WAN2\\\\\\",\\\\\\"status\\\\\\":\\\\\\"down\\\\\\"}\\" keep-result=no"`}
               </pre>
             </div>

             <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-[9px] text-yellow-500 uppercase">
                <b>NOTA:</b> Reemplaza "WAN1" y "WAN2" en los scripts superiores con el nombre que registraste en el sistema. Para Antenas, usa la IP de la antena como 'host' en Netwatch.
             </div>
           </div>
        </div>
      </div>
    </div>
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
      toast.success("PING_FINISH");
    } catch (e) { toast.error("PING_ERR"); }
    setRunningTool(null);
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-[#004400] pb-2">
        <h2 className="text-xl font-bold uppercase tracking-widest">NET_DIAGNOSTIC_TOOLS</h2>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="terminal-box p-0">
          <div className="terminal-header font-bold text-[10px]">ICMP_ECHO_GENERATOR (PING)</div>
          <div className="p-4 space-y-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                 <Label className="text-[9px] uppercase text-[#008800]">ADDR_TARGET</Label>
                 <input value={pingTarget} onChange={e => setPingTarget(e.target.value)} className="terminal-input w-full h-8 text-xs" />
               </div>
               <div className="space-y-1">
                 <Label className="text-[9px] uppercase text-[#008800]">SRC_ROUTER</Label>
                 <select className="terminal-input w-full h-8 text-xs" value={selectedRouterId} onChange={(e) => setSelectedRouterId(e.target.value)}>
                   <option value="">SELECT...</option>
                   {routers.map((r: any) => <option key={r.id} value={r.id}>{r.name.toUpperCase()}</option>)}
                 </select>
               </div>
             </div>
             <button onClick={runPing} disabled={!selectedRouterId || !!runningTool} className="terminal-btn w-full bg-[#00ff00] text-black">
               {runningTool ? 'PING_EXECUTING...' : 'EXEC_ICMP_PROBE'}
             </button>

             {pingResults.length > 0 && (
               <div className="mt-4 p-3 bg-[#001100] border border-[#004400] font-mono text-[9px] text-[#008800] space-y-1">
                 {pingResults.map((r, i) => (
                   <div key={i}>
                     <span className="text-[#00ff00]">[{i}]</span> ADDR={r.host || pingTarget} TIME={r.time}s SIZE={r.size}B STAT={r.status || 'OK'}
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>

        <div className="space-y-4">
           <div className="terminal-box">
              <h3 className="text-[10px] font-bold uppercase mb-4 text-[#008800]">{">>"} BANDWIDTH_TEST (UDP)</h3>
              <button 
                onClick={async () => {
                  setRunningTool('speedtest');
                  try {
                    await axios.post('/api/router-tools/speedtest', { deviceId: selectedRouterId });
                    toast.info("SPEEDTEST_FINISH");
                  } catch (e) { toast.error("ERR"); }
                  setRunningTool(null);
                }} 
                className="terminal-btn w-full border-orange-600 text-orange-600 hover:bg-orange-600 hover:text-black"
                disabled={!selectedRouterId || !!runningTool}
              >
                EXEC_BW_PROBE
              </button>
           </div>
           <div className="terminal-box">
              <h3 className="text-[10px] font-bold uppercase mb-4 text-[#008800]">{">>"} DNS_LATENCY_QUERY</h3>
              <button 
                onClick={async () => {
                  setRunningTool('dns');
                  try {
                    const res = await axios.post('/api/router-tools/ping', { deviceId: selectedRouterId, host: '8.8.8.8', count: 3 });
                    const avg = res.data.reduce((acc: any, curr: any) => acc + parseFloat(curr.time || '0'), 0) / 3;
                    toast.info(`DNS_AVG: ${avg.toFixed(2)}ms`);
                  } catch (e) { toast.error("ERR"); }
                  setRunningTool(null);
                }} 
                className="terminal-btn w-full border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-black"
                disabled={!selectedRouterId || !!runningTool}
              >
                QUERY_8.8.8.8
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
