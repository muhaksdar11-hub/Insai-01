export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[50vh]">
      <div className="w-6 h-6 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
      <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-mono">Loading module...</p>
    </div>
  );
}
