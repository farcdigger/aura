"use client";

import { useThemeMode } from "./ThemeProvider";
import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeMode();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="px-3 py-2 rounded-full border border-gray-300 bg-white/80 text-sm font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 transition"
        aria-label="Toggle theme"
      >
        …
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="px-3 py-2 rounded-full border border-gray-300 bg-white/80 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700/80 shadow-sm"
      aria-label="Toggle theme"
    >
      {isDark ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}

