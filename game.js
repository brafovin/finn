import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shine Garage — Premium car wash simulator.
// Built with PBR (MeshPhysicalMaterial / clearcoat), procedural studio IBL,
// soft shadows, dirt-patch decals, tool-driven cleaning, particle effects.
// ---------------------------------------------------------------------------

const container = document.getElementById('game-container');
const loadingEl = document.getElementById('loading');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const resultEl = document.getElementById('result');
const nextBtn = document.getElementById('next-btn');
const resultTitle = document.getElementById('result-title');
const cleanFill = document.getElementById('clean-fill');
const cleanPct = document.getElementById('clean-pct');
const shineFill = document.getElementById('shine-fill');
const shinePct = document.getElementById('shine-pct');
const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const rClean = document.getElementById('r-clean');
const rShine = document.getElementById('r-shine');
const rTime = document.getElementById('r-time');
const rScore = document.getElementById('r-score');
const toolBtns = [...document.querySelectorAll('.tool-btn')];

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f16);
scene.fog = new THREE.Fog(0x0a0f16, 25, 60);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(7, 4.2, 8);
camera.lookAt(0, 1.0, 0);

// ---------------------------------------------------------------------------
// Procedural studio environment for crisp reflections (PMREM)
// ---------------------------------------------------------------------------
function buildEnvironment() {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x1a2530);

  // Floor gradient
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x0a1018 });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
  f.rotation.x = -Math.PI / 2;
  f.position.y = -2;
  envScene.add(f);

  // Ceiling soft area lights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const warmMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0 });
  const coolMat = new THREE.MeshBasicMaterial({ color: 0xa0d0ff });

  const addPanel = (x, z, w, d, mat, y = 6) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = Math.PI / 2;
    envScene.add(m);
  };
  addPanel(0, 0, 8, 8, lightMat, 7);
  addPanel(-6, -3, 4, 3, coolMat, 5);
  addPanel(6, -3, 4, 3, warmMat, 5);
  addPanel(-6, 4, 3, 5, warmMat, 4.5);
  addPanel(6, 4, 3, 5, coolMat, 4.5);

  // Walls with soft gradients via emissive panels
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x12202c });
  const wb = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), wallMat);
  wb.scale.x = -1; // inside out
  envScene.add(wb);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return target.texture;
}
scene.environment = buildEnvironment();

// ---------------------------------------------------------------------------
// Real scene lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xb0d0ff, 0x101418, 0.35);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff4d8, 2.6);
key.position.set(6, 9, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 30;
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
key.shadow.bias = -0.00035;
key.shadow.normalBias = 0.025;
key.shadow.radius = 4;
scene.add(key);
scene.add(key.target);

const fill = new THREE.DirectionalLight(0xa0c8ff, 0.8);
fill.position.set(-6, 5, -3);
scene.add(fill);

const rim = new THREE.SpotLight(0xfff0c8, 60, 25, Math.PI / 5, 0.45, 1.1);
rim.position.set(-4, 7, -6);
rim.target.position.set(0, 1, 0);
rim.castShadow = false;
scene.add(rim);
scene.add(rim.target);

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function makeTex(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// Polished concrete floor
const floorAlbedo = makeTex(makeCanvas(512, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#262b32');
  grad.addColorStop(1, '#181c22');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2000; i++) {
    const a = 0.02 + Math.random() * 0.06;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.04})`;
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(Math.random() * w, Math.random() * h);
    g.lineTo(Math.random() * w, Math.random() * h);
    g.stroke();
  }
}), 6, 6);

const floorRough = makeTex(makeCanvas(512, 512, (g, w, h) => {
  g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const a = Math.random();
    g.fillStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},${a*0.4})`;
    g.fillRect(Math.random()*w, Math.random()*h, 1, 1);
  }
}), 6, 6);

