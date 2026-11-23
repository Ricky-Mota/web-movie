// Garage, écran de jeu animé et bande-annonce.
(function () {
  const C = window.ZBOSS_CARS;
  const byId = id => C.list.find(c => c.id === id);
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Garage ----------
  const grid = document.getElementById("garage-grid");
  if (grid) {
    const label = { vitesse: "Vitesse", accel: "Accélération", maniab: "Maniabilité", solide: "Solidité" };
    grid.innerHTML = C.list.map(c => `
      <article class="car-card reveal in" style="--glow:${c.color}40">
        <div class="pic">${C.svg(c, { view: "34" })}</div>
        <div class="info">
          <div class="cls">${c.cls}</div>
          <h3>${c.name}</h3>
          <p>${c.tagline}</p>
          <div class="stats">${Object.keys(label).map(k => `
            <div class="stat"><span>${label[k]}</span><span class="bar"><i style="width:${c.stats[k]}%"></i></span><b>${c.stats[k]}</b></div>`).join("")}
          </div>
        </div>
      </article>`).join("");
  }

  // ---------- Voitures de la bande-annonce ----------
  const police = {
    id: "police", name: "Voiture de police", color: "#eef1f6", dark: "#1a1d26",
    body: "M18 102 Q22 86 56 82 L130 76 Q170 52 230 50 Q282 52 318 74 L392 84 Q406 92 402 108 L20 110 Z",
    glass: "M158 76 Q186 58 230 57 Q270 58 296 76 Z",
    extra: '<path d="M20 92 L404 92 L403 106 L20 108 Z" fill="#1a1d26"/><rect x="200" y="42" width="22" height="9" rx="2" fill="#ff2d4a" class="flash-r"/><rect x="224" y="42" width="22" height="9" rx="2" fill="#2d7bff" class="flash-b"/>',
    head: "M370 86 L398 88 L396 92 L366 91 Z", tail: "M20 86 L42 84 L42 89 L20 90 Z",
  };
  document.querySelectorAll("[data-car]").forEach(el => { el.innerHTML = C.svg(byId(el.dataset.car), { suffix: "-t" }); });
  document.querySelectorAll("[data-police]").forEach(el => { el.innerHTML = C.svg(police, { suffix: "-p" }); });
  document.querySelectorAll("[data-parade]").forEach(el => { el.innerHTML = C.list.map(c => C.svg(c, { suffix: "-pa" })).join(""); });

  // ---------- Écran de jeu : vitesse et chrono ----------
  const sp = document.getElementById("hud-speed"), arc = document.getElementById("hud-arc"), tm = document.getElementById("hud-time");
  if (sp && !reduce) {
    let t0 = performance.now(), base = 102.37;
    const tick = now => {
      const t = (now - t0) / 1000;
      const v = Math.round(286 + Math.sin(t * 0.9) * 22 + Math.sin(t * 3.1) * 4);
      sp.textContent = v;
      arc.setAttribute("stroke-dasharray", Math.min(100, v / 3.6) + " 100");
      const s = base + t, m = Math.floor(s / 60);
      tm.textContent = String(m).padStart(2, "0") + ":" + (s % 60).toFixed(2).padStart(5, "0");
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- Bande-annonce ----------
  const stage = document.getElementById("stage");
  if (!stage) return;
  const scenes = [...stage.querySelectorAll(".scene")];
  const durs = scenes.map(s => +s.dataset.dur);
  const total = durs.reduce((a, b) => a + b, 0);
  const bar = document.getElementById("t-bar"), code = document.getElementById("t-code");
  const toggle = document.getElementById("t-toggle"), overlay = document.getElementById("play"), soundBtn = document.getElementById("t-sound");
  let elapsed = 0, last = 0, playing = false, current = -1, raf = 0;
  const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  code.textContent = "0:00 / " + fmt(total);

  function show(i) {
    if (i === current) return;
    current = i;
    scenes.forEach((s, k) => {
      // relancer les animations CSS de la scène
      if (k === i) { s.classList.remove("active"); void s.offsetWidth; s.classList.add("active"); }
      else s.classList.remove("active");
    });
    Sound.scene(i);
  }
  function sceneAt(ms) { let acc = 0; for (let i = 0; i < durs.length; i++) { acc += durs[i]; if (ms < acc) return i; } return durs.length - 1; }
  function frame(now) {
    if (!playing) return;
    elapsed += now - last; last = now;
    if (elapsed >= total) { elapsed = total; pause(true); }
    show(sceneAt(Math.min(elapsed, total - 1)));
    bar.style.width = (elapsed / total * 100) + "%";
    code.textContent = fmt(elapsed) + " / " + fmt(total);
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (elapsed >= total || elapsed === 0) { elapsed = 0; current = -1; }
    playing = true; last = performance.now(); stage.classList.remove("paused");
    overlay.hidden = true; toggle.textContent = "Pause";
    Sound.resume(); raf = requestAnimationFrame(frame);
  }
  function pause(ended) {
    playing = false; cancelAnimationFrame(raf); stage.classList.add("paused");
    toggle.textContent = ended ? "Revoir" : "Lecture"; Sound.pause();
    if (ended) { overlay.hidden = false; overlay.querySelector(".plabel").textContent = "Revoir la bande-annonce"; }
  }
  overlay.addEventListener("click", play);
  toggle.addEventListener("click", () => playing ? pause(false) : play());
  stage.addEventListener("click", e => { if (e.target !== overlay && !overlay.contains(e.target) && playing) pause(false); });
  // première image visible avant lecture
  // affiche : la scène du logo sert d'image d'attente
  scenes[scenes.length - 2].classList.add("active");

  // ---------- Son synthétisé (aucun fichier audio) ----------
  const Sound = (() => {
    let ctx = null, on = false, engine = null, gain = null, siren = null, sirenGain = null;
    function build() {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
      const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 900; filt.connect(gain);
      engine = ctx.createOscillator(); engine.type = "sawtooth"; engine.frequency.value = 55; engine.connect(filt); engine.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(engine.frequency); lfo.start();
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0; sirenGain.connect(ctx.destination);
      siren = ctx.createOscillator(); siren.type = "triangle"; siren.frequency.value = 700; siren.connect(sirenGain); siren.start();
      const sl = ctx.createOscillator(); sl.frequency.value = 1.6; const sg = ctx.createGain(); sg.gain.value = 260; sl.connect(sg); sg.connect(siren.frequency); sl.start();
      return true;
    }
    const levels = [ [0.02, 0, 45], [0.09, 0, 85], [0.08, 0.05, 95], [0.05, 0.08, 70], [0.07, 0, 65], [0.1, 0.04, 110], [0.02, 0, 50] ];
    return {
      toggle() {
        on = !on;
        if (on && !ctx && !build()) { on = false; return false; }
        if (on) { ctx.resume(); this.scene(current); } else this.pause();
        return on;
      },
      scene(i) {
        if (!on || !ctx || !playing) return;
        const [eg, sg, hz] = levels[Math.max(0, i)] || levels[0], t = ctx.currentTime;
        gain.gain.setTargetAtTime(eg, t, 0.3); sirenGain.gain.setTargetAtTime(sg, t, 0.3);
        engine.frequency.setTargetAtTime(hz, t, 0.8);
      },
      resume() { if (on && ctx) { ctx.resume(); } },
      pause() { if (ctx) { const t = ctx.currentTime; gain.gain.setTargetAtTime(0, t, 0.1); sirenGain.gain.setTargetAtTime(0, t, 0.1); } },
    };
  })();
  soundBtn.addEventListener("click", () => {
    const on = Sound.toggle();
    soundBtn.textContent = "Son : " + (on ? "activé" : "coupé");
    soundBtn.setAttribute("aria-pressed", String(on));
    if (on) Sound.scene(current);
  });
})();
