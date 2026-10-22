# Propeller Engine

Propeller Engine is a WebGPU-based scene editor built with Three.js, TypeScript, and Vite.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite in a WebGPU-capable browser.

Hold the left mouse button and drag to orbit the scene. Hold the middle mouse button and drag a box to select multiple blocks; use the Move, Rotate, or Scale tool to transform them together, and use Configurations to change their shared Model and Chromatics settings. Press **`** to toggle free camera; hold the right mouse button to look around. **W/S** move forward and backward in the direction you are looking, **A/D** strafe, and **Space/C** move vertically. The camera keeps its position when free camera is turned off.

## Scene tools

Use **Shapes** in Scene Explorer to add models, or choose **Insert → World Skybox** to add a sky background. **Insert → FX Lighting** adds scene lights and includes a **Sun Rays** toggle. The sun marker, glow, and rays are depth-tested, so scene geometry occludes them rather than letting them show through objects. Set a skybox to a cube or sphere. Cube skyboxes have editable width, height, and depth, and can use separate face images or one image applied to all six sides. You can also import a PNG, JPEG, WebP, or AVIF 4×3 cross atlas in the reference or standard cubemap layout. Sphere skyboxes accept one image. Image previews appear beside the image controls; removing an image restores the previous face color. Color controls are hidden while an image is assigned. Skyboxes are configured with these controls rather than transform gizmos. Newly added lights start at brightness 2, focused spot/point beams cast shadows by default, and their direction arrows track the aimed beam. The sun has a size control for its visible marker and glow. **View → Preferences** opens a movable, resizable settings window with Rendering, Configurations, and UHD UI-color options. Mlight is the current real-time rasterized lighting mode; RTX/path tracing is unavailable in the current renderer. Preferences remember window placement, UI colors, and automatic Model/Chromatics expansion settings. The top-bar **Sculpting** button is reserved for a future tool.

Drag one model onto another in Scene Explorer to parent it. Child blocks move with their parent but remain individually editable. Right-click a parent to group nested blocks or combine its child blocks into one model. A parent with children also gets an **Apply to all blocks** option in Chromatics. With an object selected, **Ctrl+C** clones it without changing the system clipboard; **Ctrl+V** remains the normal paste shortcut.

## Build

```sh
npm run build
```

The Electron desktop wrapper can be started with `npm run desktop`.

On Windows, `npm run package:win` creates an installer (with Start menu and desktop shortcuts) and a portable executable in `release/`. The browser build is the `dist/` folder; serve it over HTTP with `npm run preview` rather than opening `index.html` directly.