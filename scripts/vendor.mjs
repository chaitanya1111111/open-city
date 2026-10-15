// Re-copies the three.js files into /libs (run: npm install && npm run vendor)
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('libs/addons/utils', { recursive: true });
mkdirSync('libs/addons/objects', { recursive: true });
cpSync('node_modules/three/build/three.module.js', 'libs/three.module.js');
cpSync('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'libs/addons/utils/BufferGeometryUtils.js');
cpSync('node_modules/three/examples/jsm/objects/Sky.js', 'libs/addons/objects/Sky.js');
console.log('three.js copied to /libs');
