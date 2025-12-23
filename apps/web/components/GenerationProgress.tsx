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
    let step = 0;
    const totalDuration = 16_000;
    const stepDuration = totalDuration / intervals.length;

    setProgress(intervals[0]);
    setIndex(0);

    const interval = setInterval(() => {
      step += 1;
      const nextProgress = intervals[step] ?? 100;
      setProgress(Math.min(nextProgress, 100));
      setIndex(Math.min(step, PHRASES.length - 1));

      if (step >= intervals.length) {
        clearInterval(interval);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [intervals]);

  const currentPhrase = PHRASES[index] || PHRASES[PHRASES.length - 1];

  return (
    <div className="text-center text-sm text-gray-900 dark:text-gray-100 mt-4 space-y-3">
      <div className="relative h-3 bg-gray-200/50 dark:bg-gray-800/50 rounded-full overflow-hidden shadow-inner">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 dark:from-gray-300 dark:via-gray-400 dark:to-gray-300 transition-all duration-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-black dark:text-white">Generating xFrora</p>
      <p className="font-medium text-black dark:text-white">{currentPhrase}</p>
    </div>
  );
}

