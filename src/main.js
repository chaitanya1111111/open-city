import * as THREE from 'three';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AudioSys } from './audio.js';

const canvas = document.getElementById('c');
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const params = new URLSearchParams(location.search);
const mobile = touch || params.get('q') === 'low';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 4000);

const game = new Game(scene, camera, { mobile });
const input = new Input(canvas, touch);
const ui = new UI(game, touch);
const audio = new AudioSys();
if (touch) document.body.classList.add('touch');
window.__game = game; // handy for debugging in the browser console

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

document.getElementById('play').addEventListener('click', () => {
  document.body.classList.add('playing');
  audio.start();
  if (!touch) canvas.requestPointerLock?.();
});
document.getElementById('loading').remove();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  input.poll();
  if (document.body.classList.contains('playing')) {
    game.update(dt, input);
    audio.update(!!game.car, game.car ? game.car.speed : 0, input.moveY);
    if (game.crash > 0) audio.crash(game.crash);
  }
  input.endFrame();
  renderer.toneMappingExposure = game.env.exposure;
  renderer.render(scene, camera);
  ui.update(dt);
}
requestAnimationFrame(frame);
