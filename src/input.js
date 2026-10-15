import { clamp } from './util.js';

// Keyboard + mouse (desktop) and virtual joystick + buttons (phone).
export class Input {
  constructor(canvas, touch) {
    this.touch = touch; this.keys = new Set();
    this.moveX = 0; this.moveY = 0; this.lookX = 0; this.lookY = 0;
    this.run = false; this.brake = false; this.jumpPressed = false; this.interactPressed = false;
    this.runToggle = false; this.btnBrake = false;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookId = null; this.lx = 0; this.ly = 0; this.dragging = false;
    this.canvas = canvas;
    this._bindKeys(); this._bindMouse(); if (touch) this._bindTouch();
  }

  _bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'KeyF' || e.code === 'Enter') this.interactPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('click', () => { if (!this.touch && document.pointerLockElement !== c) c.requestPointerLock?.(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === c) { this.lookX += e.movementX * 0.0024; this.lookY += e.movementY * 0.0024; }
      else if (this.dragging) { this.lookX += e.movementX * 0.004; this.lookY += e.movementY * 0.004; }
    });
    c.addEventListener('mousedown', () => { this.dragging = true; });
    addEventListener('mouseup', () => { this.dragging = false; });
  }

  _bindTouch() {
    const base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
    const R = 55;
    const onStart = (e) => {
      if (!document.body.classList.contains('playing')) return;
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn) {
          const a = btn.dataset.act;
          if (a === 'jump') { this.jumpPressed = true; this.btnBrake = true; }
          if (a === 'use') this.interactPressed = true;
          if (a === 'run') { this.runToggle = !this.runToggle; btn.classList.toggle('on', this.runToggle); }
          e.preventDefault(); continue;
        }
        if (t.clientX < innerWidth * 0.45 && this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY;
          base.style.display = knob.style.display = 'block';
          base.style.left = t.clientX - 60 + 'px'; base.style.top = t.clientY - 60 + 'px';
          knob.style.left = t.clientX - 25 + 'px'; knob.style.top = t.clientY - 25 + 'px';
        } else if (this.lookId === null) {
          this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY;
        }
        e.preventDefault();
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const l = Math.hypot(dx, dy); if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
          this.joy.x = dx / R; this.joy.y = -dy / R;
          knob.style.left = this.joy.ox + dx - 25 + 'px'; knob.style.top = this.joy.oy + dy - 25 + 'px';
        } else if (t.identifier === this.lookId) {
          this.lookX += (t.clientX - this.lx) * 0.005; this.lookY += (t.clientY - this.ly) * 0.005;
          this.lx = t.clientX; this.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = this.joy.y = 0; base.style.display = knob.style.display = 'none'; }
        if (t.identifier === this.lookId) this.lookId = null;
      }
      this.btnBrake = false;
      if (e.touches.length === 0) { this.joy.id = null; this.lookId = null; }
    };
    addEventListener('touchstart', onStart, { passive: false });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);
  }

  poll() {
    const k = (c) => (this.keys.has(c) ? 1 : 0);
    this.moveX = clamp(k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + this.joy.x, -1, 1);
    this.moveY = clamp(k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') + this.joy.y, -1, 1);
    this.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.runToggle;
    this.brake = this.keys.has('Space') || this.btnBrake;
  }

  endFrame() { this.jumpPressed = false; this.interactPressed = false; this.lookX = 0; this.lookY = 0; }
}