const floorMat = new THREE.MeshPhysicalMaterial({
  map: floorAlbedo,
  roughnessMap: floorRough,
  roughness: 0.42,
  metalness: 0.15,
  clearcoat: 0.6,
  clearcoatRoughness: 0.35,
  envMapIntensity: 0.8,
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
floor.receiveShadow = true;
scene.add(floor);

// Garage walls + ceiling
const wallTex = makeTex(makeCanvas(256, 256, (g, w, h) => {
  g.fillStyle = '#1a2028'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.04)';
  g.lineWidth = 1;
  for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
}), 6, 3);

const wallMat = new THREE.MeshStandardMaterial({
  map: wallTex,
  roughness: 0.9,
  metalness: 0.05,
});

const garage = new THREE.Group();
scene.add(garage);
const wallH = 7;
const wallSize = 22;

const back = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallH), wallMat);
back.position.set(0, wallH / 2, -wallSize / 2);
back.receiveShadow = true;
garage.add(back);

const left = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallH), wallMat);
left.position.set(-wallSize / 2, wallH / 2, 0);
left.rotation.y = Math.PI / 2;
left.receiveShadow = true;
garage.add(left);

const right = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallH), wallMat);
right.position.set(wallSize / 2, wallH / 2, 0);
right.rotation.y = -Math.PI / 2;
right.receiveShadow = true;
garage.add(right);

const front = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallH), wallMat);
front.position.set(0, wallH / 2, wallSize / 2);
front.rotation.y = Math.PI;
front.receiveShadow = true;
garage.add(front);

// Ceiling light strips (emissive boxes)
const stripMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xfff0d8,
  emissiveIntensity: 4.0,
  roughness: 0.4,
});
for (let i = -1; i <= 1; i++) {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 8), stripMat);
  strip.position.set(i * 4, wallH - 0.2, 0);
  garage.add(strip);
  const ph = new THREE.PointLight(0xfff2dc, 6, 12, 1.6);
  ph.position.copy(strip.position);
  ph.position.y -= 0.2;
  garage.add(ph);
}

// Lift platform under the car
const liftMat = new THREE.MeshStandardMaterial({
  color: 0x1f2a36,
  metalness: 0.8,
  roughness: 0.35,
});
const lift = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.15, 64), liftMat);
lift.position.y = 0.075;
lift.receiveShadow = true;
lift.castShadow = true;
scene.add(lift);

const liftRing = new THREE.Mesh(
  new THREE.TorusGeometry(3.0, 0.06, 16, 96),
  new THREE.MeshStandardMaterial({ color: 0x4cc8ff, emissive: 0x1c80c0, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.2 })
);
liftRing.rotation.x = -Math.PI / 2;
liftRing.position.y = 0.16;
scene.add(liftRing);

// ---------------------------------------------------------------------------
// Car — assembled from primitives with premium PBR materials
// ---------------------------------------------------------------------------
const carRoot = new THREE.Group();
carRoot.position.y = 0.45;
scene.add(carRoot);

// Paint material — adjusted live as cleanliness improves
const paint = new THREE.MeshPhysicalMaterial({
  color: 0xb01a1a,
  metalness: 0.55,
  roughness: 0.55,
  clearcoat: 1.0,
  clearcoatRoughness: 0.45,
  envMapIntensity: 1.0,
});

const chrome = new THREE.MeshPhysicalMaterial({
  color: 0xeef2f6,
  metalness: 1.0,
  roughness: 0.18,
  envMapIntensity: 1.2,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x0a1218,
  metalness: 0.0,
  roughness: 0.05,
  transmission: 0.55,
  thickness: 0.2,
  ior: 1.45,
  transparent: true,
  opacity: 0.55,
  envMapIntensity: 1.0,
});

const rubber = new THREE.MeshStandardMaterial({
  color: 0x0a0a0c,
  roughness: 0.95,
  metalness: 0.0,
});

const headlightMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  emissive: 0xfff0c0,
  emissiveIntensity: 1.2,
  metalness: 0.4,
  roughness: 0.05,
  clearcoat: 1.0,
});
const tailMat = new THREE.MeshPhysicalMaterial({
  color: 0x501010,
  emissive: 0xff2030,
  emissiveIntensity: 1.4,
  metalness: 0.3,
  roughness: 0.2,
  clearcoat: 1.0,
});

const carBodyMeshes = []; // meshes that get cleaned/waxed

function addBody(geo, mat, pos, rot) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  carRoot.add(m);
  return m;
}

// Lower body (chassis-level box)
const chassis = addBody(new THREE.BoxGeometry(4.5, 0.55, 2.0), paint, [0, 0.25, 0]);
carBodyMeshes.push(chassis);

// Main hull / wedge
const hull = addBody(new THREE.BoxGeometry(4.3, 0.6, 1.9), paint, [0, 0.7, 0]);
carBodyMeshes.push(hull);

// Hood (sloped, slightly narrower)
const hood = addBody(new THREE.BoxGeometry(1.6, 0.18, 1.78), paint, [1.25, 1.05, 0]);
carBodyMeshes.push(hood);

// Trunk
const trunk = addBody(new THREE.BoxGeometry(1.4, 0.2, 1.78), paint, [-1.35, 1.05, 0]);
carBodyMeshes.push(trunk);

// Cabin (greenhouse) — narrower & tapered
const cabin = addBody(new THREE.BoxGeometry(2.0, 0.7, 1.65), paint, [-0.1, 1.45, 0]);
carBodyMeshes.push(cabin);

// Roof (small flat top)
const roof = addBody(new THREE.BoxGeometry(1.7, 0.08, 1.45), paint, [-0.1, 1.82, 0]);
carBodyMeshes.push(roof);

// Windshield (front glass)
const windshield = addBody(new THREE.BoxGeometry(0.05, 0.7, 1.5), glass, [0.95, 1.5, 0]);
windshield.rotation.z = -0.55;
// Rear window
const rearGlass = addBody(new THREE.BoxGeometry(0.05, 0.6, 1.5), glass, [-1.15, 1.55, 0]);
rearGlass.rotation.z = 0.7;
// Side windows
const sideWinL = addBody(new THREE.PlaneGeometry(1.7, 0.55), glass, [-0.1, 1.55, 0.835], [0, 0, 0]);
const sideWinR = addBody(new THREE.PlaneGeometry(1.7, 0.55), glass, [-0.1, 1.55, -0.835], [0, Math.PI, 0]);

// Bumpers / grille
const grille = addBody(new THREE.BoxGeometry(0.12, 0.18, 1.4), chrome, [2.18, 0.55, 0]);
const frontBumper = addBody(new THREE.BoxGeometry(0.25, 0.35, 1.9), paint, [2.18, 0.35, 0]);
carBodyMeshes.push(frontBumper);
const rearBumper = addBody(new THREE.BoxGeometry(0.25, 0.35, 1.9), paint, [-2.18, 0.35, 0]);
carBodyMeshes.push(rearBumper);

// Headlights
addBody(new THREE.BoxGeometry(0.06, 0.18, 0.4), headlightMat, [2.22, 0.75, 0.55]);
addBody(new THREE.BoxGeometry(0.06, 0.18, 0.4), headlightMat, [2.22, 0.75, -0.55]);
// Headlight cone lights
for (const z of [0.55, -0.55]) {
  const sl = new THREE.SpotLight(0xfff0c0, 4, 14, Math.PI / 7, 0.6, 1.5);
  sl.position.set(2.22, 0.75, z);
  sl.target.position.set(8, 0.6, z);
  carRoot.add(sl);
  carRoot.add(sl.target);
}

// Taillights
addBody(new THREE.BoxGeometry(0.05, 0.18, 0.45), tailMat, [-2.22, 0.85, 0.55]);
addBody(new THREE.BoxGeometry(0.05, 0.18, 0.45), tailMat, [-2.22, 0.85, -0.55]);

