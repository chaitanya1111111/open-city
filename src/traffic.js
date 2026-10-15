import { CFG } from './config.js';
import { Car, CAR_COLORS } from './vehicle.js';
import { clamp, wrapAngle } from './util.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TRAFFIC_VEHICLE_WEIGHTS = [20, 22, 14, 8, 7, 4, 8, 4, 5, 3, 5];

// AI cars follow the road grid, keep to the left lane (India!), turn at junctions
// and slow down for anything in front of them.
export class Traffic {
  constructor(scene, city, count, rng) {
    this.city = city; this.rng = rng; this.cars = [];
    for (let k = 0; k < count; k++) this._spawn(scene);
  }

  nodePos(i, j) { return { x: this.city.road(i), z: this.city.road(j) }; }

  makeSeg(i, j, d) {
    const [dx, dz] = DIRS[d], lx = dz, lz = -dx, off = CFG.laneOffset;
    const a = this.nodePos(i, j), b = this.nodePos(i + dx, j + dz);
    return { i, j, d, dx, dz, sx: a.x + lx * off, sz: a.z + lz * off, ex: b.x + lx * off, ez: b.z + lz * off, len: this.city.bs };
  }

  pickDir(i, j, d) {
    const n = this.city.n, opts = [];
    const tryD = (dd, w) => {
      const ni = i + DIRS[dd][0], nj = j + DIRS[dd][1];
      if (ni >= 0 && ni <= n && nj >= 0 && nj <= n) opts.push([dd, w]);
    };
    tryD(d, 0.55); tryD((d + 1) % 4, 0.22); tryD((d + 3) % 4, 0.23);
    if (!opts.length) tryD((d + 2) % 4, 1);
    let total = 0; for (const o of opts) total += o[1];
    let r = this.rng() * total;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[0][0];
  }

  _spawn(scene) {
    const n = this.city.n;
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.floor(this.rng() * (n + 1)), j = Math.floor(this.rng() * (n + 1));
      const d = Math.floor(this.rng() * 4);
      const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
      if (ni < 0 || ni > n || nj < 0 || nj > n) continue;
      const seg = this.makeSeg(i, j, d);
      const t = 5 + this.rng() * (seg.len - 20);
      const x = seg.sx + seg.dx * t, z = seg.sz + seg.dz * t;
      if (this.cars.some((c) => Math.hypot(c.car.x - x, c.car.z - z) < 7)) continue;
      if (Math.hypot(x, z) < 25 && this.cars.length < 4) continue;
      let roll = this.rng() * TRAFFIC_VEHICLE_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
      let type = 0;
      while (roll >= TRAFFIC_VEHICLE_WEIGHTS[type]) roll -= TRAFFIC_VEHICLE_WEIGHTS[type++];
      const car = new Car(scene, type, CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)]);
      car.ai = true;
      car.place(x, z, Math.atan2(seg.dx, seg.dz));
      this.cars.push({
        car, seg, cruise: Math.min(9 + this.rng() * 5, car.tuning.topSpeed * 0.65),
        stuck: 0, ghost: 0,
      });
      return;
    }
  }

  remove(car) {
    const k = this.cars.findIndex((a) => a.car === car);
    if (k >= 0) this.cars.splice(k, 1);
  }

  update(dt, obstacles, player) {
    for (const ai of this.cars) {
      const c = ai.car;
      let seg = ai.seg;
      let t = (c.x - seg.sx) * seg.dx + (c.z - seg.sz) * seg.dz;
      if (seg.len - t < 10) {
        const ni = seg.i + seg.dx, nj = seg.j + seg.dz;
        ai.seg = seg = this.makeSeg(ni, nj, this.pickDir(ni, nj, seg.d));
        t = (c.x - seg.sx) * seg.dx + (c.z - seg.sz) * seg.dz;
      }
      const la = clamp(t + 9, 0, seg.len);
      const tx = seg.sx + seg.dx * la, tz = seg.sz + seg.dz * la;
      const diff = wrapAngle(Math.atan2(tx - c.x, tz - c.z) - c.heading);
      let tspeed = ai.cruise * (1 - Math.min(0.65, Math.abs(diff) * 0.8));

      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      if (ai.ghost > 0) ai.ghost -= dt;
      else {
        for (const o of obstacles) {
          if (o === c) continue;
          const rx = o.x - c.x, rz = o.z - c.z;
          const fwd = rx * fx + rz * fz;
          if (fwd < 0 || fwd > 16) continue;
          if (Math.abs(rx * fz - rz * fx) > 2.1) continue;
          const same = Math.sin(o.heading) * fx + Math.cos(o.heading) * fz;
          if (same < 0.3 && Math.abs(o.speed) > 0.5) continue; // crossing traffic: don't deadlock
          tspeed = Math.min(tspeed, Math.max(0, (fwd - 5.5) * 1.2));
        }
        if (player) {
          const rx = player.x - c.x, rz = player.z - c.z, fwd = rx * fx + rz * fz;
          if (fwd > 0 && fwd < 12 && Math.abs(rx * fz - rz * fx) < 1.8) tspeed = Math.min(tspeed, Math.max(0, (fwd - 3.5) * 1.1));
        }
      }
      c.speed += clamp(tspeed - c.speed, -10 * dt, 3.2 * dt);
      c.heading += clamp(diff * 3, -1.6, 1.6) * dt;
      c.steer = clamp(diff, -0.5, 0.5);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;

      if (c.speed < 0.2) { ai.stuck += dt; if (ai.stuck > 5) { ai.ghost = 3; ai.stuck = 0; } }
      else ai.stuck = 0;
      c.sync(dt, this.city);
    }
  }
}
