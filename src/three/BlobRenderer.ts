import * as THREE from 'three';
import { BLOB_FRAG, POST_FRAG, QUAD_VERT } from './shaders';
import type { Traits } from './traits';

const NUMERIC_KEYS = [
  'len', 'width', 'taper', 'haunch', 'rocker', 'upsweep', 'deck', 'nose', 'tailDrop',
  'cabH', 'cabZ', 'cabFront', 'cabRear', 'round', 'tumble', 'bedDrop', 'blunt', 'boxy', 'boxyFront',
  'wheelR', 'wheelW', 'track', 'wheelbase', 'rake',
  'cloud', 'turb', 'sharp', 'glitch', 'quant', 'pulse', 'pulseRate', 'fluid',
  'gloss', 'soft', 'smoke', 'battThick',
  'camDist', 'camY', 'bound',
  'cylPerBank', 'banks', 'battery', 'engineSize', 'engineZ', 'driveF', 'driveR',
  'slices', 'wire', 'sweep', 'polish', 'shake', 'dropout', 'fault', 'vel', 'blur',
] as const;

const COLOR_KEYS = ['colorA', 'colorB', 'colorW', 'colorE'] as const;

/**
 * The floor the adaptive resolution is allowed to sink to. A phone GPU needs
 * more headroom than a laptop one, and a soft volume survives being coarse far
 * better than it survives running at 20fps.
 */
const qualityFloor = () => (window.innerWidth < 900 ? 0.26 : 0.40);
const qualityCeil = () => (window.innerWidth < 900 ? 0.70 : 0.85);

/** Where the blob sits on screen, per phase, in ray-space units. */
export interface View { shiftX: number; shiftY: number; zoom: number; }

/** `bodyLen` -> `uBodyLen`. */
const uname = (k: string) => 'u' + k[0].toUpperCase() + k.slice(1);

/** Keys the post pass owns; everything else numeric goes to the raymarch pass. */
const POST_KEYS = new Set(['glitch', 'quant', 'blur', 'soft']);

/** `polish` drives grain in both passes. */
const SHARED_KEYS = new Set(['polish']);

/**
 * Speed eases between bands rather than snapping. It can only do that
 * without the streaks jumping because the scroll runs off an accumulated
 * phase (`uFlow`) instead of `time * rate` — the rate can change whenever it
 * likes and the pattern stays where it was.
 */
const SPEED_EASE = 1.6;

/**
 * The silhouette line, in canvas pixels either side of the edge. Not a trait:
 * it is there so the shape reads at all, so nothing in the quiz moves it.
 */
const OUTLINE_PX = 1.2;
const OUTLINE_STRENGTH = 0.8;

export class BlobRenderer {
  private renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private blobScene = new THREE.Scene();
  private postScene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blobU: Record<string, THREE.IUniform>;
  private postU: Record<string, THREE.IUniform>;
  private clock = new THREE.Clock();
  private raf = 0;
  private boxObserver: ResizeObserver | null = null;
  private current: Traits;
  private wanted: Traits;
  private orbit = { yaw: 0.72, pitch: 0.22 };
  private drag: { x: number; y: number } | null = null;
  private idleSpin = true;
  private quality = 0.6;
  private flow = 0;
  private fpsFrames = 0;
  private fpsAcc = 0;
  private view: View = { shiftX: 0, shiftY: 0, zoom: 1 };
  private viewWanted: View = { shiftX: 0, shiftY: 0, zoom: 1 };