// Mirrors
addBody(new THREE.BoxGeometry(0.12, 0.12, 0.3), paint, [0.8, 1.45, 0.95]);
addBody(new THREE.BoxGeometry(0.12, 0.12, 0.3), paint, [0.8, 1.45, -0.95]);

// Door lines (cosmetic embossed lines via thin dark boxes)
const doorLineMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.7 });
for (const z of [0.951, -0.951]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.7, 0.04), doorLineMat);
  m.position.set(-0.1, 1.1, z);
  carRoot.add(m);
  const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.04), doorLineMat);
  m2.position.set(0.6, 0.85, z);
  carRoot.add(m2);
}

// Wheels
function addWheel(x, z) {
  const wheel = new THREE.Group();
  wheel.position.set(x, 0.45, z);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 32), rubber);
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  tire.receiveShadow = true;
  wheel.add(tire);

  const rimMat = new THREE.MeshPhysicalMaterial({
    color: 0xb8c0c8,
    metalness: 1.0,
    roughness: 0.25,
    clearcoat: 0.8,
  });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.33, 24), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);

  // Spokes
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.06), rimMat);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spoke.position.set(0, 0, 0);
    spoke.rotation.z = (i / 5) * Math.PI * 2;
    wheel.add(spoke);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 16), chrome);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  carRoot.add(wheel);
  return wheel;
}
addWheel(1.55, 0.95);
addWheel(1.55, -0.95);
addWheel(-1.55, 0.95);
addWheel(-1.55, -0.95);

// Side skirts
addBody(new THREE.BoxGeometry(3.0, 0.25, 0.08), paint, [0, 0.4, 0.95]);
addBody(new THREE.BoxGeometry(3.0, 0.25, 0.08), paint, [0, 0.4, -0.95]);

// ---------------------------------------------------------------------------
// Dirt patch system
// ---------------------------------------------------------------------------
// Each dirt patch = a small textured plane glued to a body surface.
// Types: 'dust' (light, removable by hose), 'mud' (heavy, needs sponge).

function makeDirtTexture(kind) {
  return makeTex(makeCanvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    if (kind === 'dust') {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
      grad.addColorStop(0, 'rgba(120, 105, 85, 0.85)');
      grad.addColorStop(0.6, 'rgba(95, 80, 65, 0.55)');
      grad.addColorStop(1, 'rgba(70, 60, 50, 0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const a = Math.random();
        g.fillStyle = `rgba(60,50,40,${a * 0.5})`;
        const r = Math.random() * w / 2;
        const ang = Math.random() * Math.PI * 2;
        g.fillRect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 2, 2);
      }
    } else {
      // mud — irregular blob
      g.fillStyle = 'rgba(0,0,0,0)';
      g.fillRect(0, 0, w, h);
      g.translate(cx, cy);
      const points = 14;
      g.beginPath();
      for (let i = 0; i <= points; i++) {
        const ang = (i / points) * Math.PI * 2;
        const r = w * 0.32 * (0.7 + Math.random() * 0.45);
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.42);
      grad.addColorStop(0, 'rgba(55, 35, 22, 0.96)');
      grad.addColorStop(0.7, 'rgba(40, 25, 16, 0.85)');
      grad.addColorStop(1, 'rgba(25, 15, 10, 0)');
      g.fillStyle = grad;
      g.fill();
      g.translate(-cx, -cy);
      // splatter dots
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = w * 0.4 + Math.random() * w * 0.15;
        g.fillStyle = `rgba(50,30,18,${0.6 * Math.random()})`;
        g.beginPath();
        g.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist,
              1 + Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }), 1, 1);
}
const dustTex = makeDirtTexture('dust');
const mudTex = makeDirtTexture('mud');

const dirtPatches = [];

