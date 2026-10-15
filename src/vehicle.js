import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './util.js';

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x596362, roughness: 0.58, metalness: 0.08, clearcoat: 0.22, clearcoatRoughness: 0.55,
});
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
const rustMat = new THREE.MeshStandardMaterial({ color: 0x805037, roughness: 0.98, metalness: 0.04 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 0.15 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.2 });

const BASE_VEHICLE_TUNING = {
  topSpeed: 50,                 // default sedan: 180 km/h
  reverseTopSpeed: 12,          // 43 km/h
  acceleration: 12.5,           // m/s^2
  reverseAcceleration: 5.3,     // m/s^2
  braking: 10,                  // m/s^2
  coastDeceleration: 1.2,       // m/s^2
  maxSteerAngle: 0.55,          // radians
  highSpeedSteerFactor: 0.35,
  steerSpeed: 3.5,              // radians per second
  wheelbase: 2.7,
};

export const VEHICLE_TYPES = [
  { name: 'City Compact', len: 3.75, wid: 1.72, bodyH: 0.58, cabH: 0.62, cabLen: 2.15, cabZ: -0.12, ride: 0.3, rake: 0.5, topSpeed: 44, acceleration: 10.5, wheelRadius: 0.3, roof: 'hatch' },
  { name: 'Family Sedan', len: 4.5, wid: 1.84, bodyH: 0.58, cabH: 0.58, cabLen: 2.45, cabZ: -0.2, ride: 0.31, rake: 0.6, topSpeed: 52, acceleration: 11, wheelRadius: 0.33, roof: 'sedan' },
  { name: 'Urban SUV', len: 4.65, wid: 1.95, bodyH: 0.76, cabH: 0.68, cabLen: 2.9, cabZ: -0.28, ride: 0.42, rake: 0.48, topSpeed: 48, acceleration: 9.5, wheelRadius: 0.36, roof: 'suv' },
  { name: 'Executive Saloon', len: 4.95, wid: 1.9, bodyH: 0.62, cabH: 0.62, cabLen: 2.65, cabZ: -0.3, ride: 0.33, rake: 0.72, topSpeed: 58, acceleration: 12, wheelRadius: 0.34, roof: 'sedan' },
  { name: 'Sport Coupe', len: 4.35, wid: 1.9, bodyH: 0.48, cabH: 0.48, cabLen: 2.35, cabZ: -0.22, ride: 0.28, rake: 0.88, topSpeed: 70, acceleration: 16, wheelRadius: 0.34, roof: 'coupe' },
  { name: 'Supercar', len: 4.55, wid: 1.98, bodyH: 0.42, cabH: 0.46, cabLen: 2.1, cabZ: -0.2, ride: 0.24, rake: 1.0, topSpeed: 83, acceleration: 19, wheelRadius: 0.35, roof: 'supercar' },
];
export const VEHICLE_TUNING = BASE_VEHICLE_TUNING;
let nightAmount = 0;

export function setCarNight(n) {
  nightAmount = n;
  headMat.emissiveIntensity = 0.15 + n * 3;
}

function colorize(g, r, gr, b) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gr; a[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const wheelGeoCache = new Map();
const typeCache = [];

function wheelGeometry(radius) {
  if (wheelGeoCache.has(radius)) return wheelGeoCache.get(radius);
  const geo = mergeGeometries([
    colorize(new THREE.CylinderGeometry(radius, radius, 0.26, 16).rotateZ(Math.PI / 2), 0.055, 0.06, 0.07),
    colorize(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.28, 12).rotateZ(Math.PI / 2), 0.78, 0.8, 0.82),
    colorize(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, 0.3, 10).rotateZ(Math.PI / 2), 0.3, 0.34, 0.38),
  ], false);
  wheelGeoCache.set(radius, geo);
  return geo;
}

