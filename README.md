# Propeller Engine

A WebGPU-based 3D scene editor built with Three.js, TypeScript, and Vite.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite in a WebGPU-capable browser.

## Scene tools

Use **Shapes** in Scene Explorer to add models, or choose **Insert → World Skybox** to add a six-sided scene background. Select the skybox to set a color or upload an image for each side; use **Remove image** to clear a side's image while keeping its color. **Feature → FXlighting** contains the scene light tools; the sun includes a soft glow control.

Drag one model onto another in Scene Explorer to parent it. Child blocks move with their parent but remain individually editable. Right-click a parent to group nested blocks or combine its child blocks into one model. A parent with children also gets an **Apply to all blocks** option in Chromatics. With an object selected, **Ctrl+C** clones it without changing the system clipboard; **Ctrl+V** remains the normal paste shortcut.

## Build

```sh
npm run build
```

The Electron desktop wrapper can be started with `npm run desktop`.

On Windows, `npm run package:win` creates an installer (with Start menu and desktop shortcuts) and a portable executable in `release/`. The browser build is the `dist/` folder; serve it over HTTP with `npm run preview` rather than opening `index.html` directly.