import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './util.js';

const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.08, metalness: 0.9 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 0.15 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.2 });

export function setCarNight(n) {
  headMat.emissiveIntensity = 0.15 + n * 3;
  tailMat.emissiveIntensity = 0.2 + n * 1.2;
}

function colorize(g, r, gr, b) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gr; a[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const wheelGeo = mergeGeometries([
  colorize(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14).rotateZ(Math.PI / 2), 0.06, 0.06, 0.06),
  colorize(new THREE.CylinderGeometry(0.21, 0.21, 0.28, 10).rotateZ(Math.PI / 2), 0.75, 0.77, 0.8),
], false);

const TYPES = [
  { len: 4.4, wid: 1.85, bodyH: 0.62, cabH: 0.56, cabLen: 2.3, cabZ: -0.25, ride: 0.32, rake: 0.75 },   // sedan
  { len: 4.5, wid: 1.95, bodyH: 0.82, cabH: 0.7, cabLen: 3.0, cabZ: -0.3, ride: 0.42, rake: 0.5 },     // SUV
  { len: 3.7, wid: 1.75, bodyH: 0.62, cabH: 0.62, cabLen: 2.1, cabZ: -0.15, ride: 0.32, rake: 0.6 },   // hatchback
];
const typeCache = [];

function buildType(i) {
  if (typeCache[i]) return typeCache[i];
  const t = TYPES[i];
  const lower = new THREE.BoxGeometry(t.wid, t.bodyH, t.len).translate(0, t.ride + t.bodyH / 2, 0);
  const roof = new THREE.BoxGeometry(t.wid * 0.9, 0.07, t.cabLen * 0.8).translate(0, t.ride + t.bodyH + t.cabH + 0.02, t.cabZ - t.rake * 0.1);
  const body = mergeGeometries([lower, roof], false);

  // tapered cabin (side profile extruded across the width)
  const hz = t.cabLen / 2, tw = t.wid * 0.88;
  const sh = new THREE.Shape();
  sh.moveTo(-hz, 0); sh.lineTo(hz, 0);                       // x here is -carZ, flipped below
  sh.lineTo(hz - t.rake * 0.55, t.cabH); sh.lineTo(-hz + t.rake * 0.9, t.cabH); sh.closePath();
  const glass = new THREE.ExtrudeGeometry(sh, { depth: tw, bevelEnabled: false });
  glass.translate(0, 0, -tw / 2); glass.rotateY(Math.PI / 2);
  glass.translate(0, t.ride + t.bodyH, t.cabZ);

  const trim = mergeGeometries([
    new THREE.BoxGeometry(t.wid + 0.02, 0.22, 0.18).translate(0, t.ride + 0.14, t.len / 2),
    new THREE.BoxGeometry(t.wid + 0.02, 0.22, 0.18).translate(0, t.ride + 0.14, -t.len / 2),
  ], false);
  const hx = t.wid / 2 - 0.3, hy = t.ride + t.bodyH - 0.15;
  const head = mergeGeometries([
    new THREE.BoxGeometry(0.4, 0.16, 0.08).translate(hx, hy, t.len / 2 + 0.02),
    new THREE.BoxGeometry(0.4, 0.16, 0.08).translate(-hx, hy, t.len / 2 + 0.02),
  ], false);
  const tail = mergeGeometries([
    new THREE.BoxGeometry(0.4, 0.14, 0.08).translate(hx, hy, -t.len / 2 - 0.02),
    new THREE.BoxGeometry(0.4, 0.14, 0.08).translate(-hx, hy, -t.len / 2 - 0.02),
  ], false);
  return (typeCache[i] = { t, body, glass, trim, head, tail });
}

export const CAR_COLORS = [0xc0392b, 0x2c5fa8, 0xe8e8e8, 0x1c1c1f, 0xd8b43a, 0x2f7d4f, 0x8a8f96, 0xe2701d, 0x6a3f8f];

