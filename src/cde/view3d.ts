// CDE Lab, the model view: the same town, people and strike as a tilted paper diorama in three.js.
// Loaded only when someone opens the 3D view.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildingDist, effect, inBuilding, lobe, rng, type Building, type Estimate, type Plan, type World } from './model';
import { grade, nightness, sun, type Outcome, type Walker } from './scene';

export interface Frame3D {
  world: World;
  plan: Plan;
  est: Estimate | null;
  layers: { circle: boolean; pattern: boolean; impacts: boolean; labels: boolean };
  circleR: number;
  outcome: Outcome | null;
  strike: { plan: Plan; outcome: Outcome; t: number } | null; // t: seconds since release, on the map's strike clock
  walkers: Walker[];
}

const IMPACT_AT = 2.6; // seconds from release, as in the map view

// ---------------------------------------------------------------- paper textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed = 1, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function grain(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, strength: number, fibre: string) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * strength;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = fibre;
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = r() * Math.PI;
    const l = 3 + r() * 9;
    g.globalAlpha = 0.08 + r() * 0.08;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** A wall: paper or card, one window per bay per floor. lit = the night version (windows glowing, all else black). */
function wallTex(base: string, lit: boolean, seed: number) {
  return canvasTex(
    128,
    128,
    (g, r) => {
      g.fillStyle = lit ? '#000' : base;
      g.fillRect(0, 0, 128, 128);
      if (!lit) grain(g, r, 128, 128, 14, '#6b5a45');
      // One window per bay, one floor per tile.
      for (const bx of [44]) {
        const on = r() < 0.55;
        if (lit) {
          if (!on) continue;
          g.fillStyle = r() < 0.5 ? '#ffc877' : '#ffdca0';
        } else g.fillStyle = '#3b352e';
        g.fillRect(bx, 40, 40, 44);
        if (!lit) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(bx - 3, 84, 46, 4);
          g.strokeStyle = 'rgba(255,255,255,0.25)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(bx + 20, 40);
          g.lineTo(bx + 20, 84);
          g.stroke();
        }
      }
    },
    seed,
  );
}

function roofTex(base: string, seed: number, creases: number) {
  return canvasTex(
    256,
    256,
    (g, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      // Crumple: soft facets of light and shade.
      for (let i = 0; i < creases; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,40,20,0.07)';
        g.beginPath();
        const x = r() * 256;
        const y = r() * 256;
        g.moveTo(x, y);
        for (let k = 0; k < 3; k++) g.lineTo(x + (r() - 0.5) * 140, y + (r() - 0.5) * 140);
        g.closePath();
        g.fill();
      }
      grain(g, r, 256, 256, 12, '#6b5a45');
    },
    seed,
  );
}

/** Torn tissue on a roof: an irregular sheet with ragged edges, transparent outside. */
function tissueTex(seed: number) {
  return canvasTex(
    256,
    256,
    (g, r) => {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = '#f6f3ec';
      g.beginPath();
      const n = 80;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const side = Math.floor(t * 4);
        const u = (t * 4) % 1;
        const j = 6 + r() * 16;
        const x = side === 0 ? u * 256 : side === 1 ? 256 - j : side === 2 ? (1 - u) * 256 : j;
        const y = side === 0 ? j : side === 1 ? u * 256 : side === 2 ? 256 - j : (1 - u) * 256;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      g.save();
      g.clip();
      for (let i = 0; i < 26; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(120,100,80,0.10)';
        g.beginPath();
        const x = r() * 256;
        const y = r() * 256;
        g.moveTo(x, y);
        for (let k = 0; k < 3; k++) g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 120);
        g.fill();
      }
      g.restore();
    },
    seed,
    false,
  );
}

function stripesTex(a: string, b: string, n: number) {
  return canvasTex(64, 64, (g) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * 64) / n, 0, 64 / n, 64);
    }
  });
}

/** Box with UVs in world units, so textures keep their scale on any size of building. */
function box(w: number, h: number, d: number, tileU: number, tileV: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tileU, (uv.getY(i) * dims[f][1]) / tileV);
    }
  return geo;
}

// ---------------------------------------------------------------- the model

