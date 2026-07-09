import Link from 'next/link';
import { SearchX, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 p-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 max-w-md w-full text-center">
        <div className="w-12 h-12 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <SearchX className="w-6 h-6 text-zinc-400" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 mb-2 uppercase tracking-wide">
          Page Not Found
        </h2>
        <p className="text-xs text-zinc-400 mb-6 font-mono">
          The requested resource could not be located in the system.
        </p>
        <Link href="/">
          <button className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            RETURN TO DASHBOARD
          </button>
        </Link>
      </div>
    </div>
  );
}