// Sample N points on a mesh's surface (area-weighted)
function sampleSurface(mesh, count) {
  const geo = mesh.geometry;
  const posAttr = geo.attributes.position;
  let normAttr = geo.attributes.normal;
  if (!normAttr) { geo.computeVertexNormals(); normAttr = geo.attributes.normal; }
  const index = geo.index;
  const triCount = index ? index.count / 3 : posAttr.count / 3;

  const areas = new Float32Array(triCount);
  let total = 0;
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3();
  for (let i = 0; i < triCount; i++) {
    const ia = index ? index.getX(i * 3) : i * 3;
    const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
    va.fromBufferAttribute(posAttr, ia);
    vb.fromBufferAttribute(posAttr, ib);
    vc.fromBufferAttribute(posAttr, ic);
    e1.subVectors(vb, va);
    e2.subVectors(vc, va);
    cr.crossVectors(e1, e2);
    total += cr.length() * 0.5;
    areas[i] = total;
  }
  mesh.updateMatrixWorld(true);
  const out = [];
  for (let k = 0; k < count; k++) {
    const r = Math.random() * total;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (areas[m] < r) lo = m + 1; else hi = m; }
    const i = lo;
    const ia = index ? index.getX(i * 3) : i * 3;
    const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
    va.fromBufferAttribute(posAttr, ia);
    vb.fromBufferAttribute(posAttr, ib);
    vc.fromBufferAttribute(posAttr, ic);
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = new THREE.Vector3()
      .copy(va)
      .add(new THREE.Vector3().subVectors(vb, va).multiplyScalar(u))
      .add(new THREE.Vector3().subVectors(vc, va).multiplyScalar(v));
    const na = new THREE.Vector3().fromBufferAttribute(normAttr, ia);
    const nb = new THREE.Vector3().fromBufferAttribute(normAttr, ib);
    const nc = new THREE.Vector3().fromBufferAttribute(normAttr, ic);
    const n = na.clone().add(nb).add(nc).normalize();
    p.applyMatrix4(mesh.matrixWorld);
    n.transformDirection(mesh.matrixWorld);
    out.push({ point: p, normal: n });
  }
  return out;
}

