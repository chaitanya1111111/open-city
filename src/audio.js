// Tiny procedural audio (no files needed): engine hum + crash thump.
export class AudioSys {
  constructor() { this.ctx = null; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.osc = this.ctx.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 50;
    this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 500;
    this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
    this.osc.connect(this.filter).connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
  }
  update(driving, speed, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(driving ? 0.04 + 0.05 * Math.abs(throttle) : 0, t, 0.1);
    this.osc.frequency.setTargetAtTime(38 + Math.abs(speed) * 4.5, t, 0.08);
    this.filter.frequency.setTargetAtTime(300 + Math.abs(speed) * 25, t, 0.1);
  }
  crash(v) {
    if (!this.ctx || v < 3) return;
    const len = Math.floor(this.ctx.sampleRate * 0.25);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = Math.min(0.5, v / 30);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    src.connect(f).connect(g).connect(this.ctx.destination); src.start();
  }
}
