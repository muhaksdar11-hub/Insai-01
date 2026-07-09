"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function ClientDate({ date, format = 'toLocaleString' }: { date: string | number, format?: 'toLocaleString' | 'toLocaleTimeString' | 'toLocaleDateString' }) {
  const str = useSyncExternalStore(
    emptySubscribe,
    () => {
      if (!date) return "---";
      const d = new Date(date);
      if (format === 'toLocaleTimeString') return d.toLocaleTimeString();
      else if (format === 'toLocaleDateString') return d.toLocaleDateString();
      else return d.toLocaleString();
    },
    () => "---"
  );

  return <span>{str}</span>;
}
