# Propeller Engine

Propeller Engine is a WebGPU-based scene editor built with Three.js, TypeScript, and Vite.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite in a WebGPU-capable browser.

## Scene tools

Use **Shapes** in Scene Explorer to add models, or choose **Insert → World Skybox** to add a sky background. Set its shape to a cube or sphere. Cube skyboxes have editable width, height, and depth, and can use separate face images or one image applied to all six sides. You can also import a PNG, JPEG, WebP, or AVIF 4×3 cross atlas in the reference or standard cubemap layout. Sphere skyboxes accept one image. Image previews appear beside the image controls; removing an image restores the previous face color. Color controls are hidden while an image is assigned. Skyboxes are configured with these controls rather than transform gizmos. **Feature → FXlighting** contains the scene light tools; the sun includes a soft glow control.

Drag one model onto another in Scene Explorer to parent it. Child blocks move with their parent but remain individually editable. Right-click a parent to group nested blocks or combine its child blocks into one model. A parent with children also gets an **Apply to all blocks** option in Chromatics. With an object selected, **Ctrl+C** clones it without changing the system clipboard; **Ctrl+V** remains the normal paste shortcut.

## Build

```sh
npm run build
```

The Electron desktop wrapper can be started with `npm run desktop`.

On Windows, `npm run package:win` creates an installer (with Start menu and desktop shortcuts) and a portable executable in `release/`. The browser build is the `dist/` folder; serve it over HTTP with `npm run preview` rather than opening `index.html` directly.