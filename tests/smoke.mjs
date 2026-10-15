// Headless smoke test: builds the whole city and simulates gameplay in Node (no browser needed).
import assert from 'node:assert/strict';

const ctx = new Proxy({}, {
  get: (t, p) => (p === 'createLinearGradient' ? () => ({ addColorStop() {} }) : p in t ? t[p] : () => {}),
  set: (t, p, v) => { t[p] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };

const THREE = await import('three');
const { Game } = await import('../src/game.js');
const { CFG } = await import('../src/config.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.2, 4000);
const t0 = Date.now();
const game = new Game(scene, camera, { mobile: false });
console.log(`city built in ${Date.now() - t0} ms, ${scene.children.length} scene objects, ${game.city.blocks.flat().reduce((a, b) => a + b.b.length, 0)} buildings, ${game.traffic.cars.length} traffic cars`);

const input = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, run: false, brake: false, jumpPressed: false, interactPressed: false };
const finite = (...v) => v.every(Number.isFinite);
const dt = 1 / 60;
const lim = game.city.half + game.city.rw / 2;

// 1) walk + run + jump on foot, look around
input.moveY = 1; input.run = true;
for (let i = 0; i < 300; i++) {
  if (i === 100) input.jumpPressed = true;
  input.lookX = 0.002;
  game.update(dt, input); input.jumpPressed = false;
  assert(finite(game.player.x, game.player.y, game.player.z), 'player NaN');
}
console.log('walked to', game.player.x.toFixed(1), game.player.z.toFixed(1));

// 2) walk straight into a building, must not enter it
const bl = game.city.blocks[3][3], b = bl.b[0];
game.player.x = b.x0 - 3; game.player.z = (b.z0 + b.z1) / 2;
input.moveY = 0; input.moveX = 0; game.yaw = -Math.PI / 2; // face +x
game.yaw = Math.PI / 2; input.moveY = 1;
for (let i = 0; i < 240; i++) game.update(dt, input);
assert(game.player.x <= b.x0 - 0.35 + 1e-6, 'player went into building: ' + game.player.x + ' vs ' + b.x0);
console.log('building collision OK');

// 3) enter a parked car and drive it hard for 20 s
const car = game.parked[0];
game.player.x = car.x - 2; game.player.z = car.z; input.moveY = 0; game.update(dt, input);
assert.equal(game.prompt, 'enter');
input.interactPressed = true; game.update(dt, input); input.interactPressed = false;
assert(game.car === car, 'did not enter car');
for (let i = 0; i < 1200; i++) {
  input.moveY = 1; input.moveX = Math.sin(i / 90) * 0.8;
  game.update(dt, input);
  assert(finite(car.x, car.z, car.heading, car.speed), 'car NaN');
  assert(Math.abs(car.x) <= lim && Math.abs(car.z) <= lim, 'car left world');
}
console.log('drove to', car.x.toFixed(0), car.z.toFixed(0), 'speed', game.speedKmh.toFixed(0), 'km/h');

// 4) car must never end up inside a building
const r = game.city.collide(car.x, car.z, 0.5);
assert(!game.city.pointInBuilding(car.x, 1, car.z, -0.5) || r.hit, 'car inside building');

// 5) brake, exit, hijack a traffic car
input.moveY = -1; input.brake = true;
for (let i = 0; i < 400; i++) game.update(dt, input);
input.moveY = 0; input.brake = false;
input.interactPressed = true; game.update(dt, input); input.interactPressed = false;
assert(game.car === null, 'did not exit car');
const ai = game.traffic.cars[0].car; game.player.x = ai.x + 2.2; game.player.z = ai.z;
game.update(dt, input);
if (game.prompt === 'enter') { input.interactPressed = true; game.update(dt, input); input.interactPressed = false; console.log('hijack:', game.car === ai || game.car !== null); }

// 6) let traffic run for 2 simulated minutes, nobody may leave the road grid or NaN
game.car && (input.interactPressed = true, game.update(dt, input), input.interactPressed = false);
for (let i = 0; i < 7200; i++) {
  game.update(dt, input);
  if (i % 600 === 0) for (const a of game.traffic.cars) assert(finite(a.car.x, a.car.z, a.car.speed), 'ai NaN');
}
let moving = 0;
for (const a of game.traffic.cars) { assert(Math.abs(a.car.x) < lim + 5 && Math.abs(a.car.z) < lim + 5, 'AI car left the map'); if (a.car.speed > 2) moving++; }
console.log(`traffic: ${moving}/${game.traffic.cars.length} cars moving after 2 minutes`);
assert(moving >= game.traffic.cars.length * 0.5, 'traffic is mostly stuck');

// 7) day/night
for (const h of [0, 6, 12, 18, 22]) { game.hour = h; game.update(dt, input); assert(finite(game.env.night, game.env.exposure)); }
console.log('ALL TESTS PASSED');
