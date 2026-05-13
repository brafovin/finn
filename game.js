(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // ---------- Constants ----------
  const ROAD_WIDTH = 2000;
  const SEGMENT_LENGTH = 200;
  const RUMBLE_LENGTH = 3;
  const DRAW_DISTANCE = 220;
  const FIELD_OF_VIEW = 100;
  const CAMERA_HEIGHT = 1000;
  const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
  const LANES = 3;
  const MAX_SPEED = SEGMENT_LENGTH * 60;
  const ACCEL = MAX_SPEED / 5;
  const BRAKING = -MAX_SPEED;
  const DECEL = -MAX_SPEED / 5;
  const OFFROAD_DECEL = -MAX_SPEED / 2;
  const OFFROAD_LIMIT = MAX_SPEED / 4;
  const CENTRIFUGAL = 0.3;

  const COLORS = {
    SKY: '#1a0a2e',
    SUN: '#ffcc55',
    LIGHT: { road: '#6b6b6b', grass: '#1f5c3a', rumble: '#ffffff', lane: '#cfcfcf' },
    DARK:  { road: '#606060', grass: '#1a4f33', rumble: '#c83a3a', lane: '#606060' },
    START: { road: '#fff', grass: '#fff', rumble: '#fff' },
    FINISH:{ road: '#000', grass: '#000', rumble: '#000' },
  };

  // ---------- State ----------
  let segments = [];
  let trackLength = 0;
  let position = 0;       // camera Z along road
  let playerX = 0;        // -1..1 across road
  let speed = 0;
  let score = 0;
  let elapsed = 0;
  let running = false;
  let paused = false;
  let gameOver = false;
  let lastTime = 0;
  const cars = [];

  // ---------- Input ----------
  const keys = { left: false, right: false, up: false, down: false };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') keys.up    = true;
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') keys.down  = true;
    if (e.code === 'Space') { e.preventDefault(); if (running && !gameOver) paused = !paused; }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left  = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') keys.up    = false;
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') keys.down  = false;
  });

  // ---------- Track building ----------
  function easeIn(a, b, p)    { return a + (b - a) * Math.pow(p, 2); }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }

  function lastY() { return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y; }

  function addSegment(curve, y) {
    const n = segments.length;
    segments.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
      p2: { world: { y: y,        z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
      curve: curve,
      cars: [],
      sprites: [],
      color: Math.floor(n / RUMBLE_LENGTH) % 2 ? COLORS.DARK : COLORS.LIGHT,
    });
  }

  function addRoad(enter, hold, leave, curve, y) {
    const startY = lastY();
    const endY = startY + y * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let i = 0; i < enter; i++) addSegment(easeIn(0, curve, i / enter),         easeInOut(startY, endY, i / total));
    for (let i = 0; i < hold;  i++) addSegment(curve,                                easeInOut(startY, endY, (enter + i) / total));
    for (let i = 0; i < leave; i++) addSegment(easeInOut(curve, 0, i / leave),      easeInOut(startY, endY, (enter + hold + i) / total));
  }

  function addStraight(n) { addRoad(n, n, n, 0, 0); }
  function addCurve(n, curve, height) { addRoad(n, n, n, curve, height); }
  function addHill(n, height) { addRoad(n, n, n, 0, height); }
  function addLowRollingHills(n, height) {
    addRoad(n, n, n, 0,  height / 2);
    addRoad(n, n, n, 0, -height);
    addRoad(n, n, n, 0,  height);
    addRoad(n, n, n, 0,  0);
    addRoad(n, n, n, 0,  height / 2);
    addRoad(n, n, n, 0,  0);
  }
  function addSCurves() {
    addRoad(20, 20, 20, -2, 0);
    addRoad(20, 20, 20,  3, 1.5);
    addRoad(20, 20, 20, -3, 1);
    addRoad(20, 20, 20,  2, -1.5);
    addRoad(20, 20, 20, -2, 1);
  }
  function addBumps() {
    addRoad(10, 10, 10, 0,  3);
    addRoad(10, 10, 10, 0, -2);
    addRoad(10, 10, 10, 0, -4);
    addRoad(10, 10, 10, 0,  2);
    addRoad(10, 10, 10, 0,  1);
  }
  function addDownhillToEnd() {
    addRoad(200, 200, 200, -2, -8);
  }

  function resetRoad() {
    segments = [];
    addStraight(40);
    addLowRollingHills(20, 30);
    addSCurves();
    addCurve(40, 2, 0);
    addBumps();
    addLowRollingHills(20, 40);
    addCurve(80, -3, -2);
    addStraight(30);
    addCurve(60, 2, 1);
    addSCurves();
    addStraight(40);
    addCurve(80, -4, 2);
    addLowRollingHills(30, 50);
    addStraight(30);
    addDownhillToEnd();

    // mark start/finish
    segments[0].color = COLORS.START;
    segments[1].color = COLORS.START;
    for (let i = 0; i < RUMBLE_LENGTH; i++) {
      segments[segments.length - 1 - i].color = COLORS.FINISH;
    }
    trackLength = segments.length * SEGMENT_LENGTH;

    // place roadside sprites (dense, varied landscape)
    const SPRITE_TYPES = ['palm', 'palm', 'tree', 'tree', 'tree', 'pine', 'pine', 'pine',
                          'cactus', 'cactus', 'rock', 'rock', 'pylon', 'sign'];
    for (let i = 10; i < segments.length; i += 1 + Math.floor(Math.random() * 3)) {
      // left side
      if (Math.random() < 0.7) {
        const offset = -(1.2 + Math.random() * 2.5);
        const type = SPRITE_TYPES[Math.floor(Math.random() * SPRITE_TYPES.length)];
        segments[i].sprites.push({ source: type, offset });
      }
      // right side
      if (Math.random() < 0.7) {
        const offset = 1.2 + Math.random() * 2.5;
        const type = SPRITE_TYPES[Math.floor(Math.random() * SPRITE_TYPES.length)];
        segments[i].sprites.push({ source: type, offset });
      }
    }
  }

  function findSegment(z) {
    return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
  }

  // ---------- AI cars ----------
  function resetCars() {
    cars.length = 0;
    const count = 50;
    for (let i = 0; i < count; i++) {
      const offset = (Math.random() * 2 - 1) * 0.8;
      const z = Math.floor(Math.random() * segments.length) * SEGMENT_LENGTH;
      const sp = MAX_SPEED / 4 + Math.random() * MAX_SPEED / 3;
      const car = { offset, z, speed: sp, segment: null,
                    color: `hsl(${Math.floor(Math.random() * 360)}, 75%, 55%)` };
      car.segment = findSegment(car.z);
      car.segment.cars.push(car);
      cars.push(car);
    }
  }

  function updateCars(dt) {
    for (const car of cars) {
      const oldSeg = car.segment;
      car.z = (car.z + car.speed * dt) % trackLength;
      if (car.z < 0) car.z += trackLength;
      const newSeg = findSegment(car.z);
      if (oldSeg !== newSeg) {
        const idx = oldSeg.cars.indexOf(car);
        if (idx >= 0) oldSeg.cars.splice(idx, 1);
        newSeg.cars.push(car);
        car.segment = newSeg;
      }
    }
  }

  // ---------- Math helpers ----------
  function project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width  / 2) + (p.screen.scale * p.camera.x * width  / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round(p.screen.scale * roadWidth * width / 2);
  }

  function overlap(x1, w1, x2, w2, percent) {
    const half = (percent || 1) / 2;
    const min1 = x1 - w1 * half, max1 = x1 + w1 * half;
    const min2 = x2 - w2 * half, max2 = x2 + w2 * half;
    return !(max1 < min2 || min1 > max2);
  }

  // ---------- Rendering primitives ----------
  // pre-generated star + cloud + skyline data so they don't flicker
  const STARS = Array.from({ length: 80 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H * 0.35,
    r: Math.random() * 1.4 + 0.3,
    a: Math.random() * 0.7 + 0.3,
    tw: Math.random() * Math.PI * 2,
  }));

  const CLOUDS = Array.from({ length: 7 }, (_, i) => ({
    x: (i * 180 + Math.random() * 120) % (W + 400) - 200,
    y: 60 + Math.random() * 120,
    s: 0.7 + Math.random() * 0.8,
    drift: 0,
  }));

  const SKYLINE = (() => {
    const buildings = [];
    let x = 0;
    while (x < W + 200) {
      const w = 18 + Math.random() * 50;
      const h = 30 + Math.random() * 90;
      buildings.push({ x, w, h, windows: Math.random() < 0.7 });
      x += w + 2 + Math.random() * 6;
    }
    return buildings;
  })();

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    grad.addColorStop(0,    '#0a0420');
    grad.addColorStop(0.25, '#2a0a48');
    grad.addColorStop(0.5,  '#7a1a5e');
    grad.addColorStop(0.7,  '#cc3a6f');
    grad.addColorStop(0.88, '#ff8a3a');
    grad.addColorStop(1,    '#ffd266');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    for (const s of STARS) {
      const flicker = 0.7 + 0.3 * Math.sin(elapsed * 3 + s.tw);
      ctx.fillStyle = `rgba(255, 240, 220, ${s.a * flicker})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawClouds(cameraX) {
    const parallax = -cameraX * 0.00005;
    for (const c of CLOUDS) {
      const cx = ((c.x + c.drift + parallax * 200) % (W + 400) + W + 400) % (W + 400) - 200;
      const cy = c.y;
      const s = c.s;
      ctx.fillStyle = 'rgba(255, 200, 220, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx,           cy,       40 * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 30 * s,  cy + 4,   30 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 28 * s,  cy + 5,   28 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSkyline(horizonY, cameraX) {
    const parallax = -cameraX * 0.00015;
    const baseY = horizonY + 6;
    // silhouette behind mountains
    ctx.fillStyle = '#0a061a';
    for (const b of SKYLINE) {
      const bx = ((b.x + parallax * 200) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillRect(bx, baseY - b.h, b.w, b.h);
      if (b.windows) {
        ctx.fillStyle = 'rgba(255, 200, 100, 0.6)';
        for (let wy = baseY - b.h + 6; wy < baseY - 4; wy += 8) {
          for (let wx = bx + 3; wx < bx + b.w - 4; wx += 6) {
            if (((wx + wy) | 0) % 13 < 7) ctx.fillRect(wx, wy, 2, 3);
          }
        }
        ctx.fillStyle = '#0a061a';
      }
    }
  }

  function drawSun(horizonY) {
    const cx = W * 0.5;
    const cy = horizonY + 30;
    const r = 110;

    const halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.2);
    halo.addColorStop(0, 'rgba(255, 220, 120, 0.6)');
    halo.addColorStop(1, 'rgba(255, 100, 80, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);

    const sun = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    sun.addColorStop(0,    '#fff2b0');
    sun.addColorStop(0.5,  '#ffaa44');
    sun.addColorStop(1,    '#ff3a66');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // retro horizontal slits
    ctx.fillStyle = '#1a0a2e';
    const slitHeights = [4, 5, 6, 8, 10];
    let yy = cy + r * 0.25;
    for (const sh of slitHeights) {
      const dx = Math.sqrt(Math.max(0, r * r - (yy - cy) * (yy - cy)));
      ctx.fillRect(cx - dx, yy, dx * 2, sh);
      yy += sh + 6;
    }
  }

  function drawMountains(horizonY, cameraX) {
    ctx.save();
    const parallax = -cameraX * 0.0002;
    // back range
    ctx.fillStyle = '#3a1850';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    const peaks1 = [0, 120, 260, 380, 520, 680, 820, 960, 1024];
    const heights1 = [40, 90, 60, 110, 75, 95, 50, 80, 60];
    for (let i = 0; i < peaks1.length; i++) {
      ctx.lineTo(peaks1[i] + parallax * 60, horizonY - heights1[i]);
    }
    ctx.lineTo(W, horizonY);
    ctx.closePath();
    ctx.fill();

    // front range darker
    ctx.fillStyle = '#1f0a35';
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 4);
    const peaks2 = [0, 80, 200, 320, 430, 590, 720, 880, 1024];
    const heights2 = [25, 55, 35, 70, 40, 65, 30, 50, 35];
    for (let i = 0; i < peaks2.length; i++) {
      ctx.lineTo(peaks2[i] + parallax * 120, horizonY - heights2[i] + 8);
    }
    ctx.lineTo(W, horizonY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSegment(x1, y1, w1, x2, y2, w2, color, isLight) {
    // grass
    ctx.fillStyle = color.grass;
    ctx.fillRect(0, y2, W, y1 - y2);

    // road (trapezoid)
    polygon(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);

    // rumble strips
    const r1 = w1 / Math.max(6, 2 * LANES);
    const r2 = w2 / Math.max(6, 2 * LANES);
    polygon(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, color.rumble);
    polygon(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, color.rumble);

    // lane markers
    if (isLight) {
      const lw1 = (w1 / Math.max(32, 8 * LANES));
      const lw2 = (w2 / Math.max(32, 8 * LANES));
      const lanew1 = w1 * 2 / LANES;
      const lanew2 = w2 * 2 / LANES;
      let lx1 = x1 - w1 + lanew1;
      let lx2 = x2 - w2 + lanew2;
      for (let l = 1; l < LANES; l++) {
        polygon(lx1 - lw1 / 2, y1, lx1 + lw1 / 2, y1,
                lx2 + lw2 / 2, y2, lx2 - lw2 / 2, y2, color.lane);
        lx1 += lanew1; lx2 += lanew2;
      }
    }
  }

  function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- Sprite drawing ----------
  function drawCarSprite(x, y, scale, color, isPlayer) {
    const w = 110 * scale;
    const h = 60 * scale;
    if (w < 2 || h < 2) return;
    const left = x - w / 2;
    const top = y - h;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.55, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // body gradient
    const body = ctx.createLinearGradient(left, top, left, top + h);
    body.addColorStop(0,   shade(color, 1.35));
    body.addColorStop(0.5, color);
    body.addColorStop(1,   shade(color, 0.6));

    roundRect(left, top, w, h, h * 0.25, body);

    // windshield
    const ws = ctx.createLinearGradient(left, top, left, top + h * 0.45);
    ws.addColorStop(0, '#1a3550');
    ws.addColorStop(1, '#5a8ab0');
    roundRect(left + w * 0.18, top + h * 0.15, w * 0.64, h * 0.32, h * 0.12, ws);

    // hood line
    ctx.fillStyle = shade(color, 0.5);
    ctx.fillRect(left + w * 0.08, top + h * 0.55, w * 0.84, 2 * scale);

    // wheels
    const wheelH = h * 0.22;
    const wheelW = w * 0.14;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(left + w * 0.04, top + h * 0.7, wheelW, wheelH);
    ctx.fillRect(left + w - wheelW - w * 0.04, top + h * 0.7, wheelW, wheelH);

    // lights
    if (isPlayer) {
      ctx.fillStyle = '#ff3060';
      ctx.fillRect(left + w * 0.1,  top + h * 0.05, w * 0.18, h * 0.08);
      ctx.fillRect(left + w * 0.72, top + h * 0.05, w * 0.18, h * 0.08);
    } else {
      // taillights facing player (red glowing)
      const glow = ctx.createRadialGradient(left + w * 0.18, top + h * 0.15, 0,
                                            left + w * 0.18, top + h * 0.15, w * 0.18);
      glow.addColorStop(0, 'rgba(255, 60, 60, 0.9)');
      glow.addColorStop(1, 'rgba(255, 60, 60, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(left, top, w, h);
      const glow2 = ctx.createRadialGradient(left + w * 0.82, top + h * 0.15, 0,
                                             left + w * 0.82, top + h * 0.15, w * 0.18);
      glow2.addColorStop(0, 'rgba(255, 60, 60, 0.9)');
      glow2.addColorStop(1, 'rgba(255, 60, 60, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(left, top, w, h);
    }
  }

  function drawPalm(x, y, scale) {
    const trunkH = 90 * scale;
    const trunkW = 8 * scale;
    if (trunkH < 2) return;
    // trunk
    const g = ctx.createLinearGradient(x - trunkW, y, x + trunkW, y);
    g.addColorStop(0, '#3a2010');
    g.addColorStop(0.5, '#6b3a18');
    g.addColorStop(1, '#3a2010');
    ctx.fillStyle = g;
    ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);
    // fronds
    ctx.fillStyle = '#1a1230';
    const top = y - trunkH;
    const frondR = 38 * scale;
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(ang) * frondR * 0.6,
                  top + Math.sin(ang) * frondR * 0.4,
                  frondR, frondR * 0.25, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    // crown
    ctx.fillStyle = '#0a0a1a';
    ctx.beginPath();
    ctx.arc(x, top, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPylon(x, y, scale) {
    const h = 28 * scale;
    if (h < 2) return;
    ctx.fillStyle = '#ff6020';
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - h * 0.4, y);
    ctx.lineTo(x + h * 0.4, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - h * 0.3, y - h * 0.55, h * 0.6, h * 0.12);
  }

  function drawCactus(x, y, scale) {
    const h = 70 * scale;
    const w = 14 * scale;
    if (h < 2) return;
    ctx.fillStyle = '#1a4030';
    // main body
    roundRect(x - w / 2, y - h, w, h, w * 0.4, '#1a4030');
    // left arm
    ctx.fillRect(x - w * 1.8, y - h * 0.6, w * 0.6, h * 0.35);
    ctx.fillRect(x - w * 1.8, y - h * 0.7, w * 0.6 + w * 0.6, w * 0.5);
    // right arm
    ctx.fillRect(x + w * 1.2, y - h * 0.5, w * 0.6, h * 0.4);
    ctx.fillRect(x + w * 0.4, y - h * 0.5, w * 1.4, w * 0.5);
    // highlight
    ctx.fillStyle = '#2a6048';
    ctx.fillRect(x - w * 0.3, y - h + 2 * scale, w * 0.2, h - 4 * scale);
  }

  function drawRock(x, y, scale) {
    const r = 24 * scale;
    if (r < 2) return;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.6, r * 0.2, x, y - r * 0.3, r);
    g.addColorStop(0, '#7a6a80');
    g.addColorStop(1, '#2a1f3a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - r,         y);
    ctx.lineTo(x - r * 0.7,   y - r * 0.6);
    ctx.lineTo(x - r * 0.2,   y - r * 0.9);
    ctx.lineTo(x + r * 0.4,   y - r * 0.8);
    ctx.lineTo(x + r,         y - r * 0.3);
    ctx.lineTo(x + r * 0.6,   y);
    ctx.closePath();
    ctx.fill();
  }

  function drawBush(x, y, scale) {
    const r = 18 * scale;
    if (r < 2) return;
    ctx.fillStyle = '#1a3a25';
    ctx.beginPath();
    ctx.arc(x - r * 0.5, y - r * 0.4, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 0.4, y - r * 0.5, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x,           y - r * 0.8, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x - r * 0.1, y - r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a5a3a';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.7, r * 0.2, 0, Math.PI * 2);
    ctx.arc(x + r * 0.2, y - r * 0.6, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTree(x, y, scale) {
    const trunkH = 30 * scale;
    const trunkW = 8 * scale;
    if (trunkH < 2) return;
    // trunk
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);
    // foliage - layered green puffs
    const top = y - trunkH;
    const r = 32 * scale;
    ctx.fillStyle = '#0f3320';
    ctx.beginPath();
    ctx.arc(x - r * 0.5, top - r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 0.4, top - r * 0.3, r * 0.65, 0, Math.PI * 2);
    ctx.arc(x,           top - r * 0.7, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x - r * 0.2, top - r * 0.4, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = '#2a6a3a';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, top - r * 0.7, r * 0.25, 0, Math.PI * 2);
    ctx.arc(x + r * 0.1, top - r * 0.5, r * 0.2,  0, Math.PI * 2);
    ctx.fill();
  }

  function drawPine(x, y, scale) {
    const h = 75 * scale;
    const w = 30 * scale;
    if (h < 2) return;
    // trunk
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x - 3 * scale, y - h * 0.18, 6 * scale, h * 0.18);
    // three layered triangles
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const ly = y - h * 0.18 - i * (h * 0.28);
      const lw = w * (1 - i * 0.18);
      const lh = h * 0.42;
      ctx.fillStyle = i === layers - 1 ? '#0a4a28' : '#0e5a30';
      ctx.beginPath();
      ctx.moveTo(x,           ly - lh);
      ctx.lineTo(x - lw / 2,  ly);
      ctx.lineTo(x + lw / 2,  ly);
      ctx.closePath();
      ctx.fill();
      // highlight
      ctx.fillStyle = 'rgba(120, 200, 130, 0.35)';
      ctx.beginPath();
      ctx.moveTo(x,            ly - lh);
      ctx.lineTo(x - lw * 0.15, ly - lh * 0.5);
      ctx.lineTo(x - lw * 0.05, ly - lh * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawSign(x, y, scale) {
    const w = 50 * scale, h = 36 * scale;
    if (h < 2) return;
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(x - 3 * scale, y - 60 * scale, 6 * scale, 60 * scale);
    ctx.fillStyle = '#ff3a6a';
    ctx.fillRect(x - w / 2, y - 80 * scale, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - w / 2 + 4 * scale, y - 80 * scale + 4 * scale, w - 8 * scale, 4 * scale);
    ctx.fillRect(x - w / 2 + 4 * scale, y - 80 * scale + 14 * scale, w - 14 * scale, 4 * scale);
    ctx.fillRect(x - w / 2 + 4 * scale, y - 80 * scale + 24 * scale, w - 8 * scale, 4 * scale);
  }

  function roundRect(x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  function shade(hexOrHsl, amt) {
    // works for hsl(...) by adjusting lightness; for hex by mixing
    if (hexOrHsl.startsWith('hsl')) {
      const m = hexOrHsl.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
      if (m) {
        const h = +m[1], s = +m[2], l = Math.max(0, Math.min(100, +m[3] * amt));
        return `hsl(${h}, ${s}%, ${l}%)`;
      }
    }
    if (hexOrHsl.startsWith('#')) {
      const c = hexOrHsl.substring(1);
      const r = Math.min(255, Math.floor(parseInt(c.substr(0,2),16) * amt));
      const g = Math.min(255, Math.floor(parseInt(c.substr(2,2),16) * amt));
      const b = Math.min(255, Math.floor(parseInt(c.substr(4,2),16) * amt));
      return `rgb(${r},${g},${b})`;
    }
    return hexOrHsl;
  }

  // ---------- Main render ----------
  function render() {
    const baseSegment = findSegment(position);
    const basePercent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerSegment = findSegment(position);
    const playerY = baseSegment.p1.world.y +
      (baseSegment.p2.world.y - baseSegment.p1.world.y) * basePercent;
    const cameraX = playerX * ROAD_WIDTH;
    const cameraY = playerY + CAMERA_HEIGHT;

    // Sky / sun / mountains. Horizon Y rough estimate.
    drawSky();
    const horizonY = H * 0.5;
    drawStars();
    drawClouds(cameraX);
    drawSun(horizonY);
    drawSkyline(horizonY, cameraX);
    drawMountains(horizonY, cameraX);

    let maxY = H;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);

    // Draw road segments
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      segment.looped = segment.index < baseSegment.index;
      segment.clip = maxY;

      project(segment.p1, cameraX - x,         cameraY, position - (segment.looped ? trackLength : 0),
              CAMERA_DEPTH, W, H, ROAD_WIDTH);
      project(segment.p2, cameraX - x - dx,    cameraY, position - (segment.looped ? trackLength : 0),
              CAMERA_DEPTH, W, H, ROAD_WIDTH);

      x += dx;
      dx += segment.curve;

      if (segment.p1.camera.z <= CAMERA_DEPTH ||
          segment.p2.screen.y >= segment.p1.screen.y ||
          segment.p2.screen.y >= maxY) {
        continue;
      }

      const isLight = Math.floor(segment.index / RUMBLE_LENGTH) % 2 === 0;
      drawSegment(
        segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w,
        segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w,
        segment.color, isLight
      );
      maxY = segment.p2.screen.y;
    }

    // Draw sprites & cars back-to-front
    for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
      const segment = segments[(baseSegment.index + n) % segments.length];

      for (const sprite of segment.sprites) {
        const spriteScale = segment.p1.screen.scale;
        const spriteX = segment.p1.screen.x + (spriteScale * sprite.offset * ROAD_WIDTH * W / 2);
        const spriteY = segment.p1.screen.y;
        const sz = spriteScale * 1000;
        if (sprite.source === 'palm')   drawPalm(spriteX, spriteY, sz);
        if (sprite.source === 'pylon')  drawPylon(spriteX, spriteY, sz);
        if (sprite.source === 'sign')   drawSign(spriteX, spriteY, sz);
        if (sprite.source === 'cactus') drawCactus(spriteX, spriteY, sz);
        if (sprite.source === 'rock')   drawRock(spriteX, spriteY, sz);
        if (sprite.source === 'bush')   drawBush(spriteX, spriteY, sz);
        if (sprite.source === 'tree')   drawTree(spriteX, spriteY, sz);
        if (sprite.source === 'pine')   drawPine(spriteX, spriteY, sz);
      }

      for (const car of segment.cars) {
        const carPercent = ((car.z - segment.p1.world.z) / SEGMENT_LENGTH);
        const sx = segment.p1.screen.x + (segment.p2.screen.x - segment.p1.screen.x) * carPercent;
        const sy = segment.p1.screen.y + (segment.p2.screen.y - segment.p1.screen.y) * carPercent;
        const sScale = segment.p1.screen.scale +
                       (segment.p2.screen.scale - segment.p1.screen.scale) * carPercent;
        const screenX = sx + (sScale * car.offset * ROAD_WIDTH * W / 2);
        drawCarSprite(screenX, sy, sScale * 3500, car.color, false);
      }
    }

    // Player car (fixed position)
    drawPlayer();

    // Vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawPlayer() {
    const px = W / 2;
    const py = H - 80;
    // wobble based on speed & steering
    const bob = Math.sin(elapsed * 16) * (speed / MAX_SPEED) * 2;
    const lean = (keys.left ? -6 : 0) + (keys.right ? 6 : 0);

    ctx.save();
    ctx.translate(px + lean, py + bob);
    drawCarSprite(0, 0, 2.2, '#ff2050', true);
    ctx.restore();

    // motion lines at high speed
    if (speed > MAX_SPEED * 0.5) {
      ctx.strokeStyle = `rgba(255,255,255,${(speed / MAX_SPEED - 0.5) * 0.5})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const yy = H - (Math.random() * H * 0.7);
        const len = 20 + Math.random() * 60;
        const xx = Math.random() < 0.5 ? Math.random() * (W / 2 - 100) : W / 2 + 100 + Math.random() * (W / 2 - 100);
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + len);
        ctx.stroke();
      }
    }
  }

  // ---------- Update ----------
  function update(dt) {
    if (gameOver || paused) return;

    elapsed += dt;
    updateCars(dt);

    const speedPct = speed / MAX_SPEED;
    const dx_steer = dt * 2 * speedPct;

    position = (position + dt * speed) % trackLength;
    if (position < 0) position += trackLength;

    const playerSegment = findSegment(position);

    if (keys.left)  playerX -= dx_steer;
    if (keys.right) playerX += dx_steer;

    // centrifugal force on curves
    playerX -= dx_steer * speedPct * playerSegment.curve * CENTRIFUGAL;

    if (keys.up)        speed += ACCEL * dt;
    else if (keys.down) speed += BRAKING * dt;
    else                speed += DECEL * dt;

    // offroad
    if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT) {
      speed += OFFROAD_DECEL * dt;
    }

    // car collisions
    if (speed > 50) {
      for (const car of playerSegment.cars) {
        if (overlap(playerX, 0.8, car.offset, 0.8, 0.6)) {
          triggerCrash();
          return;
        }
      }
    }

    playerX = Math.max(-2, Math.min(2, playerX));
    speed = Math.max(0, Math.min(MAX_SPEED, speed));

    // score
    score += Math.floor(speed * dt * 0.01);

    // HUD
    document.getElementById('speed').textContent = Math.floor(speed / MAX_SPEED * 500);
    document.getElementById('score').textContent = score;
    document.getElementById('time').textContent = elapsed.toFixed(1);
  }

  function triggerCrash() {
    gameOver = true;
    speed = 0;
    document.getElementById('final-score').textContent = score;
    document.getElementById('gameover').classList.remove('hidden');
    document.getElementById('gameover').classList.add('visible');
  }

  // ---------- Loop ----------
  function frame(t) {
    if (!lastTime) lastTime = t;
    const dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;

    if (running) {
      update(dt);
      render();
    }
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  function startGame() {
    resetRoad();
    resetCars();
    position = 0;
    playerX = 0;
    speed = 0;
    score = 0;
    elapsed = 0;
    gameOver = false;
    paused = false;
    running = true;
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('gameover').classList.add('hidden');
    document.getElementById('gameover').classList.remove('visible');
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);

  // initial render so it doesn't show black
  resetRoad();
  resetCars();
  render();
  requestAnimationFrame(frame);
})();