function placeDirt() {
  const dustMat = new THREE.MeshStandardMaterial({
    map: dustTex,
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mudMat = new THREE.MeshStandardMaterial({
    map: mudTex,
    transparent: true,
    depthWrite: false,
    roughness: 1.0,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  for (const mesh of carBodyMeshes) {
    const area = (() => {
      mesh.geometry.computeBoundingBox();
      const s = new THREE.Vector3();
      mesh.geometry.boundingBox.getSize(s);
      return s.x * s.y + s.y * s.z + s.x * s.z;
    })();
    const count = Math.max(6, Math.round(area * 4.5));
    const samples = sampleSurface(mesh, count);
    for (const s of samples) {
      const kind = Math.random() < 0.62 ? 'dust' : 'mud';
      const size = kind === 'mud' ? 0.22 + Math.random() * 0.2 : 0.28 + Math.random() * 0.28;
      const geo = new THREE.CircleGeometry(size, 18);
      const mat = (kind === 'dust' ? dustMat : mudMat).clone();
      mat.opacity = kind === 'mud' ? 0.95 : 0.85;
      const patch = new THREE.Mesh(geo, mat);
      patch.position.copy(s.point).addScaledVector(s.normal, 0.003);
      // orient to face the normal
      const up = new THREE.Vector3(0, 0, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(up, s.normal);
      patch.quaternion.copy(q);
      patch.rotateZ(Math.random() * Math.PI * 2);
      scene.add(patch);
      dirtPatches.push({
        mesh: patch,
        kind,
        position: s.point.clone(),
        cleaned: 0,    // 0..1
        waxed: 0,      // 0..1 (for wax bonus accounting)
        size,
      });
    }
  }
}
placeDirt();
const initialDirtCount = dirtPatches.length;

// ---------------------------------------------------------------------------
// Tool cursor (sphere indicating tool position + radius)
// ---------------------------------------------------------------------------
const cursor = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.35 })
);
cursor.visible = false;
scene.add(cursor);

const cursorRing = new THREE.Mesh(
  new THREE.RingGeometry(0.34, 0.4, 48),
  new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
);
cursorRing.visible = false;
scene.add(cursorRing);

// ---------------------------------------------------------------------------
// Particle pools (water, foam, sparkle)
// ---------------------------------------------------------------------------
const particles = [];
const pGeo = new THREE.SphereGeometry(0.025, 6, 6);

function spawnParticle(pos, dir, color, life = 0.6, gravity = 12, scale = 1) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const m = new THREE.Mesh(pGeo, mat);
  m.scale.setScalar(scale);
  m.position.copy(pos);
  scene.add(m);
  particles.push({ mesh: m, vel: dir.clone(), life, maxLife: life, gravity });
}

// ---------------------------------------------------------------------------
// Input — camera orbit (right-drag), zoom (wheel), tool action (left-drag)
// ---------------------------------------------------------------------------
const orbit = {
  target: new THREE.Vector3(0, 1.0, 0),
  azimuth: Math.atan2(camera.position.x - 0, camera.position.z - 0),
  polar: Math.acos((camera.position.y - 1.0) / camera.position.distanceTo(new THREE.Vector3(0, 1.0, 0))),
  distance: camera.position.distanceTo(new THREE.Vector3(0, 1.0, 0)),
};

function applyOrbit() {
  const x = orbit.target.x + Math.sin(orbit.polar) * Math.sin(orbit.azimuth) * orbit.distance;
  const z = orbit.target.z + Math.sin(orbit.polar) * Math.cos(orbit.azimuth) * orbit.distance;
  const y = orbit.target.y + Math.cos(orbit.polar) * orbit.distance;
  camera.position.set(x, y, z);
  camera.lookAt(orbit.target);
}
applyOrbit();

const input = {
  leftDown: false,
  rightDown: false,
  mouse: new THREE.Vector2(),
  ndc: new THREE.Vector2(),
  lastX: 0,
  lastY: 0,
};

const canvasEl = renderer.domElement;

canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

canvasEl.addEventListener('mousedown', (e) => {
  if (!gameRunning) return;
  if (e.button === 0) input.leftDown = true;
  if (e.button === 2) input.rightDown = true;
  input.lastX = e.clientX;
  input.lastY = e.clientY;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.leftDown = false;
  if (e.button === 2) input.rightDown = false;
});

window.addEventListener('mousemove', (e) => {
  input.mouse.set(e.clientX, e.clientY);
  input.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  input.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (input.rightDown && gameRunning) {
    const dx = e.clientX - input.lastX;
    const dy = e.clientY - input.lastY;
    orbit.azimuth -= dx * 0.005;
    orbit.polar = Math.max(0.18, Math.min(Math.PI / 2 - 0.05, orbit.polar - dy * 0.005));
    applyOrbit();
  }
  input.lastX = e.clientX;
  input.lastY = e.clientY;
});

canvasEl.addEventListener('wheel', (e) => {
  if (!gameRunning) return;
  e.preventDefault();
  orbit.distance = Math.max(5, Math.min(16, orbit.distance + e.deltaY * 0.008));
  applyOrbit();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit1') setTool('hose');
  if (e.code === 'Digit2') setTool('sponge');
  if (e.code === 'Digit3') setTool('wax');
});

toolBtns.forEach(b => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const TOOLS = {
  hose:   { radius: 0.55, dustPower: 1.4, mudPower: 0.18, waxPower: 0, color: 0x80d8ff, particle: 0x6dd6ff, gravity: 14, name: 'SPRÜHER' },
  sponge: { radius: 0.45, dustPower: 1.6, mudPower: 1.5,  waxPower: 0, color: 0xffffff, particle: 0xfaffff, gravity: 4,  name: 'SCHWAMM' },
  wax:    { radius: 0.40, dustPower: 0,   mudPower: 0,    waxPower: 1.2, color: 0xffcf66, particle: 0xffd680, gravity: 0,  name: 'WACHS' },
};
let currentTool = 'hose';

function setTool(name) {
  if (!TOOLS[name]) return;
  currentTool = name;
  toolBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === name));
  const c = TOOLS[name].color;
  cursor.material.color.setHex(c);
  cursorRing.material.color.setHex(c);
}
setTool('hose');

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let gameRunning = false;
let elapsed = 0;
let score = 0;
let cleanProgress = 0; // 0..1
let shineProgress = 0; // 0..1

