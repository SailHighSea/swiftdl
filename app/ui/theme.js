// Light or dark: "system" follows the operating system, "light" and "dark"
// override it (Settings > General > Appearance). The classic themes (Flat 98,
// Win98, Mac System 7, Mac Platinum, Linux CDE, Linux GNOME 2) are set by
// name; see themes.css. Runs in <head>, before the page draws, using the last
// choice remembered on this machine, so a window never flashes the wrong
// theme; the app then confirms it from its settings.
(() => {
  const RETRO = ["flat98", "win98", "system7", "platinum", "cde", "gnome2"];
  const media = matchMedia("(prefers-color-scheme: dark)");
  let pref = "system";
  try { pref = localStorage.getItem("theme") || "system"; } catch {}
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
  window.setTheme = (next) => {
    pref = ["light", "dark", ...RETRO].includes(next) ? next : "system";
    try { localStorage.setItem("theme", pref); } catch {}
    apply();
  };
  apply();
})();
