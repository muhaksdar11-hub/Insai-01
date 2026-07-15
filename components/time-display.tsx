"use client";

import { useState, useEffect } from "react";
import { useMounted } from "@/hooks/use-mounted";

export default function TimeDisplay() {
  const [time, setTime] = useState<string>("");
  const mounted = useMounted();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
        }).format(now),
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted || !time) {
    return <div className="text-[10px] font-mono text-zinc-500">--:--:--</div>;
  }

  return <div className="text-[10px] font-mono text-zinc-400">{time}</div>;
}
