"use client";

import {
  Settings as SettingsIcon,
  Activity,
  Server,
  ShieldAlert,
  Key,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle, ServerOff,
  FileText,
  X,
  BarChart2,
  Download,
} from "lucide-react";
import { useState } from "react";
import { ClientDate } from "@/components/client-date";
import { getMcpStatusBadge, formatMcpStatus } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";

export default function Settings() {
  const { data: configStatus, loading: loadingConfig, error: errorConfig, refetch: refetchConfig } = useFetch<any>("/api/config/status", null);
  const { data: mcpStatus, loading: loadingMcp, error: errorMcp, refetch: refetchMcp } = useFetch<any[]>("/api/mcp/status", []);
  const { data: healthStatus, loading: loadingHealth, error: errorHealth, refetch: refetchHealth } = useFetch<any>("/api/system/health", null);
  const { data: errorsData } = useFetch<any>("/api/system/errors", null);
  const { data: metricsData, loading: loadingMetrics, error: errorMetrics, refetch: refetchMetrics } = useFetch<any>("/api/system/metrics", null);

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedMcp, setSelectedMcp] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logSeverity, setLogSeverity] = useState<string>("all");
  const [showHealthSnapshot, setShowHealthSnapshot] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleSaveEnv = async (key: string) => {
    const val = envValues[key];
    if (!val) return;
    setSavingKey(key);
    try {
      const res = await fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key.toUpperCase()]: val }),
      });
      if (res.ok) {
         setEnvValues(prev => ({ ...prev, [key]: "" }));
         refetchConfig();
         refetchMcp();
         refetchHealth();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingKey(null);
    }
  };

  const loadLogs = async () => {
    setShowLogs(true);
    try {
      const res = await fetch("/api/system/logs");
      const data = await res.json();
      if (data.success || data.status === "success") {
        setLogs(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const downloadLogsCSV = () => {
    const filteredLogs = logs.filter(log => logSeverity === "all" || log.level === logSeverity);
    if (filteredLogs.length === 0) return;

    const headers = ["Timestamp", "Level", "Message", "Additional Data"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => {
        const additionalData = Object.keys(log)
          .filter(k => !["timestamp", "level", "message"].includes(k))
          .reduce((acc, k) => {
            acc[k] = log[k];
            return acc;
          }, {} as any);
        
        return [
          `"${log.timestamp || ""}"`,
          `"${log.level || ""}"`,
          `"${(log.message || "").replace(/"/g, '""')}"`,
          `"${JSON.stringify(additionalData).replace(/"/g, '""')}"`
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `system-logs-${logSeverity}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ONLINE":
        return "border-emerald-500/50 text-emerald-400 bg-emerald-500/10";
      case "RATE LIMITED":
      case "DEGRADED":
        return "border-amber-500/20 text-amber-400 bg-amber-500/10";
      case "UNAVAILABLE":
        return "border-rose-500/50 text-rose-400 bg-rose-500/10";
      case "OFFLINE":
        return "border-zinc-700 border-dashed text-zinc-500 bg-zinc-950";
      case "NOT CONFIGURED":
        return "border-zinc-700 border-dashed text-zinc-400 bg-zinc-900";
      default:
        return "border-zinc-700 text-zinc-400 bg-zinc-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ONLINE":
        return <CheckCircle2 className="w-3 h-3" />;
      case "RATE LIMITED":
      case "DEGRADED":
        return <AlertTriangle className="w-3 h-3" />;
      case "UNAVAILABLE":
        return <XCircle className="w-3 h-3" />;
      case "OFFLINE":
        return <ServerOff className="w-3 h-3" />;
      case "NOT CONFIGURED":
        return <ShieldAlert className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  const categories = [
    "All",
    ...Array.from(new Set(mcpStatus.map((m) => m.category))),
  ].filter(Boolean);
  const filteredMcps =
    selectedCategory === "All"
      ? mcpStatus
      : mcpStatus.filter((m) => m.category === selectedCategory);

  return (
    <div className="space-y-6 relative h-full">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wide">
            <SettingsIcon className="w-4 h-4 text-zinc-400" />
            Settings & Observability
          </h2>
          <p className="text-[10px] text-zinc-500 mt-1">
            Konfigurasi dan monitoring sistem menyeluruh
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
        {/* Runtime Health */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-[10px] font-bold text-zinc-300 mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" /> Runtime Health
          </h3>
          <div className="space-y-3">
            {loadingHealth ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
              </div>
            ) : errorHealth ? (
              <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-5 bg-rose-500/10 rounded-lg border border-rose-500/20 gap-3">
                <span className="text-center font-medium">{errorHealth}</span>
                <button onClick={refetchHealth} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-medium transition-colors">Retry Connection</button>
              </div>
            ) : healthStatus ? (
              healthStatus.services.map((service: any) => (
                <div
                  key={service.serviceName}
                  className="flex flex-col py-2.5 border-b border-zinc-800/50 last:border-0"
                >
                  <div className="flex justify-between items-center text-[11px]" title={service.message}>
                    <span className="text-zinc-300 flex items-center gap-2">
                      {service.serviceName === "Supabase" && (
                        <Server className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      {service.serviceName === "MarketData" && (
                        <Activity className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      {service.serviceName === "EconomicCalendar" && (
                        <BarChart2 className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      {service.serviceName === "GeminiAI" && (
                        <SettingsIcon className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      {service.serviceName === "TelegramBot" && (
                        <SettingsIcon className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      {service.serviceName === "RuleEngine" && (
                        <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      {service.serviceName === "PythonEngine" && (
                        <Server className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      <span className="font-medium">{service.serviceName}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${getStatusColor(service.status)}`}
                    >
                      {getStatusIcon(service.status)} {service.status}
                    </span>
                  </div>
                  {service.status !== 'ONLINE' && service.message && (
                    <span className="text-[9px] text-zinc-500 mt-1.5 pl-5.5 line-clamp-2">
                      Reason: {service.message}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading health status...
              </div>
            )}

            <div className="flex justify-between items-center text-[11px] py-3 border-t border-zinc-800/50">
              <span className="text-zinc-300 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70" /> Recent
                Errors
              </span>
              <span className="text-zinc-500 text-[10px] bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                {errorsData?.count24h ?? 0} in last 24h
              </span>
            </div>

            <div className="mt-3 pt-3 space-y-2 border-t border-zinc-800/50">
              <button
                onClick={() => setShowHealthSnapshot(true)}
                className="flex items-center justify-center gap-1.5 w-full py-2 bg-zinc-950/50 border border-zinc-800/50 rounded-lg text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Activity className="w-3.5 h-3.5" /> View Health Snapshot
              </button>
              <button
                onClick={loadLogs}
                className="flex items-center justify-center gap-1.5 w-full py-2 bg-zinc-950/50 border border-zinc-800/50 rounded-lg text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> View System Logs
              </button>
            </div>
          </div>
        </div>

        {/* API Status */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-400" /> Config & API Keys
            </h3>
            {configStatus?.lastChecked && (
              <span className="text-[8px] text-zinc-500 font-mono flex items-center gap-1 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                <Clock className="w-2.5 h-2.5" />
                <ClientDate date={configStatus.lastChecked} format="toLocaleTimeString" />
              </span>
            )}
          </div>
          <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
            {loadingConfig ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
              </div>
            ) : errorConfig ? (
              <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-5 bg-rose-500/10 rounded-lg border border-rose-500/20 gap-3">
                <span className="text-center font-medium">{errorConfig}</span>
                <button onClick={refetchConfig} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-medium transition-colors">Retry Connection</button>
              </div>
            ) : configStatus?.env ? (
              <>
                <div className="space-y-4">
                  {Object.entries(configStatus.env).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-2 pb-4 border-b border-zinc-800/50 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <label className="text-zinc-300 capitalize text-[10px] font-medium tracking-wide">
                          {key.replace(/_/g, " ")}
                        </label>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wide font-bold border ${value === "configured" || value === "online" ? "border-blue-500/50 text-blue-400 bg-blue-500/10" : value === "offline" || value === "error" ? "border-rose-500/50 text-rose-400 bg-rose-500/10" : "border-zinc-700 text-zinc-400 bg-zinc-800"}`}
                        >
                          {String(value)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                         <input 
                           type={value === "configured" ? "password" : "text"}
                           placeholder={value === "configured" ? "••••••••••••••••" : `Enter ${key}...`}
                           disabled={value === "configured" || savingKey === key}
                           value={envValues[key] || ""}
                           onChange={(e) => setEnvValues({ ...envValues, [key]: e.target.value })}
                           className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-zinc-600 focus:bg-zinc-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                         />
                         {value !== "configured" && (
                           <button 
                             onClick={() => handleSaveEnv(key)}
                             disabled={!envValues[key] || savingKey === key}
                             className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-md text-[9px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                             {savingKey === key ? "SAVING" : "SAVE"}
                           </button>
                         )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading config status...
              </div>
            )}
          </div>
        </div>

        {/* System Metrics */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-[10px] font-bold text-zinc-300 mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-blue-400" /> System Metrics
          </h3>
          <div className="space-y-3">
            {loadingMetrics ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                <div className="h-6 bg-zinc-800/50 animate-pulse rounded w-full"></div>
              </div>
            ) : errorMetrics ? (
               <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-5 bg-rose-500/10 rounded-lg border border-rose-500/20 gap-3">
                <span className="text-center font-medium">{errorMetrics}</span>
                <button onClick={refetchMetrics} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-medium transition-colors">Retry Connection</button>
              </div>
            ) : metricsData ? (
              <>
                <div className="flex justify-between items-center text-[11px] py-2.5 border-b border-zinc-800/50">
                  <span className="text-zinc-300 font-medium">Market Data Latency</span>
                  <span
                    className={`font-mono font-bold ${metricsData.marketDataLatencyMs > 500 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {metricsData.marketDataLatencyMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-2.5 border-b border-zinc-800/50">
                  <span className="text-zinc-300 font-medium">AI Validation Latency</span>
                  <span
                    className={`font-mono font-bold ${metricsData.aiValidationLatencyMs > 2000 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {metricsData.aiValidationLatencyMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-2.5 border-b border-zinc-800/50">
                  <span className="text-zinc-300 font-medium">Signal Throughput</span>
                  <span className="font-mono font-bold text-zinc-300">
                    {metricsData.signalThroughput}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-2.5 border-b border-zinc-800/50">
                  <span className="text-zinc-300 font-medium">Error Rate</span>
                  <span
                    className={`font-mono font-bold ${metricsData.errorRate > 0.1 ? "text-rose-400" : "text-emerald-400"}`}
                  >
                    {(metricsData.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-2.5">
                  <span className="text-zinc-300 font-medium">Notification Delivery</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {(metricsData.notificationDeliveryRate * 100).toFixed(1)}%
                  </span>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading system metrics...
              </div>
            )}
          </div>
        </div>

        {/* MCP Status */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 md:col-span-2 lg:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-4">
            <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" /> MCP Registry (
              {filteredMcps.length})
            </h3>

            <div className="flex items-center flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-1 text-[8px] uppercase tracking-wide font-bold rounded-md transition-colors border ${
                    selectedCategory === cat
                      ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loadingMcp ? (
              <div className="text-[11px] text-zinc-500 col-span-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="h-16 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                    <div className="h-16 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                    <div className="h-16 bg-zinc-800/50 animate-pulse rounded w-full"></div>
                </div>
              </div>
            ) : errorMcp ? (
              <div className="text-[11px] text-rose-400 col-span-full flex flex-col items-center justify-center py-4 bg-rose-500/10 rounded border border-rose-500/20 gap-2">
                <span className="text-center">{errorMcp}</span>
                <button onClick={refetchMcp} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors">Retry</button>
              </div>
            ) : mcpStatus.length > 0 ? (
              filteredMcps.map((mcp) => (
                <div
                  key={mcp.name}
                  onClick={() => setSelectedMcp(mcp)}
                  className="flex flex-col justify-between gap-2 p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-md cursor-pointer hover:border-zinc-600 transition-colors"
                >
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-zinc-200 line-clamp-1">
                        {mcp.name}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border shrink-0 ${getMcpStatusBadge(formatMcpStatus(mcp.status, mcp.lastError))}`}
                      >
                        {formatMcpStatus(mcp.status, mcp.lastError)}
                      </span>
                    </div>
                    {formatMcpStatus(mcp.status, mcp.lastError) === 'UNAVAILABLE' && mcp.lastError && (
                      <span className="block text-[8px] text-rose-400 mt-0.5 mb-1 font-medium leading-tight line-clamp-2">
                        Reason: {mcp.lastError}
                      </span>
                    )}
                    <span className="block text-[8px] text-zinc-500 uppercase tracking-wide font-medium">
                      {mcp.category}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-zinc-500">
                Loading MCP status...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer (Conditional Render) */}
      {selectedMcp && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedMcp(null)}
        >
          <div
            className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold text-zinc-100 uppercase">MCP Details</h3>
              <button
                onClick={() => setSelectedMcp(null)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <h4 className="text-[12px] font-bold text-zinc-100">
                  {selectedMcp.name}
                </h4>
                <span
                  className={`inline-flex items-center mt-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${getMcpStatusBadge(formatMcpStatus(selectedMcp.status, selectedMcp.lastError))}`}
                >
                  Status: {formatMcpStatus(selectedMcp.status, selectedMcp.lastError)}
                </span>
                {formatMcpStatus(selectedMcp.status, selectedMcp.lastError) === 'UNAVAILABLE' && selectedMcp.lastError && (
                  <div className="mt-2 text-xs text-rose-400 font-medium">
                    Reason: {selectedMcp.lastError}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Category
                  </span>
                  <span className="text-xs text-zinc-300">
                    {selectedMcp.category}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Purpose
                  </span>
                  <span className="text-xs text-zinc-300">
                    {selectedMcp.purpose}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Source Type
                  </span>
                  <span className="text-xs text-zinc-300">
                    {selectedMcp.sourceType || "Internal"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Dependencies
                  </span>
                  {selectedMcp.dependencies &&
                  selectedMcp.dependencies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedMcp.dependencies.map((dep: string) => (
                        <span
                          key={dep}
                          className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-[10px] text-zinc-400"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">None</span>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-800/50">
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Last Checked
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {selectedMcp.lastCheck
                      ? <ClientDate date={selectedMcp.lastCheck} />
                      : "Never"}
                  </span>
                </div>

                {selectedMcp.lastError && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-rose-500 mb-1">
                      Last Error
                    </span>
                    <span className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded block">
                      {selectedMcp.lastError}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Drawer */}
      {showLogs && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setShowLogs(false)}
        >
          <div
            className="w-full max-w-2xl h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 flex flex-col animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 shrink-0">
              <h3 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                <FileText className="w-4 h-4" /> System Logs & Monitoring
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadLogsCSV}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] rounded hover:bg-zinc-800 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
                <button
                  onClick={loadLogs}
                  className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] rounded hover:bg-zinc-800 transition-colors"
                >
                  Refresh
                </button>
                <select
                  value={logSeverity}
                  onChange={(e) => setLogSeverity(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] rounded px-2 py-1.5 focus:outline-none focus:border-zinc-700"
                >
                  <option value="all">All Severities</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-md p-3 font-mono text-[9px] sm:text-[10px]">
              {logs.filter(log => logSeverity === "all" || log.level === logSeverity).length === 0 ? (
                <div className="text-zinc-500 text-center py-8">
                  No logs available for selected severity.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.filter(log => logSeverity === "all" || log.level === logSeverity).slice(0, 100).map((log, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 border-b border-zinc-800/50 pb-2 last:border-0 break-all"
                    >
                      <span className="text-zinc-500 shrink-0">
                        <ClientDate date={log.timestamp} format="toLocaleTimeString" />
                      </span>
                      <span
                        className={`shrink-0 uppercase font-medium ${
                          log.level === "error"
                            ? "text-rose-400"
                            : log.level === "warn"
                              ? "text-amber-400"
                              : log.level === "debug"
                                ? "text-zinc-400"
                                : "text-emerald-400"
                        }`}
                      >
                        [{log.level}]
                      </span>
                      <span className="text-zinc-300">
                        {log.message}
                        {Object.keys(log).filter(
                          (k) => !["timestamp", "level", "message"].includes(k),
                        ).length > 0 && (
                          <span className="block mt-1 text-zinc-500">
                            {JSON.stringify(
                              Object.fromEntries(
                                Object.entries(log).filter(
                                  ([k]) =>
                                    !["timestamp", "level", "message"].includes(
                                      k,
                                    ),
                                ),
                              ),
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Health Snapshot Drawer */}
      {showHealthSnapshot && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setShowHealthSnapshot(false)}
        >
          <div
            className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold text-zinc-100 uppercase flex items-center gap-2">
                <Activity className="w-4 h-4" /> Health Snapshot
              </h3>
              <button
                onClick={() => setShowHealthSnapshot(false)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Overall Status</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(healthStatus?.status || 'unavailable')}`}>
                  {getStatusIcon(healthStatus?.status || 'unavailable')}
                  {healthStatus?.status || 'Loading...'}
                </span>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Service Details</h4>
                {healthStatus?.services?.map((service: any) => (
                   <div key={service.serviceName} className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[11px] font-bold text-zinc-200">{service.serviceName}</span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${getStatusColor(service.status)}`}>
                          {service.status}
                        </span>
                      </div>
                      <div className="space-y-1 mt-2 border-t border-zinc-800/50 pt-2">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-zinc-500">Latency:</span>
                          <span className="text-zinc-300 font-mono">{service.latencyMs !== undefined ? `${service.latencyMs}ms` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-[9px]">
                          <span className="text-zinc-500">Last Checked:</span>
                          <span className="text-zinc-300 font-mono"><ClientDate date={service.lastChecked} format="toLocaleTimeString" /></span>
                        </div>
                        {service.message && (
                           <div className="mt-2 text-[9px] text-zinc-400 bg-zinc-900 p-1.5 rounded">
                             {service.message}
                           </div>
                        )}
                      </div>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
