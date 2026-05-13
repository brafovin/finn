import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shadow Strike — A first-person 3D shooter with dynamic shadows.
// ---------------------------------------------------------------------------

const container = document.getElementById('game-container');
const overlay = document.getElementById('overlay');
const gameOverEl = document.getElementById('game-over');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const crosshair = document.getElementById('crosshair');
const damageFlash = document.getElementById('damage-flash');
const healthFill = document.getElementById('health-fill');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const finalScoreEl = document.getElementById('final-score');
const finalWaveEl = document.getElementById('final-wave');
const endTitleEl = document.getElementById('end-title');

// ---------------------------------------------------------------------------
// Renderer / Scene / Camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131c);
scene.fog = new THREE.Fog(0x10131c, 30, 110);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 1.7, 0);

// ---------------------------------------------------------------------------
// Lighting (shadow-casting sun + hemisphere fill + muzzle point light)
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0x6080b0, 0x181a1f, 0.45);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0x2a2e3a, 0.35);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const muzzleLight = new THREE.PointLight(0xffaa44, 0, 18, 2);
muzzleLight.castShadow = false;
camera.add(muzzleLight);
muzzleLight.position.set(0.25, -0.25, -0.6);
scene.add(camera);

// ---------------------------------------------------------------------------
// World — arena with floor, walls, and obstacles (all cast & receive shadows)
// ---------------------------------------------------------------------------
const ARENA = 60;

function makeTexture(drawFn, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floorTex = makeTexture((ctx, s) => {
  ctx.fillStyle = '#2a2c34';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#1a1c22';
  ctx.lineWidth = 4;
  for (let i = 0; i <= s; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
});
floorTex.repeat.set(ARENA / 4, ARENA / 4);

const floorMat = new THREE.MeshStandardMaterial({
  map: floorTex,
  roughness: 0.9,
  metalness: 0.05,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Outer walls
const wallTex = makeTexture((ctx, s) => {
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#22222a';
  ctx.lineWidth = 3;
  for (let y = 0; y < s; y += 32) {
    const off = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = -32; x < s; x += 64) {
      ctx.strokeRect(x + off, y, 64, 32);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(Math.random() * s, Math.random() * s, 6, 6);
  }
});
wallTex.repeat.set(8, 1);

const wallMat = new THREE.MeshStandardMaterial({
  map: wallTex,
  roughness: 0.85,
  metalness: 0.1,
});

const walls = [];
function addWall(x, z, w, d, h = 6) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  walls.push(mesh);
  return mesh;
}

// Perimeter walls
addWall(0,  ARENA, ARENA * 2 + 2, 2);
addWall(0, -ARENA, ARENA * 2 + 2, 2);
addWall( ARENA, 0, 2, ARENA * 2 + 2);
addWall(-ARENA, 0, 2, ARENA * 2 + 2);

// Random crates / pillars as cover (deterministic seed for repeatability)
function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const rng = rand(1337);

const crateMat = new THREE.MeshStandardMaterial({
  color: 0x6b4a2a,
  roughness: 0.85,
  metalness: 0.05,
});
const pillarMat = new THREE.MeshStandardMaterial({
  color: 0x4a4a55,
  roughness: 0.6,
  metalness: 0.3,
});

for (let i = 0; i < 22; i++) {
  const isPillar = rng() > 0.6;
  const x = (rng() * 2 - 1) * (ARENA - 6);
  const z = (rng() * 2 - 1) * (ARENA - 6);
  if (Math.hypot(x, z) < 6) continue; // keep spawn clear
  if (isPillar) {
    const h = 4 + rng() * 6;
    const r = 0.6 + rng() * 0.8;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), pillarMat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    walls.push(m);
  } else {
    const w = 1.4 + rng() * 1.6;
    const h = 1.2 + rng() * 1.8;
    const d = 1.4 + rng() * 1.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
    m.position.set(x, h / 2, z);
    m.rotation.y = rng() * Math.PI;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    walls.push(m);
  }
}

// ---------------------------------------------------------------------------
// Weapon model (held in view)
// ---------------------------------------------------------------------------
const weapon = new THREE.Group();
camera.add(weapon);
weapon.position.set(0.32, -0.28, -0.55);

const gunBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.5, metalness: 0.7 });
const gunAccentMat = new THREE.MeshStandardMaterial({ color: 0x2c2c33, roughness: 0.4, metalness: 0.85 });

