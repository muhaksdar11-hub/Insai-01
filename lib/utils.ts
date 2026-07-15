import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getStatusBadge(status: string) {
  const s = status?.toLowerCase() || '';
  if (['approved', 'signal_active', 'take_partial', 'finished', 'win', 'valid', 'tp tercapai', 'tp1 hit', 'tp2 hit', 'tp3 hit', 'healthy', 'online'].some(x => s === x || s.includes(x))) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (['active', 'validated', 'live', 'connected'].some(x => s === x || s.includes(x))) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (['rejected', 'error', 'disconnected', 'unavailable', 'block', 'invalid', 'sl tercapai', 'failed'].some(x => s === x || s.includes(x))) return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (['warning', 'stale', 'degraded', 'reconnecting', 'suppressed'].some(x => s === x || s.includes(x))) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (['expired', 'history', 'cached'].some(x => s === x || s.includes(x))) return "text-zinc-500 bg-zinc-800 border-zinc-700";
  if (['not configured', 'placeholder', 'tbd', 'needs configuration'].some(x => s === x || s.includes(x))) return "text-zinc-400 bg-zinc-900 border-zinc-700 border-dashed";
  if (['disabled', 'stopped'].some(x => s === x || s.includes(x))) return "text-zinc-500 bg-zinc-900 border-zinc-800";
  if (['awaiting', 'idle', 'wait', 'pending'].some(x => s === x || s.includes(x))) return "text-blue-400 bg-zinc-900 border-blue-900/30";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}

export function getMcpStatusBadge(displayStatus: string) {
  const s = displayStatus?.toUpperCase() || '';
  if (s === "ONLINE") return "border-emerald-500/50 text-emerald-400 bg-emerald-500/10";
  if (s === "NOT CONFIGURED") return "border-zinc-700 border-dashed text-zinc-400 bg-zinc-900";
  if (s === "OFFLINE") return "border-zinc-800 border-dashed text-zinc-500 bg-zinc-950";
  if (s === "RATE LIMITED" || s === "DEGRADED") return "border-amber-500/50 text-amber-400 bg-amber-500/10";
  return "border-rose-500/50 text-rose-400 bg-rose-500/10";
}

export function formatMcpStatus(status: string, error?: string | null): string {
  const s = status?.toUpperCase() || '';
  if (s === 'ACTIVE' || s === 'ONLINE') return 'ONLINE';
  if (s === 'NOT CONFIGURED' || s === 'NEEDS CONFIGURATION') return 'NOT CONFIGURED';
  if (s === 'OFFLINE') return 'OFFLINE';
  if (s === 'RATE LIMITED') return 'RATE LIMITED';
  if (s === 'DEGRADED') return 'DEGRADED';
  if (s === 'UNAVAILABLE' || s === 'ERROR') {
      if (error && (error.includes('429') || error.toLowerCase().includes('rate limited') || error.toLowerCase().includes('too many requests'))) return 'RATE LIMITED';
      return 'UNAVAILABLE';
  }
  return s;
}
