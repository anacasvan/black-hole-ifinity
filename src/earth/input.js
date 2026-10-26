// Multitouch controls: four layouts (joystick left / right / custom / touch-only
// drag), an independent ATTRAI button (hold or toggle) and keyboard fallback.

const DEAD = 0.08;

export class Input {
  constructor(layer, joy, knob, attractBtn, indicator) {
    this.layer = layer; this.joy = joy; this.knob = knob; this.btn = attractBtn; this.ind = indicator;
    this.vec = { x: 0, y: 0 };
    this.keys = new Set();
    this.attractHeld = false;
    this.attractToggled = false;
    this.joyId = null; this.dragId = null; this.attractId = null;
    this.settings = null;
    this.enabled = false;
    this.origin = { x: 0, y: 0 };
    this.joyCenter = { x: 0, y: 0 };
    this.onAttractChange = null;

    layer.addEventListener('pointerdown', e => this.down(e));
    layer.addEventListener('pointermove', e => this.move(e));
    layer.addEventListener('pointerup', e => this.up(e));
    layer.addEventListener('pointercancel', e => this.up(e));
    layer.addEventListener('lostpointercapture', e => this.up(e));
    layer.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.pressAttract(true); return; }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') { this.pressAttract(false); return; }
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.resetAll());
  }

  get attract() {
    return this.settings?.attractMode === 'toggle' ? this.attractToggled : this.attractHeld;
  }

  pressAttract(on) {
    if (this.settings?.attractMode === 'toggle') { if (on) this.attractToggled = !this.attractToggled; }
    else this.attractHeld = on;
    this.btn.classList.toggle('active', this.attract);
    this.onAttractChange?.(this.attract);
  }

  resetAll() {
    this.joyId = this.dragId = null;
    if (this.attractId !== null) { this.attractId = null; this.pressAttract(false); }
    this.vec.x = this.vec.y = 0;
    this.keys.clear();
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.ind.classList.remove('on');
  }

  setEnabled(on) { this.enabled = on; if (!on) this.resetAll(); }

  // Apply a control layout. Returns the button/joystick rects used for overlap checks.
  layout(s, vw, vh, safe) {
    this.settings = s;
    const size = Math.min(s.joySize, vw * 0.38, vh * 0.3);
    const btn = Math.min(96, vw * 0.24);
    const m = 18;
    const bottom = vh - safe.bottom - m;
    let jx, jy;
    let attractLeft = false;
    if (s.control === 'A') { jx = safe.left + m + size / 2; jy = bottom - size / 2; }
    else if (s.control === 'B') { jx = vw - safe.right - m - size / 2; jy = bottom - size / 2; attractLeft = true; }
    else if (s.control === 'C') {
      jx = s.joyX * vw; jy = s.joyY * vh;
      attractLeft = jx > vw / 2;
    } else { jx = -1000; jy = -1000; }
    const bx = attractLeft ? safe.left + m + btn / 2 : vw - safe.right - m - btn / 2;
    const by = bottom - btn / 2 - (s.control === 'D' ? 0 : Math.max(0, (size - btn) / 2));
    if (s.control === 'C') {
      // Keep the joystick inside the screen, below the HUD and away from the button.
      const minY = safe.top + 110 + size / 2, maxY = vh - safe.bottom - 8 - size / 2;
      jx = Math.min(vw - safe.right - 8 - size / 2, Math.max(safe.left + 8 + size / 2, jx));
      jy = Math.min(maxY, Math.max(minY, jy));
      const minDist = size / 2 + btn / 2 + 16;
      const dx = jx - bx, dy = jy - by, d = Math.hypot(dx, dy);
      if (d < minDist) {
        const ux = d > 1 ? dx / d : (attractLeft ? 1 : -1), uy = d > 1 ? dy / d : 0;
        jx = bx + ux * minDist; jy = by + uy * minDist;
        jy = Math.min(maxY, Math.max(minY, jy));
      }
    }
    this.joyCenter = { x: jx, y: jy };
    this.joySize = size;
    Object.assign(this.joy.style, { width: `${size}px`, height: `${size}px`, left: `${jx - size / 2}px`, top: `${jy - size / 2}px`, opacity: String(s.joyOpacity), display: s.control === 'D' ? 'none' : 'block' });
    Object.assign(this.btn.style, { width: `${btn}px`, height: `${btn}px`, left: `${bx - btn / 2}px`, top: `${by - btn / 2}px` });
    this.btnRect = { x: bx - btn / 2, y: by - btn / 2, w: btn, h: btn };
    this.joyRect = s.control === 'D' ? null : { x: jx - size / 2, y: jy - size / 2, w: size, h: size };
    return { joy: this.joyRect, btn: this.btnRect };
  }

  inBtn(x, y) {
    const r = this.btnRect; if (!r) return false;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    return Math.hypot(x - cx, y - cy) < r.w * 0.62;
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (this.attractId === null && this.inBtn(x, y)) {
      this.attractId = e.pointerId;
      this.layer.setPointerCapture?.(e.pointerId);
      this.pressAttract(true);
      return;
    }
    const s = this.settings;
    if (s.control === 'D') {
      if (this.dragId !== null) return;
      this.dragId = e.pointerId;
      this.origin = { x, y };
      this.layer.setPointerCapture?.(e.pointerId);
      Object.assign(this.ind.style, { left: `${x}px`, top: `${y}px` });
      this.ind.classList.add('on');
      return;
    }
    if (this.joyId !== null) return;
    const c = this.joyCenter;
    if (Math.hypot(x - c.x, y - c.y) < this.joySize * 0.95) {
      this.joyId = e.pointerId;
      this.layer.setPointerCapture?.(e.pointerId);
      this.joyMove(x, y);
    }
  }

  move(e) {
    if (!this.enabled) return;
    if (e.pointerId === this.joyId) this.joyMove(e.clientX, e.clientY);
    else if (e.pointerId === this.dragId) this.dragMove(e.clientX, e.clientY);
  }

  up(e) {
    if (e.pointerId === this.attractId) {
      this.attractId = null;
      if (this.settings?.attractMode !== 'toggle') this.pressAttract(false);
    }
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.vec.x = this.vec.y = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
    if (e.pointerId === this.dragId) {
      this.dragId = null;
      this.vec.x = this.vec.y = 0;
      this.ind.classList.remove('on');
    }
  }

  joyMove(x, y) {
    const c = this.joyCenter, R = this.joySize * 0.36;
    let dx = x - c.x, dy = y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.setVec(dx, dy, Math.min(1, d / R));
  }

  setVec(dx, dy, m) {
    const d = Math.hypot(dx, dy);
    const k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
    this.vec.x = d > 0 ? dx / d * k : 0;
    this.vec.y = d > 0 ? dy / d * k : 0;
  }

  dragMove(x, y) {
    const R = 95;
    let dx = x - this.origin.x, dy = y - this.origin.y;
    let d = Math.hypot(dx, dy);
    if (d > R * 1.25) {
      // The anchor follows the finger so long drags stay responsive.
      const k = (d - R * 1.25) / d;
      this.origin.x += dx * k; this.origin.y += dy * k;
      dx = x - this.origin.x; dy = y - this.origin.y; d = Math.hypot(dx, dy);
      Object.assign(this.ind.style, { left: `${this.origin.x}px`, top: `${this.origin.y}px` });
    }
    this.setVec(dx, dy, Math.min(1, d / R));
  }

  // Screen-space movement vector (x right, y down), magnitude 0..1.
  read() {
    let x = this.vec.x, y = this.vec.y;
    if (this.keys.size) {
      const k = this.keys;
      const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const ky = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    }
    return { x, y };
  }
}
