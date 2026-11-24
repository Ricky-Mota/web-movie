// Voitures originales de Zboss-speed (profils SVG dessinés à la main).
// Inspirées de silhouettes et de couleurs, sans logo ni nom de constructeur réel.
(function () {
  const CARS = [
    {
      id: "kasai", name: "Kasaï R", cls: "Supercar", color: "#ff5a1f", dark: "#a8300a",
      tagline: "Coin d'attaque orange, V12 atmosphérique.",
      stats: { vitesse: 92, accel: 88, maniab: 74, solide: 55 },
      body: "M18 104 L22 88 L62 80 L150 72 L204 46 L262 43 L332 70 L398 82 L405 98 L398 110 L22 110 Z",
      glass: "M170 72 L210 52 L258 50 L302 71 Z",
      extra: '<path d="M222 84 L262 80 L248 102 L214 102 Z" fill="#0b0d13" opacity=".7"/><path d="M60 92 L380 90" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>',
      head: "M372 86 L398 88 L396 93 L368 92 Z", tail: "M20 90 L44 87 L44 92 L21 95 Z",
    },
    {
      id: "lualaba", name: "Lualaba Héritage", cls: "Hypercar", color: "#b48a5a", dark: "#4a3826",
      tagline: "Bronze et noir, 1 600 ch de couple pur.",
      stats: { vitesse: 98, accel: 90, maniab: 66, solide: 62 },
      body: "M16 102 Q18 84 52 80 L140 75 Q190 46 250 45 Q302 47 332 72 L392 84 Q407 92 403 108 L20 110 Z",
      glass: "M174 73 Q202 54 248 53 Q284 55 306 73 Z",
      extra: '<path d="M20 100 L404 100 L403 108 L20 110 Z" fill="#1a140e" opacity=".85"/><path d="M196 100 Q206 80 236 78" stroke="#1a140e" stroke-width="5" fill="none"/>',
      head: "M370 88 L400 92 L398 97 L366 94 Z", tail: "M18 94 L46 92 L46 96 L18 98 Z",
    },
    {
      id: "gombe", name: "Nuit de Gombe", cls: "Hypercar", color: "#1b1d24", dark: "#050507",
      tagline: "Noir intégral, signature lumineuse en quatre points.",
      stats: { vitesse: 100, accel: 86, maniab: 70, solide: 68 },
      body: "M16 100 Q20 82 60 78 L132 74 Q182 42 246 42 Q302 44 336 70 L390 80 Q405 88 402 108 L20 110 Z",
      glass: "M168 72 Q200 50 246 50 Q286 52 310 72 Z",
      extra: '<path d="M158 104 Q138 72 192 64 Q238 60 252 74" stroke="#8c94a8" stroke-width="3" fill="none" opacity=".8"/><path d="M28 72 L78 70 L80 76 L30 78 Z" fill="#0b0c10"/><g fill="#e8f2ff"><rect x="372" y="86" width="5" height="4" rx="1"/><rect x="379" y="87" width="5" height="4" rx="1"/><rect x="386" y="88" width="5" height="4" rx="1"/><rect x="393" y="89" width="5" height="4" rx="1"/></g>',
      head: "", tail: "M18 90 L60 88 L60 92 L18 94 Z",
    },
    {
      id: "kivu", name: "Kivu Volt", cls: "Hybride", color: "#ffd21f", dark: "#a88500",
      tagline: "Portes papillon et poussée électrique instantanée.",
      stats: { vitesse: 90, accel: 97, maniab: 82, solide: 50 },
      body: "M18 104 Q20 86 58 80 L148 74 Q196 48 250 46 Q300 48 330 72 L394 84 Q406 94 402 108 L22 110 Z",
      glass: "M172 74 Q206 55 250 54 Q284 56 304 74 Z",
      extra: '<path d="M196 76 L190 30 L208 6 L246 2 L250 22 L226 76 Z" fill="#e6bb10" stroke="#a88500" stroke-width="2"/><path d="M198 50 L194 32 L210 12 L240 9 L242 22 L218 50 Z" fill="#111622" opacity=".9"/><path d="M228 84 L268 82 L258 102 L224 102 Z" fill="#111" opacity=".75"/>',
      head: "M370 88 L398 90 L396 95 L366 93 Z", tail: "M20 92 L44 89 L44 94 L20 97 Z",
    },
    {
      id: "ituri", name: "Ituri Spider", cls: "Roadster", color: "#a9c8e4", dark: "#5f7f9c",
      tagline: "Bleu glacier, toit ouvert, châssis très vif.",
      stats: { vitesse: 86, accel: 84, maniab: 94, solide: 52 },
      body: "M18 102 Q22 86 56 82 L150 80 L196 78 L232 76 L330 74 L392 84 Q406 92 402 108 L20 110 Z",
      glass: "M222 76 L246 54 L252 55 L236 76 Z",
      extra: '<path d="M150 80 Q160 66 178 66 Q190 66 194 78 Z" fill="#d9c7a8"/><path d="M118 80 Q128 66 146 66 Q156 66 158 80 Z" fill="#d9c7a8"/><path d="M60 94 L380 92" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>',
      head: "M368 86 L398 89 L396 94 L364 92 Z", tail: "M20 92 L42 90 L42 95 L20 97 Z",
    },
    {
      id: "mayombe", name: "Mayombe 68", cls: "Classique", color: "#d81e1e", dark: "#7c0d0d",
      tagline: "Coupé rétro des années 60, moteur refait à neuf.",
      stats: { vitesse: 72, accel: 70, maniab: 78, solide: 88 },
      body: "M26 104 Q20 86 42 80 Q92 72 140 66 Q182 38 232 38 Q272 40 300 62 Q362 68 392 84 Q404 94 398 108 L28 110 Z",
      glass: "M162 66 Q194 46 230 46 Q258 48 280 64 Z",
      extra: '<path d="M210 46 L216 66" stroke="#7c0d0d" stroke-width="3"/><rect x="360" y="100" width="44" height="5" rx="2" fill="#d7dbe3"/><rect x="18" y="100" width="34" height="5" rx="2" fill="#d7dbe3"/>',
      head: "M384 86 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0", tail: "M24 88 L40 86 L40 92 L24 94 Z",
      wheelR: 22,
    },
  ];

  function wheel(cx, r) {
    const spokes = [0, 72, 144, 216, 288].map(a =>
      `<line x1="${cx}" y1="104" x2="${cx + Math.cos(a * Math.PI / 180) * (r - 9)}" y2="${104 + Math.sin(a * Math.PI / 180) * (r - 9)}" stroke="#9aa3b5" stroke-width="3"/>`).join("");
    return `<circle cx="${cx}" cy="104" r="${r + 4}" fill="#050507"/>` +
      `<circle cx="${cx}" cy="104" r="${r}" fill="#101218" stroke="#2a2e38" stroke-width="5"/>` +
      `<circle cx="${cx}" cy="104" r="${r - 8}" fill="#1c2029"/>${spokes}<circle cx="${cx}" cy="104" r="4" fill="#cfd5e2"/>`;
  }

  // Rendus 3D pré-calculés (tools/studio.html) : vue de profil « side » ou trois-quarts « 34 ».
  // L'ancien dessin SVG reste disponible via vector() en secours.
  function svg(car, opts = {}) {
    const view = opts.view || "side";
    return `<img class="car-svg car-img car-${view}" src="assets/cars/${car.id}-${view}.webp" alt="${car.name}" loading="lazy" decoding="async">`;
  }
  function vector(car, opts = {}) {
    const r = car.wheelR || 26;
    const gid = "cg-" + car.id + (opts.suffix || "");
    return `<svg viewBox="0 0 420 150" class="car-svg" role="img" aria-label="${car.name}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${car.color}"/><stop offset=".65" stop-color="${car.color}"/><stop offset="1" stop-color="${car.dark}"/>
      </linearGradient><linearGradient id="hl-${gid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".14"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
      </linearGradient></defs>
      <ellipse cx="210" cy="130" rx="200" ry="9" fill="#000" opacity=".55"/>
      <path d="${car.body}" fill="url(#${gid})" stroke="${car.dark}" stroke-width="1.5"/>
      <path d="${car.glass}" fill="#121826" opacity=".92"/>
      <path d="${car.body}" fill="url(#hl-${gid})"/>
      ${car.extra || ""}
      ${car.head ? `<path d="${car.head}" fill="#f4f8ff"/>` : ""}
      ${car.tail ? `<path d="${car.tail}" fill="#ff2d1f"/>` : ""}
      ${wheel(100, r)}${wheel(318, r)}
    </svg>`;
  }

  window.ZBOSS_CARS = { list: CARS, svg, vector };
})();
