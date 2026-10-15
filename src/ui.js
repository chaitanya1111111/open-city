// HUD + minimap.
export class UI {
  constructor(game, touch) {
    this.g = game; this.touch = touch;
    const $ = (id) => document.getElementById(id);
    this.speed = $('speed'); this.clock = $('clock'); this.money = $('money');
    this.vehicleName = $('vehicleName');
    this.prompt = $('prompt'); this.toast = $('toast'); this.obj = $('objective'); this.fps = $('fps');
    this.district = $('district');
    this.mm = $('minimap'); this.mctx = this.mm.getContext('2d');
    this.frames = 0; this.acc = 0; this.mapSkip = 0;
    this.mapCanvas = this._staticMap();
  }

  _staticMap() {
    const c = this.g.city, W = Math.ceil(c.half * 2 + c.rw);
    const cv = document.createElement('canvas'); cv.width = cv.height = W;
    const x = cv.getContext('2d');
    x.fillStyle = '#3b4048'; x.fillRect(0, 0, W, W);
    for (const row of c.blocks) for (const bl of row) {
      const district = c.districtAtPosition(bl.cx, bl.cz);
      x.fillStyle = bl.park ? '#2f5a34' : `#${district.color.toString(16).padStart(6, '0')}`;
      x.fillRect(bl.cx - c.lot / 2 + W / 2, bl.cz - c.lot / 2 + W / 2, c.lot, c.lot);
      x.fillStyle = bl.park ? '#477147' : '#9aa0a0';
      for (const b of bl.b) x.fillRect(b.x0 + W / 2, b.z0 + W / 2, b.x1 - b.x0, b.z1 - b.z0);
    }
    this.W = W;
    return cv;
  }

  update(dt) {
    const g = this.g;
    this.acc += dt; this.frames++;
    if (this.acc >= 0.5) { this.fps.textContent = Math.round(this.frames / this.acc) + ' FPS'; this.acc = 0; this.frames = 0; }

    this.speed.textContent = g.car ? Math.round(g.speedKmh) + ' km/h' : '';
    this.vehicleName.textContent = g.car ? g.car.t.name : '';
    const hh = Math.floor(g.hour), mm = Math.floor((g.hour - hh) * 60);
    this.clock.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    this.money.textContent = '$' + g.money;
    const f = g.focus, d = Math.round(Math.hypot(f.x - g.obj.x, f.z - g.obj.z));
    this.district.textContent = g.city.districtAtPosition(f.x, f.z).label;
    this.obj.textContent = 'Marker: ' + d + ' m';

    const key = this.touch ? 'ENTER button' : 'F';
    this.prompt.textContent = g.prompt === 'enter' ? `Press ${key} to enter vehicle` : g.prompt === 'exit' ? `Press ${key} to get out` : '';
    this.toast.textContent = g.toastT > 0 ? g.toast : '';

    if ((this.mapSkip++ & 1) === 0) this._drawMap();
  }

  _drawMap() {
    const g = this.g, ctx = this.mctx, S = this.mm.width, sc = 0.75, f = g.focus;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2); ctx.rotate(g.yaw - Math.PI); ctx.scale(sc, sc); ctx.translate(-f.x, -f.z);
    ctx.drawImage(this.mapCanvas, -this.W / 2, -this.W / 2);
    ctx.fillStyle = '#ffd04a';
    for (const c of g.allCars()) ctx.fillRect(c.x - 2.2, c.z - 2.2, 4.4, 4.4);
    let ox = g.obj.x, oz = g.obj.z;
    const dx = ox - f.x, dz = oz - f.z, dd = Math.hypot(dx, dz), lim = (S / 2 - 10) / sc;
    if (dd > lim) { ox = f.x + (dx / dd) * lim; oz = f.z + (dz / dd) * lim; }
    ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.arc(ox, oz, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(S / 2, S / 2); ctx.rotate(g.yaw - f.heading);
    ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }
}