  constructor(private canvas: HTMLCanvasElement, initial: Traits) {
    // Colours get mutated in place every frame, so never alias the caller's.
    this.current = {
      ...initial,
      colorA: [...initial.colorA],
      colorB: [...initial.colorB],
      colorW: [...initial.colorW],
      colorE: [...initial.colorE],
    };
    this.wanted = initial;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: true, premultipliedAlpha: true,
    });
        // The march is fill-rate bound, so resolution costs more than anything
    // else in here. Device pixel ratio above 1 buys nothing on a volume this
    // soft, and the post pass still runs at full canvas resolution.
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    });

    this.blobU = {
      uRes: { value: new THREE.Vector2(2, 2) },
      uTime: { value: 0 },
      uOrbit: { value: new THREE.Vector2(this.orbit.yaw, this.orbit.pitch) },
      uShift: { value: new THREE.Vector2(0, 0) },
      uZoom: { value: 1 },
      uFlow: { value: 0 },
      uColorA: { value: new THREE.Color(...initial.colorA) },
      uColorB: { value: new THREE.Color(...initial.colorB) },
      uColorW: { value: new THREE.Color(...initial.colorW) },
      uColorE: { value: new THREE.Color(...initial.colorE) },
      uOutline: { value: OUTLINE_STRENGTH },
      uOutlineW: { value: OUTLINE_PX },
    };
    this.postU = {
      uScene: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(2, 2) },
      uTime: { value: 0 },
    };
    for (const k of NUMERIC_KEYS) {
      if (!POST_KEYS.has(k)) this.blobU[uname(k)] = { value: initial[k] };
      if (POST_KEYS.has(k) || SHARED_KEYS.has(k)) this.postU[uname(k)] = { value: initial[k] };
    }

    const quad = new THREE.PlaneGeometry(2, 2);
    this.blobScene.add(new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BLOB_FRAG, uniforms: this.blobU,
      depthTest: false, depthWrite: false, transparent: true,
    })));
    this.postScene.add(new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: POST_FRAG, uniforms: this.postU,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })));

    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);

    window.addEventListener('resize', this.resize);
    // A breakpoint crossing, a phone's collapsing URL bar or a pane being
    // dragged all change the stage box without necessarily firing a window
    // resize. Watch the box itself.
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      this.boxObserver = new ResizeObserver(() => this.resize());
      this.boxObserver.observe(canvas.parentElement);
    }
    this.resize();
  }

  setTraits(t: Traits) {
    this.wanted = t;
  }

  /**
   * The canvas is full-bleed and never changes shape; the blob is moved around
   * inside it instead, so switching screens cannot resize or squash it.
   */
  setView(v: View) {
    this.viewWanted = v;
  }

  /** 0.5 (soft, fast) .. 1 (crisp, heavy). */
  setQuality(q: number) {
    this.quality = q;
    this.resize();
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.boxObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.target.dispose();
    this.renderer.dispose();
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY };
    this.idleSpin = false;
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    this.orbit.yaw -= (e.clientX - this.drag.x) * 0.006;
    this.orbit.pitch = Math.max(-0.45, Math.min(0.85, this.orbit.pitch + (e.clientY - this.drag.y) * 0.004));
    this.drag = { x: e.clientX, y: e.clientY };
  };

  private onUp = () => {
    this.drag = null;
  };

  private resize = () => {
    // Measured from the element the canvas actually sits in. It used to be
    // derived from the viewport minus hard-coded header and footer heights,
    // which meant every responsive tweak to the chrome silently stretched the
    // render. The stage box is laid out by CSS; this just reads it back.
    const box = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(1, Math.round(box?.width || window.innerWidth));
    const h = Math.max(1, Math.round(box?.height || window.innerHeight));
    // updateStyle false: the stylesheet already sizes the canvas to fill the
    // stage box. Letting three.js write inline pixel widths here made the
    // canvas size the layout that the canvas was measured from, which is a
    // loop, and at some widths it ran away and burst the grid.
    this.renderer.setSize(w, h, false);

    const dpr = this.renderer.getPixelRatio();
    const rw = Math.max(2, Math.floor(w * dpr * this.quality));
    const rh = Math.max(2, Math.floor(h * dpr * this.quality));
    this.target.setSize(rw, rh);
    (this.blobU.uRes.value as THREE.Vector2).set(rw, rh);
    (this.postU.uRes.value as THREE.Vector2).set(w * dpr, h * dpr);
    // The march runs at reduced resolution, so a line measured in its pixels
    // would get thicker every time quality dropped. Convert to its scale.
    this.blobU.uOutlineW.value = OUTLINE_PX * this.quality;
  }

  /**
   * The march is fill-rate bound, so internal resolution is the one knob that
   * reliably buys frames. Rather than pick a compromise that is too soft on a
   * fast machine and too slow on a weak one, find the resolution that holds a
   * smooth frame rate and sit there.
   */
  private autoQuality(dt: number) {
    this.fpsFrames++;
    this.fpsAcc += dt;
    if (this.fpsAcc < 1.0) return;

    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsFrames = 0;
    this.fpsAcc = 0;

    const lo = qualityFloor();
    const hi = qualityCeil();
    if (fps < 45 && this.quality > lo) this.setQuality(Math.max(lo, this.quality - 0.08));
    else if (fps > 58 && this.quality < hi) this.setQuality(Math.min(hi, this.quality + 0.05));
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.autoQuality(dt);

    // Exponential smoothing — this is what makes the shape pour instead of snap.
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key of NUMERIC_KEYS) {
      this.current[key] += (this.wanted[key] - this.current[key]) * k;
      const name = uname(key);
      if (!POST_KEYS.has(key)) this.blobU[name].value = this.current[key];
      if (POST_KEYS.has(key) || SHARED_KEYS.has(key)) this.postU[name].value = this.current[key];
    }

    const vk = 1 - Math.exp(-dt * 2.6);
    this.view.shiftX += (this.viewWanted.shiftX - this.view.shiftX) * vk;
    this.view.shiftY += (this.viewWanted.shiftY - this.view.shiftY) * vk;
    this.view.zoom += (this.viewWanted.zoom - this.view.zoom) * vk;
    (this.blobU.uShift.value as THREE.Vector2).set(this.view.shiftX, this.view.shiftY);
    this.blobU.uZoom.value = this.view.zoom;

    for (const key of COLOR_KEYS) {
      const c = this.current[key];
      const w = this.wanted[key];
      for (let i = 0; i < 3; i++) c[i] += (w[i] - c[i]) * k;
      (this.blobU[uname(key)].value as THREE.Color).setRGB(c[0], c[1], c[2]);
    }

    if (this.idleSpin && !this.drag) this.orbit.yaw += dt * 0.12;
    (this.blobU.uOrbit.value as THREE.Vector2).set(this.orbit.yaw, this.orbit.pitch);
    // Ease the speed, then integrate it. Changing bands alters how fast the
    // phase advances; it never moves the phase itself.
    const sk = 1 - Math.exp(-dt * SPEED_EASE);
    this.current.vel += (this.wanted.vel - this.current.vel) * sk;
    this.flow += dt * this.current.vel;
    this.blobU.uVel.value = this.current.vel;
    this.blobU.uFlow.value = this.flow;

    this.blobU.uTime.value = t;
    this.postU.uTime.value = t;

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.blobScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.camera);
  }
}
