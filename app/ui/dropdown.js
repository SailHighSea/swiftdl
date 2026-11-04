// Rounded drop-down menus in place of the system's square ones.
// Each <select> stays in the page (hidden), so code keeps reading and setting
// `select.value` and listening for "change"; a button and a list are drawn next
// to it. The list opens inside the window, which grows to fit it.
(() => {
  const chevron = '<svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m2 3.5 3 3 3-3"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const valueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  let openOne = null;

  function enhance(sel) {
    if (sel._dd) return;
    const dd = document.createElement("div");
    dd.className = "dd";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dd-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    const list = document.createElement("div");
    list.className = "dd-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    dd.append(btn, list);
    sel.after(dd);
    sel.classList.add("dd-native");
    sel._dd = dd;

    const view = document.getElementById("view");
    const root = document.getElementById("root");
    let active = -1;

    const render = () => {
      const o = sel.selectedOptions[0];
      btn.innerHTML = `<span>${esc(o ? o.text : "")}</span>${chevron}`;
      btn.disabled = sel.disabled;
      list.innerHTML = [...sel.options].map((opt, i) =>
        `<div class="dd-opt${opt.selected ? " on" : ""}${i === active ? " act" : ""}" role="option" data-i="${i}"${opt.hidden ? " hidden" : ""}>${esc(opt.text)}</div>`).join("");
    };
    const close = () => {
      if (list.hidden) return;
      list.hidden = true;
      dd.classList.remove("open");
      if (view) view.style.paddingBottom = "";
      if (openOne === close) openOne = null;
    };
    const open = () => {
      if (sel.disabled) return;
      openOne?.();
      openOne = close;
      active = sel.selectedIndex;
      render();
      list.hidden = false;
      dd.classList.add("open");
      list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
      // Make room: the window is only as tall as its card.
      if (view && root) {
        const over = list.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom + 12;
        if (over > 0) view.style.paddingBottom = `${20 + over}px`;
      }
    };
    const choose = (i) => {
      const opt = sel.options[i];
      if (!opt || opt.disabled) return;
      valueProp.set.call(sel, opt.value);
      close();
      render();
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      btn.focus();
    };
    const move = (d) => {
      const n = sel.options.length;
      for (let k = 1; k <= n; k++) {
        const i = (active + d * k + n * n) % n;
        if (!sel.options[i].hidden && !sel.options[i].disabled) { active = i; break; }
      }
      render();
      list.querySelector(".act")?.scrollIntoView({ block: "nearest" });
    };

    btn.addEventListener("click", () => (list.hidden ? open() : close()));
    btn.addEventListener("keydown", (e) => {
      const isOpen = !list.hidden;
      if (e.key === "Escape" && isOpen) { close(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!isOpen) open(); move(e.key === "ArrowDown" ? 1 : -1); }
      else if ((e.key === "Enter" || e.key === " ") && isOpen) { choose(active); }
      else if (e.key === " " || e.key === "Enter") { open(); }
      else if (e.key === "Tab") { close(); return; }
      else return;
      // Handled here; don't let the window treat it as Enter/Escape.
      e.preventDefault();
      e.stopPropagation();
    });
    list.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus on the button
    list.addEventListener("click", (e) => {
      const o = e.target.closest(".dd-opt");
      if (o) choose(Number(o.dataset.i));
    });
    list.addEventListener("mousemove", (e) => {
      const o = e.target.closest(".dd-opt");
      if (o && Number(o.dataset.i) !== active) { active = Number(o.dataset.i); list.querySelectorAll(".act").forEach((x) => x.classList.remove("act")); o.classList.add("act"); }
    });
    btn.addEventListener("blur", () => setTimeout(() => { if (!dd.contains(document.activeElement)) close(); }, 0));
    document.addEventListener("mousedown", (e) => { if (!dd.contains(e.target)) close(); });

    // Code sets `select.value = …` and rewrites its options: follow along.
    Object.defineProperty(sel, "value", { configurable: true, get() { return valueProp.get.call(sel); }, set(v) { valueProp.set.call(sel, v); render(); } });
    new MutationObserver(render).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden", "selected"] });
    render();
  }

  const scan = (root) => root.querySelectorAll?.("select:not(.dd-native)").forEach(enhance);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches("select")) enhance(n); else scan(n); } }))).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => scan(document));
})();
