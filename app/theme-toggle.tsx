"use client";

import { THEME_STORAGE_KEY } from "./theme";

function toggleTheme() {
  const root = document.documentElement;
  const pinned = root.dataset.theme;
  const current =
    pinned === "light" || pinned === "dark"
      ? pinned
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be blocked; the mode still changes for this page.
  }
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// No state for the current mode: the server cannot know it, so both icons are
// rendered and CSS shows the right one.
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch between light and dark mode"
      className="grid h-9 w-9 place-items-center rounded border border-border-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
    >
      <svg {...ICON_PROPS} className="theme-icon-moon col-start-1 row-start-1">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      <svg {...ICON_PROPS} className="theme-icon-sun col-start-1 row-start-1">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
