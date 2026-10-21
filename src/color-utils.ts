import * as THREE from 'three';

export function drawColorWheel(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the inline color wheel.');
  const image = context.createImageData(canvas.width, canvas.height);
  const center = (canvas.width - 1) / 2;
  const radius = center;
  const color = new THREE.Color();
  const channels = new THREE.Color();
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const dx = (x - center) / radius;
      const dy = (center - y) / radius;
      const saturation = Math.hypot(dx, dy);
      if (saturation > 1) continue;
      const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
      color.setHSL(hue, saturation, 0.5, THREE.SRGBColorSpace);
      color.getRGB(channels, THREE.SRGBColorSpace);
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round(channels.r * 255);
      image.data[index + 1] = Math.round(channels.g * 255);
      image.data[index + 2] = Math.round(channels.b * 255);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

export function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(h: number, s: number, v: number) {
  const sector = (h * 6) % 6;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const m = v - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (sector < 1) [red, green] = [chroma, x];
  else if (sector < 2) [red, green] = [x, chroma];
  else if (sector < 3) [green, blue] = [chroma, x];
  else if (sector < 4) [green, blue] = [x, chroma];
  else if (sector < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];
  return { r: red + m, g: green + m, b: blue + m };
}
