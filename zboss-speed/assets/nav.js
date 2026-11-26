// 2 Life : onglets communs à toutes les pages (Accueil, ville 3D, Ma vie, Célébrités), même style partout
(() => {
  const here = location.pathname.split("/").pop() || "index.html";
  const T = [["index.html", "🏠", "Accueil"], ["jouer.html", "🏙️", "La ville en 3D"], ["vie.html", "👤", "Ma vie"], ["celebrites.html", "⭐", "Célébrités"]];
  const st = document.createElement("style");
  st.textContent = `.site-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 18px;padding:2px}
.site-tabs::-webkit-scrollbar{display:none}
.site-tabs a{flex:none;display:flex;align-items:center;gap:7px;padding:9px 15px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#c9cfdc;text-decoration:none;font:600 13px Inter,system-ui,sans-serif;white-space:nowrap;transition:background .2s,color .2s}
.site-tabs a:hover,.site-tabs a:focus-visible{background:rgba(255,255,255,.09);color:#fff}
.site-tabs a[aria-current=page]{background:linear-gradient(135deg,#ff5a1f,#ffb21f);color:#160a02;border-color:transparent}
.wm{display:inline-flex;align-items:baseline;font:700 22px "Chakra Petch",Inter,system-ui,sans-serif;letter-spacing:.08em}.wm b{color:#ff7a2a;margin-left:.28em}`;
  document.head.appendChild(st);
  document.querySelectorAll("[data-site-tabs]").forEach(el => {
    el.classList.add("site-tabs"); el.setAttribute("aria-label", "Onglets du site");
    el.innerHTML = T.map(([h, i, l]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}><span aria-hidden="true">${i}</span>${l}</a>`).join("");
  });
})();