export class Car {
  constructor(scene, typeIdx, color) {
    const d = buildType(typeIdx % TYPES.length);
    this.t = d.t;
    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.65 });
    const body = new THREE.Mesh(d.body, bodyMat); body.castShadow = true;
    this.tilt.add(body, new THREE.Mesh(d.glass, glassMat), new THREE.Mesh(d.trim, trimMat),
      new THREE.Mesh(d.head, headMat), new THREE.Mesh(d.tail, tailMat));
    this.group.add(this.tilt);

    this.wheels = [];
    const wx = this.t.wid / 2 - 0.08, wz = this.t.len * 0.31;
    for (const [sx, sz, front] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wx, 0.34, sz * wz);
      const m = new THREE.Mesh(wheelGeo, wheelMat); m.castShadow = true;
      pivot.add(m); this.group.add(pivot);
      this.wheels.push({ pivot, m, front });
    }
    scene.add(this.group);

    this.x = 0; this.y = 0; this.z = 0; this.heading = 0;
    this.speed = 0; this.steer = 0; this.spin = 0; this.prevSpeed = 0;
    this.pitchV = 0; this.rollV = 0; this.impact = 0; this.ai = false;
  }

  place(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.sync(0.016, null); }

  circles() {
    const s = Math.sin(this.heading) * 1.25, c = Math.cos(this.heading) * 1.25;
    return [[this.x + s, this.z + c], [this.x - s, this.z - c]];
  }

  // Arcade driving model. ctrl = { throttle:-1..1, steer:-1..1 (right = +), handbrake }
  drive(dt, ctrl, city) {
    const maxF = 36, maxR = 9;
    let s = this.speed;
    if (ctrl.throttle > 0) {
      if (s < -0.5) s += 30 * dt * ctrl.throttle;
      else s += ctrl.throttle * 15 * (1 - Math.max(0, s) / maxF) * dt;
    } else if (ctrl.throttle < 0) {
      if (s > 0.5) s -= 28 * dt * -ctrl.throttle;
      else s += ctrl.throttle * 9 * (1 - Math.max(0, -s) / maxR) * dt;
    } else {
      s -= Math.sign(s) * Math.min(Math.abs(s), 2.4 * dt);
    }
    s -= s * 0.05 * dt;
    if (ctrl.handbrake) s -= Math.sign(s) * Math.min(Math.abs(s), 32 * dt);
    this.speed = s;

    const maxSteer = 0.62 / (1 + Math.abs(s) * 0.045);
    const steerLeft = -ctrl.steer * maxSteer;
    this.steer += (steerLeft - this.steer) * Math.min(1, dt * 8);
    this.heading += (s / 2.7) * Math.tan(this.steer) * dt;

    this.x += Math.sin(this.heading) * s * dt;
    this.z += Math.cos(this.heading) * s * dt;

    // building collisions with a front and a rear circle
    for (const off of [1.3, -1.3]) {
      const px = this.x + Math.sin(this.heading) * off, pz = this.z + Math.cos(this.heading) * off;
      const r = city.collide(px, pz, 1.0);
      if (r.hit) {
        const dx = r.x - px, dz = r.z - pz;
        this.x += dx; this.z += dz;
        if (Math.abs(dx) + Math.abs(dz) > 0.004) {
          this.impact = Math.max(this.impact, Math.abs(this.speed));
          this.speed *= 0.82;
        }
      }
    }
  }

  // Updates the visual model (wheels, body lean, height).
  sync(dt, city) {
    if (city) {
      const g = city.groundHeight(this.x, this.z);
      this.y += (g - this.y) * Math.min(1, dt * 10);
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;

    if (dt > 0) {
      const acc = (this.speed - this.prevSpeed) / dt;
      this.pitchV += (-clamp(acc * 0.004, -0.05, 0.05) - this.pitchV) * Math.min(1, dt * 6);
      this.rollV += (clamp(this.steer * this.speed * 0.004, -0.06, 0.06) - this.rollV) * Math.min(1, dt * 6);
      this.tilt.rotation.x = this.pitchV; this.tilt.rotation.z = this.rollV;
      this.spin += (this.speed * dt) / 0.34;
      for (const w of this.wheels) {
        w.m.rotation.x = this.spin;
        if (w.front) w.pivot.rotation.y = this.steer;
      }
    }
    this.prevSpeed = this.speed;
  }
}
