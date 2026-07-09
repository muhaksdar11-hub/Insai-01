import type { Metadata } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import Navigation from "@/components/navigation";
import TimeDisplay from "@/components/time-display";
import ConnectionStatus from "@/components/connection-status";
import { SSEProvider } from "@/components/sse-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "INSAI Trading",
  description: "INSAI Trading Application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body
        className="bg-zinc-950 text-zinc-50 flex flex-col min-h-screen font-sans"
      >
        <SSEProvider>
          <header className="flex items-center justify-between px-4 h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <h1 className="font-bold text-[11px] tracking-wide text-zinc-100 uppercase">
                INSAI
              </h1>
              <span className="hidden md:inline text-[8px] text-zinc-500 tracking-wide uppercase border-l border-zinc-800 pl-3">
                AI Signal Trading XAUUSD
              </span>
            </div>
            <div className="flex items-center gap-4">
              <ConnectionStatus />
              <TimeDisplay />
            </div>
          </header>
          <div className="flex flex-1">
            <Navigation />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-6 md:pl-64 pt-4 px-4">
              {children}
            </main>
          </div>
        </SSEProvider>
      </body>
    </html>
  );
}
