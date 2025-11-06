"use client";

import { useEffect, useMemo, useState } from "react";

const PHRASES = [
  "Syncing with your X aura…",
  "Scanning profile vibes — hold tight!",
  "Brewing the xFrora potion, extra sparkle coming up!",
  "Mixing cosmic pigments for your avatar.",
  "Assembling personality traits from X datapoints.",
  "Charging the Base mainnet crystal…",
  "Almost ready — polishing your digital halo!",
];

export default function GenerationProgress() {
  const intervals = useMemo(() => [0, 10, 22, 40, 58, 75, 90], []);
  const [progress, setProgress] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const totalDuration = 16_000; // 16 seconds
    const stepDuration = totalDuration / intervals.length;

    const interval = setInterval(() => {
      setProgress(() => Math.min(intervals[index + 1] ?? 100, 100));
      setIndex((prev) => Math.min(prev + 1, PHRASES.length - 1));
    }, stepDuration);

    return () => clearInterval(interval);
  }, [intervals.length]);

  const currentPhrase = PHRASES[index] || PHRASES[PHRASES.length - 1];

  return (
    <div className="text-center text-sm text-gray-700 mt-4 space-y-3 dark:text-slate-200">
      <div className="relative h-2 bg-white/60 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 via-blue-500 to-teal-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-purple-500 dark:text-purple-300">Generating xFrora</p>
      <p className="font-medium text-gray-800 dark:text-slate-100">{currentPhrase}</p>
    </div>
  );
}

