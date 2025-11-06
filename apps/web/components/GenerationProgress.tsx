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
  const intervals = useMemo(() => [0, 20, 35, 50, 65, 80, 95], []);
  const [progress, setProgress] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const totalDuration = 10_000; // 10 seconds
    const stepDuration = totalDuration / intervals.length;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const nextProgress = Math.min(prev + 100 / (totalDuration / stepDuration), 100);
        return nextProgress;
      });
      setIndex((prev) => Math.min(prev + 1, PHRASES.length - 1));
    }, stepDuration);

    return () => clearInterval(interval);
  }, [intervals.length]);

  const currentPhrase = PHRASES[index] || PHRASES[PHRASES.length - 1];

  return (
    <div className="text-center text-sm text-gray-700 mt-4 space-y-3">
      <div className="relative h-2 bg-white/60 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 via-blue-500 to-teal-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-purple-500">Generating xFrora</p>
      <p className="font-medium text-gray-800">{currentPhrase}</p>
    </div>
  );
}

