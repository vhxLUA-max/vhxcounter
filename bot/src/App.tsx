import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  Users, 
  Terminal, 
  Database, 
  Cpu, 
  Zap,
  Shield,
  Server,
  Globe,
  Lock
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([
    "[SYSTEM] Initializing vhxLUA Kernel...",
    "[NETWORK] Establishing Discord Gateway connection...",
    "[DATABASE] Supabase listener active.",
  ]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setStats(data);
        
        // Simulate real-time logs based on stats
        if (data.botStatus?.online) {
          setLogs(prev => {
            const newLog = `[BOT] Heartbeat received. Ping: ${data.botStatus.ping}ms. Commands: ${data.botStatus.commandsProcessed}`;
            if (prev[prev.length - 1] !== newLog) {
              return [...prev.slice(-15), newLog];
            }
            return prev;
          });
        }
      } catch (e) {
        console.error('Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#E0E0E0] font-mono selection:bg-[#00FF00] selection:text-black overflow-x-hidden">
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-50 bg-[length:100%_2px,3px_100%]" />

      {/* Header */}
      <header className="border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00FF00] flex items-center justify-center rounded-sm shadow-[0_0_15px_rgba(0,255,0,0.3)]">
              <Terminal className="text-black w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tighter text-white">vhxLUA<span className="text-[#00FF00]">.BOT</span></h1>
              <p className="text-[10px] text-[#666] uppercase tracking-widest">Management Interface v4.0.2</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-[11px] uppercase tracking-wider text-[#666]">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,0,0.5)]", stats?.botStatus?.online ? "bg-[#00FF00]" : "bg-red-500")} />
              <span>Bot: {stats?.botStatus?.online ? "Online" : "Offline"}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#111] border border-[#1A1A1A] rounded-full">
              <Globe className="w-3 h-3 text-[#00FF00]" />
              <span className="text-[#00FF00]">vhx.lua/dash</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Bot Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Bot Uptime" 
            value={stats?.botStatus?.uptime ? formatUptime(stats.botStatus.uptime) : "0h 0m 0s"} 
            icon={<Activity className="w-4 h-4" />}
            color="text-[#00FF00]"
          />
          <StatCard 
            label="Commands Processed" 
            value={stats?.botStatus?.commandsProcessed || "0"} 
            icon={<Zap className="w-4 h-4" />}
            trend={`+${stats?.botStatus?.commandsProcessed || 0}`}
          />
          <StatCard 
            label="Gateway Latency" 
            value={stats?.botStatus?.ping ? `${stats.botStatus.ping}ms` : "---"} 
            icon={<Cpu className="w-4 h-4" />}
            color="text-blue-500"
          />
          <StatCard 
            label="Connected Guilds" 
            value={stats?.botStatus?.guilds || "1"} 
            icon={<Users className="w-4 h-4" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bot Console */}
          <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg flex flex-col h-[450px] shadow-2xl">
            <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between bg-[#0D0D0D]">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#00FF00]" />
                Bot_Console_Output
              </h2>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500/20 border border-red-500/40" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                <div className="w-2 h-2 rounded-full bg-green-500/20 border border-green-500/40" />
              </div>
            </div>
            <div className="flex-1 bg-black p-4 font-mono text-[11px] overflow-y-auto space-y-1 custom-scrollbar relative">
              {/* Console Scanline Overlay */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] z-10 opacity-30" />
              
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 relative z-20">
                  <span className="text-[#333] select-none">[{i.toString().padStart(3, '0')}]</span>
                  <span className={cn(
                    log.includes('[ERR]') ? "text-red-500" : 
                    log.includes('[WARN]') ? "text-yellow-500" : 
                    log.includes('[SYSTEM]') ? "text-blue-400" : "text-[#00FF00]"
                  )}>
                    {log}
                  </span>
                </div>
              ))}
              <div className="animate-pulse inline-block w-2 h-4 bg-[#00FF00] ml-1 relative z-20" />
            </div>
          </div>

          {/* Bot Health / Metrics */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-6 flex flex-col shadow-2xl">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#00FF00]" />
              System_Health
            </h2>
            <div className="space-y-6">
              <HealthBar label="Memory Usage" percent={42} />
              <HealthBar label="CPU Load" percent={18} />
              <HealthBar label="API Latency" percent={12} color="bg-blue-500" />
              <HealthBar label="Database Sync" percent={98} color="bg-emerald-500" />
            </div>
            
            <div className="mt-8 space-y-4">
              <h3 className="text-[10px] font-bold text-[#444] uppercase tracking-widest border-b border-[#1A1A1A] pb-2">System Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] text-[#444] uppercase">Kernel</p>
                  <p className="text-[11px] text-white">v4.0.2-stable</p>
                </div>
                <div>
                  <p className="text-[9px] text-[#444] uppercase">Region</p>
                  <p className="text-[11px] text-white">US-EAST-1</p>
                </div>
                <div>
                  <p className="text-[9px] text-[#444] uppercase">Provider</p>
                  <p className="text-[11px] text-white">vhxLUA Cloud</p>
                </div>
                <div>
                  <p className="text-[9px] text-[#444] uppercase">Status</p>
                  <p className="text-[11px] text-[#00FF00]">Nominal</p>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-6">
              <div className="bg-black/50 p-3 rounded border border-[#1A1A1A] group hover:border-[#00FF00]/30 transition-colors">
                <p className="text-[9px] text-[#444] uppercase mb-1 flex items-center justify-between">
                  Clean Dashboard URL
                  <Globe className="w-2 h-2 text-[#00FF00]" />
                </p>
                <p className="text-[11px] text-[#00FF00] truncate font-bold">vhx.lua/dash</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mini Logs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-4">
            <h3 className="text-[10px] font-bold text-[#666] uppercase mb-3">Recent Moderation</h3>
            <div className="space-y-2">
              {stats?.bans?.slice(0, 3).map((ban: any, i: number) => (
                <div key={i} className="text-[10px] flex justify-between">
                  <span className="text-red-500">BAN: {ban.username}</span>
                  <span className="text-[#333]">{new Date().toLocaleTimeString()}</span>
                </div>
              )) || <p className="text-[10px] text-[#333]">No recent bans</p>}
            </div>
          </div>
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-4">
            <h3 className="text-[10px] font-bold text-[#666] uppercase mb-3">AI Interactions</h3>
            <div className="space-y-2">
              <div className="text-[10px] flex justify-between">
                <span className="text-[#00FF00]">ASK: "how to use..."</span>
                <span className="text-[#333]">12:42</span>
              </div>
              <div className="text-[10px] flex justify-between">
                <span className="text-[#00FF00]">ASK: "is pixel blade..."</span>
                <span className="text-[#333]">12:40</span>
              </div>
            </div>
          </div>
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-4">
            <h3 className="text-[10px] font-bold text-[#666] uppercase mb-3">Script Deployments</h3>
            <div className="space-y-2">
              {stats?.executions?.slice(0, 3).map((exec: any, i: number) => (
                <div key={i} className="text-[10px] flex justify-between">
                  <span className="text-blue-400">LOAD: {exec.game_name}</span>
                  <span className="text-[#333]">{exec.count}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto p-6 border-t border-[#1A1A1A] mt-12 bg-[#0A0A0A]/50 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <p className="text-[10px] text-[#444] uppercase tracking-widest">© 2026 vhxLUA Frameworks. Bot Control Unit.</p>
            <span className="text-[#1A1A1A] select-none">|</span>
            <p className="text-[10px] text-[#00FF00] uppercase tracking-widest font-bold">vhx.lua/dash</p>
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-[10px] text-[#444] hover:text-[#00FF00] transition-colors uppercase tracking-widest flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Security
            </a>
            <a href="#" className="text-[10px] text-[#444] hover:text-[#00FF00] transition-colors uppercase tracking-widest flex items-center gap-1">
              <Server className="w-3 h-3" />
              API Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, icon, trend, color = "text-[#00FF00]" }: any) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] p-4 rounded-lg hover:border-[#333] transition-all group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-[#666] uppercase tracking-widest font-bold">{label}</span>
        <div className={cn("p-1.5 rounded bg-[#111] group-hover:bg-[#1A1A1A] transition-colors", color)}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white tracking-tighter">{value}</span>
        {trend && <span className="text-[9px] text-[#00FF00] font-bold">{trend}</span>}
      </div>
    </div>
  );
}

function HealthBar({ label, percent, color = "bg-[#00FF00]" }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold">{label}</span>
        <span className="text-[10px] text-white font-mono">{percent}%</span>
      </div>
      <div className="h-1.5 w-full bg-[#111] rounded-full overflow-hidden border border-[#1A1A1A]">
        <div 
          className={cn("h-full transition-all duration-1000 ease-out", color)} 
          style={{ width: `${percent}%` }} 
        />
      </div>
    </div>
  );
}