export class Model3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  controls: OrbitControls;
  private sunLight = new THREE.DirectionalLight('#fff4e0', 2.4);
  private hemi = new THREE.HemisphereLight('#dfe7ef', '#b59a74', 1.0);
  private flash = new THREE.PointLight('#ffd9a0', 0, 160, 1.4);
  private buildings = new Map<number, THREE.Group>();
  private rubble = new THREE.Group();
  private overlay = new THREE.Group();
  private fx = new THREE.Group();
  private people: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private litMats: THREE.MeshStandardMaterial[] = [];
  private raf = 0;
  private overlayKey = '';
  private damageKey = '';
  private hourKey = -1;
  private labels = new Map<string, HTMLDivElement>();
  private puffs: { m: THREE.Mesh; v: THREE.Vector3; born: number; grow: number }[] = [];
  private scraps: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private fxKey: Outcome | null = null;
  private plane: THREE.Group;
  private bomb: THREE.Mesh;
  private last = performance.now();

  constructor(
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLDivElement,
    private world: World,
    private getFrame: () => Frame3D | null,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const s = this.scene;
    s.add(this.hemi, this.sunLight, this.sunLight.target, this.flash, this.rubble, this.overlay, this.fx);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    const sc = this.sunLight.shadow.camera;
    sc.left = -260;
    sc.right = 260;
    sc.top = 260;
    sc.bottom = -260;
    sc.near = 10;
    sc.far = 900;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.4;
    this.sunLight.target.position.set(world.w / 2, 0, world.h / 2);

    this.build();

    // People on foot: a body and a head, instanced.
    const bodyGeo = new THREE.CylinderGeometry(0.34, 0.42, 1.25, 7);
    bodyGeo.translate(0, 0.62, 0);
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    headGeo.translate(0, 1.48, 0);
    this.people = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 800);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), 800);
    for (const m of [this.people, this.heads]) {
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      s.add(m);
    }
    const ringGeo = new THREE.RingGeometry(0.9, 1.25, 20);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#c2412b' }), 400);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    s.add(this.rings);

    // The aircraft: a folded paper plane. The bomb: a small grey body.
    this.plane = paperPlane();
    this.plane.visible = false;
    s.add(this.plane);
    this.bomb = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.6, 4, 8), new THREE.MeshStandardMaterial({ color: '#77736c', roughness: 0.6 }));
    this.bomb.visible = false;
    s.add(this.bomb);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 650;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minPolarAngle = 0.12;
    this.preset('drone');

    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  preset(name: 'drone' | 'street' | 'top') {
    const t = this.world.buildings[this.world.targetId];
    const target = new THREE.Vector3(t.cx, 4, t.cy + 18);
    const off = name === 'drone' ? new THREE.Vector3(-70, 95, 175) : name === 'street' ? new THREE.Vector3(-8, 14, 120) : new THREE.Vector3(0, 330, 2);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(off);
    this.controls.update();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.labelLayer.innerHTML = '';
  }

  // ---------------------------------------------------------------- building the town

  private build() {
    const w = this.world;
    const s = this.scene;
    // Ground: the street plan painted onto one big sheet of paper.
    const px = 4; // texture pixels per metre
    const margin = 160;
    const ground = canvasTex(
      (w.w + margin * 2) * px,
      (w.h + margin * 2) * px,
      (g, r) => {
        g.scale(px, px);
        g.translate(margin, margin);
        g.fillStyle = '#b3a99d';
        g.fillRect(-margin, -margin, w.w + margin * 2, w.h + margin * 2);
        const blocks = [...w.blocks];
        // Blocks beyond the edge of the modelled town.
        for (let bx = -2; bx < 5; bx++)
          for (let by = -2; by < 4; by++) {
            const x = bx * 150 + 6;
            const y = by * 150 + (by === 1 ? 9 : 6);
            if (bx >= 0 && bx < 3 && by >= 0 && by < 2) continue;
            blocks.push({ x, y, w: 138, h: 135 });
          }
        for (const bl of blocks) {
          g.fillStyle = '#ddd2c0';
          g.fillRect(bl.x, bl.y, bl.w, bl.h);
          g.fillStyle = '#e8dfcf';
          g.fillRect(bl.x + 2.6, bl.y + 2.6, bl.w - 5.2, bl.h - 5.2);
        }
        const main = w.streets.find((st) => st.main)!;
        g.fillStyle = '#8f8781';
        g.fillRect(-margin, main.y + 1.5, w.w + margin * 2, main.h - 3);
        g.strokeStyle = '#efe8da';
        g.lineWidth = 0.4;
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(-margin, main.y + main.h / 2);
        g.lineTo(w.w + margin, main.y + main.h / 2);
        g.stroke();
        g.setTransform(1, 0, 0, 1, 0, 0);
        grain(g, r, g.canvas.width, g.canvas.height, 10, '#6b5a45');
      },
      5,
      false,
    );
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(w.w + margin * 2, w.h + margin * 2), new THREE.MeshStandardMaterial({ map: ground, roughness: 1 }));
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(w.w / 2, 0, w.h / 2);
    groundMesh.receiveShadow = true;
    s.add(groundMesh);
    // A wide paper floor beyond, fading into haze.
    const far = new THREE.Mesh(new THREE.CircleGeometry(1600, 48), new THREE.MeshStandardMaterial({ color: '#cfc3b0', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(w.w / 2, -0.05, w.h / 2);
    far.receiveShadow = true;
    s.add(far);

    // Materials.
    const mats = {
      whiteWall: new THREE.MeshStandardMaterial({ map: wallTex('#efece5', false, 1), emissiveMap: wallTex('#000', true, 1), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.95 }),
      kraftWall: new THREE.MeshStandardMaterial({ map: wallTex('#c89e69', false, 2), emissiveMap: wallTex('#000', true, 2), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.95 }),
      greyWall: new THREE.MeshStandardMaterial({ map: wallTex('#b9b3aa', false, 3), emissiveMap: wallTex('#000', true, 3), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.95 }),
      whiteRoof: new THREE.MeshStandardMaterial({ map: roofTex('#f1eee8', 4, 14), roughness: 1 }),
      kraftRoof: new THREE.MeshStandardMaterial({ map: roofTex('#c99f69', 5, 20), roughness: 1 }),
      corrugated: new THREE.MeshStandardMaterial({ map: stripesTex('#9c9a95', '#bdbbb6', 16), roughness: 0.7, metalness: 0.1 }),
      kraftCorr: new THREE.MeshStandardMaterial({ map: stripesTex('#b88b55', '#d3a76f', 16), roughness: 0.9 }),
      tissue: [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({ map: tissueTex(10 + i), transparent: true, alphaTest: 0.4, roughness: 1, side: THREE.DoubleSide })),
      tank: new THREE.MeshStandardMaterial({ color: '#8e8b85', roughness: 0.5, metalness: 0.3 }),
      tree: new THREE.MeshStandardMaterial({ color: '#7b8b45', roughness: 1, flatShading: true }),
      trunk: new THREE.MeshStandardMaterial({ color: '#7a6048', roughness: 1 }),
      warehouse: new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
      awning: [stripesTex('#b85a3c', '#efe7d6', 6), stripesTex('#4f7a8a', '#efe7d6', 6), stripesTex('#c9a44c', '#efe7d6', 6)].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide })),
    };
    this.litMats = [mats.whiteWall, mats.kraftWall, mats.greyWall];

    for (const b of w.buildings) {
      const grp = new THREE.Group();
      const r = rng(b.id * 7 + 3);
      const kraft = b.paper === 'kraft';
      const wall = kraft ? mats.kraftWall : r() < 0.2 ? mats.greyWall : mats.whiteWall;
      for (const q of b.rects) {
        if (b.kind === 'market') {
          // Stalls: posts and a striped cloth awning.
          const aw = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.h * 1.1), mats.awning[b.rects.indexOf(q) % 3]);
          aw.rotation.x = -Math.PI / 2 + 0.25;
          aw.position.set(q.x + q.w / 2, 2.4, q.y + q.h / 2);
          aw.castShadow = true;
          grp.add(aw);
          continue;
        }
        const roofMat = b.kind === 'shop' && r() < 0.5 ? (kraft ? mats.kraftCorr : mats.corrugated) : kraft ? mats.kraftRoof : mats.whiteRoof;
        const geo = box(q.w, b.h, q.h, 4, 3.2);
        const mesh = new THREE.Mesh(geo, [wall, wall, b.kind === 'warehouse' ? mats.whiteRoof : roofMat, wall, wall, wall]);
        mesh.position.set(q.x + q.w / 2, b.h / 2, q.y + q.h / 2);
        mesh.castShadow = mesh.receiveShadow = true;
        grp.add(mesh);

        if (b.kind === 'warehouse') {
          grp.add(foldedRoof(q.x, q.y, q.w, q.h, b.h, mats.warehouse));
          continue;
        }
        // Torn tissue laid over many roofs, the look of the model.
        if (!kraft || r() < 0.3) {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(q.w + 0.9, q.h + 0.9), mats.tissue[Math.floor(r() * 3)]);
          t.rotation.x = -Math.PI / 2;
          t.rotation.z = (r() - 0.5) * 0.06;
          t.position.set(q.x + q.w / 2, b.h + 0.06, q.y + q.h / 2);
          t.receiveShadow = true;
          grp.add(t);
        }
        // Parapets, sometimes crenellated.
        const para = r();
        if (para < 0.45 && q.w > 8 && q.h > 8) {
          const crenel = para < 0.2;
          const pm = kraft ? mats.kraftWall : mats.whiteWall;
          for (const [x0, z0, x1, z1] of [
            [q.x, q.y, q.x + q.w, q.y],
            [q.x, q.y + q.h, q.x + q.w, q.y + q.h],
            [q.x, q.y, q.x, q.y + q.h],
            [q.x + q.w, q.y, q.x + q.w, q.y + q.h],
          ]) {
            const len = Math.hypot(x1 - x0, z1 - z0);
            const horiz = z0 === z1;
            const pieces = crenel ? Math.floor(len / 1.4) : 1;
            for (let i = 0; i < pieces; i++) {
              if (crenel && i % 2) continue;
              const seg = crenel ? 1.4 : len;
              const pgeo = new THREE.BoxGeometry(horiz ? seg : 0.35, 0.9, horiz ? 0.35 : seg);
              const p = new THREE.Mesh(pgeo, pm);
              const u = crenel ? (i + 0.5) * 1.4 : len / 2;
              p.position.set(horiz ? x0 + u : x0, b.h + 0.45, horiz ? z0 : z0 + u);
              p.castShadow = true;
              grp.add(p);
            }
          }
        }
      }
      // Water tanks and stair boxes.
      for (const k of b.roof) {
        if (k.kind === 'tank') {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 14), mats.tank);
          tank.position.set(k.x, b.h + 1.5, k.y);
          const legs = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), mats.tank);
          legs.position.set(k.x, b.h + 0.4, k.y);
          tank.castShadow = legs.castShadow = true;
          grp.add(tank, legs);
        } else {
          const st = new THREE.Mesh(box(2.4, 2, 2, 4, 3.2), wall);
          st.position.set(k.x, b.h + 1, k.y);
          st.castShadow = true;
          grp.add(st);
        }
      }
      this.buildings.set(b.id, grp);
      s.add(grp);
    }

    // Trees: crumpled green paper on a stick.
    for (const t of w.trees) {
      const tr = rng(Math.round(t.x * 13 + t.y));
      const geo = new THREE.IcosahedronGeometry(t.r, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.85 + tr() * 0.3), pos.getY(i) * (0.85 + tr() * 0.3), pos.getZ(i) * (0.85 + tr() * 0.3));
      geo.computeVertexNormals();
      const crown = new THREE.Mesh(geo, mats.tree);
      crown.position.set(t.x, 2.2 + t.r, t.y);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.4, 6), mats.trunk);
      trunk.position.set(t.x, 1.2, t.y);
      crown.castShadow = trunk.castShadow = true;
      s.add(crown, trunk);
    }

    // The skyline beyond: rows of boxes, a minaret and a dome, fading into the haze.
    const r = rng(77);
    const farMats = [mats.whiteWall, mats.kraftWall, mats.greyWall];
    const inst: { x: number; z: number; w: number; d: number; h: number; m: number }[] = [];
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2;
      const d = 280 + r() * 700;
      const x = w.w / 2 + Math.cos(a) * d;
      const z = w.h / 2 + Math.sin(a) * d * 0.9;
      if (x > -170 && x < w.w + 170 && z > -170 && z < w.h + 170) continue;
      inst.push({ x, z, w: 10 + r() * 16, d: 10 + r() * 16, h: 5 + r() * 8, m: Math.floor(r() * 3) });
    }
    for (let m = 0; m < 3; m++) {
      const list = inst.filter((q) => q.m === m);
      const im = new THREE.InstancedMesh(box(1, 1, 1, 0.25, 0.3), farMats[m], list.length);
      const mat = new THREE.Matrix4();
      list.forEach((q, i) => {
        mat.compose(new THREE.Vector3(q.x, q.h / 2, q.z), new THREE.Quaternion(), new THREE.Vector3(q.w, q.h, q.d));
        im.setMatrixAt(i, mat);
      });
      im.castShadow = false;
      im.receiveShadow = true;
      s.add(im);
    }
    const minaret = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 46, 12), mats.kraftWall);
    shaft.position.y = 23;
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 14), mats.kraftWall);
    balcony.position.y = 38;
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 12), mats.kraftRoof);
    top.position.y = 49.5;
    minaret.add(shaft, balcony, top);
    minaret.position.set(w.w / 2 - 140, 0, -330);
    const dome = new THREE.Group();
    const base = new THREE.Mesh(box(34, 12, 34, 4, 3.2), mats.whiteWall);
    base.position.y = 6;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d9b77a', roughness: 0.6 }));
    cap.position.y = 12;
    dome.add(base, cap);
    dome.position.set(w.w / 2 + 260, 0, -300);
    s.add(minaret, dome);

    this.scene.fog = new THREE.Fog('#e6d8c0', 260, 1200);
  }

  // ---------------------------------------------------------------- per frame

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const f = this.getFrame();
    if (!f) return;
    this.controls.update();
    this.light(f.plan.hour);
    this.overlays(f);
    this.damage(f);
    this.crowd(f);
    this.strike(f, now, dt);
    this.renderer.render(this.scene, this.camera);
    this.placeLabels(f);
  }

  private light(hour: number) {
    const key = Math.round(hour * 4);
    if (key === this.hourKey) return;
    this.hourKey = key;
    const sh = sun(hour);
    const night = nightness(hour);
    const gr = grade(hour);
    // Shadows in the map fall along (dx, dy) per metre of height, so the sun sits the other way.
    const dir = new THREE.Vector3(-sh.dx, 1, -sh.dy).normalize();
    const c = this.sunLight.target.position;
    this.sunLight.position.copy(c).addScaledVector(dir, 420);
    const tint = new THREE.Color(`rgb(${gr.rgb.join(',')})`);
    this.sunLight.color.set('#fff3e0').lerp(tint, gr.s * 0.8);
    this.sunLight.intensity = sh.day ? 1.2 + 1.6 * Math.min(1, sh.elev) : 0.35;
    if (!sh.day) this.sunLight.color.set('#9fb0e0');
    this.hemi.intensity = 0.35 + 0.75 * (1 - night);
    this.hemi.color.set(night > 0.5 ? '#6f7fb0' : '#e3e8ee');
    this.hemi.groundColor.set(night > 0.5 ? '#2a2c3a' : '#b59a74');
    for (const m of this.litMats) m.emissiveIntensity = night * 1.6;
    const sky = new THREE.Color('#e9dcc6').lerp(new THREE.Color('#1f2742'), night).lerp(tint, (1 - night) * gr.s * 0.5);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.renderer.toneMappingExposure = 1.05 - night * 0.25;
  }

  private overlays(f: Frame3D) {
    const p = f.plan;
    const key = [p.weapon, p.fuze, p.heading, p.aimX.toFixed(1), p.aimY.toFixed(1), f.circleR, f.layers.circle, f.layers.pattern, f.layers.impacts, f.est?.runs, f.est?.p90, f.est?.impacts[0], !!f.outcome].join('|');
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    this.overlay.clear();
    if (f.outcome) return;
    const red = '#c2412b';
    const t = this.world.buildings[this.world.targetId];
    // The crude circle: a dashed ring drawn over everything.
    if (f.layers.circle) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(p.aimX + Math.cos(a) * f.circleR, 0.4, p.aimY + Math.sin(a) * f.circleR));
      }
      this.overlay.add(dashed(pts, '#231f1a', 3, 2.2, 0.75));
    }
    // Fragment reach and blast, on the ground.
    if (f.layers.pattern) {
      const e = effect(p, true);
      const shape = new THREE.Shape();
      for (let a = 0; a <= 90; a++) {
        const th = (a / 90) * Math.PI * 2;
        const dx = Math.sin(th);
        const dy = -Math.cos(th);
        const reach = e.frag * (0.55 + 0.45 * lobe(p.heading, dx, dy));
        if (a === 0) shape.moveTo(dx * reach, dy * reach);
        else shape.lineTo(dx * reach, dy * reach);
      }
      const rose = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      rose.rotation.x = Math.PI / 2;
      rose.position.set(p.aimX, 0.25, p.aimY);
      const blast = new THREE.Mesh(new THREE.CircleGeometry(e.blast, 40), new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.18, depthWrite: false }));
      blast.rotation.x = -Math.PI / 2;
      blast.position.set(p.aimX, t.h + 0.3, p.aimY);
      this.overlay.add(rose, blast);
      // The way in: a dashed arc down out of the sky along the heading.
      const h = (p.heading * Math.PI) / 180;
      const ux = Math.sin(h);
      const uy = -Math.cos(h);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p.aimX - ux * 320, 150, p.aimY - uy * 320), new THREE.Vector3(p.aimX - ux * 60, 60, p.aimY - uy * 60), new THREE.Vector3(p.aimX, t.h, p.aimY));
      this.overlay.add(dashed(curve.getPoints(80), '#231f1a', 4, 3, 0.55));
    }
    // Where it might land: small red marks on roofs and ground.
    if (f.layers.impacts && f.est) {
      const n = Math.min(260, f.est.impacts.length / 2);
      const geo = new THREE.CircleGeometry(0.45, 10);
      geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: 0.85 }), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const x = f.est.impacts[i * 2];
        const z = f.est.impacts[i * 2 + 1];
        const b = this.world.buildings.find((q) => inBuilding(q, x, z));
        m.makeTranslation(x, (b ? b.h : 0) + 0.12, z);
        im.setMatrixAt(i, m);
      }
      this.overlay.add(im);
      // A hand-drawn ring around the spread.
      const sigma = Math.max(3, Math.sqrt(f.est.impacts.slice(0, n * 2).reduce((s, v, i) => s + (i % 2 ? (v - p.aimY) ** 2 : (v - p.aimX) ** 2), 0) / n));
      const pts: THREE.Vector3[] = [];
      const rr = rng(3);
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2.08;
        const k = 2.1 * sigma * (1 + (rr() - 0.5) * 0.08);
        pts.push(new THREE.Vector3(p.aimX + Math.cos(a) * k * 1.15, t.h + 0.5, p.aimY + Math.sin(a) * k * 0.9));
      }
      this.overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: red, transparent: true, opacity: 0.9, depthTest: false })));
    }
  }

  /** After the strike: the damaged buildings become torn paper and broken card. */
  private damage(f: Frame3D) {
    const striking = f.strike && f.strike.t < IMPACT_AT;
    const o = striking ? null : f.outcome;
    const key = o ? `${o.ix.toFixed(2)},${o.iy.toFixed(2)}` : '';
    if (key === this.damageKey) return;
    this.damageKey = key;
    this.rubble.clear();
    for (const [id, g] of this.buildings) g.visible = !o || !o.damaged.includes(id);
    if (!o) return;
    const paper = [new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 1, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#c9a06b', roughness: 1, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#b8b1a6', roughness: 1, side: THREE.DoubleSide })];
    for (const id of o.damaged) {
      const b = this.world.buildings[id];
      const r = rng(id * 13 + 1);
      const main = b.paper === 'kraft' ? paper[1] : paper[0];
      for (const q of b.rects) {
        // Stacks of torn sheets where the floors fell.
        const sheets = Math.round((q.w * q.h) / 14);
        for (let i = 0; i < sheets; i++) {
          const w = 1.5 + r() * 5;
          const d = 1 + r() * 4;
          const sh = new THREE.Mesh(tornSheet(w, d, r), r() < 0.7 ? main : paper[2]);
          sh.position.set(q.x + r() * q.w, 0.2 + r() * Math.min(3.5, b.h * 0.35), q.y + r() * q.h);
          sh.rotation.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
          sh.castShadow = sh.receiveShadow = true;
          this.rubble.add(sh);
        }
        // What's left standing: a couple of wall stumps with ragged tops.
        for (let k = 0; k < 2; k++) {
          const along = r() < 0.5;
          const len = (along ? q.w : q.h) * (0.3 + r() * 0.5);
          const hh = b.h * (0.25 + r() * 0.45);
          const wall = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.35, hh, along ? 0.35 : len), main);
          wall.position.set(along ? q.x + len / 2 + r() * (q.w - len) : k ? q.x + q.w : q.x, hh / 2, along ? (k ? q.y + q.h : q.y) : q.y + len / 2 + r() * (q.h - len));
          wall.rotation.z = (r() - 0.5) * 0.15;
          wall.castShadow = true;
          this.rubble.add(wall);
        }
      }
    }
    // The crater.
    const crater = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: '#3a3029', transparent: true, opacity: 0.8 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(o.ix, 0.1, o.iy);
    this.rubble.add(crater);
  }

  private crowd(f: Frame3D) {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    let rings = 0;
    for (const w of f.walkers) {
      if (w.hurt) {
        if (rings < 400) {
          m.makeTranslation(w.x, 0.08, w.y);
          this.rings.setMatrixAt(rings++, m);
        }
        continue;
      }
      if (n >= 800) break;
      const bob = w.path.length ? Math.abs(Math.sin((performance.now() / 1000 + w.phase) * 9)) * 0.12 : 0;
      m.compose(new THREE.Vector3(w.x, bob, w.y), new THREE.Quaternion(), new THREE.Vector3(1.3, 1.3, 1.3));
      this.people.setMatrixAt(n, m);
      this.heads.setMatrixAt(n, m);
      this.people.setColorAt(n, c.set(w.cloth));
      this.heads.setColorAt(n, c.set(w.skin));
      n++;
    }
    this.people.count = this.heads.count = n;
    this.rings.count = rings;
    for (const im of [this.people, this.heads, this.rings]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  private strike(f: Frame3D, now: number, dt: number) {
    const s = f.strike;
    if (!s) {
      this.plane.visible = this.bomb.visible = false;
      if (this.puffs.length || this.scraps.length) this.clearFx();
      this.flash.intensity = 0;
      return;
    }
    const t = s.t;
    const o = s.outcome;
    const h = (s.plan.heading * Math.PI) / 180;
    const ux = Math.sin(h);
    const uy = -Math.cos(h);
    const pt = t / IMPACT_AT;
    // The plane crosses at height, along the heading.
    this.plane.visible = pt < 2.2;
    if (this.plane.visible) {
      const along = (pt - 0.72) * 260;
      this.plane.position.set(o.ix + ux * along, 90, o.iy + uy * along);
      this.plane.rotation.set(0, -h, 0);
    }
    // The bomb falls on a curve to the impact point.
    this.bomb.visible = pt > 0.25 && pt < 1;
    if (this.bomb.visible) {
      const k = (pt - 0.25) / 0.75;
      const along = -(1 - k) * 110;
      this.bomb.position.set(o.ix + ux * along, 88 * (1 - k * k), o.iy + uy * along);
      this.bomb.rotation.set(Math.PI / 2 - 1.2 * k, -h, 0);
    }
    if (t >= IMPACT_AT && this.fxKey !== o) {
      this.fxKey = o;
      this.clearFx();
      this.burst(s.plan, o);
    }
    const since = t - IMPACT_AT;
    this.flash.intensity = since > 0 && since < 0.6 ? 900 * (1 - since / 0.6) : 0;
    this.flash.position.set(o.ix, 8, o.iy);
    for (const p of this.puffs) {
      const age = (now - p.born) / 1000;
      if (age < 0) {
        p.m.visible = false;
        continue;
      }
      p.m.visible = true;
      p.m.position.addScaledVector(p.v, dt);
      p.v.y *= 0.985;
      const sc = 1 + p.grow * Math.sqrt(age);
      p.m.scale.setScalar(sc);
      (p.m.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.95 * (1 - age / 11));
    }
    for (const p of this.scraps) {
      if (p.m.position.y <= 0.05 && p.v.y < 0) {
        p.v.set(0, 0, 0);
        p.m.position.y = 0.05;
        continue;
      }
      p.v.y -= 30 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
    }
  }

  private burst(plan: Plan, o: Outcome) {
    const r = rng(Math.round(o.ix * 97 + o.iy));
    const e = effect(plan, true);
    const now = performance.now();
    // Smoke: crumpled tissue clouds.
    const puffs = 16 + Math.round(e.blast);
    for (let i = 0; i < puffs; i++) {
      const geo = new THREE.IcosahedronGeometry(2 + r() * 2.5, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) pos.setXYZ(k, pos.getX(k) * (0.8 + r() * 0.4), pos.getY(k) * (0.8 + r() * 0.4), pos.getZ(k) * (0.8 + r() * 0.4));
      geo.computeVertexNormals();
      const shade = 0.72 + r() * 0.26;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade * 0.98, shade * 0.95), roughness: 1, flatShading: true, transparent: true }));
      const a = r() * Math.PI * 2;
      const d = r() * e.blast * 0.7;
      m.position.set(o.ix + Math.cos(a) * d, 2 + r() * 6, o.iy + Math.sin(a) * d);
      m.castShadow = true;
      this.fx.add(m);
      this.puffs.push({ m, v: new THREE.Vector3(Math.cos(a) * 2 + 1.2, 4 + r() * 7, Math.sin(a) * 2 - 0.5), born: now + r() * 400, grow: 0.6 + r() * 0.9 });
    }
    if (o.secondary) {
      const t = this.world.buildings[this.world.targetId];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), new THREE.MeshStandardMaterial({ color: '#5a524a', roughness: 1, flatShading: true, transparent: true }));
        m.position.set(t.cx + (r() - 0.5) * 20, 4, t.cy + (r() - 0.5) * 14);
        this.fx.add(m);
        this.puffs.push({ m, v: new THREE.Vector3(0, 6 + r() * 6, 0), born: now + 700 + r() * 900, grow: 1.2 });
      }
    }
    // Scraps of paper and card, thrown mostly the way the bomb was travelling.
    const cols = ['#f3f1ec', '#c99f69', '#8f8781', '#e7ddcc'];
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2;
      const g = lobe(plan.heading, Math.sin(a), -Math.cos(a));
      const v = (6 + r() * 20) * (0.5 + g) * (plan.fuze === 'delay' ? 0.55 : 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + r() * 1.4, 0.4 + r()), new THREE.MeshStandardMaterial({ color: cols[Math.floor(r() * cols.length)], side: THREE.DoubleSide, roughness: 1 }));
      m.position.set(o.ix, 3, o.iy);
      m.castShadow = true;
      this.fx.add(m);
      this.scraps.push({ m, v: new THREE.Vector3(Math.sin(a) * v, 8 + r() * 16, -Math.cos(a) * v), spin: new THREE.Vector3(r() * 8, r() * 8, 0) });
    }
  }

  private clearFx() {
    for (const c of this.fx.children) (c as THREE.Mesh).geometry.dispose();
    this.fx.clear();
    this.puffs = [];
    this.scraps = [];
  }

  // ---------------------------------------------------------------- labels

  private placeLabels(f: Frame3D) {
    const want = new Map<string, { x: number; y: number; z: number; text: string; tone?: string }>();
    if (f.layers.labels)
      for (const b of this.world.buildings) if (b.label) want.set(`b${b.id}`, { x: b.cx, y: b.h + 9, z: b.cy, text: b.label });
    const o = f.outcome;
    if (o && (!f.strike || f.strike.t > IMPACT_AT + 0.8)) {
      // Who was hurt, building by building, like the explainer's counts.
      const t = this.world.buildings[this.world.targetId];
      const hit = Object.entries(o.hurtSlots).map(([id, s]) => [this.world.buildings[+id], s.length] as [Building, number]);
      hit.sort((a, b) => b[1] - a[1]);
      for (const [b, n] of hit.slice(0, 6)) {
        const where = b === t ? 'inside' : buildingDist(b, t.cx, t.cy) < 30 ? 'next door' : b.label ? `in the ${b.label.toLowerCase()}` : 'nearby';
        want.set(`h${b.id}`, { x: b.cx, y: b.h * 0.4 + 6, z: b.cy, text: `${n} ${where}`, tone: 'hurt' });
      }
      if (o.hurtWalkers.length) want.set('street', { x: o.ix, y: 3, z: o.iy + 22, text: `${o.hurtWalkers.length} in the street`, tone: 'hurt' });
    }
    if (f.layers.impacts && f.est && !o) {
      const t = this.world.buildings[this.world.targetId];
      want.set('land', { x: f.plan.aimX + 16, y: t.h + 4, z: f.plan.aimY - 4, text: 'Where it might land', tone: 'soft' });
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const [k, el] of this.labels)
      if (!want.has(k)) {
        el.remove();
        this.labels.delete(k);
      }
    for (const [k, l] of want) {
      let el = this.labels.get(k);
      if (!el) {
        el = document.createElement('div');
        el.className = `cde3-label ${l.tone ?? ''}`;
        this.labelLayer.appendChild(el);
        this.labels.set(k, el);
      }
      if (el.textContent !== l.text) el.textContent = l.text;
      v.set(l.x, l.y, l.z).project(this.camera);
      const behind = v.z > 1;
      el.style.display = behind ? 'none' : '';
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }
}

