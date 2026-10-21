"use client";

import { useEffect, useState } from "react";

type Theme = "night" | "day";

/** Switches between the day and night themes and remembers the choice. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("day");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "night" ? "night" : "day");
  }, []);

  const flip = () => {
    const next: Theme = theme === "day" ? "night" : "day";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("writ:theme", next);
    } catch {
      // private mode: the switch still holds for this page
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-paper-tint hover:text-ink"
      aria-label={theme === "day" ? "Switch to the night theme" : "Switch to the day theme"}
      title={theme === "day" ? "Night" : "Day"}
    >
      {theme === "day" ? (
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