function buildType(i) {
  if (typeCache[i]) return typeCache[i];
  const t = VEHICLE_TYPES[i];
  const roofScale = t.roof === 'suv' ? 0.96 : t.roof === 'hatch' ? 0.94 : t.roof === 'supercar' ? 0.82 : 0.88;
  const lower = new THREE.BoxGeometry(t.wid, t.bodyH, t.len).translate(0, t.ride + t.bodyH / 2, 0);
  const hood = new THREE.BoxGeometry(t.wid * 0.9, 0.09, t.len * 0.29)
    .translate(0, t.ride + t.bodyH + 0.025, t.len * 0.32);
  const rearDeck = new THREE.BoxGeometry(t.wid * 0.88, 0.08, t.len * (t.roof === 'hatch' ? 0.15 : 0.2))
    .translate(0, t.ride + t.bodyH + 0.02, -t.len * 0.36);
  const roof = new THREE.BoxGeometry(t.wid * roofScale, 0.075, t.cabLen * (t.roof === 'suv' ? 0.86 : 0.8))
    .translate(0, t.ride + t.bodyH + t.cabH + 0.02, t.cabZ - t.rake * 0.1);
  const body = mergeGeometries([lower, hood, rearDeck, roof], false);
  const rustParts = [];
  for (const side of [-1, 1]) {
    for (const z of [-t.len * 0.28, -t.len * 0.02, t.len * 0.27]) {
      const height = 0.035 + ((Math.abs(Math.round(z * 100)) + i * 7) % 5) * 0.012;
      const width = 0.09 + ((Math.abs(Math.round(z * 100)) + i * 11) % 6) * 0.025;
      rustParts.push(new THREE.BoxGeometry(0.014, height, width).translate(
        side * (t.wid / 2 + 0.008), t.ride + t.bodyH * (0.33 + (i % 3) * 0.06), z,
      ));
    }
  }
  const rust = mergeGeometries(rustParts, false);

  // tapered cabin (side profile extruded across the width)
  const hz = t.cabLen / 2, tw = t.wid * 0.88;
  const sh = new THREE.Shape();
  sh.moveTo(-hz, 0); sh.lineTo(hz, 0);
  sh.lineTo(hz - t.rake * 0.38, t.cabH); sh.lineTo(-hz + t.rake * 0.8, t.cabH); sh.closePath();
  const glass = new THREE.ExtrudeGeometry(sh, { depth: tw, bevelEnabled: false });
  glass.translate(0, 0, -tw / 2); glass.rotateY(Math.PI / 2);
  glass.translate(0, t.ride + t.bodyH, t.cabZ);

  const grille = new THREE.BoxGeometry(t.wid * (t.roof === 'supercar' ? 0.48 : 0.4), 0.2, 0.035)
    .translate(0, t.ride + t.bodyH * 0.53, t.len / 2 + 0.025);
  const bumpers = mergeGeometries([
    new THREE.BoxGeometry(t.wid * 0.98, 0.12, 0.12).translate(0, t.ride + 0.09, t.len / 2 + 0.045),
    new THREE.BoxGeometry(t.wid * 0.98, 0.12, 0.12).translate(0, t.ride + 0.09, -t.len / 2 - 0.045),
    new THREE.BoxGeometry(0.055, 0.065, t.len * 0.48).translate(-t.wid * 0.48, t.ride + 0.08, 0),
    new THREE.BoxGeometry(0.055, 0.065, t.len * 0.48).translate(t.wid * 0.48, t.ride + 0.08, 0),
  ], false);
  const mirrors = mergeGeometries([
    new THREE.BoxGeometry(0.15, 0.1, 0.18).translate(-t.wid * 0.53, t.ride + t.bodyH + 0.24, t.len * 0.12),
    new THREE.BoxGeometry(0.15, 0.1, 0.18).translate(t.wid * 0.53, t.ride + t.bodyH + 0.24, t.len * 0.12),
  ], false);
  const doorDetails = mergeGeometries([
    new THREE.BoxGeometry(0.035, 0.035, 0.2).translate(-t.wid / 2 - 0.015, t.ride + t.bodyH * 0.56, t.cabZ + 0.08),
    new THREE.BoxGeometry(0.035, 0.035, 0.2).translate(t.wid / 2 + 0.015, t.ride + t.bodyH * 0.56, t.cabZ + 0.08),
    new THREE.BoxGeometry(0.025, t.bodyH * 0.55, 0.025).translate(-t.wid / 2 - 0.012, t.ride + t.bodyH * 0.52, t.cabZ - 0.48),
    new THREE.BoxGeometry(0.025, t.bodyH * 0.55, 0.025).translate(t.wid / 2 + 0.012, t.ride + t.bodyH * 0.52, t.cabZ - 0.48),
    new THREE.BoxGeometry(0.025, t.bodyH * 0.55, 0.025).translate(-t.wid / 2 - 0.012, t.ride + t.bodyH * 0.52, t.cabZ + 0.62),
    new THREE.BoxGeometry(0.025, t.bodyH * 0.55, 0.025).translate(t.wid / 2 + 0.012, t.ride + t.bodyH * 0.52, t.cabZ + 0.62),
  ], false);
  const trim = mergeGeometries([
    new THREE.BoxGeometry(t.wid + 0.02, 0.22, 0.18).translate(0, t.ride + 0.14, t.len / 2),
    new THREE.BoxGeometry(t.wid + 0.02, 0.22, 0.18).translate(0, t.ride + 0.14, -t.len / 2),
    new THREE.BoxGeometry(t.wid * 0.98, 0.045, 0.06).translate(0, t.ride + 0.36, t.len / 2 + 0.04),
    new THREE.BoxGeometry(0.025, 0.12, t.len * 0.12).translate(-t.wid * 0.49, t.ride + t.bodyH * 0.47, t.len * 0.03),
    new THREE.BoxGeometry(0.025, 0.12, t.len * 0.12).translate(t.wid * 0.49, t.ride + t.bodyH * 0.47, t.len * 0.03),
  ], false);
  const hx = t.wid / 2 - 0.3, hy = t.ride + t.bodyH - 0.15;
  const head = mergeGeometries([
    new THREE.BoxGeometry(t.roof === 'supercar' ? 0.5 : 0.42, 0.09, 0.07).translate(hx, hy + 0.06, t.len / 2 + 0.025),
    new THREE.BoxGeometry(t.roof === 'supercar' ? 0.5 : 0.42, 0.09, 0.07).translate(-hx, hy + 0.06, t.len / 2 + 0.025),
  ], false);
  const tail = mergeGeometries([
    new THREE.BoxGeometry(t.roof === 'suv' ? 0.28 : 0.42, 0.13, 0.07).translate(hx, hy + 0.045, -t.len / 2 - 0.025),
    new THREE.BoxGeometry(t.roof === 'suv' ? 0.28 : 0.42, 0.13, 0.07).translate(-hx, hy + 0.045, -t.len / 2 - 0.025),
  ], false);
  return (typeCache[i] = { t, body, rust, glass, trim, head, tail, grille, bumpers, mirrors, doorDetails });
}