const raycaster = new THREE.Raycaster();
let lastHit = null;

function updateHUD() {
  cleanFill.style.width = `${(cleanProgress * 100).toFixed(0)}%`;
  cleanPct.textContent = `${(cleanProgress * 100).toFixed(0)}%`;
  shineFill.style.width = `${(shineProgress * 100).toFixed(0)}%`;
  shinePct.textContent = `${(shineProgress * 100).toFixed(0)}%`;
  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  scoreEl.textContent = score.toFixed(0);
}

function startGame() {
  overlay.classList.add('hidden');
  resultEl.classList.add('hidden');
  // Reset dirt: remove existing then re-place
  for (const d of dirtPatches) scene.remove(d.mesh);
  dirtPatches.length = 0;
  placeDirt();

  paint.color.setHSL(Math.random(), 0.55, 0.32 + Math.random() * 0.2);
  paint.roughness = 0.7;
  paint.clearcoatRoughness = 0.55;

  elapsed = 0;
  score = 0;
  cleanProgress = 0;
  shineProgress = 0;
  gameRunning = true;
  updateHUD();
}

function endGame() {
  gameRunning = false;
  const timeBonus = Math.max(0, 240 - elapsed) * 4;
  const finalScore = Math.round(cleanProgress * 600 + shineProgress * 400 + timeBonus + score * 0.5);
  rClean.textContent = `${(cleanProgress * 100).toFixed(0)}%`;
  rShine.textContent = `${(shineProgress * 100).toFixed(0)}%`;
  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  rTime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  rScore.textContent = finalScore;
  resultTitle.textContent = shineProgress > 0.9 ? 'PERFEKTER GLANZ!' : (cleanProgress > 0.95 ? 'BLITZBLANK!' : 'SAUBER!');
  resultEl.classList.remove('hidden');
}

startBtn.addEventListener('click', startGame);
nextBtn.addEventListener('click', () => {
  resultEl.classList.add('hidden');
  startGame();
});