// ---------------------------------------------------------------- pieces

function dashed(pts: THREE.Vector3[], color: string, dash: number, gap: number, opacity: number) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, transparent: true, opacity, depthTest: false }));
  line.computeLineDistances();
  line.renderOrder = 10;
  return line;
}

/** The warehouse roof: white paper folded like an accordion. */
function foldedRoof(x: number, z: number, w: number, d: number, h: number, mat: THREE.Material) {
  const strip = 2.4;
  const pos: number[] = [];
  for (let sx = x; sx < x + w - 0.01; sx += strip) {
    const x1 = Math.min(x + w, sx + strip);
    const xm = (sx + x1) / 2;
    const top = h + 1.1;
    // Two sloped faces per fold.
    pos.push(sx, h, z, xm, top, z, xm, top, z + d, sx, h, z, xm, top, z + d, sx, h, z + d);
    pos.push(xm, top, z, x1, h, z, x1, h, z + d, xm, top, z, x1, h, z + d, xm, top, z + d);
    // Zigzag ends.
    pos.push(sx, h, z, x1, h, z, xm, top, z, sx, h, z + d, xm, top, z + d, x1, h, z + d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A torn sheet: a thin slab with a ragged outline. */
function tornSheet(w: number, d: number, r: () => number) {
  const s = new THREE.Shape();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const side = Math.floor(t * 4);
    const u = (t * 4) % 1;
    const j = () => (r() - 0.5) * 0.5;
    const x = side === 0 ? -w / 2 + w * u : side === 1 ? w / 2 : side === 2 ? w / 2 - w * u : -w / 2;
    const y = side === 0 ? -d / 2 : side === 1 ? -d / 2 + d * u : side === 2 ? d / 2 : d / 2 - d * u;
    if (i === 0) s.moveTo(x + j(), y + j());
    else s.lineTo(x + j(), y + j());
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12 + r() * 0.2, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function paperPlane() {
  const g = new THREE.Group();
  const s = 7;
  const left = new THREE.BufferGeometry();
  left.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2 * s, -1.6 * s, 0.5, 1.4 * s, 0, -0.6, 0.8 * s], 3));
  left.computeVertexNormals();
  const right = new THREE.BufferGeometry();
  right.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -2 * s, 0, -0.6, 0.8 * s, 1.6 * s, 0.5, 1.4 * s], 3));
  right.computeVertexNormals();
  g.add(new THREE.Mesh(left, new THREE.MeshStandardMaterial({ color: '#f7f5f0', side: THREE.DoubleSide, roughness: 1 })));
  g.add(new THREE.Mesh(right, new THREE.MeshStandardMaterial({ color: '#dcd6cb', side: THREE.DoubleSide, roughness: 1 })));
  g.traverse((o) => (o.castShadow = true));
  return g;
}
