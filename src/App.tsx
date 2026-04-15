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
  History
} from 'lucide-react';
import { analyzeNetworkHealth, askOracle } from './services/geminiService';
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
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where,
  orderBy, 
  limit, 
  serverTimestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
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
  lastSeen?: any;
  telegramEnabled: boolean;
}

interface MonitoringLog {
  id: string;
  deviceId: string;
  timestamp: any;
  status: 'up' | 'down';
  latency: number;
}

interface BackupRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  fileName: string;
  size: string;
  timestamp: any;
  location: string;
  status: string;
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
  createdAt: any;
}

interface DynamicLease {
  ip: string;
  mac: string;
  hostName: string;
}

interface AppSettings {
  telegramBotToken: string;
  telegramChatId: string;
}

interface DeviceInterface {
  id: string;
  deviceId: string;
  name: string;
  status: 'up' | 'down';
  trafficIn: number;
  trafficOut: number;
  lastUpdate: any;
}

interface TelegramUser {
  id: string;
  name: string;
  chatId: string;
  active: boolean;
  createdAt: any;
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [antennas, setAntennas] = useState<Device[]>([]);
  const [logs, setLogs] = useState<MonitoringLog[]>([]);
  const [provisioning, setProvisioning] = useState<Provisioning[]>([]);
  const [interfaces, setInterfaces] = useState<DeviceInterface[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ telegramBotToken: '', telegramChatId: '' });
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Oracle AI State
  const [oracleData, setOracleData] = useState<any>(null);
  const [oracleLoading, setOracleLoading] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const unsubDevices = onSnapshot(query(collection(db, 'devices'), where('type', 'in', ['router', 'vps'])), (snapshot) => {
      setDevices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Device)));
    });

    const unsubAntennas = onSnapshot(query(collection(db, 'devices'), where('type', '==', 'antenna')), (snapshot) => {
      setAntennas(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Device)));
    });

    const unsubLogs = onSnapshot(query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MonitoringLog)));
    });

    const unsubProv = onSnapshot(collection(db, 'provisioning'), (snapshot) => {
      setProvisioning(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Provisioning)));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as AppSettings);
      }
    });

    const unsubInterfaces = onSnapshot(collection(db, 'interfaces'), (snapshot) => {
      setInterfaces(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DeviceInterface)));
    });

    const unsubTelegramUsers = onSnapshot(collection(db, 'telegram_users'), (snapshot) => {
      setTelegramUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TelegramUser)));
    });

    const unsubBackups = onSnapshot(query(collection(db, 'backups'), orderBy('timestamp', 'desc'), limit(50)), (snapshot) => {
      setBackups(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BackupRecord)));
    });

    return () => {
      unsubDevices();
      unsubAntennas();
      unsubLogs();
      unsubProv();
      unsubSettings();
      unsubInterfaces();
      unsubTelegramUsers();
      unsubBackups();
    };
  }, [user]);

  // Oracle AI Analysis Loop
  useEffect(() => {
    if (!user || devices.length === 0) return;

    const runAnalysis = async () => {
      setOracleLoading(true);
      const data = await analyzeNetworkHealth([...devices, ...antennas], logs);
      if (data) {
        setOracleData(data);
        // Save to Firestore for Telegram bot access
        await setDoc(doc(db, 'settings', 'oracle'), {
          ...data,
          updatedAt: serverTimestamp()
        });
      }
      setOracleLoading(false);
    };

    runAnalysis();
    const interval = setInterval(runAnalysis, 1800000); // Every 30 minutes (Eco-mode)
    return () => clearInterval(interval);
  }, [user, devices.length]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success("Bienvenido al sistema de monitoreo");
    } catch (err) {
      toast.error("Error al iniciar sesión");
    }
  };

  const handleLogout = () => signOut(auth);

  if (!isAuthReady) return <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">Cargando...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-[#141414] border border-[#262626] rounded-2xl shadow-2xl text-center"
        >
          <div className="mb-6 flex justify-center">
            <div className="p-4 bg-blue-500/10 rounded-full">
              <ShieldCheck className="w-12 h-12 text-blue-500" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">MikroTik Monitor</h1>
          <p className="text-gray-400 mb-8">Ingresa con tu cuenta autorizada para gestionar tu red.</p>
          <Button onClick={handleLogin} className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 transition-all">
            Iniciar con Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-100 font-sans overflow-hidden">
      <Toaster position="top-right" theme="dark" />
      
      {/* Sidebar */}
      <aside className="w-64 bg-[#111111] border-right border-[#262626] flex flex-col">
        <div className="p-6 border-bottom border-[#262626]">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-500" />
            <span className="text-xl font-bold tracking-tighter">M-MONITOR</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem 
            icon={<LayoutDashboard />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={<Wifi />} 
            label="Infraestructura" 
            active={activeTab === 'devices'} 
            onClick={() => setActiveTab('devices')} 
          />
          <SidebarItem 
            icon={<Server />} 
            label="Antenas" 
            active={activeTab === 'antennas'} 
            onClick={() => setActiveTab('antennas')} 
          />
          <SidebarItem 
            icon={<Network />} 
            label="Aprovisionamiento" 
            active={activeTab === 'provisioning'} 
            onClick={() => setActiveTab('provisioning')} 
          />
          <SidebarItem 
            icon={<Bell />} 
            label="Notificaciones" 
            active={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')} 
          />
          <SidebarItem 
            icon={<Terminal />} 
            label="Mantenimiento" 
            active={activeTab === 'maintenance'} 
            onClick={() => setActiveTab('maintenance')} 
          />
          <SidebarItem 
            icon={<SettingsIcon />} 
            label="Configuración" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
          <div className="mt-6 px-4">
            <button 
              onClick={() => setActiveTab('oracle')}
              className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden ${
                activeTab === 'oracle' 
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]' 
                  : 'bg-[#1a1a1a] text-purple-400 hover:bg-[#222] border border-purple-500/20'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Brain className={`w-6 h-6 ${activeTab === 'oracle' ? 'animate-pulse' : ''}`} />
              <div className="flex flex-col items-start">
                <span className="font-bold text-sm tracking-wider uppercase">Oráculo AI</span>
                <span className="text-[10px] opacity-60">Inteligencia Neuronal</span>
              </div>
              {oracleLoading && (
                <RefreshCw className="w-3 h-3 animate-spin absolute right-4 opacity-40" />
              )}
            </button>
          </div>
        </nav>

        <div className="p-4 border-top border-[#262626]">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a]">
            <img src={user.photoURL || ''} alt="avatar" className="w-8 h-8 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-500 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <DashboardView devices={[...devices, ...antennas]} logs={logs} interfaces={interfaces} oracleData={oracleData} />}
          {activeTab === 'devices' && <DevicesView devices={devices} interfaces={interfaces} mode="mikrotik" />}
          {activeTab === 'antennas' && <DevicesView devices={antennas} interfaces={[]} mode="antennas" />}
          {activeTab === 'provisioning' && <ProvisioningView provisioning={provisioning} />}
          {activeTab === 'notifications' && <NotificationsView telegramUsers={telegramUsers} />}
          {activeTab === 'maintenance' && <MaintenanceView devices={devices} backups={backups} />}
          {activeTab === 'settings' && <SettingsView settings={settings} />}
          {activeTab === 'oracle' && <OracleView devices={[...devices, ...antennas]} logs={logs} oracleData={oracleData} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NeuralPulse({ color = '#3b82f6', intensity = 5 }: { color?: string, intensity?: number }) {
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 4 / (intensity / 5),
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color, filter: 'blur(12px)' }}
      />
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 2 / (intensity / 5),
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="relative w-8 h-8 rounded-full border-2 shadow-[0_0_20px_rgba(0,0,0,0.5)] z-10"
        style={{ backgroundColor: color, borderColor: 'rgba(255,255,255,0.2)' }}
      />
      <div className="absolute z-20">
        <Zap className="w-4 h-4 text-white animate-pulse" />
      </div>
    </div>
  );
}

