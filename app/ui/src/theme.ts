// Light or dark: "system" follows the operating system, "light" and "dark"
// override it (Settings > General > Appearance). The classic themes (Flat 98,
// Win98, Mac System 7, Mac Platinum, Linux CDE, Linux GNOME 2) are set by
// name; see themes.css. Inlined into each page's <head> at build time (see
// vite.config.ts), so it runs before the page draws, using the last choice
// remembered on this machine: a window never flashes the wrong theme. The app
// then confirms it from its settings.

const RETRO = ["flat98", "win98", "system7", "platinum", "cde", "gnome2"];
const media = matchMedia("(prefers-color-scheme: dark)");

let pref = "system";
try {
  pref = localStorage.getItem("theme") || "system";
} catch {
  // Storage can be unavailable; follow the system.
}

const apply = () => {
  const root = document.documentElement;
  if (RETRO.includes(pref)) {
    root.dataset.theme = pref;
    root.dataset.retro = "1";
    return;
  }
  delete root.dataset.retro;
  const dark = pref === "dark" || (pref === "system" && media.matches);
  root.dataset.theme = dark ? "dark" : "light";
};
media.addEventListener("change", apply);

window.setTheme = (next: string) => {
  pref = ["light", "dark", ...RETRO].includes(next) ? next : "system";
  try { localStorage.setItem("theme", pref); } catch { /* not remembered, still applied */ }
  apply();
};
apply();
