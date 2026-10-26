// Procedural audio with WebAudio (no sound files): ambient pad, city ambience,
// suction that deepens with the hole size, absorption pops, collapse rumble.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.music = 0.6;
    this.sfx = 0.8;
    this.lastPop = 0;
    this.pops = 0;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    this.reverb.connect(wet); wet.connect(this.master);
    this.noise = this.noiseBuffer(2);
    this.setVolumes(this.music, this.sfx);
    this.startMusic();
    this.startAmbience();
    this.startSuction();
  }

  impulse(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return b;
  }

  noiseBuffer(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  noiseSrc(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = loop;
    return s;
  }

  setVolumes(music, sfx) {
    this.music = music; this.sfx = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music * 0.5, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.2);
  }

  startMusic() {
    const ctx = this.ctx;
    const chords = [[48, 55, 59, 64], [45, 52, 57, 60], [41, 48, 52, 57], [43, 50, 55, 62]];
    const hz = n => 440 * 2 ** ((n - 69) / 12);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    const out = ctx.createGain(); out.gain.value = 0.08;
    lp.connect(out); out.connect(this.musicBus); out.connect(this.reverb);
    let step = 0;
    const play = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const ch = chords[step % chords.length];
      for (const n of ch) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.12, t + 3); g.gain.linearRampToValueAtTime(0.1, t + 7); g.gain.linearRampToValueAtTime(0, t + 11);
          o.connect(g); g.connect(lp); o.start(t); o.stop(t + 11.2);
        }
      }
      // a few soft bell notes
      const scale = [72, 74, 76, 79, 81, 84];
      for (let k = 0; k < 3; k++) {
        const tt = t + 1.5 + k * 2.4 + Math.random();
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(scale[Math.floor(Math.random() * scale.length)]);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.05, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.6);
        o.connect(g); g.connect(this.musicBus); g.connect(this.reverb); o.start(tt); o.stop(tt + 2.7);
      }
      step++;
    };
    play();
    this.musicTimer = setInterval(play, 9000);
  }

  startAmbience() {
    const ctx = this.ctx;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.0;
    n.connect(lp); lp.connect(this.ambGain); this.ambGain.connect(this.sfxBus);
    n.start();
    this.birdT = 3;
  }

  startSuction() {
    const ctx = this.ctx;
    const n = this.noiseSrc();
    this.suckFilter = ctx.createBiquadFilter(); this.suckFilter.type = 'bandpass'; this.suckFilter.Q.value = 0.9; this.suckFilter.frequency.value = 700;
    this.suckGain = ctx.createGain(); this.suckGain.gain.value = 0;
    n.connect(this.suckFilter); this.suckFilter.connect(this.suckGain); this.suckGain.connect(this.sfxBus);
    n.start();
    this.rumble = ctx.createOscillator(); this.rumble.type = 'sine'; this.rumble.frequency.value = 55;
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    this.rumble.connect(this.rumbleGain); this.rumbleGain.connect(this.sfxBus);
    this.rumble.start();
  }

  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const size = Math.log2(1 + s.r * 2);
    this.suckFilter.frequency.setTargetAtTime(Math.max(140, 1100 / (1 + size * 0.55)), t, 0.2);
    this.suckGain.gain.setTargetAtTime(s.attract ? 0.16 + Math.min(0.12, size * 0.02) : 0.0, t, s.attract ? 0.15 : 0.4);
    this.rumble.frequency.setTargetAtTime(Math.max(28, 70 - size * 6), t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(s.attract ? Math.min(0.22, 0.04 + size * 0.03) : 0, t, 0.3);
    this.ambGain.gain.setTargetAtTime(s.playing ? 0.035 + Math.min(0.05, s.cars * 0.003) : 0.015, t, 0.8);
    this.birdT -= dt;
    if (this.birdT <= 0 && s.park) { this.bird(); this.birdT = 2 + Math.random() * 5; }
    this.pops = Math.max(0, this.pops - dt * 10);
  }

  bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    const f = 2600 + Math.random() * 2000;
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.12;
      o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 1.4, tt + 0.07);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.025, tt + 0.02); g.gain.linearRampToValueAtTime(0, tt + 0.09);
    }
    o.connect(g); g.connect(this.sfxBus); g.connect(this.reverb);
    o.start(t); o.stop(t + 0.5);
  }

  swallow(mass, cat) {
    if (!this.ctx || this.pops > 10) return;
    this.pops++;
    const ctx = this.ctx, t = ctx.currentTime;
    const rel = Math.cbrt(Math.max(0.001, mass));
    const f0 = Math.max(60, 700 / (1 + rel * 0.9));
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + 0.3 + rel * 0.05);
    const g = ctx.createGain(); const vol = Math.min(0.3, 0.06 + rel * 0.05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45 + rel * 0.06);
    o.connect(g); g.connect(this.sfxBus); g.connect(this.reverb);
    o.start(t); o.stop(t + 0.7 + rel * 0.06);
    const n = this.noiseSrc(false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 2.5; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(bp); bp.connect(ng); ng.connect(this.sfxBus);
    n.start(t); n.stop(t + 0.3);
    this.material(cat, vol, t);
  }

  // A short layer that tells what was swallowed: metal, leaves, glass, wood.
  material(cat, vol, t) {
    const ctx = this.ctx;
    const env = (node, a, d, peak) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + a); g.gain.linearRampToValueAtTime(peak, t + a + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      node.connect(g); g.connect(this.sfxBus);
      return g;
    };
    if (cat === 'vehicle') {
      for (const f of [310, 470]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.9 + Math.random() * 0.2);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 3;
        o.connect(bp); env(bp, 0.02, 0.16, vol * 0.25);
        o.start(t); o.stop(t + 0.25);
      }
    } else if (cat === 'tree' || cat === 'tiny') {
      const n = this.noiseSrc(false);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = cat === 'tree' ? 1800 : 3500;
      n.connect(hp); env(hp, 0, cat === 'tree' ? 0.45 : 0.12, vol * (cat === 'tree' ? 0.5 : 0.25));
      n.start(t); n.stop(t + 0.5);
    } else if (cat === 'building') {
      for (let k = 0; k < 5; k++) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 2600;
        env(o, 0.05 + k * 0.07 + Math.random() * 0.05, 0.25, 0.04);
        o.start(t); o.stop(t + 1);
      }
    } else if (cat === 'prop') {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 180 + Math.random() * 120;
      env(o, 0.01, 0.12, vol * 0.4);
      o.start(t); o.stop(t + 0.2);
    }
  }

  collapse(size) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 2.5 + Math.min(4, size * 0.05);
    const n = this.noiseSrc(false);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp); lp.connect(g); g.connect(this.sfxBus); g.connect(this.reverb);
    n.start(t); n.stop(t + dur);
    for (let k = 0; k < 6; k++) {
      const tt = t + 0.2 + Math.random() * dur * 0.6;
      const c = this.noiseSrc(false);
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 800 + Math.random() * 1500;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.12, tt); cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      c.connect(hp); hp.connect(cg); cg.connect(this.sfxBus);
      c.start(tt); c.stop(tt + 0.15);
    }
  }

  skid(v) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc(false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    n.start(t); n.stop(t + 0.7);
  }

  honk() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const f of [392, 494]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.02); g.gain.setValueAtTime(0.025, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.36);
      o.connect(lp); lp.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.4);
    }
  }

  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [76, 81, 88].forEach((n, k) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440 * 2 ** ((n - 69) / 12);
      const g = ctx.createGain(); const tt = t + k * 0.09;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.06, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4);
      o.connect(g); g.connect(this.sfxBus); g.connect(this.reverb); o.start(tt); o.stop(tt + 1.5);
    });
  }

  click() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.07);
  }

  pause() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