function OracleView({ devices, logs, oracleData }: { devices: Device[], logs: MonitoringLog[], oracleData: any }) {
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    const userQ = question;
    setQuestion('');
    setChat(prev => [...prev, { role: 'user', text: userQ }]);
    setLoading(true);

    const context = {
      devices: devices.map(d => ({ name: d.name, status: d.status, type: d.type })),
      recentLogs: logs.slice(0, 10),
      oracleAnalysis: oracleData
    };

    const answer = await askOracle(userQ, context);
    setChat(prev => [...prev, { role: 'ai', text: answer || 'No pude procesar la consulta.' }]);
    setLoading(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      <div className="relative p-12 rounded-[2.5rem] bg-[#0d0d0d] border border-purple-500/20 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full -ml-48 -mb-48" />
        
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className="p-6 bg-gradient-to-b from-purple-500/20 to-transparent rounded-full border border-purple-500/30">
            <Brain className="w-16 h-16 text-purple-400 animate-pulse" />
          </div>
          <h2 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            ORÁCULO NEURONAL
          </h2>
          <p className="text-zinc-400 max-w-2xl text-lg leading-relaxed">
            Conectado al núcleo de inteligencia artificial. Analizando patrones de red en tiempo real para predecir el futuro de tu infraestructura.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-black/40 border-purple-500/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Inteligencia
              </CardTitle>
            </CardHeader>
            <CardContent className="text-zinc-300 text-sm leading-relaxed">
              {oracleData?.intelligence || "Iniciando protocolos de análisis neuronal..."}
            </CardContent>
          </Card>
          
          <Card className="bg-black/40 border-blue-500/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4" /> Recomendación
              </CardTitle>
            </CardHeader>
            <CardContent className="text-zinc-300 text-sm leading-relaxed">
              {oracleData?.recommendation || "Calculando vectores de optimización..."}
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-orange-500/20 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4" /> Pulso Vital
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="text-4xl font-black text-white">{oracleData?.pulseIntensity || "?"}/10</div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(oracleData?.pulseIntensity || 0) * 10}%` }}
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 space-y-6">
          <div className="bg-black/60 rounded-3xl border border-white/5 p-6 h-[400px] overflow-y-auto space-y-4 scrollbar-hide">
            {chat.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
                <MessageSquare className="w-12 h-12 opacity-20" />
                <p>Haz una pregunta técnica al Oráculo...</p>
              </div>
            )}
            {chat.map((m, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] p-4 rounded-2xl ${
                  m.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-zinc-900 text-zinc-200 border border-white/5 rounded-tl-none'
                }`}>
                  {m.text}
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 p-4 rounded-2xl rounded-tl-none flex gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleAsk} className="relative">
            <Input 
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ej: ¿Cuál es el dispositivo con mayor latencia histórica?"
              className="w-full py-8 px-8 bg-zinc-900/50 border-white/10 rounded-2xl focus:ring-2 focus:ring-purple-500 transition-all text-lg pr-20"
            />
            <Button 
              type="submit"
              disabled={loading}
              className="absolute right-2 top-2 bottom-2 bg-purple-600 hover:bg-purple-700 rounded-xl px-6"
            >
              <Sparkles className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-100'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
      <span className="font-medium">{label}</span>
    </button>
  );
}

