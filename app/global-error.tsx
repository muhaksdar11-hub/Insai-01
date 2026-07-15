"use client";

import { Inter, JetBrains_Mono } from "next/font/google";
import { AlertTriangle, RefreshCw } from "lucide-react";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-zinc-950 text-zinc-50 font-sans min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-2xl flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100 mb-2">
            Fatal System Error
          </h2>
          <p className="text-xs text-zinc-400 mb-6">
            A critical error occurred that prevented the application from loading.
            <br />
            <span className="text-zinc-500 mt-2 inline-block font-mono bg-zinc-950 p-2 rounded w-full overflow-auto text-left max-h-32">
              {error.message || "Unknown fatal error"}
            </span>
          </p>
          <button
            onClick={() => reset()}
            className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