// ---------------------------------------------------------------------------
// Cleaning logic — per-frame, applied while left mouse is held
// ---------------------------------------------------------------------------
function applyTool(dt) {
  raycaster.setFromCamera(input.ndc, camera);

  // First, ray against car & patches to position cursor
  const targets = [...carBodyMeshes, ...dirtPatches.map(d => d.mesh), lift];
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length === 0) {
    cursor.visible = false;
    cursorRing.visible = false;
    lastHit = null;
    return;
  }
  const hit = hits[0];
  lastHit = hit;

  const tool = TOOLS[currentTool];
  cursor.visible = true;
  cursorRing.visible = true;
  cursor.position.copy(hit.point);
  cursor.scale.setScalar(tool.radius / 0.18);
  cursorRing.position.copy(hit.point).addScaledVector(hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0,1,0), 0.01);
  cursorRing.lookAt(camera.position);
  cursorRing.scale.setScalar(tool.radius / 0.4);

  if (!input.leftDown) return;

  // Process all dirt patches within tool radius of hit point
  let didWork = false;
  for (let i = dirtPatches.length - 1; i >= 0; i--) {
    const d = dirtPatches[i];
    const dist = d.position.distanceTo(hit.point);
    if (dist > tool.radius + d.size * 0.5) continue;
    const falloff = 1 - Math.min(1, dist / (tool.radius + d.size * 0.5));

    if (currentTool === 'wax') {
      // Wax only applies once dirt is gone
      if (d.cleaned < 0.95) continue;
      d.waxed = Math.min(1, d.waxed + tool.waxPower * falloff * dt);
      didWork = true;
    } else {
      const power = d.kind === 'dust' ? tool.dustPower : tool.mudPower;
      if (power <= 0.01) continue;
      d.cleaned = Math.min(1, d.cleaned + power * falloff * dt);
      d.mesh.material.opacity = (d.kind === 'mud' ? 0.95 : 0.85) * (1 - d.cleaned);
      if (d.cleaned >= 1) {
        d.mesh.visible = false;
        score += d.kind === 'mud' ? 15 : 8;
      }
      didWork = true;
    }
  }

  // Spawn particles around hit point
  const burst = currentTool === 'hose' ? 6 : currentTool === 'sponge' ? 3 : 2;
  for (let i = 0; i < burst; i++) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * tool.radius,
      (Math.random() - 0.5) * tool.radius,
      (Math.random() - 0.5) * tool.radius
    );
    const pos = hit.point.clone().add(offset.multiplyScalar(0.3));
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      currentTool === 'hose' ? 1 + Math.random() * 2 : 0.5 + Math.random(),
      (Math.random() - 0.5) * 4
    );
    if (currentTool === 'hose') {
      // also push along surface normal away
      if (hit.face) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        dir.add(n.multiplyScalar(3));
      }
    }
    spawnParticle(pos, dir, tool.particle, currentTool === 'wax' ? 0.5 : 0.7, tool.gravity,
                  currentTool === 'sponge' ? 1.6 : 1);
  }

  if (didWork) {
    // small score per frame for engagement
    score += 0.5;
  }
}

// ---------------------------------------------------------------------------
// Per-frame update of overall progress + material polish
// ---------------------------------------------------------------------------
function updateProgress() {
  if (initialDirtCount === 0) return;
  let cleanedSum = 0;
  let waxedSum = 0;
  for (const d of dirtPatches) {
    cleanedSum += d.cleaned;
    waxedSum += d.waxed;
  }
  cleanProgress = cleanedSum / initialDirtCount;
  shineProgress = waxedSum / initialDirtCount;

  // As the car gets cleaner, paint becomes glossier
  const tr = 0.7 - cleanProgress * 0.55;            // 0.7 -> 0.15
  const tc = 0.55 - cleanProgress * 0.45 - shineProgress * 0.08; // -> very low
  paint.roughness = THREE.MathUtils.lerp(paint.roughness, tr, 0.04);
  paint.clearcoatRoughness = THREE.MathUtils.lerp(paint.clearcoatRoughness, Math.max(0.02, tc), 0.04);
  paint.envMapIntensity = THREE.MathUtils.lerp(paint.envMapIntensity, 1.0 + shineProgress * 1.4, 0.04);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function update(dt) {
  elapsed += dt;
  applyTool(dt);
  updateProgress();

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vel.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife) * 0.9;
    if (p.life <= 0 || p.mesh.position.y < 0) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }

  // Gentle car float (subtle "presentation" idle)
  carRoot.position.y = 0.45 + Math.sin(elapsed * 0.8) * 0.01;
  liftRing.material.emissiveIntensity = 1.2 + Math.sin(elapsed * 1.4) * 0.4;

  updateHUD();

  // End condition: clean+wax all done, or stop on demand
  if (cleanProgress >= 0.999 && shineProgress >= 0.999) {
    endGame();
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (gameRunning) update(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Kick off
requestAnimationFrame(() => {
  loadingEl.classList.add('hidden');
  animate();
});
