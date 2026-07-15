"use client";

import {
  Activity,
  ListFilter,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Info,
  
  Crosshair,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronDown,
  ChevronUp,
  History,
  Timer,
  Zap,
  CheckSquare,
  Square,
  FileSearch,
  X
} from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useState, useMemo, useEffect } from "react";
import { ClientDate } from "@/components/client-date";
import { getStatusBadge } from "@/lib/utils";

export default function Monitoring() {
  const { data: strategies, loading, error, refetch } = useFetch<any[]>("/api/strategies", []);
  
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'STRATEGY_TRANSITION' ) {
        // Debounce refetch to avoid massive rerenders if multiple transitions happen quickly
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          refetch();
        }, 1000);
      }
    };
    window.addEventListener('app-update', handleAppUpdate);
    return () => {
      window.removeEventListener('app-update', handleAppUpdate);
      clearTimeout(timeout);
    };
  }, [refetch]);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drawerData, setDrawerData] = useState<any | null>(null);

  const renderEvidence = (ruleId: string, evidence: any) => {
    if (!evidence || Object.keys(evidence).length === 0) {
      return <span className="text-[10px] text-zinc-600">No detailed evidence provided for {ruleId}.</span>;
    }
    
    return (
      <div className="grid grid-cols-2 gap-2 mt-1">
        {Object.entries(evidence).map(([k, v]: [string, any], idx) => {
          let displayVal = String(v);
          if (typeof v === 'object' && v !== null) {
            // Check if it's a candle or specific object
            if (v.price !== undefined) displayVal = `Price: ${v.price}`;
            else if (v.type && v.top && v.bottom) displayVal = `${v.type.toUpperCase()} FVG (${v.bottom.toFixed(2)} - ${v.top.toFixed(2)})`;
            else displayVal = JSON.stringify(v);
          } else if (typeof v === 'number') {
            displayVal = v.toFixed(2);
          }
          return (
            <div key={idx} className="flex flex-col bg-zinc-950 p-1.5 rounded border border-zinc-800/50">
              <span className="text-[8px] text-zinc-500 uppercase">{k.replace(/_/g, ' ')}</span>
              <span className="text-[10px] text-zinc-300 font-mono truncate">{displayVal}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const getStatusIcon = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (['approved', 'signal_active', 'take_partial', 'finished', 'win', 'valid'].some(x => s === x || s.includes(x))) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (['active', 'validated', 'live', 'connected', 'healthy', 'online'].some(x => s === x || s.includes(x))) return <PlayCircle className="w-3.5 h-3.5 text-blue-500" />;
    if (['rejected', 'error', 'disconnected', 'unavailable', 'block', 'invalid'].some(x => s === x || s.includes(x))) return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
    if (['warning', 'stale', 'degraded', 'reconnecting', 'suppressed'].some(x => s === x || s.includes(x))) return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    if (['expired', 'history', 'awaiting', 'idle', 'cached'].some(x => s === x || s.includes(x))) return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    return <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-700 bg-zinc-900" />;
  };

  const getStepDisplayName = (strategyId: string, stepName: string) => {
    const map: Record<string, Record<string, string>> = {
      'strategy-1-smc': {
        'IDLE': 'Idle', 'WAIT_SESSION': 'Session: London', 'WAIT_TREND': 'Trend: HTF', 
        'WAIT_LEVEL': 'Level: Asia High/Low', 'WAIT_SWEEP': 'Liquidity Sweep', 
        'WAIT_CONFIRMATION': 'CHoCH Confirmation', 'WAIT_RETEST': 'Pullback to FVG/OB', 
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'TAKE_PARTIAL': 'Take Partial', 'FINISHED': 'Finished'
      },
      'strategy-2-snd': {
        'IDLE': 'Idle', 'WAIT_TREND': 'Trend: MA50/MA200', 'WAIT_LEVEL': 'Zone: Supply/Demand', 
        'WAIT_SWEEP': 'Touch Zone & Imbalance', 'WAIT_CONFIRMATION': 'Engulfing Pattern', 
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      },
      'strategy-3-scalping': {
        'IDLE': 'Idle', 'WAIT_TREND': 'Trend: H1', 'WAIT_RETRACEMENT': 'Retracement (M15)', 
        'WAIT_SWEEP': 'Liquidity Sweep', 'WAIT_PATTERN': 'Double Bottom / Top (M1)', 
        'WAIT_NECKLINE_BREAK': 'Neckline Break', 'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      },
      'strategy-4-news': {
        'IDLE': 'Idle', 'WAIT_NEWS': 'High Impact News', 'WAIT_SWEEP': 'Liquidity Sweep', 
        'WAIT_REJECTION': 'Strong Rejection', 'WAIT_STRUCTURE': 'BOS / Structure Change', 
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      },
      'strategy-5-smc-sd-confluence': {
        'IDLE': 'Idle', 'WAIT_STRUCTURE': 'Market Structure (H1/M15)', 'WAIT_ZONE': 'Zone Detection (M15)',
        'WAIT_SWEEP': 'Liquidity Sweep (M5/M15)', 'WAIT_CONFIRMATION': 'Entry Trigger (M1/M5)',
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      }
    };
    return map[strategyId]?.[stepName] || stepName.replace(/_/g, ' ');
  };

  const getSetupStatus = (steps: any[], stratStatus: string) => {
     if (stratStatus === 'stopped' || stratStatus === 'disabled') return 'disabled';
     if (!steps || steps.length === 0) return 'not configured';
     
     const currentStep = [...steps].reverse().find(s => s.status !== 'awaiting') || steps[0];
     
     if (currentStep.status === 'rejected') return 'rejected';
     if (currentStep.status === 'expired') return 'expired';
     if (currentStep.status === 'suppressed') return 'suppressed';

     const stepName = currentStep.name;
     if (['FINISHED', 'TAKE_PARTIAL'].includes(stepName)) return 'finished';
     if (stepName === 'SIGNAL_ACTIVE') return 'approved';
     if (stepName === 'WAIT_AI' && currentStep.status === 'approved') return 'validated';
     if (stepName === 'IDLE') return 'awaiting';
     return 'active';
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredStrategies = useMemo(() => {
    let result = strategies?.filter(s => {
      if (filter !== "all") {
        if (filter === "active" && ['stopped', 'disabled', 'not configured'].includes(s.status?.toLowerCase())) return false;
        if (filter !== "active" && s.status?.toLowerCase() !== filter) return false;
      }
      if (search) {
        if (!s.name?.toLowerCase().includes(search.toLowerCase()) && !s.id?.toLowerCase().includes(search.toLowerCase())) return false;
      }
      return true;
    }) || [];

    result = result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === "updatedAt") {
        aVal = new Date(a.updatedAt || 0).getTime();
        bVal = new Date(b.updatedAt || 0).getTime();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [strategies, filter, search, sortField, sortDir]);

  return (
    <div className="space-y-6 h-full pb-20 relative">
      {/* Compact summary bar */}
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
            <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-zinc-400" />
                SCAN / MONITORING
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
                <p className="text-[10px] text-zinc-500">Urutan setup per strategi</p>
                <span className="text-[10px] text-zinc-500">•</span>
                <span className="text-[10px] font-medium text-zinc-400">{filteredStrategies?.length || 0} strategies</span>
            </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 min-h-[36px]">
                    <Search className="w-3.5 h-3.5 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search strategy..." 
                      className="bg-transparent border-none outline-none text-[10px] text-zinc-300 w-28 md:w-40 placeholder:text-zinc-600 focus:ring-0"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2.5">
                    <select 
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors focus:outline-none min-h-[36px]"
                    >
                        <option value="all">Filter: All</option>
                        <option value="active">Active Only</option>
                        <option value="stopped">Stopped Only</option>
                    </select>
                    <select 
                        value={sortDir}
                        onChange={(e) => setSortDir(e.target.value)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors focus:outline-none min-h-[36px]"
                    >
                        <option value="desc">Sort: Newest First</option>
                        <option value="asc">Sort: Oldest First</option>
                    </select>
                </div>
            </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-5 h-5 border-2 border-zinc-800 border-t-zinc-300 rounded-full animate-spin mb-4"></div>
          <p className="text-[11px] text-zinc-500 font-medium">Scanning strategies...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-rose-900/30 rounded-xl bg-rose-950/10">
          <AlertTriangle className="w-8 h-8 text-rose-500/80 mb-4" />
          <p className="text-[11px] font-bold text-rose-400 mb-1">Connection Error</p>
          <p className="text-[10px] text-zinc-500 max-w-[250px] leading-relaxed mb-4">
            Unable to connect to the database or service.
          </p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[10px] font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : filteredStrategies?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800/80 rounded-xl bg-zinc-950/30">
          <div className="w-12 h-12 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4 border border-zinc-800/50">
            <Activity className="w-5 h-5 text-zinc-500" />
          </div>
          <p className="text-[11px] font-bold text-zinc-300 mb-1">
            No strategies match filter
          </p>
          <p className="text-[10px] text-zinc-500 max-w-[280px] leading-relaxed">
            Adjust your filters or search term to see more strategies.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {filteredStrategies?.slice(0, 50).map((strategy) => {
            const ctx = strategy.context || {};
            const ruleResults = strategy.ruleResults || {};
            const rulesArray = Object.values(ruleResults) as any[];
            const setupStatus = getSetupStatus(strategy.steps, strategy.status);
            const isCollapsed = collapsed[strategy.id];
            
            // "Jangan tampilkan approved jika setup belum lengkap"

            // Calculate progress
            const totalSteps = strategy.steps?.length || 0;
            const completedSteps = strategy.steps?.filter((s:any) => s.status === 'approved' || s.status === 'validated').length || 0;
            const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

            const timeStr = <ClientDate date={strategy.updatedAt} format="toLocaleTimeString" />;

            return (
              <div
                key={strategy.id}
                className={`bg-zinc-900/50 border border-zinc-800 rounded-xl flex flex-col transition-colors hover:border-zinc-700 hover:bg-zinc-900/80 ${strategy.status === "stopped" ? "opacity-60 grayscale-[50%]" : ""}`}
              >
                {/* Header (Collapsible) */}
                <div 
                    className="p-5 border-b border-zinc-800/50 flex justify-between items-start cursor-pointer transition-colors"
                    onClick={() => toggleCollapse(strategy.id)}
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2.5 mb-2">
                        <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                        {strategy.name || strategy.id}
                        </h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${getStatusBadge(setupStatus)}`}>
                        {setupStatus}
                        </span>
                        {strategy.freshness && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold border uppercase tracking-wider ${getStatusBadge(strategy.freshness)}`}>
                            {strategy.freshness}
                            </span>
                        )}
                        {strategy.suppression && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold border border-amber-500/20 text-amber-400 bg-amber-500/10 uppercase tracking-wider">
                            Suppressed
                            </span>
                        )}
                    </div>
                    
                    {/* Mini Status Chips */}
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-zinc-600" /> TF: <span className="text-zinc-300 font-mono font-medium">{strategy.timeframe || 'N/A'}</span></span>
                        <span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-zinc-600" /> Session: <span className="text-zinc-300 font-medium">{strategy.session || 'N/A'}</span></span>
                        <span className="flex items-center gap-1.5">
                            {strategy.marketBias === 'buy' ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : strategy.marketBias === 'sell' ? <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> : <Activity className="w-3.5 h-3.5 text-zinc-600" />}
                            Bias: <span className="text-zinc-300 capitalize font-medium">{strategy.marketBias || 'N/A'}</span>
                        </span>
                        <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-zinc-600" /> Updated: <span className="text-zinc-300 font-mono font-medium">{timeStr}</span></span>
                    </div>

                    {/* Progress Indicator */}
                    <div className="mt-4 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono font-medium w-8 text-right">{Math.round(progressPct)}%</span>
                    </div>

                  </div>
                  
                  <div className="flex items-center pt-1">
                      {isCollapsed ? <ChevronDown className="w-5 h-5 text-zinc-500" /> : <ChevronUp className="w-5 h-5 text-zinc-500" />}
                  </div>
                </div>

                {/* Body Content */}
                {!isCollapsed && (
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                    
                    {/* Left Column: Timeline & Steps */}
                    <div className="flex flex-col h-full">
                        <h4 className="text-[10px] font-semibold text-zinc-400 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                        <ListFilter className="w-3 h-3" /> Step Timeline
                        </h4>
                        
                        {strategy.steps && strategy.steps.length > 0 ? (
                        <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-3.5 flex-1 relative">
                            <div className="space-y-3 relative before:absolute before:inset-y-0 before:left-[7px] before:w-px before:bg-zinc-800/80">
                            {strategy.steps.map((step: any, idx: number) => {
                                const isActive = step.status === 'active';
                                const isPast = step.status === 'approved' || step.status === 'validated';
                                return (
                                <div
                                    key={idx}
                                    className={`flex items-start gap-3 relative z-10 transition-opacity ${isActive ? 'opacity-100' : isPast ? 'opacity-70' : 'opacity-40'}`}
                                >
                                    <div className="pt-0.5 bg-zinc-950/50 rounded-full">
                                    {getStatusIcon(step.status)}
                                    </div>
                                    <div className="flex-1">
                                    <span
                                        className={`text-[11px] font-medium leading-none block ${isActive ? "text-blue-400" : isPast ? "text-zinc-300" : "text-zinc-500"}`}
                                    >
                                        {getStepDisplayName(strategy.id, step.name)}
                                    </span>
                                    <div className="mt-1 flex items-center gap-1.5">
                                        <span
                                        className={`text-[9px] uppercase tracking-wider font-semibold ${getStatusBadge(step.status).split(' ')[0]}`}
                                        >
                                        {step.status}
                                        </span>
                                    </div>
                                    </div>
                                </div>
                                );
                            })}
                            </div>
                        </div>
                        ) : (
                        <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-4 text-center text-zinc-500 text-[10px] flex-1 flex flex-col justify-center">
                            No steps available
                        </div>
                        )}
                    </div>

                    {/* Right Column: Setup Details, Rules & AI */}
                    <div className="flex flex-col gap-4">
                        {/* Setup Context */}
                        <div>
                        <h4 className="text-[10px] font-semibold text-zinc-400 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                            <Crosshair className="w-3 h-3" /> Setup Params
                        </h4>
                        <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-3 grid grid-cols-2 gap-y-2 gap-x-3">
                            <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-zinc-500 font-medium">ENTRY</span>
                            <span className="text-[11px] text-zinc-200 font-mono">
                                {ctx.entryPrice ? ctx.entryPrice.toFixed(2) : <span className="text-zinc-600">waiting</span>}
                            </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-zinc-500 font-medium">SL</span>
                            <span className="text-[11px] text-rose-400 font-mono">
                                {ctx.slPrice ? ctx.slPrice.toFixed(2) : <span className="text-zinc-600">waiting</span>}
                            </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-zinc-500 font-medium">TP1</span>
                            <span className="text-[11px] text-emerald-400 font-mono">
                                {ctx.tp1Price ? ctx.tp1Price.toFixed(2) : <span className="text-zinc-600">waiting</span>}
                            </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-zinc-500 font-medium">TP2</span>
                            <span className="text-[11px] text-emerald-500 font-mono">
                                {ctx.tp2Price ? ctx.tp2Price.toFixed(2) : <span className="text-zinc-600">waiting</span>}
                            </span>
                            </div>
                            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-zinc-800/50 mt-1">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] text-zinc-500 font-medium">R:R RATIO</span>
                                    <span className="text-[11px] text-blue-400 font-mono">
                                        {ctx.entryPrice && ctx.tp1Price && ctx.slPrice 
                                        ? `1 : ${Math.abs((ctx.tp1Price - ctx.entryPrice) / (ctx.entryPrice - ctx.slPrice)).toFixed(2)}`
                                        : <span className="text-zinc-600">calculating...</span>}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5 text-right">
                                    <span className="text-[9px] text-zinc-500 font-medium">SIGNAL KEY</span>
                                    <span className="text-[9px] text-zinc-400 font-mono bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800">
                                        {strategy.signalKey || 'none'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        </div>

                        {/* Rule Validation Checklist */}
                        <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
                                <CheckSquare className="w-3 h-3" /> Rule Validations
                            </h4>
                            <button 
                                onClick={() => setDrawerData(strategy)}
                                className="flex items-center gap-1 text-[9px] text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                                <FileSearch className="w-3 h-3" /> View Evidence
                            </button>
                        </div>
                        <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-3 flex-1 overflow-y-auto max-h-48">
                            {rulesArray.length > 0 ? (
                            <ul className="space-y-2">
                                {rulesArray.map((rule, rIdx) => (
                                <li key={rIdx} className="flex items-start gap-2">
                                    <div className="pt-0.5">
                                        {rule.status === 'valid' ? <CheckSquare className="w-3 h-3 text-emerald-500" /> : <Square className="w-3 h-3 text-zinc-600" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium text-zinc-300 break-all">{rule.ruleId}</span>
                                        <span className={`text-[8px] uppercase tracking-wider ${getStatusBadge(rule.status).split(' ')[0]}`}>{rule.status}</span>
                                        </div>
                                        {rule.invalidations?.length > 0 && (
                                        <div className="text-[9px] text-rose-400/80 mt-0.5 leading-tight">
                                            {rule.invalidations.join(', ')}
                                        </div>
                                        )}
                                    </div>
                                </li>
                                ))}
                            </ul>
                            ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <Info className="w-4 h-4 text-zinc-600 mb-2" />
                                <span className="text-[10px] text-zinc-500">
                                No rules validated yet.
                                </span>
                            </div>
                            )}
                        </div>
                        </div>

                        {/* AI Validation */}
                        {strategy.aiDecision && (
                            <div className="flex-shrink-0 mt-2">
                                <h4 className="text-[10px] font-semibold text-zinc-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                                    <Zap className="w-3 h-3" /> AI Validation
                                </h4>
                                <div className={`p-3 rounded-md border ${strategy.aiDecision?.toLowerCase() === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20' : strategy.aiDecision?.toLowerCase() === 'rejected' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-[10px] font-bold uppercase ${strategy.aiDecision?.toLowerCase() === 'approved' ? 'text-emerald-400' : strategy.aiDecision?.toLowerCase() === 'rejected' ? 'text-rose-400' : 'text-blue-400'}`}>
                                            Decision: {strategy.aiDecision}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-300 italic">
                                        AI analysis complete. Check drawer for reasoning if rejected.
                                    </p>
                                </div>
                            </div>
                        )}

                    </div>
                    </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Drawer */}
      {drawerData && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
              <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right-full">
                  <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                      <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                          <FileSearch className="w-4 h-4 text-zinc-400" />
                          Evidence & Details
                      </h3>
                      <button onClick={() => setDrawerData(null)} className="p-1 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-zinc-200">
                          <X className="w-4 h-4" />
                      </button>
                  </div>
                  <div className="p-4 flex-1 overflow-y-auto space-y-6">
                      
                      <div>
                          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Strategy Details</h4>
                          <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3 space-y-2">
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Name</span>
                                  <span className="text-zinc-200 font-medium">{drawerData.name}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Signal Key</span>
                                  <span className="text-zinc-300 font-mono">{drawerData.signalKey || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Timeframe</span>
                                  <span className="text-zinc-300 font-mono">{drawerData.timeframe || 'N/A'}</span>
                              </div>
                          </div>
                      </div>

                      {/* Risk & Target Section */}
                      <div>
                          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Risk & Targets</h4>
                          <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3 space-y-2">
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Direction</span>
                                  <span className={`font-bold uppercase ${drawerData.context?.direction === 'buy' ? 'text-emerald-400' : drawerData.context?.direction === 'sell' ? 'text-rose-400' : 'text-zinc-400'}`}>
                                      {drawerData.context?.direction || 'TBD'}
                                  </span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Entry Price</span>
                                  <span className="text-zinc-300 font-mono">{drawerData.context?.entryPrice?.toFixed(2) || 'TBD'}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Stop Loss</span>
                                  <span className="text-rose-400 font-mono">{drawerData.context?.slPrice?.toFixed(2) || 'TBD'}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-500">Take Profit (TP1)</span>
                                  <span className="text-emerald-400 font-mono">{drawerData.context?.tp1Price?.toFixed(2) || 'TBD'}</span>
                              </div>
                              {drawerData.context?.tp2Price && (
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-zinc-500">Take Profit (TP2)</span>
                                    <span className="text-emerald-400 font-mono">{drawerData.context?.tp2Price.toFixed(2)}</span>
                                </div>
                              )}
                          </div>
                      </div>

                      <div>
                          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">AI Reasoning (If available)</h4>
                          <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
                              {drawerData.context?.aiReasoning ? (
                                  <p className="text-[11px] text-zinc-300 leading-relaxed italic border-l-2 border-blue-500/50 pl-2">
                                      &quot;{drawerData.context.aiReasoning}&quot;
                                  </p>
                              ) : (
                                  <span className="text-[10px] text-zinc-600">No AI reasoning recorded for this state.</span>
                              )}
                          </div>
                      </div>

                      <div>
                          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Rule Evidence Data</h4>
                          <div className="space-y-2">
                              {Object.values(drawerData.ruleResults || {}).map((rule: any, i) => (
                                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
                                      <div className="flex justify-between items-center mb-2">
                                          <span className="text-[11px] font-medium text-zinc-300">{rule.ruleId}</span>
                                          <span className={`text-[9px] uppercase tracking-wider ${getStatusBadge(rule.status).split(' ')[0]}`}>{rule.status}</span>
                                      </div>
                                      <div className="mt-2">
                                          {renderEvidence(rule.ruleId, rule.evidence)}
                                      </div>
                                  </div>
                              ))}
                              {Object.keys(drawerData.ruleResults || {}).length === 0 && (
                                  <div className="bg-zinc-900 border border-zinc-800 rounded-md p-4 text-center">
                                      <span className="text-[10px] text-zinc-600">No evidence data available.</span>
                                  </div>
                              )}
                          </div>
                      </div>

                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
