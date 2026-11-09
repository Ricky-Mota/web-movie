#!/usr/bin/env python3
"""Regénère les pages du site Netlify à partir de `pages-separees/`.

Pour chaque page, le script :
  - active le mode hébergé (liens /app/ et /#abonnement) ;
  - ajoute les balises d'application installable (manifest, icônes, couleur) ;
  - ajoute le bandeau « Installer ImagiKids » et l'enregistrement du service worker.

Usage : python3 imagikids/build_netlify.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC, OUT = ROOT / "pages-separees", ROOT / "netlify"

HEAD = """<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#f4ad1d">
<link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ImagiKids">
"""

INSTALL = """
<script>
/* Application installable : service worker + bandeau « Installer ImagiKids » */
(function () {
  /* Ouvert depuis l'application Google Play : pas de prix ni de bouton d'abonnement (règles de paiement de Google) */
  try { if (document.referrer.indexOf("android-app://") === 0) sessionStorage.setItem("ik-play", "1");
    if (sessionStorage.getItem("ik-play")) { var st = document.createElement("style"); st.textContent = 'a[href*="abonnement"],#offers,#cta-offers,#nav-sub,[data-sub]{display:none!important}'; document.head.appendChild(st); } } catch (e) {}
  if ("serviceWorker" in navigator) addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  var standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return;
  var KEY = "ik-install-later", ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  try { if (+localStorage.getItem(KEY) > Date.now()) return; } catch (e) {}
  var deferred = null, el = null;
  function close(later) { if (el) el.remove(); el = null; if (later) try { localStorage.setItem(KEY, Date.now() + 7 * 864e5); } catch (e) {} }
  function bar(html, canInstall) {
    if (el) return;
    el = document.createElement("div");
    el.setAttribute("role", "region"); el.setAttribute("aria-label", "Installer ImagiKids");
    el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:60;width:min(560px,calc(100% - 24px));" +
      "display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;background:#1c2643;color:#fff;font:15px/1.4 Lexend,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";
    el.innerHTML = '<img src="/icons/icon-192.png" alt="" width="40" height="40" style="border-radius:10px;flex:none">' +
      '<span style="flex:1">' + html + "</span>" +
      (canInstall ? '<button type="button" data-i style="border:0;border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;background:#f4ad1d;color:#1c2643;cursor:pointer">Installer</button>' : "") +
      '<button type="button" data-x aria-label="Plus tard" style="border:0;background:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px">×</button>';
    document.body.appendChild(el);
    el.querySelector("[data-x]").onclick = function () { close(true); };
    var b = el.querySelector("[data-i]");
    if (b) b.onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function (c) { close(c && c.outcome !== "accepted"); }); deferred = null; };
  }
  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; bar("<b>Installez ImagiKids</b> sur votre écran d'accueil : il s'ouvre comme une vraie application.", true); });
  addEventListener("appinstalled", function () { close(false); });
  if (ios) setTimeout(function () { bar("Pour installer ImagiKids : touchez <b>Partager</b> ⬆️ puis <b>Sur l'écran d'accueil</b>.", false); }, 2500);
})();
</script>
"""

PAGES = [("abonnement.html", "index.html", True), ("application.html", "app/index.html", True), ("crm.html", "crm/index.html", False)]

for src, dst, pwa in PAGES:
    s = (SRC / src).read_text(encoding="utf8")
    assert s.count("<body>") == 1 and s.count("</head>") == 1 and s.count("</body>") == 1, src
    s = s.replace("<body>", "<body>\n<script>window.IK_HOSTED = true;</script>", 1)
    if pwa:
        s = s.replace("</head>", HEAD + "</head>", 1).replace("</body>", INSTALL + "</body>", 1)
        # lien vers la politique de confidentialité (exigé par Google Play pour une application pour enfants)
        s = s.replace('<footer id="foot"></footer>', '<footer id="foot"></footer>\n  <p style="font-size:13px;margin:-16px 0 0"><a href="/confidentialite/" style="color:inherit">Politique de confidentialité</a></p>', 1)
        s = s.replace('<span>© ImagiKids · Kinshasa, RDC</span>', '<span>© ImagiKids · Kinshasa, RDC · <a href="/confidentialite/" style="color:inherit">Politique de confidentialité</a></span>', 1)
    else:  # le CRM n'est ni installable ni référencé
        s = s.replace("<body>", '<body>\n<meta name="robots" content="noindex, nofollow">', 1)
    out = OUT / dst
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s, encoding="utf8")
    print("ok", out.relative_to(ROOT))
