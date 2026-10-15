import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { mulberry32, clamp, lerp } from './util.js';

const TILE_W = 24; // metres of facade covered by one texture tile (8 windows)
const TILE_H = 32;
const dummy = new THREE.Object3D();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function makeTex(cv, aniso) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function makeFacade(rng, aniso) {
  const S = 512, cells = 8, cw = S / cells;
  const col = makeCanvas(S, S), lit = makeCanvas(S, S);
  const c = col.getContext('2d'), l = lit.getContext('2d');
  c.fillStyle = '#c9ccd1'; c.fillRect(0, 0, S, S);
  l.fillStyle = '#000'; l.fillRect(0, 0, S, S);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const px = x * cw, py = y * cw, m = 8;
      c.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.06})`;
      c.fillRect(px, py, cw, cw);
      const g = c.createLinearGradient(px, py + m, px, py + cw - m);
      g.addColorStop(0, '#6f8ca8'); g.addColorStop(0.5, '#2c3e52'); g.addColorStop(1, '#16212c');
      c.fillStyle = g; c.fillRect(px + m, py + m, cw - 2 * m, cw - 2 * m - 6);
      c.fillStyle = 'rgba(255,255,255,0.14)';
      c.beginPath(); c.moveTo(px + m, py + m); c.lineTo(px + m + 18, py + m); c.lineTo(px + m, py + m + 28); c.fill();
      c.fillStyle = '#e7e9ec'; c.fillRect(px + m - 2, py + cw - m - 6, cw - 2 * m + 4, 4);
      if (rng() < 0.38) {
        l.fillStyle = rng() < 0.82 ? '#ffd9a0' : '#bfe3ff';
        l.fillRect(px + m, py + m, cw - 2 * m, cw - 2 * m - 6);
      }
    }
  }
  return { map: makeTex(col, aniso), emissive: makeTex(lit, aniso) };
}

function makeAsphalt(rng, aniso, repeat) {
  const S = 256, cv = makeCanvas(S, S), c = cv.getContext('2d');
  c.fillStyle = '#3a3c40'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 7000; i++) {
    const v = 40 + Math.floor(rng() * 40);
    c.fillStyle = `rgba(${v},${v},${v + 3},0.55)`;
    c.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  const t = makeTex(cv, aniso); t.repeat.set(repeat, repeat); return t;
}

function makeSidewalk(aniso) {
  const S = 128, cv = makeCanvas(S, S), c = cv.getContext('2d');
  c.fillStyle = '#a7a7a3'; c.fillRect(0, 0, S, S);
  c.strokeStyle = '#8b8b87'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2);
  return makeTex(cv, aniso);
}

function colorize(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

// Walls only (no top/bottom face) with UVs scaled so windows keep a real-world size.
function wallBox(w, h, d, x, y0, z, color, uOff) {
  const g = new THREE.BoxGeometry(w, h, d);
  const idx = g.index.array, keep = [];
  for (let i = 0; i < 12; i++) keep.push(idx[i]);
  for (let i = 24; i < 36; i++) keep.push(idx[i]);
  g.setIndex(keep);
  const uv = g.attributes.uv;
  for (let i = 0; i < 24; i++) {
    if (i >= 8 && i < 16) continue;
    const sideW = i < 8 ? d : w;
    uv.setXY(i, (uv.getX(i) * sideW) / TILE_W + uOff, (uv.getY(i) * h) / TILE_H);
  }
  g.translate(x, y0 + h / 2, z);
  colorize(g, color);
  return g;
}
function roofPlane(w, d, x, y, z, color) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2); g.translate(x, y + 0.02, z);
  colorize(g, color);
  return g;
}
function slab(w, h, d, x, y, z, uvScale) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  g.translate(x, y, z);
  return g;
}

function instanced(geom, mat, items) {
  const m = new THREE.InstancedMesh(geom, mat, items.length);
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.ry || 0, 0);
    dummy.scale.set(it.sx || 1, it.sy || 1, it.sz || 1);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
  return m;
}

export class City {
  constructor(scene, { mobile = false } = {}) {
    this.n = CFG.blocks; this.bs = CFG.blockSize; this.rw = CFG.roadWidth;
    this.half = (this.n * this.bs) / 2;
    this.lot = this.bs - this.rw;
    this.rng = mulberry32(CFG.seed);
    this.aniso = mobile ? 4 : 8;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.blocks = [];
    this._res = { x: 0, z: 0, hit: false };
    this._build();
  }

  road(k) { return (k - this.n / 2) * this.bs; }          // coordinate of road line k (0..n)
  blockCenter(i) { return (i - (this.n - 1) / 2) * this.bs; }

  setNight(n) {
    this.wallMat.emissiveIntensity = n * 1.4;
    this.lampMat.emissiveIntensity = n * 3.2;
  }

  groundHeight(x, z) {
    const lim = this.half + this.rw / 2;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return 0;
    const lx = ((((x + this.half) % this.bs) + this.bs) % this.bs) - this.bs / 2;
    const lz = ((((z + this.half) % this.bs) + this.bs) % this.bs) - this.bs / 2;
    return Math.abs(lx) < this.lot / 2 && Math.abs(lz) < this.lot / 2 ? CFG.curbHeight : 0;
  }

  _nearBlocks(x, z, fn) {
    const ix = Math.floor((x + this.half) / this.bs), iz = Math.floor((z + this.half) / this.bs);
    for (let a = ix - 1; a <= ix + 1; a++) {
      if (a < 0 || a >= this.n) continue;
      for (let b = iz - 1; b <= iz + 1; b++) {
        if (b < 0 || b >= this.n) continue;
        fn(this.blocks[a][b]);
      }
    }
  }

  // Push a circle (x,z,r) out of buildings and keep it inside the world.
  collide(x, z, r) {
    let hit = false;
    this._nearBlocks(x, z, (bl) => {
      for (const bd of bl.b) {
        const cx = clamp(x, bd.x0, bd.x1), cz = clamp(z, bd.z0, bd.z1);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          x += dx * k; z += dz * k;
        } else {
          const l = x - bd.x0, rr = bd.x1 - x, t = z - bd.z0, bt = bd.z1 - z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) x = bd.x0 - r; else if (m === rr) x = bd.x1 + r;
          else if (m === t) z = bd.z0 - r; else z = bd.z1 + r;
        }
        hit = true;
      }
    });
    const lim = this.half + this.rw / 2 - 1.2 - r;
    const cx2 = clamp(x, -lim, lim), cz2 = clamp(z, -lim, lim);
    if (cx2 !== x || cz2 !== z) hit = true;
    this._res.x = cx2; this._res.z = cz2; this._res.hit = hit;
    return this._res;
  }

  pointInBuilding(x, y, z, m = 0.3) {
    let inside = false;
    this._nearBlocks(x, z, (bl) => {
      for (const bd of bl.b) {
        if (y < bd.h && x > bd.x0 - m && x < bd.x1 + m && z > bd.z0 - m && z < bd.z1 + m) inside = true;
      }
    });
    return inside;
  }

  randomRoadPoint(rng) {
    const k = Math.floor(rng() * (this.n + 1));
    const along = (rng() * 2 - 1) * (this.half - 10);
    return rng() < 0.5 ? { x: along, z: this.road(k) } : { x: this.road(k), z: along };
  }

  _build() {
    const { n, bs, rw, lot, rng, aniso } = this;
    const P = n * bs + rw;

    // --- terrain + asphalt ---
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x55633f, roughness: 1 })
    );
    outer.position.y = -0.06; outer.receiveShadow = true;
    this.group.add(outer);

    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(P, P).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: makeAsphalt(rng, aniso, P / 10), roughness: 0.92, metalness: 0 })
    );
    asphalt.receiveShadow = true;
    this.group.add(asphalt);

    // --- buildings, sidewalks, parks ---
    const facade = makeFacade(rng, aniso);
    this.wallMat = new THREE.MeshStandardMaterial({
      map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: 0.55, metalness: 0.15,
    });
    const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const walkMat = new THREE.MeshStandardMaterial({ map: makeSidewalk(aniso), roughness: 0.95 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 1 });

    const walls = [], roofs = [], slabs = [], grass = [];
    const trunks = [], crowns = [];
    const tints = ['#ffffff', '#efe2cc', '#cfd9e4', '#dcc4b4', '#b9c0c8', '#f4e8d8', '#c9b8a8'].map((c) => new THREE.Color(c));
    const roofCol = new THREE.Color(0x3a3d42);
    const curb = CFG.curbHeight;
    const maxD = Math.hypot(this.blockCenter(0), this.blockCenter(0));

    for (let i = 0; i < n; i++) {
      this.blocks[i] = [];
      for (let j = 0; j < n; j++) {
        const cx = this.blockCenter(i), cz = this.blockCenter(j);
        const centre = Math.abs(i - (n - 1) / 2) < 1.6 && Math.abs(j - (n - 1) / 2) < 1.6;
        const park = !centre && rng() < 0.11;
        const bl = { cx, cz, park, b: [] };
        this.blocks[i][j] = bl;

        (park ? grass : slabs).push(slab(lot, curb, lot, cx, curb / 2, cz, lot / 6));

        if (park) {
          for (let t = 0; t < 16; t++) {
            trunks.push({ x: cx + (rng() * 2 - 1) * (lot / 2 - 3), z: cz + (rng() * 2 - 1) * (lot / 2 - 3), s: 0.8 + rng() * 0.7 });
          }
          continue;
        }

        const sub = lot / 2;
        const dist = Math.hypot(cx, cz) / (maxD * 1.05);
        const maxH = lerp(88, 20, clamp(dist, 0, 1));
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const w = 17 * (0.78 + rng() * 0.22), d = 17 * (0.78 + rng() * 0.22);
            const bx = cx + (a - 0.5) * sub + (rng() - 0.5) * 1.2;
            const bz = cz + (b - 0.5) * sub + (rng() - 0.5) * 1.2;
            const h = 9 + (maxH - 9) * Math.pow(rng(), 1.4);
            const tint = tints[Math.floor(rng() * tints.length)];
            const uOff = rng();
            walls.push(wallBox(w, h, d, bx, curb, bz, tint, uOff));
            roofs.push(roofPlane(w, d, bx, curb + h, bz, roofCol));
            if (h > 40 && rng() < 0.55) {
              const h2 = h * 0.28, w2 = w * 0.66, d2 = d * 0.66;
              walls.push(wallBox(w2, h2, d2, bx, curb + h, bz, tint, rng()));
              roofs.push(roofPlane(w2, d2, bx, curb + h + h2, bz, roofCol));
            }
            bl.b.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h: curb + h });
          }
        }
      }
    }

    const wallMesh = new THREE.Mesh(mergeGeometries(walls, false), this.wallMat);
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs, false), roofMat);
    roofMesh.receiveShadow = true;
    const walkMesh = new THREE.Mesh(mergeGeometries(slabs, false), walkMat);
    walkMesh.receiveShadow = true;
    this.group.add(wallMesh, roofMesh, walkMesh);
    if (grass.length) {
      const gm = new THREE.Mesh(mergeGeometries(grass, false), grassMat);
      gm.receiveShadow = true; this.group.add(gm);
    }

    // --- street trees ---
    const inset = lot / 2 - 1.6;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const bl = this.blocks[i][j];
        if (bl.park) continue;
        for (let side = 0; side < 4; side++) {
          if (rng() > 0.6) continue;
          for (let t = -lot / 2 + 9; t < lot / 2 - 8; t += 11) {
            const p = side === 0 ? [bl.cx + t, bl.cz - inset] : side === 1 ? [bl.cx + t, bl.cz + inset]
              : side === 2 ? [bl.cx - inset, bl.cz + t] : [bl.cx + inset, bl.cz + t];
            trunks.push({ x: p[0], z: p[1], s: 0.7 + rng() * 0.5 });
          }
        }
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.6, 6).translate(0, 1.3, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.8, 0);
    const trunkMesh = instanced(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }),
      trunks.map((t) => ({ x: t.x, y: curb, z: t.z, sx: t.s, sy: t.s, sz: t.s })));
    const crownMesh = instanced(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      trunks.map((t) => ({ x: t.x, y: curb, z: t.z, sx: t.s, sy: t.s, sz: t.s, ry: rng() * 6 })));
    const gc = new THREE.Color();
    trunks.forEach((_, k) => { gc.setHSL(0.24 + rng() * 0.07, 0.45, 0.22 + rng() * 0.1); crownMesh.setColorAt(k, gc); });
    crownMesh.instanceColor.needsUpdate = true;
    trunkMesh.castShadow = true; crownMesh.castShadow = true;
    this.group.add(trunkMesh, crownMesh);

    // --- lane dashes ---
    const markMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.85 });
    const dashGeo = new THREE.BoxGeometry(3, 0.03, 0.22);
    const dashes = [];
    for (let k = 0; k <= n; k++) {
      const r = this.road(k);
      for (let p = -this.half + 4; p < this.half; p += 8) {
        let skip = false;
        for (let q = 0; q <= n; q++) if (Math.abs(p - this.road(q)) < rw / 2 + 2.5) { skip = true; break; }
        if (skip) continue;
        dashes.push({ x: p, y: 0.02, z: r });
        dashes.push({ x: r, y: 0.02, z: p, ry: Math.PI / 2 });
      }
    }
    this.group.add(instanced(dashGeo, markMat, dashes));

    // --- crosswalks ---
    const stripeGeo = new THREE.BoxGeometry(1, 0.03, 1);
    const stripes = [];
    const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        for (const [dx, dz] of arms) {
          if (i + dx < 0 || i + dx > n || j + dz < 0 || j + dz > n) continue;
          const ox = this.road(i) + dx * (rw / 2 + 1.6), oz = this.road(j) + dz * (rw / 2 + 1.6);
          for (let s = -3; s <= 3; s++) {
            const off = s * 1.8;
            stripes.push(dx !== 0
              ? { x: ox, y: 0.02, z: oz + off, sx: 2.6, sz: 0.8 }
              : { x: ox + off, y: 0.02, z: oz, sx: 0.8, sz: 2.6 });
          }
        }
      }
    }
    this.group.add(instanced(stripeGeo, markMat, stripes));

    // --- street lamps ---
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 7.2, 6).translate(0, 3.6, 0);
    const headGeo = new THREE.BoxGeometry(1.4, 0.16, 0.55).translate(0, 7.25, 0);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffe2a8, emissiveIntensity: 0 });
    const poles = [], heads = [];
    const lo = lot / 2 - 0.7;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const bl = this.blocks[i][j];
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const it = { x: bl.cx + sx * lo, y: curb, z: bl.cz + sz * lo, ry: (Math.PI / 4) * (sx * sz) };
            poles.push(it); heads.push(it);
          }
        }
      }
    }
    const poleMesh = instanced(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 }), poles);
    this.group.add(poleMesh, instanced(headGeo, this.lampMat, heads));
  }
}
