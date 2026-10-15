# Open City

A GTA-style open-world city game that runs in the **browser** (desktop + phone). Built with plain JavaScript and [Three.js](https://threejs.org) - no game engine install needed.

**What's in it:** procedurally generated 8x8-block city (~500 m), third-person character, drivable cars (enter any car, even traffic), AI traffic that follows lanes and turns at junctions, day/night cycle with street lights and lit windows, minimap, cash-marker missions, touch controls for phones.

## Run it on your computer (VS Code)

1. Install [VS Code](https://code.visualstudio.com) and [Git](https://git-scm.com/downloads).
2. Open this folder in VS Code (File > Open Folder).
3. Install the recommended extension **Live Server** (VS Code will suggest it).
4. Right-click `index.html` > **Open with Live Server**. The game opens at http://localhost:5500.
   - Do not double-click `index.html`: browsers block ES modules from `file://`.
   - No VS Code? Run `python -m http.server 5500` in this folder and open http://localhost:5500.

## Put it on GitHub and publish it free

1. Create an empty repository on github.com (name it `open-city`, no README).
2. In the VS Code terminal:
   ```bash
   git init
   git add .
   git commit -m "First playable open-world city"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/open-city.git
   git push -u origin main
   ```
3. On GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
4. The workflow in `.github/workflows/pages.yml` deploys automatically. After ~1 minute your game is live at
   `https://YOUR-USERNAME.github.io/open-city/` - open that link on your phone and play.

## Controls

| Desktop | Phone |
|---|---|
| WASD move / drive, mouse look | Left thumb joystick, right-side drag to look |
| Shift run, Space jump / handbrake | RUN, JUMP/BRAKE buttons |
| F enter / leave car | ENTER button |

Add `?q=low` to the URL for a lighter graphics mode.

## Project map

```
index.html        page, HUD, touch buttons
src/config.js     world size, traffic count, day length  <- start tweaking here
src/city.js       procedural city: buildings, roads, trees, lamps, collision
src/vehicle.js    car model + driving physics
src/traffic.js    AI traffic
src/player.js     character
src/sky.js        sun, moon, stars, fog, day/night
src/game.js       the game loop logic (no DOM, testable)
src/input.js      keyboard / mouse / touch
src/ui.js         HUD + minimap
libs/             three.js (copied locally so the game works offline)
tests/smoke.mjs   headless test:  npm install && npm test
```

## Make the map bigger

Edit `blocks` in `src/config.js` (8 -> 12 gives ~720 m). Lower `trafficCount` if it gets slow.

## Roadmap (what to build next)

1. **Real art:** replace boxes with free glTF models (Kenney, Quaternius, Sketchfab CC0) using Three's `GLTFLoader`. Biggest visual upgrade.
2. **Pedestrians:** walk NavMesh/waypoints along sidewalks.
3. **Better physics:** add Rapier (`@dimforge/rapier3d-compat`) for crashes and ragdolls.
4. **Post-processing:** bloom, SSAO, motion blur via `EffectComposer`.
5. **Missions and story:** timed deliveries, police chase, save game (`localStorage`).
6. **Terrain, water, bridges, interiors**, then streaming chunks for a huge map.
7. **Native app:** wrap with Capacitor to publish on Play Store / App Store.

## Honest limits

This runs in a browser, so it will not match GTA V graphics. The path to "more realistic" is real 3D assets, PBR textures, baked lighting and post-processing, then eventually Unity/Unreal for AAA-level visuals.

MIT licensed.
