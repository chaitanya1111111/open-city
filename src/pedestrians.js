import * as THREE from 'three';
import { CFG } from './config.js';
import { mulberry32, wrapAngle } from './util.js';

const archetypes = [
  { shirt: 0x344e68, pants: 0x252b36, hair: 0x30221d, bag: 0x805b3f },
  { shirt: 0xd9c83d, pants: 0x354552, hair: 0xe7b942, bag: 0x4b5556 },
  { shirt: 0xb65367, pants: 0x394052, hair: 0x45312b, bag: 0xe2a450 },
  { shirt: 0x347d78, pants: 0x343548, hair: 0x24212b, bag: 0x6f5449 },
];
const skinTones = [0xe0b18d, 0xb87957, 0x8d5b43, 0xf0c9a7];
const dummy = new THREE.Object3D();
const rootMatrix = new THREE.Matrix4();
const localMatrix = new THREE.Matrix4();
const pivotMatrix = new THREE.Matrix4();
const turnMatrix = new THREE.Matrix4();
const offsetMatrix = new THREE.Matrix4();
const rootPosition = new THREE.Vector3();
const rootRotation = new THREE.Quaternion();
const rootScale = new THREE.Vector3(1, 1, 1);
const localPosition = new THREE.Vector3();
const localRotation = new THREE.Quaternion();
const localScale = new THREE.Vector3(1, 1, 1);
const axisY = new THREE.Vector3(0, 1, 0);
const axisX = new THREE.Vector3(1, 0, 0);

