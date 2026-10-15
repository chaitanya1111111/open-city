import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { lerp, smoothstep, clamp } from './util.js';

const C = {
  dayFog: new THREE.Color(0xaec6e0), duskFog: new THREE.Color(0xe09a70), nightFog: new THREE.Color(0x060910),
  daySky: new THREE.Color(0xbfd9ff), nightSky: new THREE.Color(0x101830),
  sunWarm: new THREE.Color(0xff9a55), sunWhite: new THREE.Color(0xfff4e6), moon: new THREE.Color(0x7f98d6),
};
const tmp = new THREE.Vector3();

export class Environment {
  constructor(scene, { mobile = false } = {}) {
    this.sky = new Sky();
    this.sky.scale.setScalar(3000);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const size = mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const r = mobile ? 70 : 100, cam = this.sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = 520;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a4f3a, 0.6);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xaec6e0, 0.0017);
    scene.fog = this.fog;

    const N = 1200, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.96 + 0.04);
      pos[i * 3] = 2500 * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = 2500 * Math.cos(ph);
      pos[i * 3 + 2] = 2500 * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.exposure = 0.55;
  }

  update(hour, focus, camera) {
    const a = ((hour - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.3).normalize();
    const y = this.sunDir.y;
    const dayF = smoothstep(-0.05, 0.3, y);
    this.night = 1 - smoothstep(-0.12, 0.1, y);

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = lerp(3, 1.2, smoothstep(0, 0.4, y));
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.material.opacity = this.night;

    const useSun = y > -0.06;
    const dir = useSun ? this.sunDir : tmp.copy(this.sunDir).negate();
    this.sun.position.copy(focus).addScaledVector(dir, 220);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = 0.2 + 3.0 * dayF;
    if (useSun) this.sun.color.copy(C.sunWarm).lerp(C.sunWhite, smoothstep(0, 0.45, y));
    else this.sun.color.copy(C.moon);

    this.hemi.intensity = 0.12 + 0.75 * dayF;
    this.hemi.color.copy(C.nightSky).lerp(C.daySky, dayF);

    const dusk = clamp(1 - Math.abs(y - 0.05) / 0.22, 0, 1);
    this.fog.color.copy(C.nightFog).lerp(C.dayFog, dayF).lerp(C.duskFog, dusk * 0.55);
    this.fog.density = lerp(0.0034, 0.0017, dayF);
    this.exposure = lerp(0.85, 0.55, dayF);
  }
}
