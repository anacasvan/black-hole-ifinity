// DOM user interface: menu, HUD, pause, settings, joystick editor, confirm.
import { DEFAULT_SETTINGS } from './save.js';

const $ = id => document.getElementById(id);

export function formatMass(m) {
  if (m < 10) return m.toFixed(2);
  if (m < 1000) return m.toFixed(1);
  const units = ['k', 'M', 'G', 'T', 'P', 'E'];
  let u = -1, v = m;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)}${units[u]}`;
}

export class UI {
  constructor(game) {
    this.g = game;
    this.el = {
      hud: $('hud'), controls: $('controls'), menu: $('menu'), pause: $('pause'), settings: $('settings'),
      editor: $('joy-editor'), confirm: $('confirm'), loading: $('loading'), fatal: $('fatal'),
      mass: $('mass-value'), massPill: $('mass-pill'), next: $('next-name'), fill: $('progress-fill'), toast: $('toast'),
      play: $('btn-play'), pauseStats: $('pause-stats'), pauseMissions: $('pause-missions'), stats: $('stats'), statsBody: $('stats-body'),
      mission: $('mission'), missionText: $('mission-text'), missionCount: $('mission-count'), guide: $('guide'),
    };
    this.settingsFrom = 'menu';
    this.toastT = 0;
    this.pulseT = 0;
    this.bind();
  }

  click(id, fn) {
    $(id).addEventListener('click', e => { e.preventDefault(); this.g.audio.click(); fn(); });
  }

  bind() {
    const g = this.g;
    this.click('btn-play', () => g.play());
    this.click('btn-new', () => this.show('confirm', true));
    this.click('btn-confirm-yes', () => { this.show('confirm', false); g.newGame(); });
    this.click('btn-confirm-no', () => this.show('confirm', false));
    this.click('btn-settings', () => this.openSettings('menu'));
    this.click('btn-pause', () => g.pause());
    this.click('btn-resume', () => g.resume());
    this.click('btn-pause-settings', () => this.openSettings('pause'));
    this.click('btn-quit', () => g.toMenu());
    this.click('btn-settings-close', () => this.closeSettings());
    this.click('btn-reset-settings', () => { g.applySettings({ ...DEFAULT_SETTINGS }); this.syncSettings(); });
    this.click('btn-edit-joy', () => this.openEditor());
    this.click('btn-editor-done', () => this.closeEditor());
    this.click('btn-stats', () => this.openStats());
    this.click('btn-pause-stats', () => this.openStats());
    this.click('btn-stats-close', () => this.show('stats', false));

    const seg = (id, key) => {
      $(id).addEventListener('click', e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        g.audio.click();
        g.applySettings({ ...g.settings, [key]: b.dataset.v });
        this.syncSettings();
      });
    };
    seg('seg-control', 'control');
    seg('seg-quality', 'quality');
    seg('seg-attract', 'attractMode');
    const range = (id, key) => $(id).addEventListener('input', e => g.applySettings({ ...g.settings, [key]: Number(e.target.value) }));
    range('in-joysize', 'joySize'); range('in-joyopacity', 'joyOpacity'); range('in-sens', 'sensitivity');
    range('in-music', 'music'); range('in-sfx', 'sfx'); range('in-uiscale', 'uiScale'); range('in-vibelevel', 'vibrationLevel');
    const toggle = (id, key) => $(id).addEventListener('change', e => g.applySettings({ ...g.settings, [key]: e.target.checked }));
    toggle('in-guide', 'guide'); toggle('in-missions', 'missions'); toggle('in-daynight', 'dayNight');
    $('in-vibe').addEventListener('change', e => g.applySettings({ ...g.settings, vibration: e.target.checked }));
    $('in-reduce').addEventListener('change', e => g.applySettings({ ...g.settings, reduceFx: e.target.checked }));

    // Joystick editor dragging
    const ghost = $('joy-ghost');
    let drag = null;
    ghost.addEventListener('pointerdown', e => { drag = { id: e.pointerId }; ghost.setPointerCapture(e.pointerId); e.preventDefault(); });
    ghost.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const vw = g.vw, vh = g.vh;
      g.applySettings({ ...g.settings, control: 'C', joyX: e.clientX / vw, joyY: e.clientY / vh }, true);
      this.layoutEditor();
    });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; g.applySettings({ ...g.settings }); this.layoutEditor(); } };
    ghost.addEventListener('pointerup', end);
    ghost.addEventListener('pointercancel', end);
    $('ed-size').addEventListener('input', e => { g.applySettings({ ...g.settings, joySize: Number(e.target.value) }); this.layoutEditor(); });
    $('ed-opacity').addEventListener('input', e => { g.applySettings({ ...g.settings, joyOpacity: Number(e.target.value) }); this.layoutEditor(); });
  }

  show(name, on) { this.el[name].classList.toggle('hidden', !on); }

  showMenu(hasSave) {
    this.el.play.textContent = hasSave ? 'Continua' : 'Gioca';
    this.show('menu', true); this.show('hud', false); this.show('controls', false); this.show('pause', false);
  }

  showGame() { this.show('menu', false); this.show('pause', false); this.show('hud', true); this.show('controls', true); }

  showPause(stats, missions = '') {
    this.el.pauseStats.innerHTML = stats;
    this.el.pauseMissions.innerHTML = missions;
    this.show('pause', true);
  }

  openSettings(from) {
    this.settingsFrom = from;
    this.syncSettings();
    this.show('settings', true);
    if (from === 'pause') this.show('pause', false);
  }

  closeSettings() {
    this.show('settings', false);
    if (this.settingsFrom === 'pause') this.show('pause', true);
  }

  syncSettings() {
    const s = this.g.settings;
    for (const [id, key] of [['seg-control', 'control'], ['seg-quality', 'quality'], ['seg-attract', 'attractMode']]) {
      for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === s[key]);
    }
    $('in-joysize').value = s.joySize; $('in-joyopacity').value = s.joyOpacity; $('in-sens').value = s.sensitivity;
    $('in-music').value = s.music; $('in-sfx').value = s.sfx;
    $('in-vibe').checked = s.vibration; $('in-reduce').checked = s.reduceFx;
    $('in-uiscale').value = s.uiScale; $('in-vibelevel').value = s.vibrationLevel;
    $('in-guide').checked = s.guide; $('in-missions').checked = s.missions; $('in-daynight').checked = s.dayNight;
    $('btn-edit-joy').disabled = s.control !== 'C';
    $('btn-edit-joy').textContent = s.control === 'C' ? 'Posiziona il joystick…' : 'Posiziona joystick (solo Personalizzato)';
  }

  openEditor() {
    this.show('settings', false);
    this.show('editor', true);
    $('ed-size').value = this.g.settings.joySize;
    $('ed-opacity').value = this.g.settings.joyOpacity;
    this.layoutEditor();
  }

  layoutEditor() {
    const rects = this.g.layoutControls();
    const jg = $('joy-ghost'), ag = $('attract-ghost');
    const s = this.g.settings;
    if (rects.joy) Object.assign(jg.style, { left: `${rects.joy.x}px`, top: `${rects.joy.y}px`, width: `${rects.joy.w}px`, height: `${rects.joy.h}px`, opacity: String(s.joyOpacity) });
    Object.assign(ag.style, { left: `${rects.btn.x}px`, top: `${rects.btn.y}px`, width: `${rects.btn.w}px`, height: `${rects.btn.h}px` });
  }

  closeEditor() {
    this.show('editor', false);
    this.openSettings(this.settingsFrom);
  }

  updateHUD(mass, info, dt) {
    this.el.mass.textContent = formatMass(mass);
    this.el.next.textContent = info.next.name;
    this.el.fill.style.width = `${(info.progress * 100).toFixed(1)}%`;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    if (this.pulseT > 0) { this.pulseT -= dt; if (this.pulseT <= 0) this.el.massPill.classList.remove('pulse'); }
    if (this.missionT > 0) { this.missionT -= dt; if (this.missionT <= 0) this.el.mission.classList.remove('show'); }
  }

  openStats() {
    this.el.statsBody.innerHTML = this.g.statsHTML();
    this.show('stats', true);
  }

  // Current mission, shown for a few seconds when it progresses.
  setMission(m, changed) {
    const el = this.el.mission;
    if (!m) { el.classList.remove('show'); this.missionKey = null; return; }
    const key = `${m.id}:${m.have}`;
    if (key === this.missionKey) return;
    this.missionKey = key;
    this.el.missionText.textContent = m.text;
    this.el.missionCount.textContent = `${m.have}/${m.n}`;
    if (changed) { el.classList.add('show'); this.missionT = 4.5; }
  }

  setGuide(g) {
    const el = this.el.guide;
    if (!g) { el.classList.remove('show'); return; }
    const R = Math.min(this.g.vw, this.g.vh) * 0.3;
    const x = g.cx + Math.cos(g.angle) * R, y = g.cy + Math.sin(g.angle) * R;
    el.style.transform = `translate(${x - 19}px, ${y - 19}px) rotate(${g.angle}rad)`;
    el.classList.add('show');
  }

  pulse() { this.el.massPill.classList.add('pulse'); this.pulseT = 0.16; }

  toast(text, t = 3.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = t;
  }

  loaded() { this.el.loading.classList.add('done'); setTimeout(() => this.show('loading', false), 700); }

  fatal(msg) { this.el.fatal.textContent = msg; this.show('fatal', true); this.show('loading', false); }
}
