"use client";

import { useFetch } from "@/hooks/use-fetch";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { ClientDate } from "@/components/client-date";
import { getStatusBadge, getMcpStatusBadge } from "@/lib/utils";
import {
  Activity,
  Clock,
  Globe,
  Zap,
  ListFilter,
  Cpu,
  BarChart2,
  ArrowRight,
  Server,
  Shield,
  X,
  AlertTriangle,
} from "lucide-react";

export default function Dashboard() {
  const router = useRouter();
  
  const { data: marketStatus, loading: loadingMarket, error: errorMarket, refetch: refetchMarket } = useFetch<any>("/api/market/xauusd/latest", null);
  const { data: overviewStatus, loading: loadingOverview, error: errorOverview, refetch: refetchOverview } = useFetch<any>("/api/status/overview", null);
  const { data: strategies = [], loading: loadingStrategies, error: errorStrategies, refetch: refetchStrategies } = useFetch<any[]>("/api/strategies", []);
  const { data: mcpStatus = [] } = useFetch<any[]>("/api/mcp/status", []);
  const { data: activeSignals = [], loading: loadingSignals, error: errorSignals, refetch: refetchSignals } = useFetch<any[]>("/api/signals/live", []);
  const { data: newsEventsData } = useFetch<any>("/api/news/active", { active_events: [] });
  
  const newsEvents = Array.isArray(newsEventsData?.active_events) ? newsEventsData.active_events : [];
  const safeStrategies = Array.isArray(strategies) ? strategies : [];
  const safeActiveSignals = Array.isArray(activeSignals) ? activeSignals : [];
  const safeMcpStatus = Array.isArray(mcpStatus) ? mcpStatus : [];

  const [selectedStrategy, setSelectedStrategy] = useState<any>(null);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);

  const [sessionName, setSessionName] = useState("---");

  useEffect(() => {
    Promise.resolve().then(() => {
      const currentHour = new Date().getUTCHours();
      if (currentHour >= 13 && currentHour < 22) setSessionName("New York");
      else if (currentHour >= 8 && currentHour < 16) setSessionName("London");
      else if (currentHour >= 0 && currentHour < 9) setSessionName("Tokyo");
      else setSessionName("Sydney");
    });
  }, []);

  return (
    <div className="space-y-3 pb-20 relative h-full">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI Strip: Harga XAUUSD */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between min-h-[5.5rem]">
          <div className="flex justify-between items-start mb-2">
            <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" /> XAUUSD Live
            </div>
          </div>
          <div>
            {loadingMarket ? (
              <div className="animate-pulse space-y-1.5">
                <div className="h-4 bg-zinc-800/80 rounded w-1/2"></div>
                <div className="h-3 bg-zinc-800/80 rounded w-1/4"></div>
              </div>
            ) : errorMarket ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-1.5 rounded text-[9px]">
                <span className="truncate">{errorMarket}</span>
                <button onClick={refetchMarket} className="mt-1.5 bg-rose-500/20 hover:bg-rose-500/30 py-1 rounded text-rose-300 font-medium transition-colors">Retry</button>
              </div>
            ) : marketStatus?.status === 'not_configured' ? (
              <div className="flex flex-col text-amber-400 bg-amber-500/10 p-1.5 rounded text-[9px]">
                <span className="truncate" title={marketStatus.reason}>{marketStatus.reason || 'Not configured'}</span>
              </div>
            ) : marketStatus ? (
              <>
                <div className="text-sm font-mono font-bold text-zinc-100">
                  {marketStatus.price ? marketStatus.price.toFixed(2) : "--.--"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium ${marketStatus.freshness === "live" || marketStatus.freshness === "cached" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}
                  >
                    {marketStatus.freshness || "loading"}
                  </span>
                  <span className="text-[8px] text-zinc-500">Source: {marketStatus.provider || 'Unknown'}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* KPI Strip: Trend / Bias */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between min-h-[5.5rem]">
          <div className="flex justify-between items-start mb-2">
            <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-purple-400" /> HTF Bias
            </div>
          </div>
          <div>
            {loadingMarket ? (
              <div className="animate-pulse space-y-1.5">
                <div className="h-4 bg-zinc-800/80 rounded w-1/2"></div>
                <div className="h-3 bg-zinc-800/80 rounded w-1/4"></div>
              </div>
            ) : errorMarket ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-1.5 rounded text-[9px]">
                <span className="truncate">{errorMarket}</span>
                <button onClick={refetchMarket} className="mt-1.5 bg-rose-500/20 hover:bg-rose-500/30 py-1 rounded text-rose-300 font-medium transition-colors">Retry</button>
              </div>
            ) : marketStatus?.status === 'not_configured' ? (
              <div className="flex flex-col text-amber-400 bg-amber-500/10 p-1.5 rounded text-[9px]">
                <span className="truncate" title={marketStatus.reason}>{marketStatus.reason || 'Not configured'}</span>
              </div>
            ) : marketStatus ? (
              <>
                <div className="text-xs font-bold text-zinc-100">
                  {marketStatus.bias || "NEUTRAL"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium ${marketStatus.bias ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}
                  >
                    {marketStatus.bias ? "live" : "unavailable"}
                  </span>
                  <span className="text-[8px] text-zinc-500">Market Trend</span>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* KPI Strip: Session */}
        <div
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between min-h-[5.5rem] cursor-pointer hover:border-zinc-600 transition-colors"
          onClick={() => setShowSessionDrawer(true)}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> Session
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">
              {sessionName}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                active
              </span>
              <span className="text-[8px] text-zinc-500">Timezone UTC</span>
            </div>
          </div>
        </div>

        {/* KPI Strip: Signal Aktif */}
        <div
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between min-h-[5.5rem] cursor-pointer hover:border-zinc-600 transition-colors"
          onClick={() => router.push("/live-signals")}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Active Signals
            </div>
          </div>
          <div>
            {loadingSignals ? (
               <div className="h-4 bg-zinc-800/80 rounded animate-pulse w-8"></div>
            ) : errorSignals ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-1.5 rounded text-[9px]">
                <span className="truncate">{errorSignals}</span>
                <button onClick={refetchSignals} className="mt-1.5 bg-rose-500/20 hover:bg-rose-500/30 py-1 rounded text-rose-300 font-medium transition-colors">Retry</button>
              </div>
            ) : activeSignals ? (
              <>
                <div className="text-xs font-bold text-zinc-100">
                  {safeActiveSignals.length} <span className="text-[9px] font-normal text-zinc-500 ml-1">signals</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium ${safeActiveSignals.length > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}
                  >
                    {safeActiveSignals.length > 0 ? "live" : "none"}
                  </span>
                  <span className="text-[8px] text-zinc-500">AI Verified</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Left Column - Main monitoring */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          {/* Active Strategies */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 md:p-5">
            <h3 className="text-[10px] font-bold text-zinc-300 mb-3 md:mb-4 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ListFilter className="w-3.5 h-3.5 text-blue-400" /> Active Strategies
              </span>
              <button
                onClick={() => router.push("/monitoring")}
                className="text-[9px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors bg-zinc-950 px-2 py-1 rounded border border-zinc-800"
              >
                View Full Scan <ArrowRight className="w-3 h-3" />
              </button>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loadingStrategies ? (
                 <div className="col-span-1 md:col-span-2 space-y-3 py-2">
                    <Skeleton className="h-20 w-full bg-zinc-800/50" />
                    <Skeleton className="h-20 w-full bg-zinc-800/50" />
                 </div>
              ) : errorStrategies ? (
                 <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center text-rose-400 bg-rose-500/10 p-6 rounded-xl border border-rose-500/20 text-[10px]">
                  <AlertTriangle className="w-5 h-5 mb-2 opacity-80" />
                  <span>{errorStrategies}</span>
                  <button onClick={refetchStrategies} className="mt-3 bg-rose-500/20 hover:bg-rose-500/30 px-4 py-2 rounded text-rose-300 font-medium transition-colors">Retry Connection</button>
                </div>
              ) : strategies.length > 0 ? (
                safeStrategies.slice(0, 10).map((strategy: any, index: number) => {
                  let statusBadgeStyle = getStatusBadge(strategy.status);

                  // Extract rule results briefly
                  const rulesObj = strategy.ruleResults || {};
                  const rulesCount = Object.keys(rulesObj).length;
                  const passedCount = Object.values(rulesObj).filter((r: any) => r?.passed).length;
                  
                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedStrategy(strategy)}
                      className="flex flex-col p-4 bg-zinc-950/50 border border-zinc-800/50 rounded-xl cursor-pointer hover:border-zinc-600 hover:bg-zinc-900/80 transition-all h-full group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-[11px] font-bold text-zinc-200 line-clamp-1 group-hover:text-white transition-colors">
                            {strategy.name || strategy.id}
                          </div>
                          <div className="text-[9px] text-zinc-500 mt-1 line-clamp-2">
                            {strategy.description || "No description provided for this strategy."}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium border ${statusBadgeStyle} shrink-0 ml-3 uppercase`}>
                          {strategy.status || "awaiting"}
                        </span>
                      </div>
                      
                      <div className="mt-3 space-y-1.5 flex-grow">
                        {strategy.steps && strategy.steps.length > 0 ? (
                          <div className="flex justify-between items-center bg-zinc-950/80 rounded border border-zinc-800/80 px-2 py-1.5 overflow-hidden">
                            {strategy.steps.map((step: any, sIdx: number) => {
                              const isActive = step.status === 'active';
                              const isApproved = step.status === 'approved';
                              const isRejected = step.status === 'rejected';
                              const isExpired = step.status === 'expired';
                              
                              let colorCls = 'text-zinc-600 bg-zinc-900/50';
                              if (isActive) colorCls = 'text-blue-400 bg-blue-500/10 border border-blue-500/20';
                              if (isApproved) colorCls = 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
                              if (isRejected || isExpired) colorCls = 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
                              
                              return (
                                <div key={sIdx} className="flex items-center">
                                  <span className={`text-[7px] font-bold px-1 py-0.5 rounded uppercase tracking-wider ${colorCls}`}>
                                    {step.name}
                                  </span>
                                  {sIdx < strategy.steps.length - 1 && (
                                    <ArrowRight className={`w-2.5 h-2.5 mx-0.5 ${isApproved ? 'text-emerald-500/50' : 'text-zinc-800'}`} />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-[10px] text-zinc-500 font-mono">No steps available</div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-zinc-800/50 flex items-center justify-between text-[9px]">
                        <span className="text-zinc-500">Validation Rules</span>
                        <span className={`font-mono font-bold ${passedCount > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {passedCount}/{rulesCount} Passed
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-1 md:col-span-2 text-[10px] text-zinc-400 p-8 bg-zinc-950/50 border border-zinc-800/50 rounded-xl text-center flex flex-col items-center justify-center">
                  <Shield className="w-6 h-6 text-zinc-600 mb-2 opacity-50" />
                  No active strategies detected.
                  <span className="block mt-1 text-[9px] text-zinc-500">Ensure Supabase is configured and strategies are enabled.</span>
                </div>
              )}
            </div>
          </div>

          {/* News Panel */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 md:p-5">
            <h3 className="text-[10px] font-bold text-zinc-300 mb-3 md:mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" /> News & Events
            </h3>
            {newsEvents.length > 0 ? (
              <div className="space-y-3">
                {newsEvents.slice(0, 10).map((event: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-lg flex flex-col hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] font-medium text-zinc-200">
                        {event.title}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium border shrink-0 ml-2 ${event.impact === "high" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : event.impact === "medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                      >
                        {event.impact}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[8px] text-zinc-500">
                      <span>{event.country}</span>
                      <span className="text-zinc-600"><ClientDate date={event.timestamp} /></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-zinc-950/50 border border-zinc-800/50 rounded-xl border-dashed flex flex-col items-center justify-center">
                <Globe className="w-6 h-6 text-zinc-600 mb-3 opacity-50" />
                <p className="text-[10px] text-zinc-400 font-medium">
                  No high-impact events scheduled.
                </p>
                <p className="text-[9px] text-zinc-500 mt-1">
                  Standard strategies are operating normally.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Status & Overview */}
        <div className="space-y-6">
          {/* System Overview */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 md:p-5">
            <h3 className="text-[10px] font-bold text-zinc-300 mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" /> System Status
            </h3>
            <div className="space-y-2">
              {loadingOverview ? (
                <div className="space-y-2 py-1"><Skeleton className="h-4 w-full bg-zinc-800/50" /><Skeleton className="h-4 w-[90%] bg-zinc-800/50" /><Skeleton className="h-4 w-[80%] bg-zinc-800/50" /></div>
              ) : errorOverview ? (
                <div className="flex flex-col text-rose-400 bg-rose-500/10 p-3 rounded-lg text-[9px] border border-rose-500/20 text-center">
                  <span className="mb-2">{errorOverview}</span>
                  <button onClick={refetchOverview} className="bg-rose-500/20 hover:bg-rose-500/30 rounded text-rose-300 py-1.5 transition-colors font-medium">Retry</button>
                </div>
              ) : overviewStatus ? (
                Object.entries(overviewStatus).map(([key, value]) => {
                   let badgeStyle = getMcpStatusBadge(value as string);
                   
                   return (
                    <div
                      key={key}
                      className="flex justify-between items-center text-[10px] py-2 border-b border-zinc-800/50 last:border-0"
                    >
                      <span className="text-zinc-400 capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium border ${badgeStyle}`}
                      >
                        {String(value)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-2 py-1"><Skeleton className="h-4 w-full bg-zinc-800/50" /><Skeleton className="h-4 w-[90%] bg-zinc-800/50" /><Skeleton className="h-4 w-[80%] bg-zinc-800/50" /></div>
              )}
            </div>
          </div>

          {/* MCP Status */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 md:p-5">
            <h3 className="text-[10px] font-bold text-zinc-300 mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" /> MCP Active
            </h3>
            <div className="space-y-2">
              {safeMcpStatus.length > 0 ? (
                safeMcpStatus.slice(0, 4).map((mcp: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-[10px] py-2 border-b border-zinc-800/50 last:border-0"
                  >
                    <span className="text-zinc-400 line-clamp-1 pr-2">{mcp.name}</span>
                    <span
                      className={`text-[8px] shrink-0 px-1.5 py-0.5 rounded border ${getMcpStatusBadge(mcp.status)}`}
                    >
                      {mcp.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="space-y-2 py-1"><Skeleton className="h-4 w-full bg-zinc-800/50" /><Skeleton className="h-4 w-[90%] bg-zinc-800/50" /><Skeleton className="h-4 w-[80%] bg-zinc-800/50" /></div>
              )}
              <div className="mt-4 pt-3 border-t border-zinc-800/50">
                <button
                  onClick={() => router.push("/settings")}
                  className="w-full text-left text-[9px] text-zinc-400 hover:text-zinc-200 flex justify-between items-center transition-colors bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800"
                >
                  View all MCPs <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer: Strategy Detail */}
      {selectedStrategy && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedStrategy(null)}
        >
          <div
            className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-2 uppercase">
                <ListFilter className="w-4 h-4 text-zinc-400" />
                Strategy Setup
              </h3>
              <button
                onClick={() => setSelectedStrategy(null)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="text-[11px] font-bold text-zinc-200">{selectedStrategy.name}</h4>
                    <p className="text-[9px] text-zinc-500 mt-1">{selectedStrategy.description}</p>
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium border ${selectedStrategy.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {selectedStrategy.status}
                  </span>
                </div>
              </div>

              <div>
                <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">AI & Market State</h5>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-3">
                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1">AI Decision</div>
                    <div className={`text-[11px] font-bold ${selectedStrategy.aiDecision === 'APPROVED' ? 'text-emerald-400' : selectedStrategy.aiDecision === 'REJECTED' ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {selectedStrategy.aiDecision || 'PENDING'}
                    </div>
                  </div>
                  <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-3">
                    <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Market Bias</div>
                    <div className="text-[11px] font-bold text-zinc-300 uppercase">
                      {selectedStrategy.marketBias || 'UNKNOWN'}
                    </div>
                  </div>
                </div>

                <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Setup Requirements</h5>
                <div className="space-y-2">
                  {Object.entries(selectedStrategy.ruleResults || {}).map(([key, result]: [string, any], idx) => {
                     const isPassed = result?.status === 'valid' || result?.passed === true;
                     const isFailed = result?.status === 'invalid' || result?.passed === false;
                     return (
                        <div key={idx} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800/50 rounded-md p-2">
                          <span className="text-[10px] text-zinc-300 font-medium capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                          {isPassed ? (
                            <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1"><Shield className="w-3 h-3" /> PASS</span>
                          ) : isFailed ? (
                            <span className="text-[9px] font-bold text-rose-400 flex items-center gap-1"><X className="w-3 h-3" /> FAIL</span>
                          ) : (
                            <span className="text-[9px] font-medium text-zinc-500 flex items-center gap-1">WAITING</span>
                          )}
                        </div>
                     );
                  })}
                  {(!selectedStrategy.ruleResults || Object.keys(selectedStrategy.ruleResults).length === 0) && (
                    <div className="text-[10px] text-zinc-500 text-center py-4 bg-zinc-950/50 border border-zinc-800/50 rounded-md border-dashed">
                      No setup rules defined or verified yet.
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                onClick={() => router.push("/monitoring")}
                className="w-full mt-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-[10px] text-zinc-300 transition-colors"
              >
                Go to Monitoring
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Session Detail */}
      {showSessionDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setShowSessionDrawer(false)}
        >
          <div
            className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-2 uppercase">
                <Clock className="w-4 h-4 text-zinc-400" />
                Session Detail
              </h3>
              <button
                onClick={() => setShowSessionDrawer(false)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
               <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
                  <div className="text-[10px] text-blue-400 uppercase tracking-wider mb-1 font-medium">Active Session</div>
                  <div className="text-xl font-bold text-blue-400">{sessionName}</div>
               </div>

               <div>
                 <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">All Sessions (UTC)</h5>
                 <div className="space-y-2">
                   {[
                     { name: 'Sydney', range: '22:00 - 07:00' },
                     { name: 'Tokyo', range: '00:00 - 09:00' },
                     { name: 'London', range: '08:00 - 16:00' },
                     { name: 'New York', range: '13:00 - 22:00' },
                   ].map((s, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800/50 rounded-md p-3">
                         <span className="text-[11px] font-medium text-zinc-300">{s.name}</span>
                         <div className="flex items-center gap-3">
                           <span className="text-[10px] text-zinc-500 font-mono">{s.range}</span>
                           {s.name === sessionName && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                           )}
                         </div>
                      </div>
                   ))}
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
