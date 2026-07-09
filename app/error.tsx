'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 p-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 max-w-md w-full text-center">
        <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-rose-500" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 mb-2 uppercase tracking-wide">
          Application Error
        </h2>
        <p className="text-xs text-zinc-400 mb-6 font-mono break-words">
          {error.message || 'An unexpected error occurred in the UI.'}
        </p>
        <button
          onClick={() => reset()}
          className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded transition-colors"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