export const CAR_COLORS = [0xc0392b, 0x2c5fa8, 0xe8e8e8, 0x1c1c1f, 0xd8b43a, 0x2f7d4f, 0x8a8f96, 0xe2701d, 0x6a3f8f];

export class Car {
  constructor(scene, typeIdx, color) {
    const d = buildType(((typeIdx % VEHICLE_TYPES.length) + VEHICLE_TYPES.length) % VEHICLE_TYPES.length);
    this.t = d.t;
    this.tuning = { ...BASE_VEHICLE_TUNING, topSpeed: this.t.topSpeed, acceleration: this.t.acceleration, wheelbase: this.t.len * 0.62 };
    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    const weatheredPaint = new THREE.Color(color).lerp(new THREE.Color(0x81745e), 0.24);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: weatheredPaint, roughness: 0.76, metalness: 0.22, clearcoat: 0.18, clearcoatRoughness: 0.62,
    });
    const body = new THREE.Mesh(d.body, bodyMat); body.castShadow = true;
    const rust = new THREE.Mesh(d.rust, rustMat); rust.castShadow = true;
    this.tailLightMat = tailMat.clone();
    const bumpers = new THREE.Mesh(d.bumpers, trimMat); bumpers.castShadow = true;
    const mirrors = new THREE.Mesh(d.mirrors, bodyMat); mirrors.castShadow = true;
    const grille = new THREE.Mesh(d.grille, trimMat);
    const doorDetails = new THREE.Mesh(d.doorDetails, trimMat);
    this.tilt.add(body, rust, bumpers, mirrors, grille, doorDetails, new THREE.Mesh(d.glass, glassMat), new THREE.Mesh(d.trim, trimMat),
      new THREE.Mesh(d.head, headMat), new THREE.Mesh(d.tail, this.tailLightMat));
    this.group.add(this.tilt);

    this.wheels = [];
    const wx = this.t.wid / 2 - 0.08, wz = this.t.len * 0.32;
    const wheelGeo = wheelGeometry(this.t.wheelRadius);
    for (const [sx, sz, front] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wx, this.t.wheelRadius, sz * wz);
      const m = new THREE.Mesh(wheelGeo, wheelMat); m.castShadow = true;
      pivot.add(m); this.group.add(pivot);
      this.wheels.push({ pivot, m, front });
    }
    scene.add(this.group);

    this.x = 0; this.y = 0; this.z = 0; this.heading = 0;
    this.speed = 0; this.steer = 0; this.spin = 0; this.prevSpeed = 0;
    this.braking = false; this.brakeLight = false;
    this.pitchV = 0; this.rollV = 0; this.impact = 0; this.ai = false;
  }

  place(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.sync(0.016, null); }

  circles() {
    const s = Math.sin(this.heading) * 1.25, c = Math.cos(this.heading) * 1.25;
    return [[this.x + s, this.z + c], [this.x - s, this.z - c]];
  }

  // RWD-style arcade handling. ctrl = { throttle:-1..1, steer:-1..1 (right = +), handbrake }
  drive(dt, ctrl, city) {
    let s = this.speed;
    if (ctrl.throttle > 0) {
      if (s < 0) {
        s = Math.min(0, s + this.tuning.braking * ctrl.throttle * dt);
      } else {
        s += ctrl.throttle * this.tuning.acceleration *
          (1 - s / this.tuning.topSpeed) * dt;
      }
    } else if (ctrl.throttle < 0) {
      if (s > 0) {
        s = Math.max(0, s - this.tuning.braking * -ctrl.throttle * dt);
      } else {
        s += ctrl.throttle * this.tuning.reverseAcceleration *
          (1 - Math.abs(s) / this.tuning.reverseTopSpeed) * dt;
      }
    } else {
      s -= Math.sign(s) * Math.min(Math.abs(s), this.tuning.coastDeceleration * dt);
    }
    this.braking = ctrl.handbrake || (ctrl.throttle < 0 && this.speed > 0);
    if (ctrl.handbrake) {
      s -= Math.sign(s) * Math.min(Math.abs(s), this.tuning.braking * 2.5 * dt);
    }
    this.speed = clamp(s, -this.tuning.reverseTopSpeed, this.tuning.topSpeed);

    const speedRatio = clamp(Math.abs(this.speed) / this.tuning.topSpeed, 0, 1);
    const activeMaxSteer = this.tuning.maxSteerAngle *
      (1 - (1 - this.tuning.highSpeedSteerFactor) * speedRatio);
    const targetSteer = -ctrl.steer * activeMaxSteer;
    this.steer += clamp(
      targetSteer - this.steer,
      -this.tuning.steerSpeed * dt,
      this.tuning.steerSpeed * dt,
    );
    this.heading += (this.speed / this.tuning.wheelbase) * Math.tan(this.steer) * dt;

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

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
      this.spin += (this.speed * dt) / this.t.wheelRadius;
      const deceleration = (this.prevSpeed - this.speed) / dt;
      this.brakeLight = this.braking || (this.speed > 1 && deceleration > 1.4);
      const tailTarget = this.brakeLight ? 4.5 : 0.2 + nightAmount * 1.2;
      this.tailLightMat.emissiveIntensity +=
        (tailTarget - this.tailLightMat.emissiveIntensity) * Math.min(1, dt * 8);
      for (const w of this.wheels) {
        w.m.rotation.x = this.spin;
        if (w.front) w.pivot.rotation.y = this.steer;
      }
    }
    this.prevSpeed = this.speed;
  }
}
