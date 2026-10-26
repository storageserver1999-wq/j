import * as THREE from 'three';

export type ViewGizmoDirection = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-' | 'reset';

const AXES: Array<{ key: ViewGizmoDirection; label: string; color: string; direction: THREE.Vector3 }> = [
  { key: 'x+', label: 'X', color: '#e0605f', direction: new THREE.Vector3(1, 0, 0) },
  { key: 'x-', label: 'X', color: '#8d4a49', direction: new THREE.Vector3(-1, 0, 0) },
  { key: 'y+', label: 'Y', color: '#78b06a', direction: new THREE.Vector3(0, 1, 0) },
  { key: 'y-', label: 'Y', color: '#4d7144', direction: new THREE.Vector3(0, -1, 0) },
  { key: 'z+', label: 'Z', color: '#5f93c8', direction: new THREE.Vector3(0, 0, 1) },
  { key: 'z-', label: 'Z', color: '#3f5f80', direction: new THREE.Vector3(0, 0, -1) },
];

interface ProjectedAxis {
  key: ViewGizmoDirection;
  label: string;
  color: string;
  x: number;
  y: number;
  /** Positive when the axis points toward the viewer. */
  facing: number;
}

/**
 * Small 3D orientation widget drawn over the viewport.
 *
 * The six world axes are projected through the live camera rotation, so the
 * widget tumbles with the view. Clicking an axis sphere snaps the camera to that
 * side of the scene; clicking the centre dot returns to the view the editor
 * started with.
 */
export class ViewGizmo {
  private readonly context: CanvasRenderingContext2D;
  private readonly inverseQuaternion = new THREE.Quaternion();
  private readonly projected: ProjectedAxis[] = [];
  private readonly radius: number;
  private readonly center: number;
  private readonly ballRadius: number;
  private hovered: ViewGizmoDirection | null = null;
  private hoveredReset = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onSelect: (direction: ViewGizmoDirection) => void,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The view gizmo needs a 2D canvas context.');
    this.context = context;

    const size = canvas.clientWidth || 104;
    const ratio = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    this.context.scale(ratio, ratio);
    this.center = size / 2;
    this.radius = size * 0.34;
    this.ballRadius = size * 0.11;

    AXES.forEach(() => this.projected.push({ key: 'x+', label: '', color: '', x: 0, y: 0, facing: 0 }));

    canvas.addEventListener('pointermove', (event) => this.updateHover(event));
    canvas.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.hoveredReset = false;
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.updateHover(event);
      this.onSelect(this.hoveredReset ? 'reset' : this.hovered ?? 'reset');
      event.preventDefault();
    });
  }

  /** Redraws the widget for the current camera orientation. */
  update(): void {
    const { context } = this;
    const ratio = this.canvas.width / (this.canvas.clientWidth || 104);
    context.save();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.center * 2, this.center * 2);
    this.inverseQuaternion.copy(this.camera.quaternion).invert();

    AXES.forEach((axis, index) => {
      this.projected[index].key = axis.key;
      this.projected[index].label = axis.label;
      this.projected[index].color = axis.color;
      const view = axis.direction.clone().applyQuaternion(this.inverseQuaternion);
      this.projected[index].x = this.center + view.x * this.radius;
      this.projected[index].y = this.center - view.y * this.radius;
      // The camera looks down its own -Z, so -view.z points at the viewer.
      this.projected[index].facing = -view.z;
    });

    const ordered = [...this.projected].sort((a, b) => a.facing - b.facing);
    for (const axis of ordered) {
      const depth = THREE.MathUtils.clamp((axis.facing + 1) / 2, 0, 1);
      context.strokeStyle = axis.color;
      context.globalAlpha = 0.25 + depth * 0.65;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(this.center, this.center);
      context.lineTo(axis.x, axis.y);
      context.stroke();
    }

    for (const axis of ordered) {
      const depth = THREE.MathUtils.clamp((axis.facing + 1) / 2, 0, 1);
      const active = this.hovered === axis.key;
      const radius = this.ballRadius * (0.72 + depth * 0.4) * (active ? 1.2 : 1);
      context.globalAlpha = 0.55 + depth * 0.45;
      context.beginPath();
      context.arc(axis.x, axis.y, radius, 0, Math.PI * 2);
      if (axis.facing > 0.86) {
        // Pointing at the viewer: hollow ring, like most 3D view widgets.
        context.lineWidth = 2;
        context.strokeStyle = axis.color;
        context.stroke();
      } else {
        context.fillStyle = axis.color;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        context.stroke();
      }
      context.globalAlpha = Math.min(1, 0.35 + depth);
      context.fillStyle = '#0c0f11';
      context.font = `600 ${Math.round(this.ballRadius * 1.05)}px "Segoe UI", system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(axis.label, axis.x, axis.y + 0.5);
    }

    // Centre dot: click to return to the starting view.
    context.globalAlpha = this.hoveredReset ? 1 : 0.7;
    context.beginPath();
    context.arc(this.center, this.center, this.hoveredReset ? 5 : 3.5, 0, Math.PI * 2);
    context.fillStyle = this.hoveredReset ? '#f0bc62' : '#d9dde0';
    context.fill();
    context.globalAlpha = 1;
    context.restore();
  }

  private updateHover(event: PointerEvent): void {
    const bounds = this.canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    this.hoveredReset = Math.hypot(x - this.center, y - this.center) < this.ballRadius * 0.9;
    this.hovered = null;
    if (this.hoveredReset) return;
    let best = this.ballRadius * 1.35;
    for (const axis of this.projected) {
      const distance = Math.hypot(x - axis.x, y - axis.y);
      if (distance > best) continue;
      best = distance;
      this.hovered = axis.key;
    }
  }
}
