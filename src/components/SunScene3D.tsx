'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { HorizonPoint, SunPos, horizonAt, sunVector } from '@/lib/solar';

const R = 10; // sky-dome radius in scene units
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SceneProps {
  sun: SunPos;
  path: SunPos[]; // selected date
  summer: SunPos[];
  winter: SunPos[];
  hourMarks: { hour: number; pos: SunPos }[];
  tilt: number;
  azimuth: number;
  horizon: HorizonPoint[];
  shaded: boolean;
  panels: number;
  dirs: string[]; // compass point names N, NE, E … NW
  hourLabel: (h: number) => string;
  /** Live compass heading from the phone (° from north), read every frame without re-rendering. */
  headingRef: React.RefObject<number | null>;
  follow: boolean;
  roseRef?: React.RefObject<HTMLDivElement | null>;
  /** Zoom factor (1 = default), changed by the zoom buttons and pinch / wheel gestures. */
  zoomRef: React.RefObject<number>;
}

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 4;

/** Eases camera.zoom toward the requested zoom. Works in both orbit and compass mode. */
function ZoomSync({ zoomRef }: { zoomRef: React.RefObject<number> }) {
  useFrame(({ camera }, dt) => {
    const target = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current ?? 1));
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.zoom - target) < 0.001) return;
    cam.zoom += (target - cam.zoom) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
  });
  return null;
}

const domePoint = (p: SunPos, r = R) => {
  const [x, y, z] = sunVector(p);
  return new THREE.Vector3(x * r, y * r, z * r);
};