const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.5), gunBodyMat);
weapon.add(body);

const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 16), gunAccentMat);
barrel.rotation.x = Math.PI / 2;
barrel.position.set(0, 0.04, -0.32);
weapon.add(barrel);

const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.12), gunBodyMat);
grip.position.set(0, -0.16, 0.1);
grip.rotation.x = 0.2;
weapon.add(grip);

const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.05), gunAccentMat);
sight.position.set(0, 0.13, -0.05);
weapon.add(sight);

const muzzleFlash = new THREE.Mesh(
  new THREE.ConeGeometry(0.12, 0.25, 12),
  new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 })
);
muzzleFlash.rotation.x = -Math.PI / 2;
muzzleFlash.position.set(0, 0.04, -0.6);
weapon.add(muzzleFlash);

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
const enemies = [];
const enemyBodyMat = new THREE.MeshStandardMaterial({ color: 0x882020, roughness: 0.5, metalness: 0.2, emissive: 0x220505, emissiveIntensity: 0.4 });
const enemyHeadMat = new THREE.MeshStandardMaterial({ color: 0xaa2828, roughness: 0.4, metalness: 0.3, emissive: 0x441010, emissiveIntensity: 0.6 });
const enemyEyeMat = new THREE.MeshBasicMaterial({ color: 0xff4020 });

function createEnemy(x, z, hp = 2) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), enemyBodyMat);
  body.position.y = 0.9;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), enemyHeadMat);
  head.position.y = 1.7;
  head.castShadow = true;
  head.receiveShadow = true;
  g.add(head);

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), enemyEyeMat);
  eyeL.position.set(-0.14, 1.75, 0.28);
  g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), enemyEyeMat);
  eyeR.position.set(0.14, 1.75, 0.28);
  g.add(eyeR);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.25);
  const legL = new THREE.Mesh(legGeo, enemyBodyMat);
  legL.position.set(-0.18, 0.35, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, enemyBodyMat);
  legR.position.set(0.18, 0.35, 0);
  legR.castShadow = true;
  g.add(legR);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
  const armL = new THREE.Mesh(armGeo, enemyBodyMat);
  armL.position.set(-0.44, 0.95, 0);
  armL.castShadow = true;
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, enemyBodyMat);
  armR.position.set(0.44, 0.95, 0);
  armR.castShadow = true;
  g.add(armR);

  scene.add(g);

  enemies.push({
    group: g,
    body,
    head,
    legL, legR,
    hp,
    maxHp: hp,
    speed: 1.8 + Math.random() * 1.2,
    attackCd: 0,
    walkPhase: Math.random() * Math.PI * 2,
    radius: 0.5,
    dead: false,
  });
}

// ---------------------------------------------------------------------------
// Bullets (visible tracer)
// ---------------------------------------------------------------------------
const bullets = [];
const bulletGeo = new THREE.SphereGeometry(0.05, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });

// ---------------------------------------------------------------------------
// Particles (impact / blood)
// ---------------------------------------------------------------------------
const particles = [];
function spawnParticles(pos, color, count = 12, speed = 4) {
  const geo = new THREE.SphereGeometry(0.07, 5, 5);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.position.copy(pos);
    const dir = new THREE.Vector3(
      (Math.random() - 0.5),
      Math.random(),
      (Math.random() - 0.5)
    ).normalize().multiplyScalar(speed * (0.5 + Math.random()));
    scene.add(m);
    particles.push({ mesh: m, vel: dir, life: 0.7 });
  }
}

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------
const player = {
  pos: new THREE.Vector3(0, 1.7, 0),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: true,
  radius: 0.4,
  height: 1.7,
  speed: 6,
  sprintMul: 1.6,
  jumpVel: 7,
  hp: 100,
  maxHp: 100,
  magSize: 30,
  mag: 30,
  reserve: 90,
  reloading: false,
  reloadTime: 0,
  fireCd: 0,
  fireRate: 0.11,
  bobPhase: 0,
};