function addInstanceMesh(scene, geometry, count) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export class Pedestrians {
  constructor(scene, city, { mobile = false, count = CFG.pedestrianCount } = {}) {
    this.city = city;
    this.rng = mulberry32(CFG.seed + 71);
    if (mobile) count = Math.min(count, 10);
    this.people = [];
    this.torso = addInstanceMesh(scene, new THREE.CapsuleGeometry(0.18, 0.36, 4, 8), count);
    this.head = addInstanceMesh(scene, new THREE.SphereGeometry(0.12, 10, 8), count);
    this.hair = addInstanceMesh(scene, new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), count);
    this.arms = addInstanceMesh(scene, new THREE.CapsuleGeometry(0.055, 0.2, 3, 6), count * 2);
    this.legs = addInstanceMesh(scene, new THREE.CapsuleGeometry(0.07, 0.27, 3, 6), count * 2);
    this.shoes = addInstanceMesh(scene, new THREE.BoxGeometry(0.12, 0.07, 0.2), count * 2);
    this.bags = addInstanceMesh(scene, new THREE.BoxGeometry(0.2, 0.2, 0.12), count);
    this._spawn(count);
    this._updateMeshes();
  }

  _spawn(count) {
    const inset = this.city.lot / 2 - 1;
    for (let i = 0; i < count; i++) {
      const bi = Math.floor(this.rng() * this.city.n);
      const bj = Math.floor(this.rng() * this.city.n);
      const block = this.city.blocks[bi][bj];
      const extent = inset * (0.88 + this.rng() * 0.08);
      const route = [
        { x: block.cx - extent, z: block.cz - extent },
        { x: block.cx + extent, z: block.cz - extent },
        { x: block.cx + extent, z: block.cz + extent },
        { x: block.cx - extent, z: block.cz + extent },
      ];
      const segment = Math.floor(this.rng() * route.length);
      const start = route[segment], end = route[(segment + 1) % route.length];
      const t = 0.12 + this.rng() * 0.76;
      const type = Math.floor(this.rng() * archetypes.length);
      const outfit = archetypes[type];
      const p = {
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
        heading: Math.atan2(end.x - start.x, end.z - start.z),
        route, target: (segment + 1) % route.length,
        speed: 0.85 + this.rng() * 0.55,
        phase: this.rng() * Math.PI * 2,
        type,
        skin: skinTones[Math.floor(this.rng() * skinTones.length)],
        outfit,
      };
      this.people.push(p);
      this.torso.setColorAt(i, new THREE.Color(outfit.shirt));
      this.head.setColorAt(i, new THREE.Color(p.skin));
      this.hair.setColorAt(i, new THREE.Color(outfit.hair));
      this.bags.setColorAt(i, new THREE.Color(outfit.bag));
      for (let side = 0; side < 2; side++) {
        this.arms.setColorAt(i * 2 + side, new THREE.Color(outfit.shirt));
        this.legs.setColorAt(i * 2 + side, new THREE.Color(outfit.pants));
        this.shoes.setColorAt(i * 2 + side, new THREE.Color(0xc9c4b8));
      }
    }
    for (const mesh of [this.torso, this.head, this.hair, this.arms, this.legs, this.shoes, this.bags]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  update(dt) {
    for (const p of this.people) {
      let remaining = p.speed * dt;
      while (remaining > 0) {
        const target = p.route[p.target];
        const dx = target.x - p.x, dz = target.z - p.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.12) {
          p.x = target.x; p.z = target.z;
          p.target = (p.target + 1) % p.route.length;
          continue;
        }
        const step = Math.min(remaining, distance);
        p.x += (dx / distance) * step;
        p.z += (dz / distance) * step;
        p.heading += wrapAngle(Math.atan2(dx, dz) - p.heading) * Math.min(1, dt * 8);
        p.phase += step * 5.5;
        remaining -= step;
      }
    }
    this._updateMeshes();
  }

  _write(mesh, index, person, x, y, z, scale = 1, swing = 0) {
    rootPosition.set(person.x, this.city.groundHeight(person.x, person.z), person.z);
    rootRotation.setFromAxisAngle(axisY, person.heading);
    rootMatrix.compose(rootPosition, rootRotation, rootScale);
    localPosition.set(x, y, z);
    localRotation.setFromAxisAngle(axisX, swing);
    localScale.setScalar(scale);
    localMatrix.compose(localPosition, localRotation, localScale);
    mesh.setMatrixAt(index, rootMatrix.clone().multiply(localMatrix));
  }

  _writeLimb(mesh, index, person, side, y, lengthOffset, swing) {
    rootPosition.set(person.x, this.city.groundHeight(person.x, person.z), person.z);
    rootRotation.setFromAxisAngle(axisY, person.heading);
    rootMatrix.compose(rootPosition, rootRotation, rootScale);
    localPosition.set(side, y, 0);
    localRotation.setFromAxisAngle(axisX, swing);
    localScale.setScalar(1);
    pivotMatrix.compose(localPosition, localRotation, localScale);
    offsetMatrix.makeTranslation(0, -lengthOffset, 0);
    const matrix = rootMatrix.clone().multiply(pivotMatrix).multiply(offsetMatrix);
    mesh.setMatrixAt(index, matrix);
  }

  _updateMeshes() {
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      const swing = Math.sin(p.phase) * 0.28;
      this._write(this.torso, i, p, 0, 1.12, 0);
      this._write(this.head, i, p, 0, 1.68, 0.015, 1.05);
      this._write(this.hair, i, p, 0, 1.76, -0.015);
      this._write(this.bags, i, p, 0.25, 0.88, 0.02, p.type === 0 ? 0.88 : 1);
      this._writeLimb(this.arms, i * 2, p, -0.24, 1.36, 0.2, -swing);
      this._writeLimb(this.arms, i * 2 + 1, p, 0.24, 1.36, 0.2, swing);
      this._writeLimb(this.legs, i * 2, p, -0.1, 0.82, 0.34, swing);
      this._writeLimb(this.legs, i * 2 + 1, p, 0.1, 0.82, 0.34, -swing);
      this._write(this.shoes, i * 2, p, -0.1, 0.09, 0.07, 1, swing);
      this._write(this.shoes, i * 2 + 1, p, 0.1, 0.09, 0.07, 1, -swing);
    }
    for (const mesh of [this.torso, this.head, this.hair, this.arms, this.legs, this.shoes, this.bags]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
