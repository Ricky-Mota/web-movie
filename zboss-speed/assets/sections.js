// Bande-annonce animée de la page d'accueil.
(function () {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const levels = [ [0.02, 0, 45], [0.03, 0, 55], [0.03, 0, 60], [0.04, 0, 65], [0.05, 0, 70], [0.06, 0, 80], [0.02, 0, 50] ];
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
