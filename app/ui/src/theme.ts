// Light or dark: "system" follows the operating system, "light" and "dark"
// override it (Settings > General > Theme). Inlined into each page's <head>
// at build time (see vite.config.ts), so it runs before the page draws,
// using the last choice remembered on this machine: a window never flashes
// the wrong theme. The app then confirms it from its settings.

type ThemePref = "system" | "light" | "dark";

const media = matchMedia("(prefers-color-scheme: dark)");
const valid = (v: string | null): v is ThemePref => v === "system" || v === "light" || v === "dark";

let pref: ThemePref = "system";
try {
  const saved = localStorage.getItem("theme");
  if (valid(saved)) pref = saved;
} catch {
  // Storage can be unavailable; follow the system.
}

const apply = () => {
  const dark = pref === "dark" || (pref === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};
media.addEventListener("change", apply);

window.setTheme = (next: string) => {
  pref = valid(next) ? next : "system";
  try { localStorage.setItem("theme", pref); } catch { /* not remembered, still applied */ }
  apply();
};
apply();
