import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { mulberry32, clamp, lerp } from './util.js';

const TILE_W = 24; // metres of facade covered by one texture tile (8 windows)
const TILE_H = 32;
const dummy = new THREE.Object3D();
const DISTRICTS = {
  airport: { label: 'International Airport', color: 0x59636a },
  base: { label: 'Restricted Defence Base', color: 0x61674e },
  desert: { label: 'Redstone Badlands', color: 0x9b7650 },
  village: { label: 'Old Town Village', color: 0x8d7455 },
  race: { label: 'Grand Prix Circuit', color: 0x42464a },
  tech: { label: 'Tech Quarter', color: 0x59656d },
  downtown: { label: 'Central District', color: 0x66676a },
  suburb: { label: 'Residential Suburbs', color: 0x77766e },
};
const DISTRICT_PALETTES = {
  airport: [0xaaa99f, 0x888e8c, 0x989a91],
  base: [0x686b5d, 0x68675e, 0x8a8878],
  desert: [0x977656, 0x80674f, 0xa08463],
  village: [0xa18b6d, 0x92785e, 0x826a56, 0xb09b7d],
  race: [0x747777, 0x5d6063, 0x908a7e],
  tech: [0x829195, 0x697d83, 0x9a9e98],
  downtown: [0x969794, 0x858783, 0xa39580, 0x747d7d],
  suburb: [0x9c907d, 0x918573, 0x85867d, 0xa09889],
};

function districtAt(i, j, n) {
  const edge = Math.ceil(n * 0.25);
  if (i < edge && j < edge) return 'airport';
  if (i >= n - edge && j < edge) return 'base';
  if (i < edge && j >= n - edge) return 'desert';
  if (i >= n - edge && j >= n - edge) return 'village';
  const raceStart = Math.floor(n * 0.68), raceEnd = Math.floor(n * 0.92);
  if (i >= raceStart && i < raceEnd && j >= Math.floor(n * 0.32) && j < Math.floor(n * 0.68)) return 'race';
  const mid = (n - 1) / 2;
  const radius = Math.hypot(i - mid, j - mid);
  if (radius <= n * 0.18) return 'tech';
  if (i < 2 || j < 2 || i >= n - 2 || j >= n - 2) return 'suburb';
  return 'downtown';
}

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
      g.addColorStop(0, '#c5c0b3'); g.addColorStop(0.5, '#788080'); g.addColorStop(1, '#434a49');
      c.fillStyle = g; c.fillRect(px + m, py + m, cw - 2 * m, cw - 2 * m - 6);
      c.fillStyle = 'rgba(223,215,195,0.2)';
      c.fillRect(px + m + 2, py + m + 2, cw - 2 * m - 4, 2);
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.beginPath(); c.moveTo(px + m, py + m); c.lineTo(px + m + 15, py + m); c.lineTo(px + m, py + m + 22); c.fill();
      if (rng() < 0.34) {
        c.fillStyle = `rgba(55,43,35,${0.12 + rng() * 0.18})`;
        c.fillRect(px + m - 3, py + m + 20 + rng() * 10, 3 + rng() * 5, 12 + rng() * 32);
      }
      if (rng() < 0.16) {
        c.strokeStyle = 'rgba(35,33,31,0.72)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(px + cw * (0.45 + rng() * 0.25), py + m + 18);
        c.lineTo(px + cw * (0.4 + rng() * 0.3), py + m + 27);
        c.lineTo(px + cw * (0.5 + rng() * 0.2), py + m + 34);
        c.stroke();
      }
      c.fillStyle = '#e7e9ec'; c.fillRect(px + m - 2, py + cw - m - 6, cw - 2 * m + 4, 4);
      if (rng() < 0.12) {
        l.fillStyle = rng() < 0.82 ? '#c5a47c' : '#89979a';
        l.fillRect(px + m, py + m, cw - 2 * m, cw - 2 * m - 6);
      }
    }
  }
  return { map: makeTex(col, aniso), emissive: makeTex(lit, aniso) };
}

