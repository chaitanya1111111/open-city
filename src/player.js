import * as THREE from 'three';
import { wrapAngle } from './util.js';

function risoTexture(base, inks, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);

  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < 260; i++) {
    const value = random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${value},${value},${value},${0.025 + random() * 0.035})`;
    ctx.fillRect(random() * 128, random() * 128, 1, 1);
  }
  inks.forEach((ink, layer) => {
    const shiftX = layer * 2.2, shiftY = layer * -1.6;
    for (let y = -4; y < 132; y += 9) {
      for (let x = -4; x < 132; x += 9) {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(x + shiftX, y + shiftY, 1.2 + random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const skin = new THREE.MeshStandardMaterial({
  map: risoTexture('#d9a47e', ['rgba(173,55,70,0.17)', 'rgba(255,225,164,0.2)'], 17),
  color: 0xffffff, roughness: 0.82,
});
const shirt = new THREE.MeshStandardMaterial({
  map: risoTexture('#59604a', ['rgba(120,91,56,0.35)', 'rgba(190,166,118,0.2)', 'rgba(53,67,54,0.32)'], 31),
  color: 0xffffff, roughness: 0.88,
});
const pants = new THREE.MeshStandardMaterial({
  map: risoTexture('#343a35', ['rgba(126,104,72,0.26)', 'rgba(31,50,43,0.3)'], 53),
  color: 0xffffff, roughness: 0.92,
});
const shoes = new THREE.MeshStandardMaterial({
  map: risoTexture('#35332d', ['rgba(125,91,54,0.24)', 'rgba(191,167,116,0.13)'], 79),
  color: 0xffffff, roughness: 0.96,
});
const hair = new THREE.MeshStandardMaterial({ color: 0x241b20, roughness: 0.94 });
const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf4e7d4, roughness: 0.65 });
const iris = new THREE.MeshStandardMaterial({ color: 0x263a43, roughness: 0.55 });
const detail = new THREE.MeshStandardMaterial({ color: 0x173c4a, roughness: 0.8 });
const canvasGear = new THREE.MeshStandardMaterial({
  map: risoTexture('#4c4939', ['rgba(150,119,74,0.24)', 'rgba(30,43,39,0.3)'], 97),
  color: 0xffffff, roughness: 0.98,
});
const leatherGear = new THREE.MeshStandardMaterial({ color: 0x292d29, roughness: 0.94 });
const wornCloth = new THREE.MeshStandardMaterial({ color: 0x77715c, roughness: 0.98 });

function part(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
function makeLeg(x) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.91, 0);
  pivot.add(part(new THREE.CapsuleGeometry(0.105, 0.34, 5, 10), pants, 0, -0.2, 0));
  const knee = new THREE.Group();
  knee.position.y = -0.39;
  knee.add(part(new THREE.CapsuleGeometry(0.078, 0.32, 5, 10), pants, 0, -0.17, 0));
  const foot = part(new THREE.SphereGeometry(1, 12, 8), shoes, 0, -0.38, 0.075);
  foot.scale.set(0.105, 0.07, 0.19);
  knee.add(foot);
  pivot.add(knee);
  pivot.userData.knee = knee;
  return pivot;
}

function makeArm(x) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 1.49, 0);
  pivot.add(part(new THREE.SphereGeometry(0.12, 12, 10), shirt, 0, -0.04, 0));
  pivot.add(part(new THREE.CapsuleGeometry(0.083, 0.22, 5, 10), shirt, 0, -0.21, 0));
  const forearm = new THREE.Group();
  forearm.position.y = -0.36;
  forearm.add(part(new THREE.CapsuleGeometry(0.067, 0.23, 5, 10), skin, 0, -0.17, 0));
  forearm.add(part(new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.34, 0.015));
  pivot.add(forearm);
  return pivot;
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    const torso = part(new THREE.CapsuleGeometry(0.235, 0.37, 6, 14), shirt, 0, 1.22, 0);
    torso.scale.set(1.05, 1, 0.77);
    const hips = part(new THREE.CapsuleGeometry(0.19, 0.12, 4, 12), pants, 0, 0.88, 0);
    const neck = part(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 10), skin, 0, 1.57, 0);
    const head = part(new THREE.SphereGeometry(0.15, 18, 14), skin, 0, 1.76, 0);
    head.scale.set(0.9, 1.08, 0.92);
    const jaw = part(new THREE.SphereGeometry(0.105, 14, 10), skin, 0, 1.705, 0.025);
    jaw.scale.set(0.88, 0.68, 0.9);
    const hairCap = part(new THREE.SphereGeometry(0.157, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.785, -0.008);
    const hairBack = part(new THREE.SphereGeometry(0.12, 12, 10), hair, 0, 1.77, -0.075);
    hairBack.scale.set(1, 0.85, 0.75);
    const nose = part(new THREE.ConeGeometry(0.022, 0.055, 6), skin, 0, 1.76, 0.142);
    nose.rotation.x = Math.PI / 2;
    this.group.add(torso, hips, neck, head, jaw, hairCap, hairBack, nose);

    for (const side of [-1, 1]) {
      const ear = part(new THREE.SphereGeometry(0.038, 10, 8), skin, side * 0.137, 1.76, 0);
      ear.scale.set(0.55, 1, 0.72);
      const eye = part(new THREE.SphereGeometry(0.019, 10, 8), eyeWhite, side * 0.052, 1.785, 0.128);
      const pupil = part(new THREE.SphereGeometry(0.009, 8, 6), iris, side * 0.052, 1.783, 0.145);
      const brow = part(new THREE.BoxGeometry(0.045, 0.009, 0.012), hair, side * 0.052, 1.818, 0.13);
      this.group.add(ear, eye, pupil, brow);
    }

    const collar = part(new THREE.TorusGeometry(0.085, 0.018, 6, 14), detail, 0, 1.48, 0);
    collar.rotation.x = Math.PI / 2;
    collar.material = leatherGear;
    const pocket = part(new THREE.BoxGeometry(0.105, 0.12, 0.012), leatherGear, 0.12, 1.31, 0.176);
    const pocketTrim = part(new THREE.BoxGeometry(0.11, 0.018, 0.016), wornCloth, 0.12, 1.365, 0.182);
    const backpack = part(new THREE.BoxGeometry(0.38, 0.48, 0.2), canvasGear, 0, 1.16, -0.245);
    backpack.rotation.x = -0.08;
    const packTop = part(new THREE.BoxGeometry(0.3, 0.09, 0.21), wornCloth, 0, 1.43, -0.245);
    const packPocket = part(new THREE.BoxGeometry(0.24, 0.16, 0.025), leatherGear, 0, 1.07, -0.357);
    const packStraps = [];
    for (const side of [-1, 1]) {
      const strap = part(new THREE.BoxGeometry(0.055, 0.48, 0.045), wornCloth, side * 0.17, 1.2, -0.118);
      strap.rotation.z = side * -0.1;
      packStraps.push(strap);
    }
    const jacketPatch = part(new THREE.BoxGeometry(0.13, 0.12, 0.016), wornCloth, -0.11, 1.3, 0.174);
    const shoulderPadL = part(new THREE.SphereGeometry(0.13, 10, 8), leatherGear, -0.27, 1.47, 0);
    const shoulderPadR = part(new THREE.SphereGeometry(0.13, 10, 8), leatherGear, 0.27, 1.47, 0);
    this.group.add(collar, pocket, pocketTrim, backpack, packTop, packPocket, ...packStraps,
      jacketPatch, shoulderPadL, shoulderPadR);

    this.legL = makeLeg(-0.12);
    this.legR = makeLeg(0.12);
    this.armL = makeArm(-0.275);
    this.armR = makeArm(0.275);
    this.group.add(this.legL, this.legR, this.armL, this.armR);
    scene.add(this.group);

    this.x = 0; this.y = 0; this.z = 0;
    this.vy = 0; this.heading = 0; this.speed = 0;
    this.dirx = 0; this.dirz = 0; this.phase = 0; this.grounded = true;
  }

  setVisible(v) { this.group.visible = v; }

  update(dt, input, camYaw, city) {
    const mx = input.moveX, my = input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    let tx = 0, tz = 0;
    if (mag > 0.08) {
      const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
      tx = sy * my - cy * mx; tz = cy * my + sy * mx;
      const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      this.dirx = tx; this.dirz = tz;
      this.heading += wrapAngle(Math.atan2(tx, tz) - this.heading) * Math.min(1, dt * 14);
    }
    const target = mag > 0.08 ? (input.run ? 7.5 : 4.0) * (mag > 0.5 ? 1 : 0.6) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    this.x += this.dirx * this.speed * dt;
    this.z += this.dirz * this.speed * dt;

    const res = city.collide(this.x, this.z, 0.4);
    this.x = res.x; this.z = res.z;

    if (input.jumpPressed && this.grounded) { this.vy = 7; this.grounded = false; }
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    const g = city.groundHeight(this.x, this.z);
    if (this.y <= g) { this.y = g; this.vy = 0; this.grounded = true; }
    else if (this.y - g < 0.2 && this.vy <= 0) { this.y = g; this.vy = 0; this.grounded = true; }
    else this.grounded = false;

    this.phase += this.speed * dt * 2.3;
    const amp = Math.min(1, this.speed / 4) * (this.speed > 5.5 ? 1.15 : 0.8);
    const sw = Math.sin(this.phase) * amp;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw; this.armR.rotation.x = sw;
    this.legL.userData.knee.rotation.x = Math.max(0, -sw) * 0.45;
    this.legR.userData.knee.rotation.x = Math.max(0, sw) * 0.45;
    if (!this.grounded) {
      this.legL.rotation.x = 0.5; this.legR.rotation.x = -0.4;
      this.legL.userData.knee.rotation.x = 0.3; this.legR.userData.knee.rotation.x = 0.3;
      this.armL.rotation.x = -2.2; this.armR.rotation.x = -2.2;
    }
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }
}