/** Text label drawn to a canvas texture, always facing the camera. */
function Label({ text, position, color = '#e2e8f0', size = 0.55 }: { text: string; position: [number, number, number] | THREE.Vector3; color?: string; size?: number }) {
  // Redraw once web fonts (the Khmer face) have finished loading.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontsReady(true));
    return () => { live = false; };
  }, []);
  const { texture, aspect } = useMemo(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const khmer = getComputedStyle(document.documentElement).getPropertyValue('--font-khmer').trim();
    const font = `bold 64px system-ui, ${khmer ? `${khmer}, ` : ''}'Khmer UI', sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 24;
    c.width = w;
    c.height = 88;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(2,6,23,0.85)';
    ctx.strokeText(text, w / 2, 46);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, 46);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { texture: t, aspect: w / 88 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, color, fontsReady]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[size * aspect, size, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function Arc({ points, color, width = 2 }: { points: SunPos[]; color: string; width?: number }) {
  const segs = useMemo(() => {
    // Split into continuous above-horizon segments.
    const out: THREE.Vector3[][] = [];
    let cur: THREE.Vector3[] = [];
    for (const p of points) {
      if (p.elevation > -0.5) cur.push(domePoint({ ...p, elevation: Math.max(0, p.elevation) }));
      else if (cur.length) { out.push(cur); cur = []; }
    }
    if (cur.length) out.push(cur);
    return out.filter((s) => s.length > 1);
  }, [points]);
  return (
    <>
      {segs.map((s, i) => (
        <Line key={i} points={s} color={color} lineWidth={width} />
      ))}
    </>
  );
}

function AltitudeRing({ el }: { el: number }) {
  const pts = useMemo(() => {
    const r = R * Math.cos(rad(el));
    const y = R * Math.sin(rad(el));
    return Array.from({ length: 73 }, (_, i) => new THREE.Vector3(r * Math.sin(rad(i * 5)), y, -r * Math.cos(rad(i * 5))));
  }, [el]);
  return <Line points={pts} color="#334155" lineWidth={1} dashed dashSize={0.3} gapSize={0.25} />;
}

function Compass({ dirs }: { dirs: string[] }) {
  const ticks = useMemo(() => {
    const segs: THREE.Vector3[] = [];
    for (let a = 0; a < 360; a += 15) {
      const len = a % 90 === 0 ? 1 : a % 45 === 0 ? 0.6 : 0.3;
      const s = Math.sin(rad(a));
      const c = -Math.cos(rad(a));
      segs.push(new THREE.Vector3(s * R, 0.02, c * R), new THREE.Vector3(s * (R - len), 0.02, c * (R - len)));
    }
    return segs;
  }, []);
  const ring = useMemo(
    () => Array.from({ length: 121 }, (_, i) => new THREE.Vector3(R * Math.sin(rad(i * 3)), 0.02, -R * Math.cos(rad(i * 3)))),
    [],
  );
  const labels = dirs.map((name, i) => ({ name, a: i * 45, cardinal: i % 2 === 0 }));
  return (
    <group>
      <Line points={ring} color="#64748b" lineWidth={1.5} />
      <Line points={ticks} segments color="#64748b" lineWidth={1.5} />
      {labels.map(({ name, a, cardinal }) => (
        <Label key={a} text={name} position={[Math.sin(rad(a)) * (R + 1.1), 0.4, -Math.cos(rad(a)) * (R + 1.1)]}
          color={a === 0 ? '#f87171' : cardinal ? '#e2e8f0' : '#94a3b8'} size={cardinal ? 0.8 : 0.45} />
      ))}
    </group>
  );
}

/** Surveyed obstacles drawn as a translucent band on the sky dome, from the horizon up to the surveyed height. */
function Skyline({ horizon }: { horizon: HorizonPoint[] }) {
  const geom = useMemo(() => {
    if (!horizon.length) return null;
    const pos: number[] = [];
    const idx: number[] = [];
    const step = 2;
    for (let a = 0, i = 0; a <= 360; a += step, i++) {
      const h = horizonAt(horizon, a);
      const lo = domePoint({ azimuth: a, elevation: 0 });
      const hi = domePoint({ azimuth: a, elevation: h });
      pos.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z);
      if (a > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [horizon]);
  if (!geom) return null;
  return (
    <group>
      <mesh geometry={geom}>
        <meshBasicMaterial color="#475569" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {horizon.map((p, i) => (
        <mesh key={i} position={domePoint({ azimuth: p.az, elevation: p.el })}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#f87171" />
        </mesh>
      ))}
    </group>
  );
}

const MODULE_W = 1.7; // across (landscape), m
const MODULE_D = 1.05; // up the slope, m
const MAX_DRAWN = 60;
const MAX_WIDTH = 12; // larger arrays are scaled down to stay inside the dome

/** The module array on a ground mount, tilted and turned to the chosen orientation. */
const PANEL_DAY = new THREE.Color('#1e3a8a');
const PANEL_NIGHT = new THREE.Color('#ffffff');

/** night: 0 = daylight (blue cells), 1 = night (white, so the array stands out in the dark). */
function PanelArray({ tilt, azimuth, count, night }: { tilt: number; azimuth: number; count: number; night: number }) {
  const cellColor = useMemo(() => PANEL_DAY.clone().lerp(PANEL_NIGHT, night), [night]);
  const n = Math.max(1, Math.min(MAX_DRAWN, count || 1));
  const rows = n <= 5 ? 1 : n <= 16 ? 2 : n <= 36 ? 3 : 4;
  const cols = Math.ceil(n / rows);
  const W = cols * MODULE_W;
  const D = rows * MODULE_D;
  const scale = Math.min(1, MAX_WIDTH / W);
  const t = rad(tilt);
  const lowEdge = 0.5;
  const centerY = lowEdge + (D / 2) * Math.sin(t);
  const modules = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    modules.push(
      <mesh key={i} position={[(c - (cols - 1) / 2) * MODULE_W, 0.031, ((rows - 1) / 2 - r) * MODULE_D]} castShadow>
        <boxGeometry args={[MODULE_W - 0.05, 0.01, MODULE_D - 0.05]} />
        <meshStandardMaterial color={cellColor} metalness={0.6 * (1 - night)} roughness={0.25 + 0.5 * night} emissive={cellColor} emissiveIntensity={0.35 * night} />
      </mesh>,
    );
  }
  const posts = Math.max(2, Math.ceil(W / 3) + 1);
  return (
    <group rotation={[0, rad(180 - azimuth), 0]} scale={scale}>
      <group position={[0, centerY, 0]} rotation={[t, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[W, 0.05, D]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
        </mesh>
        {modules}
      </group>
      {/* posts: front (low) and back (high) */}
      {Array.from({ length: posts }, (_, k) => -W / 2 + 0.2 + (k * (W - 0.4)) / (posts - 1)).map((x) =>
        [
          { z: (D / 2) * Math.cos(t), h: lowEdge },
          { z: -(D / 2) * Math.cos(t), h: lowEdge + D * Math.sin(t) },
        ].map((p, i) => (
          <mesh key={`${x}-${i}`} position={[x, p.h / 2, p.z]} castShadow>
            <boxGeometry args={[0.06, p.h, 0.06]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        )),
      )}
      {/* arrow on the ground showing which way the panels face */}
      <mesh position={[0, 0.03, D / 2 + 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.25, 0.6, 3]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}

function Sun({ sun, shaded }: { sun: SunPos; shaded: boolean }) {
  const up = sun.elevation > 0;
  const p = domePoint(sun);
  const light = domePoint(sun, 20);
  const day = Math.max(0, Math.min(1, sun.elevation / 20));
  return (
    <>
      <color attach="background" args={[new THREE.Color('#020617').lerp(new THREE.Color('#0c4a6e'), day)]} />
      {/* Enough light at night that the panels stay visible. */}
      <hemisphereLight args={['#bae6fd', '#334155', 0.7 + 0.2 * day]} />
      <ambientLight intensity={0.45 - 0.25 * day} />
      {up && (
        <directionalLight
          position={light}
          intensity={shaded ? 0.6 : 2.4 * (0.3 + 0.7 * day)}
          color={sun.elevation < 8 ? '#fdba74' : '#fff7e6'}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-camera-near={1}
          shadow-camera-far={45}
          shadow-bias={-0.0005}
        />
      )}
      {/* Below the horizon the sun is drawn through the ground, so it can always be found. */}
      <mesh position={p} renderOrder={up ? 0 : 10}>
        <sphereGeometry args={[0.45, 24, 24]} />
        <meshBasicMaterial color={up ? '#fbbf24' : '#f59e0b'} transparent={!up} opacity={up ? 1 : 0.55} depthTest={up} depthWrite={up} />
      </mesh>
      {!up && (
        <Billboard position={p}>
          <mesh renderOrder={11}>
            <ringGeometry args={[0.55, 0.65, 32]} />
            <meshBasicMaterial color="#fde68a" depthTest={false} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
        </Billboard>
      )}
      {up && <Line points={[new THREE.Vector3(0, 1.2, 0), p]} color="#fbbf24" lineWidth={1} transparent opacity={0.35} />}
    </>
  );
}

const cameraDistance = (aspect: number) => 22 * Math.max(1, 1.15 / aspect);

/**
 * Compass mode: the camera stands behind you and turns with the phone, so the part of the
 * sky in front of the screen is the part of the real sky the phone is pointing at.
 */
function CompassFollow({ headingRef, follow }: { headingRef: React.RefObject<number | null>; follow: boolean }) {
  const { camera, size } = useThree();
  const current = useRef<number | null>(null);
  useFrame((_, dt) => {
    if (!follow) { current.current = null; return; }
    const target = headingRef.current;
    if (target == null) return;
    if (current.current == null) current.current = target;
    const diff = ((target - current.current + 540) % 360) - 180; // shortest way round
    current.current = (current.current + diff * Math.min(1, dt * 6) + 360) % 360;

    const a = rad(current.current);
    const pitch = rad(28);
    const d = cameraDistance(size.width / size.height) * 0.9;
    // Forward (the way the phone faces) in scene space: x = east, z = south.
    const fx = Math.sin(a), fz = -Math.cos(a);
    camera.position.set(-fx * d * Math.cos(pitch), 2 + d * Math.sin(pitch), -fz * d * Math.cos(pitch));
    camera.lookAt(fx * 2, 3, fz * 2);
  });
  return null;
}

/** Keeps the on-screen compass rose pointing at true north for whatever way the camera faces. */
function RoseSync({ roseRef, headingRef, follow, dirs }: {
  roseRef?: React.RefObject<HTMLDivElement | null>; headingRef: React.RefObject<number | null>; follow: boolean; dirs: string[];
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const el = roseRef?.current;
    if (!el) return;
    camera.getWorldDirection(v);
    const facing = (deg(Math.atan2(v.x, -v.z)) + 360) % 360;
    el.style.setProperty('--rose', `${-facing}deg`);
    el.dataset.facing = String(Math.round(facing));
    // Compass mode: show the phone's own reading, to compare with any compass app.
    const out = el.querySelector<HTMLElement>('.rose-deg');
    if (out) {
      const h = follow ? headingRef.current : null;
      const text = h == null ? '' : `${Math.round(h) % 360}° ${dirs[Math.round(h / 45) % 8]}`;
      if (out.textContent !== text) out.textContent = text;
    }
  });
  return null;
}

/** Pull the camera back on narrow (portrait) canvases so the whole dome stays in view. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const dist = cameraDistance(aspect);
    const dir = new THREE.Vector3(13, 10, 15).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.lookAt(0, 2, 0);
  }, [camera, size.width, size.height]);
  return null;
}

export default function SunScene3D(props: SceneProps) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [13, 10, 15], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
      <FitCamera />
      <ZoomSync zoomRef={props.zoomRef} />
      <CompassFollow headingRef={props.headingRef} follow={props.follow} />
      <RoseSync roseRef={props.roseRef} headingRef={props.headingRef} follow={props.follow} dirs={props.dirs} />
      <Sun sun={props.sun} shaded={props.shaded} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R + 2, 96]} />
        <meshStandardMaterial color="#1f2d1f" roughness={1} />
      </mesh>

      <Compass dirs={props.dirs} />
      <AltitudeRing el={30} />
      <AltitudeRing el={60} />

      <Arc points={props.summer} color="#38bdf8" width={1.5} />
      <Arc points={props.winter} color="#a78bfa" width={1.5} />
      <Arc points={props.path} color="#f59e0b" width={3} />
      {props.hourMarks.map(({ hour, pos }) => (
        <group key={hour} position={domePoint(pos)}>
          <mesh>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
          <Label text={props.hourLabel(hour)} position={[0, 0.4, 0]} color="#fde68a" size={0.4} />
        </group>
      ))}

      <Skyline horizon={props.horizon} />
      {/* Fades from blue to white as the sun goes from 5° up to below the horizon. */}
      <PanelArray tilt={props.tilt} azimuth={props.azimuth} count={props.panels}
        night={Math.max(0, Math.min(1, (5 - props.sun.elevation) / 5))} />

      <OrbitControls enabled={!props.follow} target={[0, 2, 0]} enablePan={false} enableZoom={false} maxPolarAngle={Math.PI / 2 - 0.02} />
    </Canvas>
  );
}
