// Trash Royal - sounds (CC0 clips in sfx/ with code-made backups) and background music.
const Sfx = (() => {
  let ac = null, master = null, soundBus = null, sfxBus = null, beatBus = null, noiseBuf = null, distCurve = null;
  let muted = false, soundVol = 100;   // soundVol: Settings slider, 0-100 (all sound effects + Orville's beat)
  try { muted = localStorage.getItem('tr_muted') === '1'; } catch (e) {}
  try { const v = parseInt(localStorage.getItem('tr_sound_vol'), 10); if (v >= 0 && v <= 100) soundVol = v; } catch (e) {}
  const last = {};
  let voices = 0;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
    soundBus = ac.createGain(); soundBus.gain.value = soundVol / 100; soundBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 1; sfxBus.connect(soundBus);
    beatBus = ac.createGain(); beatBus.gain.value = 0; beatBus.connect(soundBus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 6); }
    loadSamples();
  }

  function gainEnv(t0, a, d, v, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(dest || sfxBus);
    return g;
  }
  function osc(type, f0, f1, dur, vol, delay = 0, dest, attack = 0.005) {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = gainEnv(t0, attack, dur, vol, dest);
    o.connect(g); o.start(t0); o.stop(t0 + dur + attack + 0.05);
    voices++; o.onended = () => voices--;
    return o;
  }
  function noise(dur, vol, ftype, f0, f1, q = 1, delay = 0, dest, attack = 0.003) {
    const t0 = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = gainEnv(t0, attack, dur, vol, dest);
    s.connect(f); f.connect(g); s.start(t0, Math.random()); s.stop(t0 + dur + attack + 0.05);
    voices++; s.onended = () => voices--;
  }
  function wobble(type, base, dur, vol, lfoHz, lfoAmt, filt, delay = 0) {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(); o.type = type; o.frequency.value = base;
    const l = ac.createOscillator(); l.frequency.value = lfoHz;
    const lg = ac.createGain(); lg.gain.value = lfoAmt; l.connect(lg); lg.connect(o.frequency);
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
    const g = gainEnv(t0, 0.02, dur, vol);
    o.connect(f); f.connect(g);
    o.start(t0); l.start(t0); o.stop(t0 + dur + 0.1); l.stop(t0 + dur + 0.1);
    voices++; o.onended = () => voices--;
  }

  const lib = {
    pop() { osc('sine', 500, 900, 0.08, 0.3); },
    deploy() { noise(0.15, 0.2, 'lowpass', 1200, 300); },
    bonk() { osc('sine', 260, 70, 0.22, 0.7); osc('square', 1100, 400, 0.04, 0.12); },
    grunt() { wobble('sawtooth', 85, 0.35, 0.35, 18, 12, 500); },
    ptooey() { noise(0.05, 0.3, 'bandpass', 900, 900, 2); noise(0.18, 0.3, 'bandpass', 1500, 3500, 3, 0.05); },
    splat() { noise(0.12, 0.35, 'lowpass', 900, 200); },
    kick() { osc('sine', 150, 40, 0.25, 0.8); noise(0.06, 0.3, 'lowpass', 2000, 300); },
    stomp() { osc('sine', 70, 30, 0.3, 0.6); noise(0.15, 0.25, 'lowpass', 400, 80); },
    plop() { osc('sine', 500, 140, 0.1, 0.35); },
    coo() { wobble('sine', 520, 0.3, 0.2, 9, 60, 1500); },
    boom() { noise(0.7, 0.6, 'lowpass', 1400, 60); osc('sine', 90, 30, 0.6, 0.7); },
    gun() { for (let i = 0; i < 9; i++) { noise(0.04, 0.3, 'highpass', 1500, 1500, 1, i * 0.07); osc('square', 140, 60, 0.04, 0.12, i * 0.07); } },
    fart() { wobble('sawtooth', 75, 0.7, 0.45, 23, 30, 420); noise(0.6, 0.12, 'lowpass', 300, 120); },
    twang() { [196, 247, 294, 392].forEach((f, i) => { osc('sawtooth', f, f * 0.995, 0.55, 0.11, i * 0.035); osc('triangle', f * 2, f * 2, 0.3, 0.06, i * 0.035); }); },   // Buck's banjo
    toot() { lib.fart(); },   // backup if toot.mp3 can't load
    blinker() { noise(0.1, 0.32, 'highpass', 3200, 3600, 0.7, 0); noise(0.1, 0.32, 'highpass', 3200, 3600, 0.7, 0.17); noise(0.85, 0.36, 'bandpass', 3800, 5200, 0.6, 0.38, undefined, 0.04); noise(0.85, 0.12, 'lowpass', 1500, 900, 0.7, 0.38, undefined, 0.06); },   // smoke spray: psst psst psssshhh
    rage() { osc('sawtooth', 120, 600, 0.5, 0.25); osc('square', 240, 1200, 0.5, 0.1); },
    thwump() { osc('sine', 200, 60, 0.15, 0.5); noise(0.08, 0.2, 'lowpass', 900, 200); },
    hiss() { noise(0.4, 0.2, 'highpass', 2500, 5000); },
    hum() { osc('sawtooth', 120, 120, 0.12, 0.08); },
    ding() { osc('sine', 1760, 1760, 0.6, 0.25); osc('sine', 2637, 2637, 0.4, 0.1); },
    bottle() { osc('sine', 2200, 1900, 0.15, 0.25); osc('sine', 3300, 3000, 0.1, 0.1); },
    waah() { wobble('triangle', 520, 0.45, 0.18, 6, 40, 2000); },
    snipe() { noise(0.12, 0.5, 'highpass', 3000, 800); osc('square', 1600, 200, 0.08, 0.15); },
    whack() { noise(0.08, 0.4, 'bandpass', 700, 300, 2); osc('sine', 180, 80, 0.15, 0.5); },
    heehaw() { osc('sawtooth', 700, 650, 0.25, 0.2); osc('sawtooth', 300, 260, 0.35, 0.22, 0.27); osc('sawtooth', 700, 650, 0.25, 0.2, 0.65); },
    flush() { noise(0.9, 0.25, 'bandpass', 400, 1600, 1.5); },
    squish() { noise(0.1, 0.25, 'lowpass', 600, 150); osc('sine', 300, 120, 0.08, 0.2); },
    squeak() { osc('sine', 2200, 2900, 0.07, 0.15); },
    clank() { osc('square', 820, 600, 0.12, 0.18); osc('triangle', 1650, 1300, 0.2, 0.12); },
    chomp() { noise(0.06, 0.4, 'lowpass', 1500, 400); osc('square', 300, 90, 0.1, 0.25); },
    yap() { osc('square', 950, 700, 0.06, 0.18); osc('square', 1050, 750, 0.06, 0.18, 0.12); },
    crash() { noise(0.4, 0.5, 'lowpass', 3000, 200); osc('square', 400, 120, 0.2, 0.2); },
    horn() { osc('square', 520, 520, 0.12, 0.18); osc('square', 520, 520, 0.18, 0.18, 0.18); },
    whoosh() { noise(0.35, 0.3, 'bandpass', 300, 1500, 2); },
    burp() { wobble('sawtooth', 70, 0.5, 0.4, 14, 20, 350); },
    honk() { osc('sawtooth', 420, 380, 0.22, 0.25); osc('square', 210, 190, 0.22, 0.1); },
    slam() { osc('sine', 120, 40, 0.3, 0.7); noise(0.2, 0.3, 'lowpass', 800, 100); },
    cap() { osc('triangle', 1300, 600, 0.06, 0.12); },
    can() { osc('square', 700, 300, 0.08, 0.14); },
    hit() { noise(0.04, 0.15, 'bandpass', 1200, 800, 2); },
    death() { osc('sine', 700, 150, 0.25, 0.2); },
    towerDown() { noise(1.2, 0.6, 'lowpass', 2500, 80); osc('sine', 80, 25, 1.0, 0.7); osc('square', 600, 200, 0.4, 0.15, 0.1); },
    overtime() { [523, 659, 784].forEach((f, i) => osc('square', f, f, 0.15, 0.15, i * 0.15)); },
    win() { [523, 659, 784, 1047].forEach((f, i) => osc('square', f, f, i === 3 ? 0.6 : 0.15, 0.18, i * 0.16)); },
    lose() { [392, 370, 349, 330].forEach((f, i) => wobble('sawtooth', f * 0.5, i === 3 ? 0.9 : 0.35, 0.2, 5, i === 3 ? 8 : 0, 900, i * 0.4)); },
    tick() { osc('square', 1000, 1000, 0.03, 0.08); },
    fight() { osc('sawtooth', 220, 880, 0.3, 0.2); noise(0.3, 0.2, 'highpass', 2000, 6000); },
    nope() { osc('square', 200, 140, 0.12, 0.15); },
  };

  // ---- real CC0 sound clips (sfx/*.wav). If one fails to load, the code-made sound plays instead.
  const SAMPLES = ['pop', 'tick', 'nope', 'deploy', 'bonk', 'grunt', 'ptooey', 'splat', 'kick', 'stomp', 'plop', 'boom', 'fart', 'rage',
    'thwump', 'hiss', 'ding', 'bottle', 'waah', 'snipe', 'whack', 'heehaw', 'flush', 'squish', 'squeak', 'clank', 'chomp', 'yap', 'crash', 'horn',
    'whoosh', 'burp', 'slam', 'cap', 'can', 'hit', 'towerDown', 'dynamite', 'win', 'growl', 'toot'];
  const VOLS = { cap: 0.5, can: 0.6, hit: 0.5, stomp: 0.8, blinker: 0.8, fart: 1.0, win: 0.8, tick: 0.6, flush: 0.8, toot: 0.85 };
  const FILES = { toot: 'toot.mp3?v=1' };       // Erick's own Toot sound (everything else is a CC0 .wav)
  const START = { toot: 0.18 };                 // skip the silence at the start of a clip
  const SAMPLE_URL = n => 'sfx/' + (FILES[n] || n + '.wav?v=1');
  const buffers = {};
  function loadSamples() {
    SAMPLES.forEach(n => {
      fetch(SAMPLE_URL(n)).then(r => r.ok ? r.arrayBuffer() : null).then(b => {
        if (!b) return;
        ac.decodeAudioData(b, buf => { buffers[n] = buf; }, () => {});
      }).catch(() => {});
    });
  }
  function playSample(name) {
    const s = ac.createBufferSource(); s.buffer = buffers[name];
    if (name !== 'win' && name !== 'blinker' && !FILES[name]) s.playbackRate.value = 0.93 + Math.random() * 0.14;
    const g = ac.createGain(); g.gain.value = VOLS[name] || 0.9;
    s.connect(g); g.connect(sfxBus); s.start(0, START[name] || 0);
    voices++; s.onended = () => voices--;
  }

  function play(name) {
    if (!ac || muted || (!lib[name] && !buffers[name])) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < 0.07) return;
    if (voices > 40) return;
    last[name] = now;
    try { if (buffers[name]) playSample(name); else lib[name](); } catch (e) {}
  }

  // ---- Orville's speaker beat: an original heavy, distorted bass loop ----
  let beatWanted = false, nextStep = 0, step = 0;
  const BPM = 140, STEP = 60 / BPM / 4;
  const kickSteps = [0, 7, 10], clapSteps = [4, 12];
  const bassNotes = { 0: 41.2, 7: 49.0, 10: 36.7, 14: 46.2 };
  function bass808(t0, f) {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.06);
    const ws = ac.createWaveShaper(); ws.curve = distCurve;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + STEP * 3);
    o.connect(ws); ws.connect(g); g.connect(beatBus);
    o.start(t0); o.stop(t0 + STEP * 3 + 0.05);
  }
  function beatKick(t0) {
    const o = ac.createOscillator(); o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
    const g = ac.createGain(); g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    o.connect(g); g.connect(beatBus); o.start(t0); o.stop(t0 + 0.25);
  }
  function beatNoise(t0, dur, vol, ftype, f) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = ftype; fl.frequency.value = f;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(beatBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02);
  }
  function beatTick(on) {
    if (!ac) return;
    if (on !== beatWanted) {
      beatWanted = on;
      const t = ac.currentTime;
      beatBus.gain.cancelScheduledValues(t);
      beatBus.gain.setTargetAtTime(on ? 0.32 : 0, t, 0.25);
      if (on && nextStep < t) { nextStep = t + 0.05; step = 0; }
    }
    if (!beatWanted && beatBus.gain.value < 0.01) return;
    const ahead = ac.currentTime + 0.15;
    if (nextStep < ac.currentTime - 0.5) nextStep = ac.currentTime + 0.05;
    while (nextStep < ahead) {
      const s = step % 16;
      if (kickSteps.includes(s)) beatKick(nextStep);
      if (clapSteps.includes(s)) beatNoise(nextStep, 0.15, 0.5, 'bandpass', 1500);
      if (s % 2 === 0) beatNoise(nextStep, 0.03, 0.15, 'highpass', 7000);
      if (s % 4 === 3 && step % 32 > 16) beatNoise(nextStep, 0.03, 0.12, 'highpass', 8000);
      if (bassNotes[s]) bass808(nextStep, bassNotes[s]);
      nextStep += STEP; step++;
    }
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('tr_muted', m ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = m ? 0 : 0.55;
  }
  function setSoundVol(v) {
    soundVol = Math.max(0, Math.min(100, Math.round(v)));
    try { localStorage.setItem('tr_sound_vol', String(soundVol)); } catch (e) {}
    if (soundBus) soundBus.gain.setTargetAtTime(soundVol / 100, ac.currentTime, 0.03);
  }
  return { init, play, beatTick, setMuted, isMuted: () => muted, setSoundVol, soundVol: () => soundVol, audio: () => ({ ac, master }) };
})();