let score = 0;
let wave = 0;
let waveEnemiesRemaining = 0;
let nextWaveTimer = 1.5;
let gameRunning = false;
let paused = false;

const keys = new Set();
let mouseDown = false;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function onKeyDown(e) {
  if (!gameRunning) return;
  const k = e.code;
  keys.add(k);
  if (k === 'KeyR') reload();
  if (k === 'Escape') {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
function onKeyUp(e) { keys.delete(e.code); }

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!gameRunning) return;
  if (e.button === 0) mouseDown = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});

document.addEventListener('mousemove', (e) => {
  if (!gameRunning || document.pointerLockElement !== renderer.domElement) return;
  const sens = 0.0025;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  const maxPitch = Math.PI / 2 - 0.05;
  if (player.pitch > maxPitch) player.pitch = maxPitch;
  if (player.pitch < -maxPitch) player.pitch = -maxPitch;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    paused = false;
    crosshair.classList.add('active');
  } else {
    if (gameRunning) {
      paused = true;
      overlay.classList.remove('hidden');
      startBtn.textContent = 'WEITERSPIELEN';
    }
    crosshair.classList.remove('active');
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Start / restart
// ---------------------------------------------------------------------------
startBtn.addEventListener('click', () => {
  if (!gameRunning) startGame();
  else {
    paused = false;
    overlay.classList.add('hidden');
    renderer.domElement.requestPointerLock();
  }
});
restartBtn.addEventListener('click', () => {
  gameOverEl.classList.add('hidden');
  startGame();
});

function startGame() {
  // Reset state
  player.pos.set(0, 1.7, 0);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.hp = player.maxHp;
  player.mag = player.magSize;
  player.reserve = 90;
  player.reloading = false;
  player.fireCd = 0;

  for (const e of enemies) scene.remove(e.group);
  enemies.length = 0;

  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;

  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;

  score = 0;
  wave = 0;
  waveEnemiesRemaining = 0;
  nextWaveTimer = 1.5;

  updateHUD();
  gameRunning = true;
  paused = false;
  overlay.classList.add('hidden');
  startBtn.textContent = 'WEITERSPIELEN';
  renderer.domElement.requestPointerLock();
}

function endGame(won = false) {
  gameRunning = false;
  paused = true;
  if (document.pointerLockElement) document.exitPointerLock();
  endTitleEl.textContent = won ? 'SIEG!' : 'GAME OVER';
  finalScoreEl.textContent = score;
  finalWaveEl.textContent = wave;
  gameOverEl.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Wave spawning
// ---------------------------------------------------------------------------
function spawnWave() {
  wave++;
  const count = 3 + wave * 2;
  waveEnemiesRemaining = count;
  for (let i = 0; i < count; i++) {
    // spawn at random angle on outer ring
    const a = Math.random() * Math.PI * 2;
    const r = 25 + Math.random() * 25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const hp = 2 + Math.floor(wave / 2);
    createEnemy(x, z, hp);
  }
  waveEl.textContent = wave;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
function reload() {
  if (player.reloading || player.mag === player.magSize || player.reserve <= 0) return;
  player.reloading = true;
  player.reloadTime = 1.4;
}

function tryFire() {
  if (player.fireCd > 0 || player.reloading) return;
  if (player.mag <= 0) { reload(); return; }
  player.fireCd = player.fireRate;
  player.mag--;
  updateHUD();

  // Spawn tracer bullet
  const origin = new THREE.Vector3();
  weapon.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // Slight spread
  dir.x += (Math.random() - 0.5) * 0.005;
  dir.y += (Math.random() - 0.5) * 0.005;
  dir.normalize();

  const m = new THREE.Mesh(bulletGeo, bulletMat);
  m.position.copy(origin);
  scene.add(m);
  bullets.push({ mesh: m, vel: dir.clone().multiplyScalar(120), life: 1.5, dir: dir.clone() });

  // Muzzle flash
  muzzleFlash.material.opacity = 1;
  muzzleLight.intensity = 4;

  // Recoil kick
  player.pitch += 0.012;
  weapon.position.z = -0.5;

  // Hitscan against enemies (for reliability)
  const ray = new THREE.Raycaster(origin, dir, 0.1, 200);
  let closest = null;
  let closestDist = Infinity;

  for (const e of enemies) {
    if (e.dead) continue;
    const hits = ray.intersectObject(e.group, true);
    if (hits.length && hits[0].distance < closestDist) {
      closestDist = hits[0].distance;
      closest = { enemy: e, point: hits[0].point, isHead: hits[0].object === e.head };
    }
  }

  // Check walls so bullet doesn't pass through
  let wallDist = Infinity;
  for (const w of walls) {
    const hits = ray.intersectObject(w, false);
    if (hits.length && hits[0].distance < wallDist) {
      wallDist = hits[0].distance;
    }
  }

  if (closest && closestDist < wallDist) {
    const dmg = closest.isHead ? 3 : 1;
    closest.enemy.hp -= dmg;
    spawnParticles(closest.point, 0xff3030, 14, 5);
    if (closest.enemy.hp <= 0) killEnemy(closest.enemy);
  } else if (wallDist !== Infinity) {
    const hitPoint = origin.clone().add(dir.clone().multiplyScalar(wallDist));
    spawnParticles(hitPoint, 0xccaa88, 6, 3);
  }
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  spawnParticles(e.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x882020, 22, 6);
  scene.remove(e.group);
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);
  score += 100;
  waveEnemiesRemaining--;
  updateHUD();
}

function damagePlayer(amt) {
  player.hp -= amt;
  damageFlash.classList.add('hit');
  setTimeout(() => damageFlash.classList.remove('hit'), 60);
  if (player.hp <= 0) {
    player.hp = 0;
    updateHUD();
    endGame(false);
  } else {
    updateHUD();
  }
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------
function collideAABB(pos, radius) {
  // Resolve collisions with axis-aligned bounding boxes (works for boxes; cylinders use bbox).
  for (const w of walls) {
    const box = new THREE.Box3().setFromObject(w);
    const minX = box.min.x - radius;
    const maxX = box.max.x + radius;
    const minZ = box.min.z - radius;
    const maxZ = box.max.z + radius;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
      // Push out along minimum penetration axis
      const dx1 = pos.x - minX;
      const dx2 = maxX - pos.x;
      const dz1 = pos.z - minZ;
      const dz2 = maxZ - pos.z;
      const m = Math.min(dx1, dx2, dz1, dz2);
      if (m === dx1) pos.x = minX;
      else if (m === dx2) pos.x = maxX;
      else if (m === dz1) pos.z = minZ;
      else pos.z = maxZ;
    }
  }
}

// ---------------------------------------------------------------------------
// HUD updates
// ---------------------------------------------------------------------------
function updateHUD() {
  healthFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
  ammoEl.textContent = `${player.mag} / ${player.reserve}`;
  scoreEl.textContent = score;
  waveEl.textContent = wave;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

function update(dt) {
  // Camera orientation from yaw/pitch
  const cosP = Math.cos(player.pitch);
  forward.set(
    -Math.sin(player.yaw) * cosP,
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * cosP
  );
  // Flat forward for movement
  const moveF = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const moveR = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  // Movement
  const wish = new THREE.Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(moveF);
  if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(moveF);
  if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(moveR);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(moveR);
  if (wish.lengthSq() > 0) wish.normalize();

  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = player.speed * (sprint ? player.sprintMul : 1);

  // Horizontal velocity (instant for responsive feel, with mild smoothing)
  player.vel.x = THREE.MathUtils.damp(player.vel.x, wish.x * speed, 18, dt);
  player.vel.z = THREE.MathUtils.damp(player.vel.z, wish.z * speed, 18, dt);

  // Gravity & jump
  player.vel.y -= 22 * dt;
  if ((keys.has('Space')) && player.onGround) {
    player.vel.y = player.jumpVel;
    player.onGround = false;
  }

  // Apply
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collideAABB(player.pos, player.radius);

  player.pos.y += player.vel.y * dt;
  if (player.pos.y <= 1.7) {
    player.pos.y = 1.7;
    player.vel.y = 0;
    player.onGround = true;
  }

  // Clamp inside arena
  const lim = ARENA - 1.2;
  if (player.pos.x > lim) player.pos.x = lim;
  if (player.pos.x < -lim) player.pos.x = -lim;
  if (player.pos.z > lim) player.pos.z = lim;
  if (player.pos.z < -lim) player.pos.z = -lim;

  // View bob
  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  player.bobPhase += dt * (hSpeed * 1.6);
  const bobY = Math.sin(player.bobPhase * 2) * 0.04 * (hSpeed / speed);
  const bobX = Math.cos(player.bobPhase) * 0.03 * (hSpeed / speed);

  camera.position.set(player.pos.x + bobX, player.pos.y + bobY, player.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // Sun follows player (so shadows stay sharp where it matters)
  sun.position.set(player.pos.x + 30, 50, player.pos.z + 20);
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.target.updateMatrixWorld();

  // Weapon recoil/recovery
  weapon.position.z = THREE.MathUtils.damp(weapon.position.z, -0.55, 12, dt);
  muzzleFlash.material.opacity = THREE.MathUtils.damp(muzzleFlash.material.opacity, 0, 22, dt);
  muzzleLight.intensity = THREE.MathUtils.damp(muzzleLight.intensity, 0, 22, dt);

  // Firing
  player.fireCd = Math.max(0, player.fireCd - dt);
  if (mouseDown) tryFire();

  // Reload
  if (player.reloading) {
    player.reloadTime -= dt;
    weapon.rotation.x = THREE.MathUtils.damp(weapon.rotation.x, -0.6, 8, dt);
    if (player.reloadTime <= 0) {
      const need = player.magSize - player.mag;
      const give = Math.min(need, player.reserve);
      player.mag += give;
      player.reserve -= give;
      player.reloading = false;
      updateHUD();
    }
  } else {
    weapon.rotation.x = THREE.MathUtils.damp(weapon.rotation.x, 0, 10, dt);
  }

  // Enemies AI
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = player.pos.x - e.group.position.x;
    const dz = player.pos.z - e.group.position.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dx / (dist || 1);
    const dirZ = dz / (dist || 1);

    // Face player
    e.group.rotation.y = Math.atan2(dirX, dirZ);

    if (dist > 1.4) {
      const nx = e.group.position.x + dirX * e.speed * dt;
      const nz = e.group.position.z + dirZ * e.speed * dt;
      // Collide with walls (don't push into them)
      const tmp = new THREE.Vector3(nx, 0, nz);
      collideAABB(tmp, e.radius);
      e.group.position.x = tmp.x;
      e.group.position.z = tmp.z;

      // Walk animation
      e.walkPhase += dt * 8;
      const swing = Math.sin(e.walkPhase) * 0.5;
      e.legL.rotation.x = swing;
      e.legR.rotation.x = -swing;
    } else {
      e.legL.rotation.x = 0;
      e.legR.rotation.x = 0;
    }

    // Attack
    e.attackCd -= dt;
    if (dist < 1.8 && e.attackCd <= 0) {
      damagePlayer(8);
      e.attackCd = 0.9;
      // Little lunge
      e.group.position.x -= dirX * 0.15;
      e.group.position.z -= dirZ * 0.15;
    }
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.addScaledVector(b.vel, dt);
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / 0.7);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  // Wave control
  if (waveEnemiesRemaining <= 0) {
    nextWaveTimer -= dt;
    if (nextWaveTimer <= 0) {
      spawnWave();
      nextWaveTimer = 4.0;
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (gameRunning && !paused) update(dt);
  renderer.render(scene, camera);
}

updateHUD();
animate();
