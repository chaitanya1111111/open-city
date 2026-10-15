import * as THREE from 'three';
import { wrapAngle } from './util.js';

const skin = new THREE.MeshStandardMaterial({ color: 0xd9a47e, roughness: 0.8 });
const shirt = new THREE.MeshStandardMaterial({ color: 0xd8452f, roughness: 0.7 });
const pants = new THREE.MeshStandardMaterial({ color: 0x252a35, roughness: 0.8 });
const shoes = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
const hair = new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 0.9 });

function part(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
function limb(x, y, w, h, d, mat, extra) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(part(new THREE.BoxGeometry(w, h, d), mat, 0, -h / 2, 0));
  if (extra) pivot.add(extra);
  return pivot;
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.add(part(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirt, 0, 1.2, 0));
    this.group.add(part(new THREE.SphereGeometry(0.15, 12, 10), skin, 0, 1.68, 0));
    this.group.add(part(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.71, -0.01));
    this.legL = limb(-0.13, 0.88, 0.2, 0.8, 0.22, pants, part(new THREE.BoxGeometry(0.22, 0.1, 0.32), shoes, 0, -0.85, 0.04));
    this.legR = limb(0.13, 0.88, 0.2, 0.8, 0.22, pants, part(new THREE.BoxGeometry(0.22, 0.1, 0.32), shoes, 0, -0.85, 0.04));
    this.armL = limb(-0.34, 1.48, 0.14, 0.58, 0.16, shirt, part(new THREE.SphereGeometry(0.08, 8, 6), skin, 0, -0.6, 0));
    this.armR = limb(0.34, 1.48, 0.14, 0.58, 0.16, shirt, part(new THREE.SphereGeometry(0.08, 8, 6), skin, 0, -0.6, 0));
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
    if (!this.grounded) { this.legL.rotation.x = 0.5; this.legR.rotation.x = -0.4; this.armL.rotation.x = -2.2; this.armR.rotation.x = -2.2; }
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }
}
