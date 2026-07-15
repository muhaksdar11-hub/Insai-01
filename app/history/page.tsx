"use client";

import { useState, useMemo, useEffect } from "react";
import { useFetch } from "@/hooks/use-fetch";
import {
  History as HistoryIcon,
  Target,
  Shield,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ListFilter,
  X,
  Search,
  Activity
} from "lucide-react";

export default function History() {
  const { data: history, loading, error, refetch } = useFetch<any[]>("/api/signals/history", []);
  
  const [selectedHistory, setSelectedHistory] = useState<any>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [timeframeFilter, setTimeframeFilter] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTimestamp(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Derived stats
  const { filteredHistory, summary, strategyRanking, uniqueStrategies } = useMemo(() => {
    const safeHistoryArr = Array.isArray(history) ? history : [];
    if (!safeHistoryArr.length) return { filteredHistory: [], summary: { win: 0, loss: 0, totalPips: 0, winRate: 0 }, strategyRanking: [], uniqueStrategies: [], safeHistory: [] };
    
    let timeFiltered = safeHistoryArr;
    if (timeframeFilter !== "ALL") {
      const now = nowTimestamp;
      const msPerDay = 24 * 60 * 60 * 1000;
      let limit = 0;
      if (timeframeFilter === "TODAY") limit = now - msPerDay;
      else if (timeframeFilter === "WEEK") limit = now - 7 * msPerDay;
      else if (timeframeFilter === "MONTH") limit = now - 30 * msPerDay;
      timeFiltered = timeFiltered.filter(h => (h.closedAtTimestamp || 0) >= limit);
    }

    let filtered = timeFiltered;
    if (filter === "WIN") filtered = filtered.filter(h => h.outcome === "WIN");
    if (filter === "LOSS") filtered = filtered.filter(h => h.outcome === "LOSS");
    if (strategyFilter !== "ALL") filtered = filtered.filter(h => h.strategyName === strategyFilter);

    const wins = filtered.filter(h => h.outcome === "WIN").length;
    const losses = filtered.filter(h => h.outcome === "LOSS").length;
    const totalPips = filtered.reduce((acc, h) => acc + (Number(h.pips) || 0), 0);
    const winRate = filtered.length > 0 ? Math.round((wins / (wins + losses || 1)) * 100) : 0;

    // Strategy ranking based on timeFiltered
    const stratMap: Record<string, { name: string, wins: number, total: number, pips: number }> = {};
    timeFiltered.forEach(h => {
      if (!stratMap[h.strategyName]) stratMap[h.strategyName] = { name: h.strategyName, wins: 0, total: 0, pips: 0 };
      stratMap[h.strategyName].total += 1;
      if (h.outcome === "WIN") stratMap[h.strategyName].wins += 1;
      stratMap[h.strategyName].pips += (Number(h.pips) || 0);
    });

    const ranking = Object.values(stratMap)
      .map(s => ({ ...s, winRate: Math.round((s.wins / (s.total || 1)) * 100) }))
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

    return { 
      filteredHistory: filtered, 
      summary: { win: wins, loss: losses, totalPips: Math.round(totalPips * 10) / 10, winRate },
      strategyRanking: ranking,
      uniqueStrategies: Object.keys(stratMap),
      safeHistory: safeHistoryArr
    };
  }, [history, filter, strategyFilter, timeframeFilter, nowTimestamp]);

  return (
    <div className="space-y-6 relative h-full">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
            <HistoryIcon className="w-4 h-4 text-zinc-400" />
            HISTORY / PORTFOLIO
          </h2>
          <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1.5">
            Arsip outcome, pips, dan evaluasi
            {!loading && history && (
              <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-wide">
                Synced
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2 py-1 border rounded text-[9px] font-medium transition-colors ${showFilters ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}
          >
            <ListFilter className="w-3 h-3" />
            Filter
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <select 
            value={timeframeFilter} 
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800 transition-colors cursor-pointer min-h-[36px]"
          >
            <option value="ALL">All Time</option>
            <option value="TODAY">Last 24 Hours</option>
            <option value="WEEK">Last 7 Days</option>
            <option value="MONTH">Last 30 Days</option>
          </select>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800 transition-colors cursor-pointer min-h-[36px]"
          >
            <option value="ALL">All Outcomes</option>
            <option value="WIN">Wins Only</option>
            <option value="LOSS">Losses Only</option>
          </select>
          <select 
            value={strategyFilter} 
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800 transition-colors cursor-pointer min-h-[36px] max-w-full sm:max-w-[200px] truncate"
          >
            <option value="ALL">All Strategies</option>
            {uniqueStrategies.map(strat => (
              <option key={strat} value={strat}>{strat}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-5 h-5 border-2 border-zinc-800 border-t-zinc-300 rounded-full animate-spin mb-4"></div>
          <p className="text-[11px] text-zinc-500 font-medium">Loading history...</p>
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
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800/80 rounded-xl bg-zinc-950/30">
          <div className="w-12 h-12 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4 border border-zinc-800/50">
            <HistoryIcon className="w-5 h-5 text-zinc-500" />
          </div>
          <p className="text-[11px] font-bold text-zinc-300 mb-1">No Trade History</p>
          <p className="text-[10px] text-zinc-500 max-w-[280px] leading-relaxed">
            Completed or closed signals will appear here for evaluation.
          </p>
        </div>
      ) : (
        <div className="space-y-6 pb-20">
          
          {/* Summary Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
              <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">Win Rate</span>
              <span className="text-sm font-bold text-zinc-200">{summary.winRate}%</span>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
              <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">Total Pips</span>
              <span className={`text-sm font-bold font-mono ${summary.totalPips > 0 ? "text-emerald-400" : summary.totalPips < 0 ? "text-rose-400" : "text-zinc-200"}`}>
                {summary.totalPips > 0 ? "+" : ""}{summary.totalPips}
              </span>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex flex-col items-center justify-center">
              <span className="text-[9px] text-emerald-500/70 font-medium uppercase tracking-wider mb-1.5">Wins</span>
              <span className="text-sm font-bold text-emerald-400">{summary.win}</span>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 flex flex-col items-center justify-center">
              <span className="text-[9px] text-rose-500/70 font-medium uppercase tracking-wider mb-1.5">Losses</span>
              <span className="text-sm font-bold text-rose-400">{summary.loss}</span>
            </div>
          </div>

          {/* Strategy Ranking */}
          {strategyRanking.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-[10px] font-bold text-zinc-300 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                Performance By Strategy
              </h3>
              <div className="space-y-2">
                {strategyRanking.map((strat, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-3 text-[10px] hover:border-zinc-700 transition-colors">
                    <span className="text-zinc-300 font-medium truncate pr-3 flex-1">
                      {idx + 1}. {strat.name}
                    </span>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-zinc-500 w-12 text-right">{strat.wins}/{strat.total} Won</span>
                      <span className={`w-12 text-right font-bold ${strat.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{strat.winRate}%</span>
                      <span className={`w-12 text-right font-mono font-bold ${strat.pips > 0 ? 'text-emerald-400' : strat.pips < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {strat.pips > 0 ? '+' : ''}{strat.pips}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-zinc-300 mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <HistoryIcon className="w-3.5 h-3.5 text-zinc-400" />
              Trade History
            </h3>
            {filteredHistory.length === 0 ? (
               <div className="text-center py-10 text-[10px] text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                 <p className="font-medium text-zinc-400 mb-1">No Matches Found</p>
                 <p>Adjust your filters to see more results.</p>
               </div>
            ) : (
              filteredHistory.slice(0, 100).map((item, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedHistory(item)}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${item.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                      >
                        {item.direction === "LONG" ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {item.direction}
                      </span>
                      <span className="text-xs font-bold text-zinc-100 group-hover:text-white transition-colors">
                        {item.pair}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-medium line-clamp-1">
                      {item.strategyName}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${item.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : item.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                    >
                      {item.outcome === "WIN" ? (
                        <Target className="w-3 h-3" />
                      ) : (
                        <Shield className="w-3 h-3" />
                      )}
                      {item.outcome === "WIN"
                        ? "Take Profit"
                        : item.outcome === "LOSS"
                          ? "Stop Loss"
                          : "Closed"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50 text-[10px]">
                  <div className="flex items-center gap-1.5 text-zinc-500 font-mono font-medium">
                    <Clock className="w-3 h-3 text-zinc-600" />
                    {item.closedAt}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 font-medium">Net Pips:</span>
                    <span
                      className={`font-mono font-bold ${item.pips > 0 ? "text-emerald-400" : item.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                    >
                      {item.pips > 0 ? "+" : ""}
                      {item.pips}
                    </span>
                  </div>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedHistory && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedHistory(null)}
        >
          <div
            className="w-full max-w-sm h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-2 uppercase">
                <HistoryIcon className="w-4 h-4 text-zinc-400" />
                Trade Record
              </h3>
              <button
                onClick={() => setSelectedHistory(null)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${selectedHistory.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                  >
                    {selectedHistory.direction === "LONG" ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {selectedHistory.direction} {selectedHistory.pair}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${selectedHistory.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : selectedHistory.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                  >
                    {selectedHistory.outcome}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-zinc-500 block mb-1">
                  {selectedHistory.signalKey}
                </span>
                <p className="text-[10px] font-medium text-zinc-300">
                  {selectedHistory.strategyName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-zinc-800/50 pt-3">
                <div>
                  <span className="block text-[8px] uppercase tracking-wider text-zinc-500 mb-0.5">
                    Time Closed
                  </span>
                  <span className="text-[10px] font-mono text-zinc-300">
                    {selectedHistory.closedAt}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase tracking-wider text-zinc-500 mb-0.5">
                    Duration
                  </span>
                  <span className="text-[10px] text-zinc-300 font-mono">
                    {selectedHistory.duration || '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase tracking-wider text-zinc-500 mb-0.5">
                    Final Status
                  </span>
                  <span className="text-[10px] text-zinc-300 font-bold uppercase text-[9px]">
                    {selectedHistory.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 py-3 border-y border-zinc-800/50">
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-1.5 text-center">
                  <div className="text-[8px] text-zinc-500 uppercase tracking-wider mb-0.5">Entry</div>
                  <div className="text-[10px] font-mono font-bold text-zinc-300">{selectedHistory.entry || '-'}</div>
                </div>
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-1.5 text-center">
                  <div className="text-[8px] text-zinc-500 uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                    <Shield className="w-2.5 h-2.5 text-rose-500/70" /> SL
                  </div>
                  <div className="text-[10px] font-mono font-bold text-rose-400">{selectedHistory.sl || '-'}</div>
                </div>
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-md p-1.5 text-center">
                  <div className="text-[8px] text-zinc-500 uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                    <Target className="w-2.5 h-2.5 text-emerald-500/70" /> TP1
                  </div>
                  <div className="text-[10px] font-mono font-bold text-emerald-400">{selectedHistory.tp1 || '-'}</div>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-center">
                <span className="block text-[9px] uppercase tracking-wider text-zinc-500 mb-2">
                  Net Result (Pips)
                </span>
                <span
                  className={`text-[12px] font-mono font-bold ${selectedHistory.pips > 0 ? "text-emerald-400" : selectedHistory.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                >
                  {selectedHistory.pips > 0 ? "+" : ""}
                  {selectedHistory.pips}
                </span>
              </div>

              <div>
                <span className="block text-[9px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1.5 font-bold">
                  <Search className="w-3 h-3" />
                  Outcome Analysis
                </span>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5 text-[10px] text-zinc-400 leading-snug">
                  {selectedHistory.reason 
                    ? selectedHistory.reason
                    : selectedHistory.outcome === "WIN"
                      ? "Trade hit target profit."
                      : selectedHistory.outcome === "LOSS"
                        ? "Trade hit stop loss."
                        : "Trade was closed."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