function makeAsphalt(rng, aniso, repeat) {
  const S = 256, cv = makeCanvas(S, S), c = cv.getContext('2d');
  c.fillStyle = '#49483f'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 7000; i++) {
    const v = 50 + Math.floor(rng() * 42);
    c.fillStyle = `rgba(${v},${v - 3},${v - 8},0.5)`;
    c.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let i = 0; i < 28; i++) {
    const x = rng() * S, y = rng() * S, length = 8 + rng() * 42;
    c.strokeStyle = `rgba(20,20,18,${0.28 + rng() * 0.3})`;
    c.lineWidth = 1 + rng() * 1.5;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rng() - 0.5) * 7, y + length * 0.48);
    c.lineTo(x + (rng() - 0.5) * 14, y + length);
    c.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = rng() * S, y = rng() * S;
    c.fillStyle = `rgba(18,24,22,${0.1 + rng() * 0.14})`;
    c.beginPath();
    c.ellipse(x, y, 3 + rng() * 12, 2 + rng() * 7, rng() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  const t = makeTex(cv, aniso); t.repeat.set(repeat, repeat); return t;
}

function makeSidewalk(aniso) {
  const S = 128, cv = makeCanvas(S, S), c = cv.getContext('2d');
  c.fillStyle = '#9b9b96'; c.fillRect(0, 0, S, S);
  const tile = S / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const px = x * tile, py = y * tile;
      c.fillStyle = `rgba(255,255,255,${0.025 + ((x * 7 + y * 3) % 4) * 0.012})`;
      c.fillRect(px + 1, py + 1, tile - 2, tile - 2);
      c.strokeStyle = 'rgba(50,50,48,0.42)'; c.lineWidth = 2;
      c.strokeRect(px + 1, py + 1, tile - 2, tile - 2);
    }
  }
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
    this.n = mobile ? CFG.blocks : CFG.blocks + 2; this.bs = CFG.blockSize; this.rw = CFG.roadWidth;
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

  districtAtPosition(x, z) {
    const i = Math.max(0, Math.min(this.n - 1, Math.floor((x + this.half) / this.bs)));
    const j = Math.max(0, Math.min(this.n - 1, Math.floor((z + this.half) / this.bs)));
    return DISTRICTS[this.blocks[i][j].district] ?? DISTRICTS.downtown;
  }

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
      new THREE.MeshStandardMaterial({ map: makeAsphalt(rng, aniso, P / 10), roughness: 0.76, metalness: 0.05 })
    );
    asphalt.receiveShadow = true;
    this.group.add(asphalt);

    // --- buildings, sidewalks, parks ---
    const facade = makeFacade(rng, aniso);
    this.wallMat = new THREE.MeshStandardMaterial({
      map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: 0.68, metalness: 0.1,
    });
    const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const walkMat = new THREE.MeshStandardMaterial({ map: makeSidewalk(aniso), roughness: 0.95 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x59613b, roughness: 1 });

    const walls = [], roofs = [], slabs = [], grass = [], paths = [], rooftopUnits = [], parkBenches = [];
    const facadeBands = [], cornerPilasters = [];
    const districtGround = Object.fromEntries(Object.keys(DISTRICTS).map((name) => [name, []]));
    const cacti = [], rocks = [];
    const trunks = [], crowns = [], weeds = [], debris = [];
    const roofCol = new THREE.Color(0x3a3d42);
    const curb = CFG.curbHeight;
    const maxD = Math.hypot(this.blockCenter(0), this.blockCenter(0));

    for (let i = 0; i < n; i++) {
      this.blocks[i] = [];
      for (let j = 0; j < n; j++) {
        const cx = this.blockCenter(i), cz = this.blockCenter(j);
        const district = districtAt(i, j, n);
        const centre = district === 'tech' || district === 'downtown';
        const park = !centre && !['airport', 'base', 'desert', 'race'].includes(district) && rng() < 0.11;
        const techTower = district === 'tech' && i === Math.floor(n / 2) - 1 && j === Math.floor(n / 2) - 1;
        const bl = { cx, cz, park, district, techTower, b: [] };
        this.blocks[i][j] = bl;

        if (park) {
          for (let t = 0; t < 22; t++) {
            weeds.push({
              x: cx + (rng() - 0.5) * (lot - 7), y: curb + 0.08,
              z: cz + (rng() - 0.5) * (lot - 7), s: 0.35 + rng() * 0.75, ry: rng() * Math.PI,
            });
          }
        }

        if (park) grass.push(slab(lot, curb, lot, cx, curb / 2, cz, lot / 6));
        else if (['airport', 'base', 'desert', 'race'].includes(district)) {
          districtGround[district].push({ x: cx, y: curb / 2, z: cz, sx: lot, sy: curb, sz: lot });
        } else slabs.push(slab(lot, curb, lot, cx, curb / 2, cz, lot / 6));

        if (park) {
          paths.push(slab(lot - 8, 0.04, 2.4, cx, curb + 0.03, cz, 1));
          paths.push(slab(2.4, 0.04, lot - 8, cx, curb + 0.03, cz, 1));
          parkBenches.push({ x: cx - 7, y: curb, z: cz - 7, ry: Math.PI / 4 });
          parkBenches.push({ x: cx + 7, y: curb, z: cz + 7, ry: -3 * Math.PI / 4 });
          for (let t = 0; t < 16; t++) {
            trunks.push({ x: cx + (rng() * 2 - 1) * (lot / 2 - 3), z: cz + (rng() * 2 - 1) * (lot / 2 - 3), s: 0.8 + rng() * 0.7 });
          }
          continue;
        }

        if (district === 'airport' || district === 'base' || district === 'race' || techTower) continue;
        if (district === 'desert') {
          for (let prop = 0; prop < 4; prop++) {
            const px = cx + (rng() - 0.5) * (lot - 10), pz = cz + (rng() - 0.5) * (lot - 10);
            if (rng() < 0.65) cacti.push({ x: px, y: curb, z: pz, s: 0.75 + rng() * 1.1, ry: rng() * Math.PI * 2 });
            else rocks.push({ x: px, y: curb + 0.35, z: pz, sx: 0.8 + rng() * 1.6, sy: 0.7 + rng() * 0.8, sz: 0.8 + rng() * 1.4, ry: rng() * Math.PI * 2 });
          }
          continue;
        }

        for (let t = 0; t < 6; t++) {
          const edge = lot / 2 - 2.2, side = rng() < 0.5 ? -1 : 1;
          const along = (rng() - 0.5) * (lot - 8);
          const onSidewalk = rng() < 0.5;
          weeds.push({
            x: cx + (onSidewalk ? along : side * edge), y: curb + 0.05,
            z: cz + (onSidewalk ? side * edge : along), s: 0.22 + rng() * 0.56, ry: rng() * Math.PI,
          });
          if (rng() < 0.55) {
            debris.push({
              x: cx + (rng() - 0.5) * (lot - 8), y: curb + 0.08,
              z: cz + (rng() - 0.5) * (lot - 8), sx: 0.12 + rng() * 0.28,
              sy: 0.08 + rng() * 0.12, sz: 0.16 + rng() * 0.32, ry: rng() * Math.PI,
            });
          }
        }

        const sub = lot / 2;
        const dist = Math.hypot(cx, cz) / (maxD * 1.05);
        const maxH = district === 'tech' ? 112 : district === 'downtown' ? 76 : district === 'village' ? 17 : district === 'suburb' ? 30 : 40;
        const plotCount = district === 'village' ? 1 : 4;
        for (let plot = 0; plot < plotCount; plot++) {
            const a = plotCount === 1 ? 0.5 : Math.floor(plot / 2);
            const b = plotCount === 1 ? 0.5 : plot % 2;
            const scale = district === 'village' ? 0.72 : district === 'suburb' ? 0.82 : 1;
            const w = 17 * scale * (0.78 + rng() * 0.22), d = 17 * scale * (0.78 + rng() * 0.22);
            const bx = cx + (a - 0.5) * sub + (rng() - 0.5) * 1.2;
            const bz = cz + (b - 0.5) * sub + (rng() - 0.5) * 1.2;
            const minH = district === 'village' ? 5 : 9;
            const heightVariation = district === 'village' ? rng() : Math.pow(rng(), district === 'tech' ? 0.9 : 1.4);
            const h = minH + (maxH - minH) * heightVariation;
            const palette = DISTRICT_PALETTES[district];
            const tint = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
            const uOff = rng();
            walls.push(wallBox(w, h, d, bx, curb, bz, tint, uOff));
            roofs.push(roofPlane(w, d, bx, curb + h, bz, roofCol));
            for (let level = 1; level < h; level += 5.5) {
              const y = curb + level;
              const band = { y, x: bx, z: bz, sx: w + 0.08, sy: 0.045, sz: 0.08 };
              facadeBands.push({ ...band, z: bz + d / 2 + 0.018 });
              facadeBands.push({ ...band, z: bz - d / 2 - 0.018 });
              facadeBands.push({ ...band, x: bx + w / 2 + 0.018, sx: d + 0.08, sz: 0.08, ry: Math.PI / 2 });
              facadeBands.push({ ...band, x: bx - w / 2 - 0.018, sx: d + 0.08, sz: 0.08, ry: Math.PI / 2 });
            }
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
              cornerPilasters.push({
                x: bx + sx * (w / 2 - 0.08), y: curb + h / 2,
                z: bz + sz * (d / 2 - 0.08), sx: 0.12, sy: h, sz: 0.12,
              });
            }
            let roofY = curb + h;
            if (h > 40 && rng() < 0.55) {
              const h2 = h * 0.28, w2 = w * 0.66, d2 = d * 0.66;
              walls.push(wallBox(w2, h2, d2, bx, curb + h, bz, tint, rng()));
              roofs.push(roofPlane(w2, d2, bx, curb + h + h2, bz, roofCol));
              roofY += h2;
            }
            if (rng() < 0.7) {
              const unitW = 1.2 + rng() * 1.1, unitD = 1.2 + rng() * 1.1, unitH = 0.45 + rng() * 0.4;
              rooftopUnits.push({
                x: bx + (rng() - 0.5) * (w - unitW - 1),
                y: roofY + unitH / 2,
                z: bz + (rng() - 0.5) * (d - unitD - 1),
                sx: unitW, sy: unitH, sz: unitD,
              });
            }
            bl.b.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h: curb + h });
        }
      }
    }

    for (const [district, items] of Object.entries(districtGround)) {
      if (!items.length) continue;
      const mesh = instanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: DISTRICTS[district].color, roughness: 0.96 }),
        items,
      );
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    const wallMesh = new THREE.Mesh(mergeGeometries(walls, false), this.wallMat);
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs, false), roofMat);
    roofMesh.receiveShadow = true;
    const walkMesh = new THREE.Mesh(mergeGeometries(slabs, false), walkMat);
    walkMesh.receiveShadow = true;
    this.group.add(wallMesh, roofMesh, walkMesh);
    if (facadeBands.length) {
      const bandMat = new THREE.MeshStandardMaterial({
        color: 0x838b91, roughness: 0.78, metalness: 0.08,
      });
      const bandMesh = instanced(new THREE.BoxGeometry(1, 1, 1), bandMat, facadeBands);
      bandMesh.receiveShadow = true;
      this.group.add(bandMesh);
    }
    if (cornerPilasters.length) {
      const pilasterMat = new THREE.MeshStandardMaterial({
        color: 0x768087, roughness: 0.82, metalness: 0.06,
      });
      const pilasterMesh = instanced(new THREE.BoxGeometry(1, 1, 1), pilasterMat, cornerPilasters);
      this.group.add(pilasterMesh);
    }
    if (paths.length) {
      const pathMesh = new THREE.Mesh(mergeGeometries(paths, false), walkMat);
      pathMesh.receiveShadow = true;
      this.group.add(pathMesh);
    }
    if (parkBenches.length) {
      const benchGeo = mergeGeometries([
        new THREE.BoxGeometry(1.8, 0.14, 0.5).translate(0, 0.58, 0),
        new THREE.BoxGeometry(1.8, 0.14, 0.12).translate(0, 0.95, -0.19),
        new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(-0.65, 0.28, 0),
        new THREE.BoxGeometry(0.12, 0.55, 0.12).translate(0.65, 0.28, 0),
      ], false);
      const benchMesh = instanced(benchGeo, new THREE.MeshStandardMaterial({
        color: 0x79583c, roughness: 0.82,
      }), parkBenches);
      benchMesh.castShadow = true;
      benchMesh.receiveShadow = true;
      this.group.add(benchMesh);
    }
    if (rooftopUnits.length) {
      const unitMat = new THREE.MeshStandardMaterial({ color: 0x72777b, roughness: 0.82, metalness: 0.18 });
      const unitMesh = instanced(new THREE.BoxGeometry(1, 1, 1), unitMat, rooftopUnits);
      unitMesh.castShadow = true; unitMesh.receiveShadow = true;
      this.group.add(unitMesh);
    }
    if (grass.length) {
      const gm = new THREE.Mesh(mergeGeometries(grass, false), grassMat);
      gm.receiveShadow = true; this.group.add(gm);
    }
    if (weeds.length) {
      const weedGeometry = mergeGeometries([
        new THREE.ConeGeometry(0.13, 0.9, 4).translate(0, 0.45, 0),
        new THREE.ConeGeometry(0.1, 0.62, 4).rotateZ(0.55).translate(0.17, 0.3, 0),
        new THREE.ConeGeometry(0.1, 0.58, 4).rotateZ(-0.55).translate(-0.16, 0.28, 0),
      ], false);
      const weedMesh = instanced(weedGeometry, new THREE.MeshStandardMaterial({
        color: 0x66704b, roughness: 1, flatShading: true,
      }), weeds.map((w) => ({ x: w.x, y: w.y, z: w.z, sx: w.s, sy: w.s, sz: w.s, ry: w.ry })));
      weedMesh.castShadow = true;
      this.group.add(weedMesh);
    }
    if (debris.length) {
      const debrisMesh = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({
        color: 0x62594b, roughness: 1, flatShading: true,
      }), debris);
      debrisMesh.castShadow = true;
      this.group.add(debrisMesh);
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
    const crownGeo = new THREE.IcosahedronGeometry(1.35, 1);
    const trunkMesh = instanced(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }),
      trunks.map((t) => ({ x: t.x, y: curb, z: t.z, sx: t.s, sy: t.s, sz: t.s })));
    const canopyItems = [];
    for (const t of trunks) {
      for (const [ox, oy, oz, scale] of [[0, 3.8, 0, 1], [-0.8, 3.45, 0, 0.62], [0.7, 3.5, 0.5, 0.65], [0.05, 3.4, -0.8, 0.62]]) {
        canopyItems.push({
          x: t.x + ox * t.s, y: curb + oy * t.s, z: t.z + oz * t.s,
          sx: t.s * scale, sy: t.s * scale, sz: t.s * scale, ry: rng() * 6,
        });
      }
    }
    const crownMesh = instanced(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, flatShading: true }), canopyItems);
    const gc = new THREE.Color();
    canopyItems.forEach((_, k) => { gc.setHSL(0.24 + rng() * 0.07, 0.45, 0.2 + rng() * 0.12); crownMesh.setColorAt(k, gc); });
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
    this._buildLandmarks();
    this.landmarkCounts = { airport: 1, defenceBase: 1, raceCircuit: 1, flyover: 1, footbridge: 1, techTower: 1, cacti: cacti.length };

    if (cacti.length) {
      const cactusMat = new THREE.MeshStandardMaterial({ color: 0x668044, roughness: 0.92 });
      const cactusGeo = mergeGeometries([
        new THREE.CylinderGeometry(0.22, 0.3, 1.8, 7).translate(0, 0.9, 0),
        new THREE.CylinderGeometry(0.13, 0.17, 0.8, 7).translate(-0.32, 1.05, 0),
        new THREE.CylinderGeometry(0.13, 0.17, 0.8, 7).translate(0.32, 1.3, 0),
        new THREE.CylinderGeometry(0.14, 0.14, 0.62, 7).translate(-0.43, 1.38, 0),
        new THREE.CylinderGeometry(0.14, 0.14, 0.62, 7).translate(0.43, 1.62, 0),
      ], false);
      const cactusMesh = instanced(cactusGeo, cactusMat, cacti.map((p) => ({
        x: p.x, y: p.y, z: p.z, sx: p.s, sy: p.s, sz: p.s, ry: p.ry,
      })));
      cactusMesh.castShadow = true;
      this.group.add(cactusMesh);
    }
    if (rocks.length) {
      const rockGeo = new THREE.IcosahedronGeometry(1, 1);
      const rockMesh = instanced(rockGeo, new THREE.MeshStandardMaterial({
        color: 0x76604b, roughness: 1, flatShading: true,
      }), rocks);
      rockMesh.castShadow = true;
      this.group.add(rockMesh);
    }
  }

  _buildLandmarks() {
    const { n, bs, curb } = this;
    const box = (w, h, d, x, y, z, mat, parent = this.group) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const airportMat = new THREE.MeshStandardMaterial({ color: 0x555b60, roughness: 0.92 });
    const runwayMat = new THREE.MeshStandardMaterial({ color: 0x303438, roughness: 0.9 });
    const markingMat = new THREE.MeshStandardMaterial({ color: 0xe7e8df, roughness: 0.82 });
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x777c80, roughness: 0.76, metalness: 0.24 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7faeb8, roughness: 0.22, metalness: 0.16, clearcoat: 0.85,
    });
    const techIndex = Math.floor(n / 2) - 1;
    const techX = this.blockCenter(techIndex), techZ = this.blockCenter(techIndex);
    const techBase = new THREE.Mesh(new THREE.BoxGeometry(35, 2, 35), bridgeMat);
    techBase.position.set(techX, 1, techZ);
    this.group.add(techBase);
    const techTower = new THREE.Mesh(new THREE.CylinderGeometry(8, 16, 76, 6), glassMat);
    techTower.position.set(techX, 40, techZ);
    techTower.castShadow = true;
    this.group.add(techTower);
    const techCrown = new THREE.Mesh(new THREE.CylinderGeometry(4, 8, 20, 6), airportMat);
    techCrown.position.set(techX, 88, techZ);
    this.group.add(techCrown);
    const techSpire = new THREE.Mesh(new THREE.ConeGeometry(2, 20, 8), markingMat);
    techSpire.position.set(techX, 108, techZ);
    this.group.add(techSpire);
    this.blocks[techIndex][techIndex].b.push({
      x0: techX - 18, x1: techX + 18, z0: techZ - 18, z1: techZ + 18, h: 120,
    });
    const airportMid = Math.ceil(n * 0.25) / 2 - 0.5;
    const ax = this.blockCenter(airportMid), az = this.blockCenter(airportMid);
    const runway = new THREE.Mesh(new THREE.BoxGeometry(bs * 2.45, 0.08, 12), runwayMat);
    runway.position.set(ax, 0.08, az - 23);
    runway.receiveShadow = true;
    this.group.add(runway);
    box(42, 7, 12, ax, 3.6, az + 22, glassMat);
    box(22, 4, 18, ax - 31, 2.1, az + 22, airportMat);
    box(22, 4, 18, ax + 31, 2.1, az + 22, airportMat);
    const runwayMarks = [];
    for (let k = -5; k <= 5; k++) runwayMarks.push({ x: ax + k * 6, y: 0.14, z: az - 23, sx: 0.45, sy: 0.03, sz: 3.4 });
    for (const end of [-1, 1]) {
      for (let k = -3; k <= 3; k++) {
        runwayMarks.push({ x: ax + k * 0.9, y: 0.14, z: az - 23 + end * 67, sx: 0.42, sy: 0.03, sz: 5 });
      }
    }
    this.group.add(instanced(new THREE.BoxGeometry(1, 1, 1), markingMat, runwayMarks));
    const tower = new THREE.Group();
    box(5, 17, 5, ax + 26, 8.6, az + 14, airportMat, tower);
    box(8, 3, 8, ax + 26, 18.1, az + 14, glassMat, tower);
    box(9, 0.35, 9, ax + 26, 19.8, az + 14, markingMat, tower);
    this.group.add(tower);

    const edge = Math.ceil(n * 0.25);
    const baseCenterIndex = n - edge / 2 - 0.5;
    const bx = this.blockCenter(baseCenterIndex), bz = this.blockCenter(edge / 2 - 0.5);
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x777b73, roughness: 0.82, metalness: 0.28 });
    const fenceItems = [];
    const halfFence = bs * (edge - 0.5);
    for (let s = -halfFence; s <= halfFence; s += 6) {
      for (const side of [-1, 1]) {
        fenceItems.push({ x: bx + s, y: 1.5, z: bz + side * halfFence, sx: 0.09, sy: 3, sz: 0.09 });
        fenceItems.push({ x: bx + side * halfFence, y: 1.5, z: bz + s, sx: 0.09, sy: 3, sz: 0.09 });
      }
    }
    const fencePost = instanced(new THREE.BoxGeometry(1, 1, 1), fenceMat, fenceItems);
    const fenceRailItems = [
      { x: bx, y: 0.55, z: bz - halfFence, sx: halfFence * 2, sy: 0.09, sz: 0.09 },
      { x: bx, y: 2.35, z: bz - halfFence, sx: halfFence * 2, sy: 0.09, sz: 0.09 },
      { x: bx, y: 0.55, z: bz + halfFence, sx: halfFence * 2, sy: 0.09, sz: 0.09 },
      { x: bx, y: 2.35, z: bz + halfFence, sx: halfFence * 2, sy: 0.09, sz: 0.09 },
      { x: bx - halfFence, y: 0.55, z: bz, sx: 0.09, sy: 0.09, sz: halfFence * 2 },
      { x: bx - halfFence, y: 2.35, z: bz, sx: 0.09, sy: 0.09, sz: halfFence * 2 },
      { x: bx + halfFence, y: 0.55, z: bz, sx: 0.09, sy: 0.09, sz: halfFence * 2 },
      { x: bx + halfFence, y: 2.35, z: bz, sx: 0.09, sy: 0.09, sz: halfFence * 2 },
    ];
    box(30, 9, 18, bx, 4.65, bz, airportMat);
    box(12, 12, 12, bx + 24, 6.15, bz - 20, fenceMat);
    this.group.add(fencePost, instanced(new THREE.BoxGeometry(1, 1, 1), fenceMat, fenceRailItems));

    const raceI = Math.floor(n * 0.8), raceJ = Math.floor(n * 0.5);
    const rx = this.blockCenter(raceI), rz = this.blockCenter(raceJ);
    const trackShape = new THREE.Shape();
    trackShape.absellipse(0, 0, bs * 0.83, bs * 0.48, 0, Math.PI * 2, false, 0);
    const trackHole = new THREE.Path();
    trackHole.absellipse(0, 0, bs * 0.69, bs * 0.34, 0, Math.PI * 2, true, 0);
    trackShape.holes.push(trackHole);
    const track = new THREE.Mesh(new THREE.ShapeGeometry(trackShape, 48), runwayMat);
    track.rotation.x = -Math.PI / 2;
    track.position.set(rx, 0.08, rz);
    track.receiveShadow = true;
    this.group.add(track);
    const trackLine = new THREE.Mesh(new THREE.TorusGeometry(bs * 0.5, 0.12, 6, 80, Math.PI), markingMat);
    trackLine.rotation.x = Math.PI / 2;
    trackLine.position.set(rx, 0.16, rz);
    this.group.add(trackLine);
    for (const side of [-1, 1]) {
      box(9, 1.2, 0.7, rx + side * bs * 0.83, 1.2, rz, markingMat);
    }

    const waterCenterIndex = n - edge / 2 - 0.5;
    const vx = this.blockCenter(waterCenterIndex), vz = this.blockCenter(waterCenterIndex);
    const villageMat = new THREE.MeshStandardMaterial({ color: 0x9d7952, roughness: 0.88 });
    const towerLegs = [];
    for (let sx of [-1, 1]) for (let sz of [-1, 1]) {
      towerLegs.push({ x: vx + sx * 2, y: 4, z: vz + sz * 2, sx: 0.18, sy: 8, sz: 0.18 });
    }
    this.group.add(instanced(new THREE.CylinderGeometry(0.1, 0.15, 8, 8).translate(0, 4, 0), villageMat, towerLegs));
    const waterTank = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 3.5, 12), villageMat);
    waterTank.position.set(vx, 8.4, vz);
    this.group.add(waterTank);

    const flyoverX = bs, flyoverZ = 0, deckY = 6;
    box(9, 0.8, 72, flyoverX, deckY, flyoverZ, bridgeMat);
    const rampGeo = new THREE.BoxGeometry(9, 0.6, 42);
    const rampA = new THREE.Mesh(rampGeo, bridgeMat);
    rampA.position.set(flyoverX, 3.15, flyoverZ - 57);
    rampA.rotation.x = -Math.atan2(deckY, 42);
    this.group.add(rampA);
    const rampB = new THREE.Mesh(rampGeo, bridgeMat);
    rampB.position.set(flyoverX, 3.15, flyoverZ + 57);
    rampB.rotation.x = Math.atan2(deckY, 42);
    this.group.add(rampB);
    const pierItems = [];
    for (const z of [-29, -12, 12, 29]) for (const x of [-3.5, 3.5]) {
      pierItems.push({ x: flyoverX + x, y: 2.8, z: flyoverZ + z, sx: 0.6, sy: 5.6, sz: 0.8 });
    }
    this.group.add(instanced(new THREE.BoxGeometry(1, 1, 1), bridgeMat, pierItems));
    box(2.4, 0.35, 19, bs * 2, 4, bs, bridgeMat);
    const stairItems = [];
    for (let k = 0; k < 7; k++) {
      const height = 0.45 + k * 0.48;
      for (const side of [-1, 1]) {
        stairItems.push({ x: bs * 2, y: height / 2, z: bs + side * (9.5 + k * 1.3), sx: 2.5, sy: height, sz: 1.3 });
      }
    }
    this.group.add(instanced(new THREE.BoxGeometry(1, 1, 1), bridgeMat, stairItems));
  }
}