// Background music. The menu song loops on the menu screens and fades out for matches
// (match music comes later). It runs through the same volume/mute as the sounds, so it
// also behaves on iPhones (which ignore audio.volume).
const Music = (() => {
  const TRACKS = { menu: 'music/menu.mp3?v=1' };
  let vol = 30;                          // Settings slider, 0-100; starts at 30%, then whatever the player saved
  try { const v = parseInt(localStorage.getItem('tr_music_vol'), 10); if (v >= 0 && v <= 100) vol = v; } catch (e) {}
  let el = null, gain = null, want = null, pauseT = 0;
  function hook() {
    if (gain) return true;
    const a = Sfx.audio();
    if (!a.ac) return false;              // sound isn't unlocked yet (needs a tap first)
    el = new Audio(); el.loop = true; el.preload = 'auto';
    gain = a.ac.createGain(); gain.gain.value = 0;
    a.ac.createMediaElementSource(el).connect(gain); gain.connect(a.master);
    return true;
  }
  const audible = () => !!want && vol > 0 && !document.hidden;
  let holdUntil = 0, holdT = 0;          // the loading theme can ask the menu music to wait until it's done
  function sync(quick) {
    if (performance.now() < holdUntil) { clearTimeout(holdT); holdT = setTimeout(() => sync(), holdUntil - performance.now() + 20); return; }
    if (!hook()) return;
    const ac = Sfx.audio().ac, t = ac.currentTime, g = gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    clearTimeout(pauseT);
    if (audible()) {
      if (el.dataset.track !== want) { el.src = TRACKS[want]; el.dataset.track = want; }
      if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
      g.linearRampToValueAtTime(vol / 100, t + (quick ? 0.05 : 0.8));
    } else {
      g.linearRampToValueAtTime(0, t + 0.5);
      pauseT = setTimeout(() => { if (!audible()) el.pause(); }, 550);   // keeps its place for next time
    }
  }
  document.addEventListener('visibilitychange', () => sync());
  return {
    play(name) { want = name; sync(); },
    stop() { want = null; sync(); },
    hold(ms) { if (isFinite(ms) && ms > 0) holdUntil = Math.max(holdUntil, performance.now() + Math.min(ms, 10000)); },
    setVol(v) { vol = Math.max(0, Math.min(100, Math.round(v))); try { localStorage.setItem('tr_music_vol', String(vol)); } catch (e) {} sync(true); },
    vol: () => vol,
    state: () => ({ track: el && el.dataset.track, playing: !!el && !el.paused, time: el ? +el.currentTime.toFixed(1) : 0, vol: gain ? +gain.gain.value.toFixed(2) : 0 }),
  };
})();
