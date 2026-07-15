"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-2xl flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 mb-2">
          Something went wrong
        </h2>
        <p className="text-xs text-zinc-400 mb-6">
          The application encountered an unexpected error. We have logged this issue.
          <br className="hidden md:block" />
          <span className="text-zinc-500 mt-2 inline-block font-mono bg-zinc-950 p-2 rounded w-full overflow-auto text-left line-clamp-3">
            {error.message || "Unknown rendering error"}
          </span>
        </p>
        <div className="flex gap-3 w-full">
          <button
            onClick={() => reset()}
            className="flex-1 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex-1 flex justify-center items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 py-2 px-4 rounded-lg text-xs font-medium transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