// --- Views ---

function DashboardView({ devices, logs, interfaces, oracleData }: { devices: Device[], logs: MonitoringLog[], interfaces: DeviceInterface[], oracleData: any }) {
  const [selectedInterface, setSelectedInterface] = useState<string>('all');
  const [temporality, setTemporality] = useState<string>('live');
  const [selectedMikrotik, setSelectedMikrotik] = useState<string>(devices.find(d => d.type === 'router')?.id || '');

  const stats = useMemo(() => {
    const up = devices.filter(d => d.status === 'up').length;
    const down = devices.filter(d => d.status === 'down').length;
    const avgLatency = logs.length > 0 ? logs.reduce((acc, l) => acc + l.latency, 0) / logs.length : 0;
    
    // Traffic stats
    const totalTrafficIn = interfaces.reduce((acc, i) => acc + (i.trafficIn || 0), 0);
    const totalTrafficOut = interfaces.reduce((acc, i) => acc + (i.trafficOut || 0), 0);
    
    return { up, down, avgLatency, totalTrafficIn, totalTrafficOut };
  }, [devices, logs, interfaces]);

  const chartData = useMemo(() => {
    const last24h = logs.filter(l => l.timestamp?.toDate() > new Date(Date.now() - 24 * 60 * 60 * 1000));
    return last24h.reverse().map(l => ({
      time: format(l.timestamp?.toDate() || new Date(), 'HH:mm'),
      latency: l.latency,
      status: l.status === 'up' ? 1 : 0
    }));
  }, [logs]);

  const trafficChartData = useMemo(() => {
    // Simulate traffic based on selection
    const baseIn = selectedInterface === 'all' 
      ? stats.totalTrafficIn 
      : interfaces.find(i => i.id === selectedInterface)?.trafficIn || 0;
    const baseOut = selectedInterface === 'all' 
      ? stats.totalTrafficOut 
      : interfaces.find(i => i.id === selectedInterface)?.trafficOut || 0;

    const points = temporality === 'live' ? 20 : temporality === '1h' ? 60 : 24;
    
    return Array.from({ length: points }).map((_, i) => ({
      time: i,
      in: (Math.random() * 0.4 + 0.8) * baseIn + (Math.random() * 500),
      out: (Math.random() * 0.4 + 0.8) * baseOut + (Math.random() * 200)
    }));
  }, [stats.totalTrafficIn, stats.totalTrafficOut, selectedInterface, temporality, interfaces]);

  const cpuChartData = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      time: i,
      usage: Math.floor(Math.random() * 30) + 10 // Simulated CPU usage 10-40%
    }));
  }, [selectedMikrotik]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-end">
        <div className="flex items-center gap-6">
          <NeuralPulse color={oracleData?.pulseColor} intensity={oracleData?.pulseIntensity} />
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
            <p className="text-zinc-400">
              {oracleData?.statusSummary || "Estado general de la infraestructura en tiempo real."}
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <Badge variant="outline" className="px-4 py-1 border-green-500/50 text-green-500 bg-green-500/5">
            {stats.up} Dispositivos Online
          </Badge>
          <Badge variant="outline" className="px-4 py-1 border-red-500/50 text-red-500 bg-red-500/5">
            {stats.down} Dispositivos Offline
          </Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Latencia Promedio" value={`${stats.avgLatency.toFixed(1)}ms`} icon={<Activity className="text-blue-500" />} />
        <StatCard title="Tráfico Entrante" value={`${(stats.totalTrafficIn / 1000000).toFixed(2)} Mbps`} icon={<Network className="text-green-500" />} />
        <StatCard title="Tráfico Saliente" value={`${(stats.totalTrafficOut / 1000000).toFixed(2)} Mbps`} icon={<Network className="text-purple-500" />} />
        <StatCard title="Uptime (24h)" value="99.9%" icon={<CheckCircle2 className="text-green-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#111111] border-[#262626]">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Latencia de Red (ms)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="time" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #262626', borderRadius: '8px' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Area type="monotone" dataKey="latency" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLatency)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[#111111] border-[#262626]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Network className="w-5 h-5 text-green-500" />
              Tráfico Real (Mbps)
            </CardTitle>
            <div className="flex gap-2">
              <Select value={selectedInterface} onValueChange={setSelectedInterface}>
                <SelectTrigger className="w-[120px] h-8 bg-[#1a1a1a] border-[#262626] text-xs">
                  <SelectValue placeholder="Interfaz" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#262626] text-white">
                  <SelectItem value="all">Todas</SelectItem>
                  {interfaces.map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={temporality} onValueChange={setTemporality}>
                <SelectTrigger className="w-[100px] h-8 bg-[#1a1a1a] border-[#262626] text-xs">
                  <SelectValue placeholder="Tiempo" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#262626] text-white">
                  <SelectItem value="live">En vivo</SelectItem>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="24h">24 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trafficChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #262626', borderRadius: '8px' }}
                  formatter={(value: number) => [`${(value / 1000000).toFixed(2)} Mbps`, '']}
                />
                <Line type="monotone" dataKey="in" stroke="#22c55e" strokeWidth={2} dot={false} name="IN" />
                <Line type="monotone" dataKey="out" stroke="#a855f7" strokeWidth={2} dot={false} name="OUT" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-[#111111] border-[#262626] lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Cpu className="w-5 h-5 text-orange-500" />
              Uso de Procesador (%)
            </CardTitle>
            <Select value={selectedMikrotik} onValueChange={setSelectedMikrotik}>
              <SelectTrigger className="w-[180px] h-8 bg-[#1a1a1a] border-[#262626] text-xs">
                <SelectValue placeholder="Seleccionar MikroTik" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#262626] text-white">
                {devices.filter(d => d.type === 'router' || d.type === 'vps').map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpuChartData}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #262626', borderRadius: '8px' }}
                  formatter={(value: number) => [`${value}%`, 'Uso CPU']}
                />
                <Area type="monotone" dataKey="usage" stroke="#f97316" fillOpacity={1} fill="url(#colorCpu)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[#111111] border-[#262626]">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Network className="w-5 h-5 text-green-500" />
              Puertos e Interfaces L2TP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {interfaces.slice(0, 8).map(i => {
                const isL2TP = i.name.toLowerCase().includes('l2tp');
                return (
                  <div key={i.id} className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${
                    isL2TP 
                      ? 'bg-purple-500/5 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                      : 'bg-[#1a1a1a] border-[#262626]'
                  }`}>
                    <div className={`w-3 h-3 rounded-full ${i.status === 'up' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                    <span className={`text-[10px] font-bold uppercase text-center truncate w-full ${isL2TP ? 'text-purple-400' : 'text-white'}`}>
                      {i.name}
                    </span>
                    <span className="text-[9px] text-gray-500">{i.status.toUpperCase()}</span>
                  </div>
                );
              })}
              {interfaces.length === 0 && <p className="col-span-2 text-center text-gray-500 py-4">No hay interfaces</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="bg-[#111111] border-[#262626]">
          <CardHeader>
            <CardTitle>Últimos Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {logs.slice(0, 5).map(l => {
                const device = devices.find(d => d.id === l.deviceId);
                return (
                  <div key={l.id} className="flex items-center gap-4 p-3 rounded-lg bg-[#1a1a1a] border border-[#262626]">
                    <div className={`p-2 rounded-full ${l.status === 'up' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {l.status === 'up' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{device?.name || 'Desconocido'}</p>
                      <p className="text-xs text-gray-500">{l.status === 'up' ? 'Conexión establecida' : 'Pérdida de paquetes'}</p>
                    </div>
                    <p className="text-xs text-gray-500">{format(l.timestamp?.toDate() || new Date(), 'HH:mm:ss')}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function NotificationsView({ telegramUsers }: { telegramUsers: TelegramUser[] }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newUser, setNewUser] = useState<Partial<TelegramUser>>({ active: true });

  const handleAdd = async () => {
    if (!newUser.name || !newUser.chatId) return toast.error("Nombre y Chat ID son requeridos");
    try {
      await addDoc(collection(db, 'telegram_users'), {
        ...newUser,
        createdAt: serverTimestamp()
      });
      setIsAddOpen(false);
      toast.success("Usuario de Telegram agregado");
    } catch (err) {
      toast.error("Error al agregar");
    }
  };

  const toggleActive = async (user: TelegramUser) => {
    await updateDoc(doc(db, 'telegram_users', user.id), { active: !user.active });
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Eliminar este usuario?")) {
      await deleteDoc(doc(db, 'telegram_users', id));
      toast.success("Usuario eliminado");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Usuarios Telegram</h2>
          <p className="text-zinc-400">Administra quién recibe las alertas del vigilante autónomo.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Agregar Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111111] border-[#262626] text-white">
            <DialogHeader>
              <DialogTitle>Nuevo Usuario de Telegram</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nombre / Alias</Label>
                <Input 
                  placeholder="Ej: Administrador Red" 
                  className="bg-[#1a1a1a] border-[#262626]" 
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Chat ID</Label>
                <Input 
                  placeholder="Ej: 123456789" 
                  className="bg-[#1a1a1a] border-[#262626]" 
                  onChange={e => setNewUser({...newUser, chatId: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 w-full">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-[#111111] border-[#262626]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#262626] hover:bg-transparent">
              <TableHead>Nombre</TableHead>
              <TableHead>Chat ID</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {telegramUsers.map(u => (
              <TableRow key={u.id} className="border-[#262626] hover:bg-[#1a1a1a]">
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="font-mono text-xs text-gray-500">{u.chatId}</TableCell>
                <TableCell>
                  <Switch 
                    checked={u.active} 
                    onCheckedChange={() => toggleActive(u)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <button onClick={() => handleDelete(u.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <Card className="bg-[#111111] border-[#262626]">
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-400 mb-1">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
        </div>
        <div className="p-3 bg-[#1a1a1a] rounded-xl border border-[#262626]">
          {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
        </div>
      </CardContent>
    </Card>
  );
}

function DevicesView({ devices, interfaces, mode }: { devices: Device[], interfaces: DeviceInterface[], mode: 'mikrotik' | 'antennas' }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDevice, setNewDevice] = useState<Partial<Device>>({ 
    type: mode === 'mikrotik' ? 'router' : 'antenna', 
    telegramEnabled: true 
  });

  const handleAdd = async () => {
    if (!newDevice.name || !newDevice.ip) return toast.error("Nombre e IP son requeridos");
    if (mode === 'mikrotik' && newDevice.type === 'router') {
      if (!newDevice.apiPort || !newDevice.username) return toast.error("Puerto API y Usuario son requeridos para MikroTik");
    }
    
    try {
      const docRef = await addDoc(collection(db, 'devices'), {
        ...newDevice,
        status: 'down',
        lastSeen: null
      });
      
      if (newDevice.type === 'router') {
        const standardPorts = ['ether1', 'ether2', 'ether3', 'wlan1'];
        const l2tpPorts = ['l2tp-out-google-cloud', 'l2tp-vpn-remote'];
        
        [...standardPorts, ...l2tpPorts].forEach(async (port) => {
          await addDoc(collection(db, 'interfaces'), {
            deviceId: docRef.id,
            name: port,
            status: 'up',
            trafficIn: Math.random() * 5000000,
            trafficOut: Math.random() * 2000000,
            lastUpdate: serverTimestamp()
          });
        });
      }

      setIsAddOpen(false);
      toast.success(mode === 'mikrotik' ? "Dispositivo API MikroTik agregado" : "Antena agregada");
    } catch (err) {
      toast.error("Error al agregar");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este elemento?")) {
      await deleteDoc(doc(db, 'devices', id));
      toast.success("Eliminado correctamente");
    }
  };

  const toggleTelegram = async (device: Device) => {
    await updateDoc(doc(db, 'devices', device.id), {
      telegramEnabled: !device.telegramEnabled
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            {mode === 'mikrotik' ? 'Infraestructura de Red' : 'Monitoreo de Antenas'}
          </h2>
          <p className="text-zinc-400">
            {mode === 'mikrotik' 
              ? 'Gestión de MikroTik y Túneles L2TP (Google Cloud).' 
              : 'Vigilancia de antenas con notificaciones por Telegram.'}
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> {mode === 'mikrotik' ? 'Agregar Dispositivo' : 'Agregar Antena'}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111111] border-[#262626] text-white">
            <DialogHeader>
              <DialogTitle>{mode === 'mikrotik' ? 'Nuevo Dispositivo' : 'Nueva Antena'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input 
                  placeholder={mode === 'mikrotik' ? "Ej: Router Principal" : "Ej: Antena Sectorial 1"} 
                  className="bg-[#1a1a1a] border-[#262626]" 
                  onChange={e => setNewDevice({...newDevice, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>IP Address</Label>
                <Input 
                  placeholder="192.168.1.10" 
                  className="bg-[#1a1a1a] border-[#262626]" 
                  onChange={e => setNewDevice({...newDevice, ip: e.target.value})}
                />
              </div>
              {mode === 'mikrotik' && (
                <>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <select 
                      className="w-full bg-[#1a1a1a] border-[#262626] rounded-md p-2 text-sm"
                      onChange={e => setNewDevice({...newDevice, type: e.target.value as any})}
                      defaultValue="router"
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
                </>
              )}
              <div className="flex items-center gap-2">
                <Switch 
                  checked={newDevice.telegramEnabled} 
                  onCheckedChange={checked => setNewDevice({...newDevice, telegramEnabled: checked})}
                />
                <Label>Notificaciones por Telegram</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 w-full">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-[#111111] border-[#262626]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#262626] hover:bg-transparent">
              <TableHead>Dispositivo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>IP / MAC</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map(d => (
              <TableRow key={d.id} className="border-[#262626] hover:bg-[#1a1a1a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${d.type === 'antenna' ? 'bg-orange-500/10 text-orange-500' : d.type === 'vps' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'}`}>
                      {d.type === 'antenna' ? <Wifi className="w-4 h-4" /> : d.type === 'vps' ? <Server className="w-4 h-4" /> : <Network className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="font-medium block">{d.name}</span>
                      {d.type === 'vps' && <span className="text-[10px] text-purple-400 uppercase font-bold">Enlace L2TP Cloud</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="capitalize text-gray-500 text-sm">{d.type}</TableCell>
                <TableCell>
                  <p className="font-mono text-xs">{d.ip}</p>
                  <p className="font-mono text-[10px] text-gray-600">{d.mac || 'N/A'}</p>
                </TableCell>
                <TableCell>
                  <Badge className={d.status === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
                    {d.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button onClick={() => toggleTelegram(d)} className="transition-colors">
                    {d.telegramEnabled ? <Bell className="w-4 h-4 text-blue-500" /> : <BellOff className="w-4 h-4 text-gray-600" />}
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <button onClick={() => handleDelete(d.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {devices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No hay {mode === 'mikrotik' ? 'dispositivos' : 'antenas'} registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function ProvisioningView({ provisioning }: { provisioning: Provisioning[] }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [dynamicLeases, setDynamicLeases] = useState<DynamicLease[]>([]);
  const [newProv, setNewProv] = useState<Partial<Provisioning>>({
    dhcpLease: true,
    arpEnabled: true,
    speedLimit: '10M/10M',
    interfaceName: 'SALIDA'
  });

  useEffect(() => {
    const fetchLeases = async () => {
      try {
        const res = await axios.get('/api/mikrotik/dynamic-leases');
        // Filter out those already provisioned
        const provisionedIps = provisioning.map(p => p.ip);
        const filtered = res.data.filter((l: DynamicLease) => !provisionedIps.includes(l.ip));
        setDynamicLeases(filtered);
      } catch (err) {
        console.error("Error fetching leases", err);
      }
    };
    fetchLeases();
    const interval = setInterval(fetchLeases, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [provisioning]);

  const handleSelectLease = (lease: DynamicLease) => {
    setNewProv({
      ...newProv,
      ip: lease.ip,
      mac: lease.mac,
      deviceName: lease.hostName
    });
    setIsAddOpen(true);
  };

  const handleAdd = async () => {
    if (!newProv.ip || !newProv.mac) return toast.error("IP y MAC son requeridos");
    try {
      await addDoc(collection(db, 'provisioning'), {
        ...newProv,
        createdAt: serverTimestamp()
      });
      setIsAddOpen(false);
      toast.success("Aprovisionamiento completado (DHCP + ARP + Velocidad)");
    } catch (err) {
      toast.error("Error al registrar");
    }
  };

  const toggleField = async (id: string, field: keyof Provisioning, value: boolean) => {
    await updateDoc(doc(db, 'provisioning', id), { [field]: value });
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Eliminar este registro?")) {
      await deleteDoc(doc(db, 'provisioning', id));
      toast.success("Registro eliminado");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Aprovisionamiento</h2>
          <p className="text-zinc-400">Gestión de DHCP Lease, ARP y Límites de Velocidad.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) setNewProv({ dhcpLease: true, arpEnabled: true, speedLimit: '10M/10M', interfaceName: 'SALIDA' });
        }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Aprovisionamiento
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111111] border-[#262626] text-white max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Cliente / Dispositivo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IP Address</Label>
                  <Input 
                    placeholder="192.168.88.50" 
                    className="bg-[#1a1a1a] border-[#262626]" 
                    value={newProv.ip || ''}
                    onChange={e => setNewProv({...newProv, ip: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>MAC Address</Label>
                  <Input 
                    placeholder="AA:BB:CC:DD:EE:FF" 
                    className="bg-[#1a1a1a] border-[#262626]" 
                    value={newProv.mac || ''}
                    onChange={e => setNewProv({...newProv, mac: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nombre del Cliente (Usado en DHCP, ARP y Queues)</Label>
                <Input 
                  placeholder="Ej: Cliente_Juan_Perez" 
                  className="bg-[#1a1a1a] border-[#262626]" 
                  value={newProv.deviceName || ''}
                  onChange={e => setNewProv({...newProv, deviceName: e.target.value})}
                />
                <p className="text-[10px] text-gray-500 italic">Este nombre identificará el Lease, la entrada ARP y la Simple Queue.</p>
              </div>
              <div className="space-y-2">
                <Label>Configuración de Queues (Límite de Velocidad)</Label>
                <Input 
                  placeholder="Ej: 10M/10M" 
                  defaultValue="10M/10M"
                  className="bg-[#1a1a1a] border-[#262626]" 
                  onChange={e => setNewProv({...newProv, speedLimit: e.target.value})}
                />
                <p className="text-[10px] text-gray-500 italic">Define la velocidad de bajada/subida para la Simple Queue.</p>
              </div>
              
              <div className="pt-2">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">Pasos de Aprovisionamiento</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#262626]">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-blue-500" />
                      <Label>1. DHCP Static Lease</Label>
                    </div>
                    <Switch 
                      defaultChecked 
                      onCheckedChange={v => setNewProv({...newProv, dhcpLease: v})}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#262626]">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      <Label>2. ARP Entry (IP-MAC)</Label>
                    </div>
                    <Switch 
                      defaultChecked 
                      onCheckedChange={v => setNewProv({...newProv, arpEnabled: v})}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1a1a] border border-[#262626]">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-500" />
                      <Label>3. Simple Queue (Velocidad)</Label>
                    </div>
                    <Switch 
                      defaultChecked 
                      disabled
                      checked={true}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Interfaz ARP</Label>
                <Input 
                  value={newProv.interfaceName || 'SALIDA'} 
                  disabled
                  className="bg-[#1a1a1a] border-[#262626] opacity-70" 
                />
                <p className="text-[10px] text-blue-500 italic">Por defecto: SALIDA (Configuración de red)</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 w-full">Provisionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {dynamicLeases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-blue-400">
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Leases Dinámicos Detectados (Nuevos)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dynamicLeases.map(lease => (
              <motion.div
                key={lease.ip}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => handleSelectLease(lease)}
                className="bg-[#111111] border border-blue-500/20 p-4 rounded-xl cursor-pointer hover:border-blue-500/50 transition-all group"
              >
                <div className="flex justify-between items-start mb-2">
                  <Badge className="bg-blue-500/10 text-blue-400 border-none text-[10px]">DINÁMICO</Badge>
                  <Plus className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                </div>
                <p className="text-lg font-mono font-bold text-white">{lease.ip}</p>
                <p className="text-xs text-zinc-500 font-mono mb-2">{lease.mac}</p>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Server className="w-3 h-3" />
                  <span>{lease.hostName || 'Desconocido'}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <Card className="bg-[#111111] border-[#262626]">
        <Table>
          <TableHeader>
            <TableRow className="border-[#262626] hover:bg-transparent">
              <TableHead>Cliente / IP</TableHead>
              <TableHead>MAC</TableHead>
              <TableHead>Interfaz</TableHead>
              <TableHead>DHCP</TableHead>
              <TableHead>Velocidad</TableHead>
              <TableHead>Estado Servicio</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {provisioning.map(p => (
              <TableRow key={p.id} className={`border-[#262626] transition-colors ${!p.arpEnabled ? 'bg-red-500/5 opacity-80' : 'hover:bg-[#1a1a1a]'}`}>
                <TableCell>
                  <p className="font-medium">{p.deviceName || 'Sin nombre'}</p>
                  <p className="font-mono text-xs text-blue-400">{p.ip}</p>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-400">{p.mac}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-none text-[10px]">
                    {p.interfaceName || 'SALIDA'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={p.dhcpLease} 
                    onCheckedChange={v => toggleField(p.id, 'dhcpLease', v)}
                    className="scale-75"
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/5">
                    {p.speedLimit || 'N/A'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button 
                    size="sm"
                    variant={p.arpEnabled ? "outline" : "destructive"}
                    className={`h-8 px-3 text-xs font-bold uppercase tracking-tighter ${p.arpEnabled ? 'border-green-500/50 text-green-500 hover:bg-green-500/10' : ''}`}
                    onClick={() => {
                      toggleField(p.id, 'arpEnabled', !p.arpEnabled);
                      toast.info(p.arpEnabled ? `Servicio CORTADO para ${p.deviceName}` : `Servicio ACTIVADO para ${p.deviceName}`);
                    }}
                  >
                    {p.arpEnabled ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" /> Activo</>
                    ) : (
                      <><XCircle className="w-3 h-3 mr-1" /> Cortado</>
                    )}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <button onClick={() => handleDelete(p.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function MaintenanceView({ devices, backups }: { devices: Device[], backups: BackupRecord[] }) {
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [target, setTarget] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [command, setCommand] = useState<'ping' | 'traceroute' | 'speedtest' | 'backup'>('ping');

  const routers = devices.filter(d => d.type === 'router' || d.type === 'vps');

  const runCommand = async () => {
    if (!selectedDevice && command !== 'speedtest') return toast.error("Selecciona un dispositivo");
    
    if (command === 'backup') {
      setLoading(true);
      setOutput(prev => [...prev, `> Iniciando respaldo de seguridad para el dispositivo...`]);
      try {
        await axios.post('/api/maintenance/backup', { deviceId: selectedDevice });
        setOutput(prev => [...prev, `✅ Respaldo completado con éxito.`, `📁 Archivo guardado en MikroTik y replicado en VPS.`, `📲 Notificación enviada a Telegram.`]);
        toast.success("Backup completado");
      } catch (err) {
        setOutput(prev => [...prev, `❌ Error al generar el respaldo.`]);
        toast.error("Error en backup");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!target && command !== 'speedtest') return toast.error("Ingresa un destino");
    
    setLoading(true);
    const cmdLabel = command === 'speedtest' ? 'Speedtest' : command;
    const targetLabel = target ? ` hacia ${target}` : '';
    setOutput(prev => [...prev, `> Ejecutando ${cmdLabel}${targetLabel}...`]);
    
    try {
      const response = await axios.post('/api/maintenance/run', {
        deviceId: selectedDevice,
        command,
        target
      });
      
      const lines = response.data.output.split('\n');
      setOutput(prev => [...prev, ...lines]);
    } catch (err) {
      setOutput(prev => [...prev, `Error: No se pudo conectar con el router o el comando falló.`]);
      toast.error("Error en la ejecución");
    } finally {
      setLoading(false);
    }
  };

  const clearConsole = () => setOutput([]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-white">Mantenimiento</h2>
        <p className="text-zinc-400">Ejecuta herramientas de diagnóstico y gestiona respaldos de tus MikroTik.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <Card className="bg-[#111111] border-[#262626]">
            <CardHeader>
              <CardTitle>Herramientas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Dispositivo de Origen</Label>
                <select 
                  className="w-full bg-[#1a1a1a] border-[#262626] rounded-md p-2 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                >
                  <option value="">Seleccionar Dispositivo...</option>
                  {routers.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.ip}) - {r.type.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {command !== 'backup' && (
                <div className="space-y-2">
                  <Label>Destino (Opcional para Speedtest)</Label>
                  <Input 
                    placeholder="8.8.8.8 o google.com" 
                    className="bg-[#1a1a1a] border-[#262626]" 
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Comando</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={command === 'ping' ? 'default' : 'outline'}
                    className={`text-xs ${command === 'ping' ? 'bg-blue-600' : 'border-[#262626]'}`}
                    onClick={() => setCommand('ping')}
                  >
                    Ping
                  </Button>
                  <Button 
                    variant={command === 'traceroute' ? 'default' : 'outline'}
                    className={`text-xs ${command === 'traceroute' ? 'bg-blue-600' : 'border-[#262626]'}`}
                    onClick={() => setCommand('traceroute')}
                  >
                    Trace
                  </Button>
                  <Button 
                    variant={command === 'speedtest' ? 'default' : 'outline'}
                    className={`text-xs ${command === 'speedtest' ? 'bg-blue-600' : 'border-[#262626]'}`}
                    onClick={() => setCommand('speedtest')}
                  >
                    Speed
                  </Button>
                  <Button 
                    variant={command === 'backup' ? 'default' : 'outline'}
                    className={`text-xs ${command === 'backup' ? 'bg-blue-600' : 'border-[#262626]'}`}
                    onClick={() => setCommand('backup')}
                  >
                    <Database className="w-3 h-3 mr-1" /> Backup
                  </Button>
                </div>
              </div>

              <Button 
                onClick={runCommand} 
                disabled={loading}
                className={`w-full ${command === 'backup' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {loading ? 'Ejecutando...' : command === 'backup' ? 'Generar Backup Ahora' : 'Iniciar Diagnóstico'}
              </Button>
              
              {command === 'backup' && (
                <p className="text-[10px] text-zinc-500 text-center italic">
                  * Los backups automáticos se ejecutan todos los domingos a las 3:00 AM.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#111111] border-[#262626]">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-zinc-400" /> Historial de Backups
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[300px] overflow-y-auto">
                {backups.map(b => (
                  <div key={b.id} className="p-3 border-b border-[#262626] hover:bg-white/5 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-white truncate max-w-[150px]">{b.fileName}</span>
                      <Badge className="text-[8px] h-3 px-1 bg-green-500/20 text-green-500 border-none">OK</Badge>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-zinc-500">
                      <span>{b.deviceName}</span>
                      <span>{b.timestamp?.toDate().toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {backups.length === 0 && (
                  <p className="p-4 text-center text-xs text-zinc-600 italic">No hay respaldos registrados.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2 bg-[#050505] border-[#262626] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#262626] py-3">
            <CardTitle className="text-sm font-mono text-zinc-400 flex items-center gap-2">
              <Terminal className="w-4 h-4" /> Consola de Salida
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={clearConsole} className="text-xs text-zinc-500 hover:text-white">
              Limpiar
            </Button>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-[500px]">
            <div className="p-4 font-mono text-xs space-y-1 overflow-y-auto max-h-[600px]">
              {output.length === 0 && (
                <p className="text-zinc-700 italic">Esperando comandos...</p>
              )}
              {output.map((line, i) => (
                <p key={i} className={line.startsWith('>') ? 'text-blue-400' : line.startsWith('✅') ? 'text-green-400' : line.startsWith('❌') ? 'text-red-400' : 'text-zinc-300'}>
                  {line}
                </p>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-blue-500 animate-pulse">
                  <span>_</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function SettingsView({ settings }: { settings: AppSettings }) {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), localSettings);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error("Error al guardar");
    }
  };

  const testTelegram = async () => {
    if (!localSettings.telegramBotToken || !localSettings.telegramChatId) return toast.error("Completa los campos de Telegram");
    try {
      await axios.post('/api/notify', {
        token: localSettings.telegramBotToken,
        chatId: localSettings.telegramChatId,
        message: "<b>[TEST]</b> Notificaciones de MikroTik Monitor configuradas correctamente. ✅"
      });
      toast.success("Mensaje de prueba enviado");
    } catch (err) {
      toast.error("Error al enviar prueba");
    }
  };

  const setWebhook = async () => {
    if (!localSettings.telegramBotToken) return toast.error("Token de Bot requerido");
    const webhookUrl = `${window.location.origin}/api/telegram-webhook`;
    try {
      await axios.post(`https://api.telegram.org/bot${localSettings.telegramBotToken}/setWebhook`, {
        url: webhookUrl
      });
      toast.success("Webhook de Telegram configurado");
    } catch (err) {
      toast.error("Error al configurar Webhook");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8 max-w-2xl"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-white">Configuración</h2>
        <p className="text-zinc-400">Ajustes globales del sistema y notificaciones.</p>
      </header>

      <Card className="bg-[#111111] border-[#262626]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" />
            Telegram Bot (Vigilante)
          </CardTitle>
          <CardDescription>Configura las alertas y el panel interactivo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Bot Token</Label>
            <Input 
              type="password"
              placeholder="123456789:ABCdefGHIjkl..." 
              className="bg-[#1a1a1a] border-[#262626]" 
              value={localSettings.telegramBotToken}
              onChange={e => setLocalSettings({...localSettings, telegramBotToken: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Chat ID Principal (Alertas)</Label>
            <Input 
              placeholder="-100123456789" 
              className="bg-[#1a1a1a] border-[#262626]" 
              value={localSettings.telegramChatId}
              onChange={e => setLocalSettings({...localSettings, telegramChatId: e.target.value})}
            />
          </div>

          <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
            <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Panel Interactivo en Telegram
            </h4>
            <p className="text-xs text-zinc-400">
              Para activar los paneles interactivos (Estado, Antenas, Clientes), debes configurar el Webhook.
            </p>
            <div className="text-[10px] font-mono bg-black/50 p-2 rounded break-all text-zinc-500">
              URL: {window.location.origin}/api/telegram-webhook
            </div>
            <Button onClick={setWebhook} variant="outline" className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs h-8">
              Configurar Webhook Automáticamente
            </Button>
          </div>

          <div className="flex gap-4 pt-4">
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 flex-1">Guardar Cambios</Button>
            <Button onClick={testTelegram} variant="outline" className="border-[#262626] hover:bg-[#1a1a1a]">Probar</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#111111] border-[#262626]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-[#1a1a1a] border border-[#262626]">
            <div>
              <p className="font-medium">Acceso Restringido</p>
              <p className="text-xs text-gray-500">Solo usuarios autorizados pueden modificar la configuración.</p>
            </div>
            <Switch checked={true} disabled />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
