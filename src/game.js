import * as THREE from 'three';
import { CFG } from './config.js';
import { mulberry32, clamp, wrapAngle, lerp } from './util.js';
import { City } from './city.js';
import { Environment } from './sky.js';
import { Player } from './player.js';
import { Car, CAR_COLORS, setCarNight } from './vehicle.js';
import { Traffic } from './traffic.js';

const PARKED = [
  [-22, -5.6, Math.PI / 2], [-34, 5.6, -Math.PI / 2], [5.6, -26, 0], [-5.6, -40, Math.PI],
];

// Game = the whole simulation (no DOM here, so it can be tested in Node).
export class Game {
  constructor(scene, camera, opts = {}) {
    this.scene = scene; this.camera = camera; this.mobile = !!opts.mobile;
    this.rng = mulberry32(CFG.seed + 1);
    this.city = new City(scene, { mobile: this.mobile });
    this.env = new Environment(scene, { mobile: this.mobile });
    this.player = new Player(scene);
    this.parked = [];
    this.car = null;
    this.hour = CFG.startHour;
    this.money = 0;
    this.yaw = Math.PI / 4; this.pitch = 0.32; this.camDist = 5; this.lookIdle = 10;
    this.prompt = ''; this.toast = ''; this.toastT = 0;
    this.speedKmh = 0; this.crash = 0; this.objTime = 0;

    this.player.x = -10; this.player.z = -10; this.player.heading = Math.PI / 4;
    this.player.sync();

    PARKED.forEach((p, i) => {
      const c = new Car(scene, i, CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
      c.place(p[0], p[1], p[2]);
      this.parked.push(c);
    });
    this.traffic = new Traffic(scene, this.city, opts.traffic ?? (this.mobile ? 20 : CFG.trafficCount), this.rng);

    this.spot = new THREE.SpotLight(0xfff1cf, 0, 70, 0.55, 0.5, 1.2);
    scene.add(this.spot, this.spot.target);

    // objective beacon
    this.beacon = new THREE.Group();
    const col = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 90, 20, 1, true), col); beam.position.y = 45;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 8, 32), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.3;
    this.beacon.add(beam, this.ring);
    scene.add(this.beacon);
    this.obj = { x: 0, z: 0 };
    this._newObjective();

    this.say('Welcome! Reach the cyan marker to earn cash.', 5);
    this._camInit();
  }

  allCars() { return this.parked.concat(this.traffic.cars.map((a) => a.car)); }
  get focus() {
    return this.car ? { x: this.car.x, y: this.car.y, z: this.car.z, heading: this.car.heading }
      : { x: this.player.x, y: this.player.y, z: this.player.z, heading: this.player.heading };
  }
  say(t, s = 3) { this.toast = t; this.toastT = s; }

  _newObjective() {
    const f = this.focus;
    for (let k = 0; k < 30; k++) {
      const p = this.city.randomRoadPoint(this.rng);
      if (Math.hypot(p.x - f.x, p.z - f.z) > 130) { this.obj = p; break; }
    }
    this.beacon.position.set(this.obj.x, 0, this.obj.z);
    this.objTime = 0;
  }

  _camInit() {
    const f = this.focus;
    this.camera.position.set(f.x - 4, f.y + 4, f.z - 4);
  }

  update(dt, input) {
    this.hour = (this.hour + (dt * 24) / CFG.dayLengthSec) % 24;
    this.objTime += dt;
    this.crash = 0;

    // --- enter / exit ---
    const near = this.car ? null : this._nearestCar();
    this.prompt = this.car ? (Math.abs(this.car.speed) < 9 ? 'exit' : '') : near ? 'enter' : '';
    if (input.interactPressed) {
      if (this.car && Math.abs(this.car.speed) < 9) this._exitCar();
      else if (!this.car && near) this._enterCar(near);
    }

    // --- control ---
    if (this.car) {
      const c = this.car;
      c.drive(dt, { throttle: input.moveY, steer: input.moveX, handbrake: input.brake }, this.city);
      this._carVsCars(c);
      c.sync(dt, this.city);
      this.player.x = c.x; this.player.z = c.z; this.player.y = c.y;
      this.crash = c.impact; c.impact = 0;
      this.speedKmh = Math.abs(c.speed) * 3.6;
    } else {
      this.player.update(dt, input, this.yaw, this.city);
      this._footVsCars();
      this.speedKmh = 0;
    }

    const all = this.allCars();
    this.traffic.update(dt, all, this.car ? null : this.player);
    for (const c of this.parked) if (c !== this.car) c.sync(dt, this.city);

    // --- objective ---
    const f = this.focus;
    if (Math.hypot(f.x - this.obj.x, f.z - this.obj.z) < 7) {
      const bonus = Math.max(0, Math.round(80 - this.objTime));
      this.money += 100 + bonus;
      this.say(`+$${100 + bonus}  ${bonus > 0 ? '(speed bonus!)' : ''}`, 3);
      this._newObjective();
    }
    this.ring.rotation.z += dt * 1.5;
    this.ring.scale.setScalar(1 + Math.sin(performance_now() * 0.004) * 0.06);

    this._updateCamera(dt, input);

    // --- world look ---
    const foc = this.focus;
    this.env.update(this.hour, new THREE.Vector3(foc.x, 0, foc.z), this.camera);
    this.city.setNight(this.env.night);
    setCarNight(this.env.night);
    if (this.car) {
      const c = this.car, s = Math.sin(c.heading), co = Math.cos(c.heading);
      this.spot.intensity = this.env.night * 900;
      this.spot.position.set(c.x + s * 2, 0.9, c.z + co * 2);
      this.spot.target.position.set(c.x + s * 25, 0, c.z + co * 25);
    } else this.spot.intensity = 0;

    if (this.toastT > 0) this.toastT -= dt;
  }

  _nearestCar() {
    let best = null, bd = 3.8;
    for (const o of this.allCars()) {
      const d = Math.hypot(o.x - this.player.x, o.z - this.player.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  _enterCar(c) {
    if (c.ai) { this.traffic.remove(c); c.ai = false; this.parked.push(c); c.speed = 0; }
    this.car = c;
    this.player.setVisible(false);
    this.say('Drive anywhere! F to get out.', 3);
  }

  _exitCar() {
    const c = this.car;
    const lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    const res = this.city.collide(c.x + lx * 2.4, c.z + lz * 2.4, 0.4);
    this.player.x = res.x; this.player.z = res.z;
    this.player.y = this.city.groundHeight(res.x, res.z);
    this.player.heading = c.heading; this.player.speed = 0;
    this.player.setVisible(true); this.player.sync();
    c.speed = 0; this.car = null;
    this.yaw = c.heading;
  }

  _carVsCars(c) {
    const cs = c.circles();
    let hit = false;
    for (const o of this.allCars()) {
      if (o === c) continue;
      if (Math.abs(o.x - c.x) > 6 || Math.abs(o.z - c.z) > 6) continue;
      const os = o.circles();
      for (const a of cs) for (const b of os) {
        let dx = a[0] - b[0], dz = a[1] - b[1];
        const d = Math.hypot(dx, dz);
        if (d < 1.9 && d > 1e-4) {
          const pen = 1.9 - d; dx /= d; dz /= d;
          c.x += dx * pen * 0.5; c.z += dz * pen * 0.5;
          o.x -= dx * pen * 0.5; o.z -= dz * pen * 0.5;
          hit = true;
          if (o.ai) o.speed *= 0.9;
        }
      }
    }
    if (hit) { c.impact = Math.max(c.impact, Math.abs(c.speed)); c.speed *= 0.9; }
  }

  _footVsCars() {
    const p = this.player;
    for (const o of this.allCars()) {
      if (Math.abs(o.x - p.x) > 4 || Math.abs(o.z - p.z) > 4) continue;
      for (const c of o.circles()) {
        let dx = p.x - c[0], dz = p.z - c[1];
        const d = Math.hypot(dx, dz);
        if (d < 1.35 && d > 1e-4) { const k = (1.35 - d) / d; p.x += dx * k; p.z += dz * k; }
      }
    }
  }

  _updateCamera(dt, input) {
    this.yaw -= input.lookX; this.pitch = clamp(this.pitch + input.lookY, -0.15, 1.25);
    if (Math.abs(input.lookX) + Math.abs(input.lookY) > 0.0005) this.lookIdle = 0; else this.lookIdle += dt;
    const f = this.focus;
    if (this.car && this.lookIdle > 1.2) {
      const target = this.car.speed < -1 ? f.heading + Math.PI : f.heading;
      this.yaw += wrapAngle(target - this.yaw) * (1 - Math.exp(-dt * 2.5));
    }
    const wantDist = this.car ? 8.5 + Math.abs(this.car.speed) * 0.06 : 4.8;
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 4);

    const px = f.x, py = f.y + (this.car ? 1.5 : 1.55), pz = f.z;
    const cp = Math.cos(this.pitch);
    let dx = -Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = -Math.cos(this.yaw) * cp;
    let dist = this.camDist;
    for (let s = 0.6; s <= this.camDist; s += 0.5) {
      if (this.city.pointInBuilding(px + dx * s, py + dy * s, pz + dz * s, 0.5)) { dist = Math.max(0.8, s - 0.7); break; }
    }
    const cx = px + dx * dist, cz = pz + dz * dist;
    const cy = Math.max(0.5, py + dy * dist);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(px, py + 0.2, pz);
    const fov = 62 + clamp(this.speedKmh * 0.12, 0, 16);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = lerp(this.camera.fov, fov, Math.min(1, dt * 4)); this.camera.updateProjectionMatrix(); }
  }
}

function performance_now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
