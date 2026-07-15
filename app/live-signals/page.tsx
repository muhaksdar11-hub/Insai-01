"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { getStatusBadge } from "@/lib/utils";
import {
  Radio,
  ListFilter,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Target,
  Shield,
  CheckCircle2,
  X,
} from "lucide-react";

export default function LiveSignals() {
  const { data: signals, loading, error, refetch } = useFetch<any[]>("/api/signals/live", []);
  const [selectedSignal, setSelectedSignal] = useState<any>(null);

  return (
    <div className="space-y-6 relative h-full">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-500" />
            LIVE SIGNALS
          </h2>
          <p className="text-[10px] text-zinc-500 mt-1">
            Signal aktif yang sudah disetujui AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[9px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
            <ListFilter className="w-3 h-3" />
            Filter
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-5 h-5 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
          <p className="text-[11px] text-zinc-500 font-medium">Scanning for live signals...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-rose-900/30 rounded-xl bg-rose-950/10">
          <AlertTriangle className="w-8 h-8 text-rose-500/80 mb-4" />
          <p className="text-[11px] font-bold text-rose-400 mb-1">Connection Error</p>
          <p className="text-[10px] text-zinc-500 max-w-[250px] leading-relaxed mb-4">
            {error || "Unable to connect to the signal database."}
          </p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[10px] font-medium rounded-lg transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800/80 rounded-xl bg-zinc-950/30">
          <div className="w-12 h-12 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4 border border-zinc-800/50">
            <Radio className="w-5 h-5 text-zinc-500" />
          </div>
          <p className="text-[11px] font-bold text-zinc-300 mb-1">
            No Active Signals
          </p>
          <p className="text-[10px] text-zinc-500 max-w-[280px] leading-relaxed">
            Rule engine is actively scanning the market. Setups must pass all AI validations before appearing here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-20">
          {signals.map((signal, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedSignal(signal)}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
            >
              <div className="flex justify-between items-start mb-4 pb-3 border-b border-zinc-800/50">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${signal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {signal.direction === "LONG" ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {signal.direction}
                    </span>
                    <span className="text-xs font-bold text-zinc-100 group-hover:text-white transition-colors">
                      {signal.pair}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-medium">
                    {signal.strategyName}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getStatusBadge(signal.status)}`}>
                    {signal.status}
                  </span>
                  <div className="mt-2 flex items-center justify-end gap-1.5 text-[9px] text-zinc-500 font-medium">
                    <Clock className="w-3 h-3" />
                    {signal.age}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
                  <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1">
                    Entry
                  </div>
                  <div className="text-[11px] font-mono font-bold text-zinc-200">
                    {signal.entry}
                  </div>
                </div>
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
                  <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1 flex justify-center items-center gap-1">
                    <Shield className="w-3 h-3 text-rose-500/70" /> SL
                  </div>
                  <div className="text-[11px] font-mono font-bold text-rose-400">
                    {signal.sl}
                  </div>
                </div>
                <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
                  <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1 flex justify-center items-center gap-1">
                    <Target className="w-3 h-3 text-emerald-500/70" /> TP1
                  </div>
                  <div className="text-[11px] font-mono font-bold text-emerald-400">
                    {signal.tp1}
                  </div>
                </div>
              </div>

              {(signal.tp2 || signal.tp3) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {signal.tp2 && (
                    <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
                      <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1 flex justify-center items-center gap-1">
                        <Target className="w-3 h-3 text-emerald-500/70" /> TP2
                      </div>
                      <div className="text-[11px] font-mono font-bold text-emerald-400">
                        {signal.tp2}
                      </div>
                    </div>
                  )}
                  {signal.tp3 && (
                    <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
                      <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1 flex justify-center items-center gap-1">
                        <Target className="w-3 h-3 text-emerald-500/70" /> TP3
                      </div>
                      <div className="text-[11px] font-mono font-bold text-emerald-400">
                        {signal.tp3}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[9px] font-medium text-blue-400">
                    AI Verified ({signal.aiChecklist ? signal.aiChecklist.length : 0} Rules)
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold border uppercase ${signal.freshness === 'live' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : signal.freshness === 'cached' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700'}`}>
                      {signal.freshness}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-zinc-500 font-medium">Pips:</span>
                  <span
                    className={`font-mono font-bold ${signal.pips > 0 ? "text-emerald-400" : signal.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                  >
                    {signal.pips > 0 ? "+" : ""}
                    {signal.pips}
                  </span>
                </div>
              </div>

              {/* TP Progress Indicator */}
              <div className="mt-4 pt-4 border-t border-zinc-800/50">
                <div className="flex items-center justify-between text-[9px] font-medium text-zinc-500 mb-2">
                  <span>Entry</span>
                  <span>TP1</span>
                  {signal.tp2 && <span>TP2</span>}
                  {signal.tp3 && <span>TP3</span>}
                </div>
                <div className="h-1.5 bg-zinc-800/50 rounded-full flex overflow-hidden border border-zinc-800">
                    <div className={`h-full ${signal.status === 'TP1 HIT' || signal.status === 'TP2 HIT' || signal.status === 'TP3 HIT' ? 'bg-emerald-500' : 'bg-zinc-700'}`} style={{ width: signal.tp2 ? '33.33%' : signal.tp3 ? '25%' : '100%' }}></div>
                    {signal.tp2 && (
                        <div className={`h-full ${signal.status === 'TP2 HIT' || signal.status === 'TP3 HIT' ? 'bg-emerald-500' : 'bg-zinc-700'}`} style={{ width: signal.tp3 ? '25%' : '33.33%', borderLeft: '1px solid #27272a' }}></div>
                    )}
                    {signal.tp3 && (
                        <div className={`h-full ${signal.status === 'TP3 HIT' ? 'bg-emerald-500' : 'bg-zinc-700'}`} style={{ width: '50%', borderLeft: '1px solid #27272a' }}></div>
                    )}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {selectedSignal && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedSignal(null)}
        >
          <div
            className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500" />
                SIGNAL DETAIL
              </h3>
              <button
                onClick={() => setSelectedSignal(null)}
                className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${selectedSignal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                  >
                    {selectedSignal.direction === "LONG" ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {selectedSignal.direction} {selectedSignal.pair}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500">
                    {selectedSignal.signalKey}
                  </span>
                </div>
                <p className="text-[10px] font-medium text-zinc-300 mb-4">
                  {selectedSignal.strategyName}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-zinc-500 mb-0.5">
                      Time Created
                    </span>
                    <span className="text-[10px] font-mono text-zinc-300">
                      {selectedSignal.age}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-zinc-500 mb-0.5">
                      Status
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${getStatusBadge(selectedSignal.status)}`}>
                      {selectedSignal.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-zinc-800/50 pt-3">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 font-medium">Entry Target</span>
                    <span className="font-mono font-bold text-zinc-200">
                      {selectedSignal.entry}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 font-medium">Stop Loss</span>
                    <span className="font-mono font-bold text-rose-400">
                      {selectedSignal.sl}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-zinc-500 font-medium">Take Profit 1</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {selectedSignal.tp1}
                    </span>
                  </div>
                  {selectedSignal.tp2 && (
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500 font-medium">Take Profit 2</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {selectedSignal.tp2}
                      </span>
                    </div>
                  )}
                  {selectedSignal.tp3 && (
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500 font-medium">Take Profit 3</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {selectedSignal.tp3}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-zinc-100 mb-2 flex items-center gap-1.5 uppercase">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  AI Validation Evidence
                </h4>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                  
                  {selectedSignal.confidenceScore !== null && (
                    <div className="mb-4 bg-zinc-950 p-3 rounded-lg border border-zinc-800/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">AI Confidence Score</span>
                        <span className={`text-lg font-mono font-bold ${selectedSignal.confidenceScore >= 80 ? 'text-emerald-400' : selectedSignal.confidenceScore >= 60 ? 'text-blue-400' : 'text-amber-400'}`}>
                          {selectedSignal.confidenceScore}%
                        </span>
                      </div>
                      
                      {selectedSignal.marketConfidence !== undefined && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 uppercase tracking-wider">Market Confidence</span>
                          <span className={`font-mono font-bold ${selectedSignal.marketConfidence >= 80 ? 'text-emerald-500/80' : 'text-zinc-400'}`}>
                            {selectedSignal.marketConfidence}%
                          </span>
                        </div>
                      )}
                      {selectedSignal.dataQualityScore !== undefined && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 uppercase tracking-wider">Data Quality Score</span>
                          <span className={`font-mono font-bold ${selectedSignal.dataQualityScore >= 80 ? 'text-emerald-500/80' : 'text-zinc-400'}`}>
                            {selectedSignal.dataQualityScore}%
                          </span>
                        </div>
                      )}
                      {selectedSignal.signalQualityScore !== undefined && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 uppercase tracking-wider">Signal Quality Score</span>
                          <span className={`font-mono font-bold ${selectedSignal.signalQualityScore >= 80 ? 'text-emerald-500/80' : 'text-zinc-400'}`}>
                            {selectedSignal.signalQualityScore}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSignal.probabilities && (
                    <div className="mb-4 space-y-2">
                      <span className="text-[8px] uppercase tracking-wider text-zinc-500 block mb-1">
                        Probabilistic Analysis
                      </span>
                      {Object.entries(selectedSignal.probabilities).map(([key, value]: [string, any]) => (
                        <div key={key} className="flex flex-col gap-1">
                          <div className="flex justify-between text-[9px] text-zinc-400">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="font-mono">{value}%</span>
                          </div>
                          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-blue-500' : 'bg-zinc-600'}`} 
                              style={{ width: `${value}%` }} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mb-3">
                    <span className="text-[8px] uppercase tracking-wider text-zinc-500 block mb-1">
                          AI Checklist
                        </span>
                        <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto pr-1">
                          {selectedSignal.aiChecklist && selectedSignal.aiChecklist.length > 0 ? (
                            selectedSignal.aiChecklist.map((item: any, idx: number) => (
                              <div key={idx} className="flex flex-col gap-0.5 pb-2 mb-2 border-b border-zinc-800/50 last:border-0 last:pb-0 last:mb-0">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-zinc-300 font-medium" title={item.rule}>{item.rule}</span>
                                  <span className={`font-bold ${
                                    item.status === 'PASS' ? 'text-emerald-400' : 
                                    item.status === 'FAIL' ? 'text-rose-400' : 
                                    'text-amber-400'
                                  }`}>
                                    {item.status}
                                  </span>
                                </div>
                                <div className="text-[9px] text-zinc-400">
                                  <span className="text-zinc-500">Reason:</span> {item.reason}
                                </div>
                                {item.details && (
                                  <div className="text-[9px] text-zinc-400 mt-1">
                                    <span className="text-zinc-500">Details:</span> {item.details}
                                  </div>
                                )}
                                {(item.rulesExamined && item.rulesExamined.length > 0) && (
                                  <div className="text-[9px] text-zinc-400 mt-0.5">
                                    <span className="text-zinc-500">Rules Examined:</span> {item.rulesExamined.join(', ')}
                                  </div>
                                )}
                                {(item.rulesFailed && item.rulesFailed.length > 0) && (
                                  <div className="text-[9px] text-rose-400 mt-0.5">
                                    <span className="text-zinc-500">Failed:</span> {item.rulesFailed.join(', ')}
                                  </div>
                                )}
                                {(item.rulesPassed && item.rulesPassed.length > 0) && (
                                  <div className="text-[9px] text-emerald-400 mt-0.5">
                                    <span className="text-zinc-500">Passed:</span> {item.rulesPassed.join(', ')}
                                  </div>
                                )}
                                {item.evidence && (
                                  <div className="text-[9px] text-zinc-500 font-mono mt-1 bg-zinc-950 p-1.5 rounded border border-zinc-800 break-words">
                                    {typeof item.evidence === 'object' ? JSON.stringify(item.evidence) : String(item.evidence)}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <span className="text-[10px] text-zinc-500 italic">No checklist data</span>
                          )}
                        </div>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase tracking-wider text-zinc-500 block mb-1">
                      AI Reasoning
                    </span>
                    <p className="text-[10px] text-zinc-400 leading-snug">
                      {selectedSignal.aiReasoning || "Not Available"}
                    </p>
                    
                    {selectedSignal.aiEvidence && (
                      <div className="mt-2">
                        <span className="text-[8px] uppercase tracking-wider text-zinc-500 block mb-1">
                          Market Evidence
                        </span>
                        <p className="text-[10px] text-zinc-400 leading-snug bg-zinc-950 p-2 rounded border border-zinc-800/50">
                          {selectedSignal.aiEvidence}
                        </p>
                      </div>
                    )}

                    {selectedSignal.aiConflicts && (
                      <div className="mt-2">
                        <span className="text-[8px] uppercase tracking-wider text-amber-500/70 block mb-1">
                          Detected Conflicts
                        </span>
                        <p className="text-[10px] text-amber-500/80 leading-snug bg-amber-500/5 p-2 rounded border border-amber-500/20">
                          {selectedSignal.aiConflicts}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-zinc-100 mb-2 flex items-center gap-1.5 uppercase">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  Event History
                </h4>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                    <p className="text-[10px] text-zinc-500 italic text-center py-2">
                        No event history recorded yet.
                    </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
