/* Sparkle Wash — Premium Car Detailing Simulator
 * Rendered procedurally on HTML5 Canvas with multi-layer compositing:
 *   bodyCanvas  — pre-rendered car paint, glass, alloys, chrome
 *   dirtCanvas  — initial grime overlay (erased by tools)
 *   foamCanvas  — applied soap foam
 *   waxCanvas   — high-gloss shine accumulator
 *   maskCanvas  — silhouette used for clipping overlays
 */
(() => {
  'use strict';

  // ------- Setup ----------------------------------------------------------
  const stage = document.getElementById('stage');
  const ctx = stage.getContext('2d');
  const W = stage.width;
  const H = stage.height;

  function makeCanvas(w = W, h = H) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  const bodyCanvas = makeCanvas(), bodyCtx = bodyCanvas.getContext('2d');
  const dirtCanvas = makeCanvas(), dirtCtx = dirtCanvas.getContext('2d');
  const foamCanvas = makeCanvas(), foamCtx = foamCanvas.getContext('2d');
  const waxCanvas  = makeCanvas(), waxCtx  = waxCanvas.getContext('2d');
  const wetCanvas  = makeCanvas(), wetCtx  = wetCanvas.getContext('2d');
  const maskCanvas = makeCanvas(), maskCtx = maskCanvas.getContext('2d');
  const bgCanvas   = makeCanvas(), bgCtx   = bgCanvas.getContext('2d');

  // small canvases used to sample fill levels cheaply
  const sampleSize = 96;
  const sampleCanvas = makeCanvas(sampleSize, sampleSize);
  const sampleCtx = sampleCanvas.getContext('2d');

  // ------- Car presets ----------------------------------------------------
  const carPresets = [
    { name: 'Crimson Roadster',  body: ['#ff5560','#ff2030','#9a0612'], accent: '#1a0306', rim: '#e6e8ee' },
    { name: 'Sapphire GT',       body: ['#5aa6ff','#1d5cf0','#082c8a'], accent: '#04102a', rim: '#dde1e9' },
    { name: 'Onyx Phantom',      body: ['#4a5364','#1e2330','#06090f'], accent: '#000',    rim: '#bdc1c9' },
    { name: 'Pearl Coupé',       body: ['#ffffff','#e3eaf5','#9eb2ce'], accent: '#1a232f', rim: '#c8ccd4' },
    { name: 'Citrus Spider',     body: ['#ffe06a','#ffb521','#b06a00'], accent: '#1a0e02', rim: '#d6dade' },
    { name: 'Verdant Tourer',    body: ['#6ee6a5','#0fab66','#03512d'], accent: '#06170f', rim: '#dde1e9' },
    { name: 'Lavender Concept',  body: ['#d6b3ff','#8a52e6','#311572'], accent: '#0a0418', rim: '#dadbe2' },
  ];

  // ------- Game state -----------------------------------------------------
  const state = {
    tool: 'hose',
    mouse: { x: W * 0.5, y: H * 0.5, down: false, lastX: W * 0.5, lastY: H * 0.5, inside: false },
    score: 0,
    combo: 1,
    timeLeft: 120,
    running: false,
    finished: false,
    car: null,
    initialDirt: 1,
    cleanPct: 0,
    foamPct: 0,
    shinePct: 0,
    particles: [],
    droplets: [],
    sparkles: [],
    lastFrame: 0,
    sampleTimer: 0,
    cursorPulse: 0,
    floorPuddle: 0,
    bestShineThisRound: 0,
    carPath: null,
  };

  // ------- DOM ------------------------------------------------------------
  const ui = {
    cleanFill: document.getElementById('cleanFill'),
    cleanPct:  document.getElementById('cleanPct'),
    foamFill:  document.getElementById('foamFill'),
    shineFill: document.getElementById('shineFill'),
    score:     document.getElementById('score'),
    timer:     document.getElementById('timer'),
    overlay:   document.getElementById('overlay'),
    finishOv:  document.getElementById('finishOverlay'),
    startBtn:  document.getElementById('startBtn'),
    nextBtn:   document.getElementById('nextBtn'),
    finalClean:document.getElementById('finalClean'),
    finalShine:document.getElementById('finalShine'),
    finalScore:document.getElementById('finalScore'),
    finishTitle:document.getElementById('finishTitle'),
    finishSub: document.getElementById('finishSub'),
    tools:     [...document.querySelectorAll('.tool')],
  };

  // ------- Car silhouette path -------------------------------------------
  // Side-view luxury sedan, designed in normalized coords centered around (cx,cy)
  function carPath(cx, cy, scale) {
    const p = new Path2D();
    const s = scale;
    // start at front-lower bumper
    p.moveTo(cx - 3.30 * s, cy + 0.95 * s);
    // front bumper curve up
    p.bezierCurveTo(cx - 3.55 * s, cy + 0.55 * s, cx - 3.55 * s, cy + 0.15 * s, cx - 3.30 * s, cy + 0.00 * s);
    // hood
    p.bezierCurveTo(cx - 2.80 * s, cy - 0.25 * s, cx - 2.20 * s, cy - 0.45 * s, cx - 1.80 * s, cy - 0.55 * s);
    // windshield slope
    p.bezierCurveTo(cx - 1.50 * s, cy - 0.65 * s, cx - 1.25 * s, cy - 1.10 * s, cx - 0.75 * s, cy - 1.35 * s);
    // roof
    p.bezierCurveTo(cx - 0.20 * s, cy - 1.55 * s, cx + 0.65 * s, cy - 1.55 * s, cx + 1.30 * s, cy - 1.35 * s);
    // rear windshield slope
    p.bezierCurveTo(cx + 1.85 * s, cy - 1.15 * s, cx + 2.15 * s, cy - 0.75 * s, cx + 2.50 * s, cy - 0.55 * s);
    // trunk lid
    p.bezierCurveTo(cx + 2.95 * s, cy - 0.40 * s, cx + 3.25 * s, cy - 0.30 * s, cx + 3.45 * s, cy - 0.10 * s);
    // rear bumper
    p.bezierCurveTo(cx + 3.65 * s, cy + 0.20 * s, cx + 3.70 * s, cy + 0.65 * s, cx + 3.50 * s, cy + 0.95 * s);
    // bottom (between wheels & bumpers)
    p.lineTo(cx - 3.30 * s, cy + 0.95 * s);
    p.closePath();
    return p;
  }

  // wheel positions relative to car center
  function wheelCenters(cx, cy, scale) {
    return [
      { x: cx - 2.30 * scale, y: cy + 0.95 * scale, r: 0.70 * scale },
      { x: cx + 2.40 * scale, y: cy + 0.95 * scale, r: 0.70 * scale },
    ];
  }

  // ------- Background scene ----------------------------------------------
  function buildBackground() {
    bgCtx.clearRect(0, 0, W, H);

    // sky / back wall gradient (detail bay)
    const wall = bgCtx.createLinearGradient(0, 0, 0, H * 0.78);
    wall.addColorStop(0.00, '#162033');
    wall.addColorStop(0.55, '#0b1422');
    wall.addColorStop(1.00, '#070b14');
    bgCtx.fillStyle = wall;
    bgCtx.fillRect(0, 0, W, H * 0.78);

    // neon strip lighting along top
    const neon = bgCtx.createLinearGradient(0, H * 0.04, 0, H * 0.12);
    neon.addColorStop(0, 'rgba(120, 200, 255, 0.0)');
    neon.addColorStop(0.5, 'rgba(120, 200, 255, 0.65)');
    neon.addColorStop(1, 'rgba(120, 200, 255, 0.0)');
    bgCtx.fillStyle = neon;
    bgCtx.fillRect(0, H * 0.04, W, H * 0.08);

    // soft warm key light from upper-left
    const key = bgCtx.createRadialGradient(W * 0.18, -50, 40, W * 0.18, -50, W * 0.6);
    key.addColorStop(0, 'rgba(255, 220, 160, 0.35)');
    key.addColorStop(1, 'rgba(255, 220, 160, 0)');
    bgCtx.fillStyle = key;
    bgCtx.fillRect(0, 0, W, H);

    // cool fill from upper-right
    const fill = bgCtx.createRadialGradient(W * 0.85, -30, 30, W * 0.85, -30, W * 0.55);
    fill.addColorStop(0, 'rgba(120, 170, 255, 0.30)');
    fill.addColorStop(1, 'rgba(120, 170, 255, 0)');
    bgCtx.fillStyle = fill;
    bgCtx.fillRect(0, 0, W, H);

    // vertical service-bay panel lines
    bgCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    bgCtx.lineWidth = 1;
    for (let x = 80; x < W; x += 90) {
      bgCtx.beginPath();
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, H * 0.78);
      bgCtx.stroke();
    }

    // logo on back wall
    bgCtx.save();
    bgCtx.translate(W * 0.5, H * 0.18);
    bgCtx.font = '700 64px -apple-system, "Segoe UI", sans-serif';
    bgCtx.textAlign = 'center';
    bgCtx.fillStyle = 'rgba(180, 220, 255, 0.07)';
    bgCtx.fillText('SPARKLE WASH', 0, 0);
    bgCtx.font = '500 20px -apple-system, "Segoe UI", sans-serif';
    bgCtx.fillStyle = 'rgba(180, 220, 255, 0.05)';
    bgCtx.fillText('— premium detailing bay —', 0, 28);
    bgCtx.restore();

    // floor: wet polished concrete with reflections
    const floorTop = H * 0.78;
    const floor = bgCtx.createLinearGradient(0, floorTop, 0, H);
    floor.addColorStop(0, '#0b1320');
    floor.addColorStop(0.4, '#0a1018');
    floor.addColorStop(1, '#070b13');
    bgCtx.fillStyle = floor;
    bgCtx.fillRect(0, floorTop, W, H - floorTop);

    // floor tile perspective lines
    bgCtx.strokeStyle = 'rgba(180, 220, 255, 0.06)';
    bgCtx.lineWidth = 1;
    const vpx = W * 0.5, vpy = floorTop;
    for (let i = -14; i <= 14; i++) {
      const x = W * 0.5 + i * 64;
      bgCtx.beginPath();
      bgCtx.moveTo(x, floorTop);
      bgCtx.lineTo(vpx + (x - vpx) * 4, H);
      bgCtx.stroke();
    }
    // horizontal lines
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const y = floorTop + Math.pow(t, 1.6) * (H - floorTop);
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(W, y);
      bgCtx.stroke();
    }

    // floor sheen
    const sheen = bgCtx.createRadialGradient(W * 0.5, H * 0.82, 50, W * 0.5, H * 0.82, W * 0.55);
    sheen.addColorStop(0, 'rgba(180, 220, 255, 0.10)');
    sheen.addColorStop(1, 'rgba(180, 220, 255, 0)');
    bgCtx.fillStyle = sheen;
    bgCtx.fillRect(0, floorTop, W, H - floorTop);

    // ground horizon glow
    const horizon = bgCtx.createLinearGradient(0, floorTop - 4, 0, floorTop + 30);
    horizon.addColorStop(0, 'rgba(120, 200, 255, 0)');
    horizon.addColorStop(0.5, 'rgba(120, 200, 255, 0.22)');
    horizon.addColorStop(1, 'rgba(120, 200, 255, 0)');
    bgCtx.fillStyle = horizon;
    bgCtx.fillRect(0, floorTop - 4, W, 34);
  }

  // ------- Car drawing ----------------------------------------------------
  function drawCarBody(preset) {
    bodyCtx.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.55, scale = 90; // 1 unit ≈ 90px

    const path = carPath(cx, cy, scale);
    const wheels = wheelCenters(cx, cy, scale);

    // shadow under the car
    bodyCtx.save();
    const shadowGrad = bodyCtx.createRadialGradient(cx, cy + 1.15 * scale, 20, cx, cy + 1.15 * scale, 3.6 * scale);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.65)');
    shadowGrad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    bodyCtx.fillStyle = shadowGrad;
    bodyCtx.beginPath();
    bodyCtx.ellipse(cx, cy + 1.15 * scale, 3.6 * scale, 0.6 * scale, 0, 0, Math.PI * 2);
    bodyCtx.fill();
    bodyCtx.restore();

    // floor reflection of car (drawn flipped, low alpha)
    bodyCtx.save();
    bodyCtx.translate(cx, cy + 2.10 * scale);
    bodyCtx.scale(1, -1);
    bodyCtx.translate(-cx, -cy);
    bodyCtx.globalAlpha = 0.22;
    bodyCtx.filter = 'blur(2px)';
    paintCar(bodyCtx, preset, cx, cy, scale, true);
    bodyCtx.restore();

    // soft fade gradient on reflection (mask the lower half so it fades out)
    bodyCtx.save();
    bodyCtx.globalCompositeOperation = 'destination-out';
    const fade = bodyCtx.createLinearGradient(0, cy + 1.15 * scale, 0, cy + 2.6 * scale);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    bodyCtx.fillStyle = fade;
    bodyCtx.fillRect(0, cy + 1.15 * scale, W, 3 * scale);
    bodyCtx.restore();

    // wheels (rear first for a tiny depth bias)
    drawWheel(bodyCtx, wheels[1], preset.rim);
    drawWheel(bodyCtx, wheels[0], preset.rim);

    // car body fills
    paintCar(bodyCtx, preset, cx, cy, scale, false);

    // bumpers / chrome strip
    bodyCtx.save();
    bodyCtx.clip(path);
    const chromeGrad = bodyCtx.createLinearGradient(0, cy + 0.80 * scale, 0, cy + 1.05 * scale);
    chromeGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
    chromeGrad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    chromeGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
    bodyCtx.fillStyle = chromeGrad;
    bodyCtx.fillRect(cx - 3.5 * scale, cy + 0.78 * scale, 7 * scale, 0.25 * scale);

    // door cut lines
    bodyCtx.strokeStyle = 'rgba(0,0,0,0.45)';
    bodyCtx.lineWidth = 1.5;
    bodyCtx.beginPath();
    // front door
    bodyCtx.moveTo(cx - 1.10 * scale, cy - 0.85 * scale);
    bodyCtx.lineTo(cx - 1.20 * scale, cy + 0.90 * scale);
    // rear door
    bodyCtx.moveTo(cx + 0.10 * scale, cy - 1.45 * scale);
    bodyCtx.lineTo(cx + 0.05 * scale, cy + 0.90 * scale);
    // trunk
    bodyCtx.moveTo(cx + 1.70 * scale, cy - 1.25 * scale);
    bodyCtx.lineTo(cx + 2.10 * scale, cy - 0.65 * scale);
    bodyCtx.stroke();

    // door handles
    bodyCtx.fillStyle = 'rgba(0,0,0,0.55)';
    bodyCtx.fillRect(cx - 1.00 * scale, cy - 0.35 * scale, 0.40 * scale, 0.10 * scale);
    bodyCtx.fillRect(cx + 0.30 * scale, cy - 0.35 * scale, 0.40 * scale, 0.10 * scale);

    bodyCtx.restore();

    // headlight
    drawHeadlight(bodyCtx, cx - 3.20 * scale, cy + 0.10 * scale, 0.45 * scale);
    // tail light
    drawTailLight(bodyCtx, cx + 3.30 * scale, cy + 0.10 * scale, 0.40 * scale);
  }

  function paintCar(c, preset, cx, cy, scale, reflection) {
    const path = carPath(cx, cy, scale);

    // base paint with multi-stop vertical gradient
    const paint = c.createLinearGradient(0, cy - 1.5 * scale, 0, cy + 1.0 * scale);
    paint.addColorStop(0.00, preset.body[0]);
    paint.addColorStop(0.45, preset.body[1]);
    paint.addColorStop(1.00, preset.body[2]);
    c.fillStyle = paint;
    c.fill(path);

    // sky reflection band on hood/trunk top
    c.save();
    c.clip(path);
    const skyRefl = c.createLinearGradient(0, cy - 1.6 * scale, 0, cy + 0.3 * scale);
    skyRefl.addColorStop(0, 'rgba(190, 220, 255, 0.45)');
    skyRefl.addColorStop(0.4, 'rgba(190, 220, 255, 0.05)');
    skyRefl.addColorStop(1, 'rgba(190, 220, 255, 0)');
    c.fillStyle = skyRefl;
    c.fillRect(cx - 3.6 * scale, cy - 1.6 * scale, 7.2 * scale, 2.0 * scale);

    // ambient occlusion at the bottom
    const ao = c.createLinearGradient(0, cy + 0.55 * scale, 0, cy + 1.0 * scale);
    ao.addColorStop(0, 'rgba(0,0,0,0)');
    ao.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = ao;
    c.fillRect(cx - 3.6 * scale, cy + 0.55 * scale, 7.2 * scale, 0.5 * scale);

    // side accent line
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(cx - 3.0 * scale, cy + 0.20 * scale);
    c.bezierCurveTo(
      cx - 1.0 * scale, cy + 0.00 * scale,
      cx + 1.5 * scale, cy + 0.00 * scale,
      cx + 3.0 * scale, cy + 0.25 * scale,
    );
    c.stroke();

    // glasshouse (greenhouse) — windows
    const windowsPath = new Path2D();
    windowsPath.moveTo(cx - 1.55 * scale, cy - 0.62 * scale);
    windowsPath.bezierCurveTo(
      cx - 1.30 * scale, cy - 0.95 * scale,
      cx - 1.10 * scale, cy - 1.20 * scale,
      cx - 0.70 * scale, cy - 1.30 * scale,
    );
    windowsPath.bezierCurveTo(
      cx - 0.10 * scale, cy - 1.46 * scale,
      cx + 0.70 * scale, cy - 1.46 * scale,
      cx + 1.20 * scale, cy - 1.30 * scale,
    );
    windowsPath.bezierCurveTo(
      cx + 1.65 * scale, cy - 1.16 * scale,
      cx + 1.95 * scale, cy - 0.90 * scale,
      cx + 2.20 * scale, cy - 0.65 * scale,
    );
    windowsPath.lineTo(cx - 1.55 * scale, cy - 0.62 * scale);
    windowsPath.closePath();

    const winGrad = c.createLinearGradient(0, cy - 1.6 * scale, 0, cy - 0.4 * scale);
    winGrad.addColorStop(0, '#101826');
    winGrad.addColorStop(0.45, '#1a2436');
    winGrad.addColorStop(1, '#0a1018');
    c.fillStyle = winGrad;
    c.fill(windowsPath);

    // reflection inside windows — bright streak
    c.save();
    c.clip(windowsPath);
    const winRefl = c.createLinearGradient(cx - 1.5 * scale, cy - 1.4 * scale, cx + 0.5 * scale, cy - 0.6 * scale);
    winRefl.addColorStop(0, 'rgba(255,255,255,0)');
    winRefl.addColorStop(0.4, 'rgba(180, 220, 255, 0.45)');
    winRefl.addColorStop(0.55, 'rgba(255,255,255,0.30)');
    winRefl.addColorStop(0.7, 'rgba(180, 220, 255, 0.45)');
    winRefl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = winRefl;
    c.fillRect(cx - 1.8 * scale, cy - 1.5 * scale, 4.2 * scale, 1.0 * scale);

    // window pillar (B-pillar)
    c.fillStyle = preset.accent;
    c.fillRect(cx - 0.05 * scale, cy - 1.45 * scale, 0.10 * scale, 0.85 * scale);

    // chrome window trim
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2;
    c.stroke(windowsPath);
    c.restore();

    // top highlight on roof
    if (!reflection) {
      c.save();
      c.clip(path);
      const roofHi = c.createRadialGradient(cx, cy - 1.45 * scale, 10, cx, cy - 1.45 * scale, 1.6 * scale);
      roofHi.addColorStop(0, 'rgba(255,255,255,0.55)');
      roofHi.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = roofHi;
      c.fillRect(cx - 1.8 * scale, cy - 1.7 * scale, 3.6 * scale, 0.6 * scale);
      c.restore();
    }

    c.restore();

    // outline
    c.lineWidth = 1.4;
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.stroke(path);
  }

  function drawWheel(c, w, rimColor) {
    // tire
    const tireGrad = c.createRadialGradient(w.x, w.y, w.r * 0.3, w.x, w.y, w.r);
    tireGrad.addColorStop(0, '#222831');
    tireGrad.addColorStop(0.7, '#10141a');
    tireGrad.addColorStop(1, '#04060a');
    c.fillStyle = tireGrad;
    c.beginPath();
    c.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    c.fill();

    // hub
    const hubR = w.r * 0.7;
    const hubGrad = c.createRadialGradient(w.x - hubR * 0.3, w.y - hubR * 0.3, 2, w.x, w.y, hubR);
    hubGrad.addColorStop(0, '#fbfcff');
    hubGrad.addColorStop(0.5, rimColor);
    hubGrad.addColorStop(1, '#3a4050');
    c.fillStyle = hubGrad;
    c.beginPath();
    c.arc(w.x, w.y, hubR, 0, Math.PI * 2);
    c.fill();

    // alloy spokes (5)
    c.save();
    c.translate(w.x, w.y);
    c.fillStyle = 'rgba(20,24,32,0.85)';
    const spokes = 5;
    for (let i = 0; i < spokes; i++) {
      c.rotate((Math.PI * 2) / spokes);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-hubR * 0.16, hubR * 0.94);
      c.lineTo(hubR * 0.16, hubR * 0.94);
      c.closePath();
      c.fill();
    }
    c.restore();

    // center cap
    c.fillStyle = '#2a3140';
    c.beginPath();
    c.arc(w.x, w.y, w.r * 0.18, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.beginPath();
    c.arc(w.x - w.r * 0.05, w.y - w.r * 0.05, w.r * 0.06, 0, Math.PI * 2);
    c.fill();

    // rim highlight
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(w.x, w.y, hubR * 0.96, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
  }

  function drawHeadlight(c, x, y, r) {
    const g = c.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#dcefff');
    g.addColorStop(1, '#1a2334');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, r * 0.85, r * 0.55, 0.1, 0, Math.PI * 2);
    c.fill();
    // glow
    const glow = c.createRadialGradient(x, y, 2, x, y, r * 2.2);
    glow.addColorStop(0, 'rgba(255, 240, 200, 0.45)');
    glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
    c.fillStyle = glow;
    c.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  }

  function drawTailLight(c, x, y, r) {
    const g = c.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, '#ff9aa0');
    g.addColorStop(0.4, '#cc1828');
    g.addColorStop(1, '#3d050b');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, r * 0.75, r * 0.45, 0, 0, Math.PI * 2);
    c.fill();
    const glow = c.createRadialGradient(x, y, 2, x, y, r * 1.8);
    glow.addColorStop(0, 'rgba(255, 80, 80, 0.30)');
    glow.addColorStop(1, 'rgba(255, 80, 80, 0)');
    c.fillStyle = glow;
    c.fillRect(x - r * 1.8, y - r * 1.8, r * 3.6, r * 3.6);
  }

  function buildMask() {
    maskCtx.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.55, scale = 90;
    state.carPath = carPath(cx, cy, scale);
    maskCtx.fillStyle = '#fff';
    maskCtx.fill(state.carPath);
  }

  // ------- Dirt generation ------------------------------------------------
  function generateDirt(intensity) {
    dirtCtx.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.55, scale = 90;
    dirtCtx.save();
    dirtCtx.clip(carPath(cx, cy, scale));

    // dust film — large soft blotches
    const filmCount = Math.floor(220 * intensity);
    for (let i = 0; i < filmCount; i++) {
      const x = cx + (Math.random() - 0.5) * 7 * scale;
      const y = cy + (Math.random() - 0.5) * 2.6 * scale;
      const r = 18 + Math.random() * 50;
      const hue = 28 + Math.random() * 18;
      const sat = 18 + Math.random() * 22;
      const light = 22 + Math.random() * 14;
      const a = 0.10 + Math.random() * 0.22;
      const g = dirtCtx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${hue},${sat}%,${light}%,${a})`);
      g.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
      dirtCtx.fillStyle = g;
      dirtCtx.beginPath();
      dirtCtx.arc(x, y, r, 0, Math.PI * 2);
      dirtCtx.fill();
    }

    // mud splashes near wheels
    const splashes = Math.floor(60 * intensity);
    for (let i = 0; i < splashes; i++) {
      const fromRear = Math.random() < 0.5;
      const wx = fromRear ? cx + 2.40 * scale : cx - 2.30 * scale;
      const wy = cy + 0.95 * scale;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 140;
      const x = wx + Math.cos(angle) * dist;
      const y = wy - Math.abs(Math.sin(angle)) * dist * 0.8;
      const r = 4 + Math.random() * 10;
      const hue = 20 + Math.random() * 18;
      const a = 0.45 + Math.random() * 0.35;
      const g = dirtCtx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${hue},45%,18%,${a})`);
      g.addColorStop(1, `hsla(${hue},45%,18%,0)`);
      dirtCtx.fillStyle = g;
      dirtCtx.beginPath();
      dirtCtx.arc(x, y, r, 0, Math.PI * 2);
      dirtCtx.fill();
    }

    // streaks of grime running down
    const streaks = Math.floor(28 * intensity);
    for (let i = 0; i < streaks; i++) {
      const x = cx + (Math.random() - 0.5) * 6.6 * scale;
      const y0 = cy + (Math.random() - 0.5) * 1.0 * scale;
      const len = 60 + Math.random() * 160;
      dirtCtx.strokeStyle = `hsla(${28 + Math.random() * 12},35%,${18 + Math.random() * 8}%,${0.20 + Math.random() * 0.20})`;
      dirtCtx.lineWidth = 2 + Math.random() * 4;
      dirtCtx.lineCap = 'round';
      dirtCtx.beginPath();
      dirtCtx.moveTo(x, y0);
      dirtCtx.bezierCurveTo(x + 4, y0 + len * 0.3, x - 4, y0 + len * 0.6, x + (Math.random() - 0.5) * 6, y0 + len);
      dirtCtx.stroke();
    }

    // bird droppings (cheeky white-grey speckles)
    const drops = Math.floor(8 * intensity);
    for (let i = 0; i < drops; i++) {
      const x = cx + (Math.random() - 0.5) * 5 * scale;
      const y = cy - 1.4 * scale + Math.random() * 0.4 * scale;
      const r = 3 + Math.random() * 5;
      dirtCtx.fillStyle = 'rgba(240, 240, 230, 0.85)';
      dirtCtx.beginPath();
      dirtCtx.arc(x, y, r, 0, Math.PI * 2);
      dirtCtx.fill();
      dirtCtx.fillStyle = 'rgba(150, 140, 120, 0.7)';
      dirtCtx.beginPath();
      dirtCtx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
      dirtCtx.fill();
    }

    dirtCtx.restore();
  }

  // ------- Tool application ----------------------------------------------
  function strokeBetween(x0, y0, x1, y1, step, fn) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      fn(x0 + dx * t, y0 + dy * t);
    }
  }

  function applyHose(x, y) {
    // remove dirt gently
    dirtCtx.save();
    dirtCtx.globalCompositeOperation = 'destination-out';
    const r = 38;
    const g = dirtCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dirtCtx.fillStyle = g;
    dirtCtx.beginPath(); dirtCtx.arc(x, y, r, 0, Math.PI * 2); dirtCtx.fill();
    dirtCtx.restore();

    // rinse foam aggressively
    foamCtx.save();
    foamCtx.globalCompositeOperation = 'destination-out';
    const fr = 60;
    const fg = foamCtx.createRadialGradient(x, y, 0, x, y, fr);
    fg.addColorStop(0, 'rgba(0,0,0,0.85)');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    foamCtx.fillStyle = fg;
    foamCtx.beginPath(); foamCtx.arc(x, y, fr, 0, Math.PI * 2); foamCtx.fill();
    foamCtx.restore();

    // tiny wax loss when blasted with water
    waxCtx.save();
    waxCtx.globalCompositeOperation = 'destination-out';
    const wg = waxCtx.createRadialGradient(x, y, 0, x, y, 30);
    wg.addColorStop(0, 'rgba(0,0,0,0.10)');
    wg.addColorStop(1, 'rgba(0,0,0,0)');
    waxCtx.fillStyle = wg;
    waxCtx.beginPath(); waxCtx.arc(x, y, 30, 0, Math.PI * 2); waxCtx.fill();
    waxCtx.restore();

    // spray particles
    spawnSpray(x, y, 6);
  }

  function applyFoam(x, y) {
    foamCtx.save();
    if (state.carPath) foamCtx.clip(state.carPath);
    // foam blob cluster
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * 36;
      const oy = (Math.random() - 0.5) * 36;
      const r = 14 + Math.random() * 14;
      const g = foamCtx.createRadialGradient(x + ox, y + oy, 1, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.55, 'rgba(220,238,255,0.55)');
      g.addColorStop(1, 'rgba(220,238,255,0)');
      foamCtx.fillStyle = g;
      foamCtx.beginPath(); foamCtx.arc(x + ox, y + oy, r, 0, Math.PI * 2); foamCtx.fill();
    }
    // tiny iridescent highlights
    for (let i = 0; i < 4; i++) {
      const ox = (Math.random() - 0.5) * 30;
      const oy = (Math.random() - 0.5) * 30;
      foamCtx.fillStyle = `hsla(${Math.random() * 360}, 90%, 85%, 0.55)`;
      foamCtx.beginPath(); foamCtx.arc(x + ox, y + oy, 1.4, 0, Math.PI * 2); foamCtx.fill();
    }
    foamCtx.restore();

    spawnBubbles(x, y, 2);
  }

  function applySponge(x, y) {
    // sponge only effective where foam exists — sample local foam strength
    const fa = sampleAlphaAt(foamCanvas, x, y);
    const effective = 0.25 + fa * 1.4; // dry sponge still does a bit

    dirtCtx.save();
    dirtCtx.globalCompositeOperation = 'destination-out';
    const r = 34;
    const g = dirtCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(0.95, effective)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dirtCtx.fillStyle = g;
    dirtCtx.beginPath(); dirtCtx.arc(x, y, r, 0, Math.PI * 2); dirtCtx.fill();
    dirtCtx.restore();

    // sponging also presses foam out a bit
    foamCtx.save();
    foamCtx.globalCompositeOperation = 'destination-out';
    const fg = foamCtx.createRadialGradient(x, y, 0, x, y, 26);
    fg.addColorStop(0, 'rgba(0,0,0,0.20)');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    foamCtx.fillStyle = fg;
    foamCtx.beginPath(); foamCtx.arc(x, y, 26, 0, Math.PI * 2); foamCtx.fill();
    foamCtx.restore();

    if (fa > 0.05) spawnBubbles(x, y, 1);
  }

  function applyWax(x, y) {
    // wax only sticks where dirt is gone AND foam is gone
    const da = sampleAlphaAt(dirtCanvas, x, y);
    const fa = sampleAlphaAt(foamCanvas, x, y);
    const eff = Math.max(0, 1 - da * 4 - fa * 2);
    if (eff <= 0.05) {
      // smear sparkle anyway but no shine
      spawnSparkle(x, y, 1, 0.4);
      return;
    }
    waxCtx.save();
    if (state.carPath) waxCtx.clip(state.carPath);
    const r = 28;
    const g = waxCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 250, 220, ${0.32 * eff})`);
    g.addColorStop(0.6, `rgba(255, 240, 200, ${0.14 * eff})`);
    g.addColorStop(1, 'rgba(255, 240, 200, 0)');
    waxCtx.fillStyle = g;
    waxCtx.beginPath(); waxCtx.arc(x, y, r, 0, Math.PI * 2); waxCtx.fill();
    waxCtx.restore();

    if (Math.random() < 0.4) spawnSparkle(x, y, 1, eff);
  }

  function sampleAlphaAt(canvas, x, y) {
    try {
      const d = canvas.getContext('2d').getImageData(Math.max(0, Math.min(W - 1, x | 0)), Math.max(0, Math.min(H - 1, y | 0)), 1, 1).data;
      return d[3] / 255;
    } catch (e) { return 0; }
  }

  // ------- Particle systems ----------------------------------------------
  function spawnSpray(x, y, n) {
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      const sp = 4 + Math.random() * 6;
      state.particles.push({
        x, y,
        vx: Math.cos(ang) * sp + (Math.random() - 0.5) * 3,
        vy: Math.sin(ang) * sp + (Math.random() - 0.5) * 3,
        life: 0.6 + Math.random() * 0.5,
        age: 0,
        r: 1.5 + Math.random() * 2,
        type: 'water',
      });
    }
    // some droplets that fall on the car
    for (let i = 0; i < 2; i++) {
      state.droplets.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 20,
        r: 1.2 + Math.random() * 2.3,
        life: 3 + Math.random() * 4,
        age: 0,
      });
    }
  }

  function spawnBubbles(x, y, n) {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x: x + (Math.random() - 0.5) * 26,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -0.4 - Math.random() * 1.5,
        life: 1.2 + Math.random() * 1.2,
        age: 0,
        r: 3 + Math.random() * 5,
        type: 'bubble',
      });
    }
  }

  function spawnSparkle(x, y, n, intensity) {
    for (let i = 0; i < n; i++) {
      state.sparkles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 12,
        r: 4 + Math.random() * 6,
        life: 0.6 + Math.random() * 0.6,
        age: 0,
        rot: Math.random() * Math.PI,
        intensity,
      });
    }
  }

  // ------- Sampling fill levels ------------------------------------------
  function sampleStats() {
    // Draw maskCanvas at sampleSize for total car area
    sampleCtx.clearRect(0, 0, sampleSize, sampleSize);
    sampleCtx.drawImage(maskCanvas, 0, 0, sampleSize, sampleSize);
    const maskData = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
    let maskTotal = 0;
    for (let i = 3; i < maskData.length; i += 4) maskTotal += maskData[i] / 255;
    if (maskTotal < 1) maskTotal = 1;

    function alphaSum(canvas) {
      sampleCtx.clearRect(0, 0, sampleSize, sampleSize);
      sampleCtx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
      const d = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
      let s = 0;
      for (let i = 3; i < d.length; i += 4) s += d[i] / 255;
      return s;
    }

    const dirt = alphaSum(dirtCanvas);
    const foam = alphaSum(foamCanvas);
    const wax  = alphaSum(waxCanvas);

    state.cleanPct = Math.max(0, Math.min(1, 1 - dirt / (state.initialDirt || dirt + 1)));
    state.foamPct  = Math.max(0, Math.min(1, foam / (maskTotal * 0.55)));
    state.shinePct = Math.max(0, Math.min(1, wax  / (maskTotal * 0.35)));
    state.bestShineThisRound = Math.max(state.bestShineThisRound, state.shinePct);
  }

  function calibrateInitialDirt() {
    sampleCtx.clearRect(0, 0, sampleSize, sampleSize);
    sampleCtx.drawImage(dirtCanvas, 0, 0, sampleSize, sampleSize);
    const d = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
    let s = 0;
    for (let i = 3; i < d.length; i += 4) s += d[i] / 255;
    state.initialDirt = s || 1;
  }

  // ------- Rendering ------------------------------------------------------
  function render(dt) {
    ctx.clearRect(0, 0, W, H);

    // background scene
    ctx.drawImage(bgCanvas, 0, 0);

    // volumetric light beams above the car
    drawLightBeams();

    // car body (already includes shadow + reflection)
    ctx.drawImage(bodyCanvas, 0, 0);

    // overlays — clipped to car silhouette path
    const cx = W * 0.5, cy = H * 0.55, scale = 90;
    const path = carPath(cx, cy, scale);
    ctx.save();
    ctx.clip(path);

    // dirt
    ctx.drawImage(dirtCanvas, 0, 0);

    // wet sheen — subtle bluish overlay where dirt is gone (cheap approximation)
    if (state.cleanPct > 0.05) {
      ctx.globalAlpha = 0.06 * Math.min(1, state.cleanPct * 1.5);
      ctx.fillStyle = '#9fd8ff';
      ctx.fillRect(cx - 4 * scale, cy - 2 * scale, 8 * scale, 4 * scale);
      ctx.globalAlpha = 1;
    }

    // wax shine — additive
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(waxCanvas, 0, 0);

    // animated specular sweep — only visible when shine > 0.15
    if (state.shinePct > 0.1) {
      const t = (performance.now() % 5000) / 5000;
      const sx = cx - 4 * scale + t * 8 * scale;
      const gradSpec = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
      gradSpec.addColorStop(0, 'rgba(255,255,255,0)');
      gradSpec.addColorStop(0.5, `rgba(255,255,255,${0.22 * state.shinePct})`);
      gradSpec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradSpec;
      ctx.fillRect(sx - 80, cy - 1.7 * scale, 160, 3 * scale);
    }
    ctx.globalCompositeOperation = 'source-over';

    // foam on top of everything else (foam visually covers paint)
    ctx.drawImage(foamCanvas, 0, 0);

    ctx.restore();

    // water droplets on car
    drawDroplets();

    // particles (spray, bubbles)
    drawParticles();

    // sparkles
    drawSparkles();

    // tool cursor
    if (state.mouse.inside) drawToolCursor(state.tool, state.mouse.x, state.mouse.y);

    // vignette
    drawVignette();

    // top scanline noise (very subtle)
    drawFilmGrain();
  }

  function drawLightBeams() {
    const cx = W * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * 320;
      const g = ctx.createLinearGradient(x, 0, x, H * 0.6);
      g.addColorStop(0, 'rgba(180, 220, 255, 0.18)');
      g.addColorStop(0.6, 'rgba(180, 220, 255, 0.05)');
      g.addColorStop(1, 'rgba(180, 220, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 30, 0);
      ctx.lineTo(x + 30, 0);
      ctx.lineTo(x + 220, H * 0.6);
      ctx.lineTo(x - 220, H * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  let grainOffset = 0;
  function drawFilmGrain() {
    grainOffset = (grainOffset + 1) % 4;
    ctx.globalAlpha = 0.025;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() * W) | 0;
      const y = (Math.random() * H) | 0;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of state.particles) {
      const a = 1 - p.age / p.life;
      if (p.type === 'water') {
        ctx.fillStyle = `rgba(190, 230, 255, ${0.85 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.6 * a})`;
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'bubble') {
        const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
        g.addColorStop(0.6, `rgba(220, 240, 255, ${0.45 * a})`);
        g.addColorStop(1, `rgba(220, 240, 255, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(180, 220, 255, ${0.5 * a})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.95, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawDroplets() {
    const cx = W * 0.5, cy = H * 0.55, scale = 90;
    const path = carPath(cx, cy, scale);
    ctx.save();
    ctx.clip(path);
    for (const d of state.droplets) {
      const a = 1 - d.age / d.life;
      ctx.fillStyle = `rgba(180, 220, 255, ${0.55 * a})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSparkles() {
    for (const s of state.sparkles) {
      const a = 1 - s.age / s.life;
      const r = s.r * (1 + (1 - a) * 1.2);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.4);
      g.addColorStop(0, `rgba(255, 255, 220, ${0.9 * a * s.intensity})`);
      g.addColorStop(1, 'rgba(255, 255, 220, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * a * s.intensity})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
      ctx.moveTo(-r * 0.6, r * 0.6); ctx.lineTo(r * 0.6, -r * 0.6);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawToolCursor(tool, x, y) {
    state.cursorPulse += 0.15;
    ctx.save();
    if (tool === 'hose') {
      // nozzle
      ctx.translate(x, y);
      ctx.rotate(0.4);
      // body
      const ng = ctx.createLinearGradient(0, -10, 0, 10);
      ng.addColorStop(0, '#7da4d6'); ng.addColorStop(0.5, '#3b5a86'); ng.addColorStop(1, '#16243b');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.roundRect(-44, -8, 44, 16, 4);
      ctx.fill();
      // tip
      ctx.fillStyle = '#bdd6ee';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(14, -4); ctx.lineTo(14, 4); ctx.lineTo(0, 7); ctx.closePath();
      ctx.fill();
      // water cone
      if (state.mouse.down) {
        const grad = ctx.createRadialGradient(20, 0, 0, 28, 0, 80);
        grad.addColorStop(0, 'rgba(200, 235, 255, 0.85)');
        grad.addColorStop(1, 'rgba(200, 235, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(14, -2);
        ctx.lineTo(80, -22);
        ctx.lineTo(80, 22);
        ctx.lineTo(14, 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (tool === 'foam') {
      ctx.translate(x, y);
      ctx.rotate(0.3);
      const fg = ctx.createLinearGradient(0, -10, 0, 10);
      fg.addColorStop(0, '#eef6ff'); fg.addColorStop(1, '#9fb5d0');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.roundRect(-50, -10, 42, 20, 4); ctx.fill();
      ctx.fillStyle = '#dbe7f5';
      ctx.beginPath();
      ctx.moveTo(-8, -10); ctx.lineTo(14, -6); ctx.lineTo(14, 6); ctx.lineTo(-8, 10); ctx.closePath();
      ctx.fill();
      if (state.mouse.down) {
        for (let i = 0; i < 4; i++) {
          const fx = 16 + i * 12 + (Math.sin(state.cursorPulse + i) * 4);
          const fy = (Math.sin(state.cursorPulse * 0.8 + i * 2)) * 8;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.arc(fx, fy, 6 + i, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    } else if (tool === 'sponge') {
      ctx.translate(x, y);
      ctx.rotate(-0.15);
      // yellow sponge
      const sg = ctx.createLinearGradient(0, -20, 0, 20);
      sg.addColorStop(0, '#ffe87a'); sg.addColorStop(0.5, '#f4c834'); sg.addColorStop(1, '#a87d10');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.roundRect(-30, -22, 60, 36, 6); ctx.fill();
      // texture dots
      ctx.fillStyle = 'rgba(120,80,10,0.4)';
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.arc(-26 + Math.random() * 52, -18 + Math.random() * 32, 1 + Math.random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // green scrub side
      ctx.fillStyle = '#1f8a48';
      ctx.beginPath(); ctx.roundRect(-30, 8, 60, 8, 3); ctx.fill();
      ctx.restore();
    } else if (tool === 'wax') {
      ctx.translate(x, y);
      // microfiber cloth
      const cg = ctx.createLinearGradient(0, -20, 0, 20);
      cg.addColorStop(0, '#fff6d6'); cg.addColorStop(0.5, '#ffd87a'); cg.addColorStop(1, '#b8861a');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(-28, -16); ctx.lineTo(24, -22); ctx.lineTo(30, 18); ctx.lineTo(-22, 22);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      for (let i = -2; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-28 + i * 10, -16);
        ctx.lineTo(-22 + i * 10, 22);
        ctx.stroke();
      }
      // sparkle hint
      const pulse = 0.5 + 0.5 * Math.sin(state.cursorPulse * 0.5);
      ctx.fillStyle = `rgba(255,255,200,${0.4 + pulse * 0.6})`;
      ctx.beginPath(); ctx.arc(20, -10, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ------- Update loop ----------------------------------------------------
  function update(dt) {
    // tool application (continuous while mouse down)
    if (state.running && state.mouse.down && state.mouse.inside) {
      const m = state.mouse;
      const fn =
        state.tool === 'hose'   ? applyHose   :
        state.tool === 'foam'   ? applyFoam   :
        state.tool === 'sponge' ? applySponge :
                                  applyWax;
      strokeBetween(m.lastX, m.lastY, m.x, m.y, 8, fn);
      m.lastX = m.x; m.lastY = m.y;
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += dt;
      if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
      p.x += p.vx;
      p.y += p.vy;
      if (p.type === 'water') {
        p.vy += 0.45; // gravity
        p.vx *= 0.99;
      } else if (p.type === 'bubble') {
        p.vy += 0.04;
        p.vx *= 0.96;
      }
    }
    for (let i = state.droplets.length - 1; i >= 0; i--) {
      const d = state.droplets[i];
      d.age += dt;
      if (d.age >= d.life) { state.droplets.splice(i, 1); continue; }
      d.y += 0.12; // slow trickle down
    }
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      const s = state.sparkles[i];
      s.age += dt;
      if (s.age >= s.life) state.sparkles.splice(i, 1);
    }

    // periodic sampling
    state.sampleTimer += dt;
    if (state.sampleTimer > 0.22) {
      state.sampleTimer = 0;
      sampleStats();
      updateHUD();
    }

    // timer
    if (state.running) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finish();
      }
      ui.timer.textContent = formatTime(state.timeLeft);
      ui.timer.classList.toggle('warn', state.timeLeft < 15);
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s - m * 60);
    return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  }

  function updateHUD() {
    const cp = Math.round(state.cleanPct * 100);
    const fp = Math.round(state.foamPct * 100);
    const sp = Math.round(state.shinePct * 100);
    ui.cleanFill.style.width = cp + '%';
    ui.foamFill.style.width  = fp + '%';
    ui.shineFill.style.width = sp + '%';
    ui.cleanPct.textContent  = cp + '%';

    // score: cleanliness + shine, multiplied by remaining time bonus
    const base = Math.round((cp * 8) + (sp * 12));
    state.score = base;
    ui.score.textContent = base.toLocaleString('de-DE');
  }

  // ------- Round flow -----------------------------------------------------
  function startRound() {
    const preset = carPresets[(Math.random() * carPresets.length) | 0];
    state.car = preset;

    buildBackground();
    buildMask();
    drawCarBody(preset);
    dirtCtx.clearRect(0, 0, W, H);
    foamCtx.clearRect(0, 0, W, H);
    waxCtx.clearRect(0, 0, W, H);
    wetCtx.clearRect(0, 0, W, H);
    state.particles.length = 0;
    state.droplets.length = 0;
    state.sparkles.length = 0;

    generateDirt(1.0);
    calibrateInitialDirt();

    state.timeLeft = 120;
    state.score = 0;
    state.cleanPct = 0;
    state.foamPct = 0;
    state.shinePct = 0;
    state.bestShineThisRound = 0;
    state.running = true;
    state.finished = false;
    selectTool('hose');
    updateHUD();
    ui.timer.textContent = formatTime(state.timeLeft);
    hide(ui.overlay);
    hide(ui.finishOv);
  }

  function finish() {
    state.running = false;
    state.finished = true;
    sampleStats();
    const cp = Math.round(state.cleanPct * 100);
    const sp = Math.round(state.bestShineThisRound * 100);
    const timeBonus = Math.max(0, Math.round(state.timeLeft * 25));
    const final = Math.round(cp * 8 + sp * 12 + timeBonus);
    ui.finalClean.textContent = cp + '%';
    ui.finalShine.textContent = sp + '%';
    ui.finalScore.textContent = final.toLocaleString('de-DE');
    if (cp >= 95 && sp >= 70) {
      ui.finishTitle.textContent = 'Showroom-Glanz!';
      ui.finishSub.textContent = 'Perfekte Detailarbeit.';
    } else if (cp >= 80) {
      ui.finishTitle.textContent = 'Sauber!';
      ui.finishSub.textContent = 'Solide Arbeit – nächste Schicht?';
    } else {
      ui.finishTitle.textContent = 'Schicht beendet';
      ui.finishSub.textContent = 'Da geht noch was beim nächsten Auto.';
    }
    show(ui.finishOv);
  }

  function show(el) { el.classList.add('show'); }
  function hide(el) { el.classList.remove('show'); }

  // ------- Input ----------------------------------------------------------
  function getMousePos(e) {
    const rect = stage.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  stage.addEventListener('mousedown', (e) => {
    const p = getMousePos(e);
    state.mouse.x = p.x; state.mouse.y = p.y;
    state.mouse.lastX = p.x; state.mouse.lastY = p.y;
    state.mouse.down = true;
  });
  window.addEventListener('mouseup', () => { state.mouse.down = false; });
  stage.addEventListener('mousemove', (e) => {
    const p = getMousePos(e);
    state.mouse.x = p.x; state.mouse.y = p.y;
    state.mouse.inside = true;
  });
  stage.addEventListener('mouseleave', () => { state.mouse.inside = false; state.mouse.down = false; });
  stage.addEventListener('mouseenter', (e) => {
    const p = getMousePos(e);
    state.mouse.lastX = p.x; state.mouse.lastY = p.y;
    state.mouse.inside = true;
  });

  // touch support
  stage.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const p = getMousePos(t);
    state.mouse.x = p.x; state.mouse.y = p.y;
    state.mouse.lastX = p.x; state.mouse.lastY = p.y;
    state.mouse.down = true;
    state.mouse.inside = true;
  }, { passive: false });
  stage.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const p = getMousePos(t);
    state.mouse.x = p.x; state.mouse.y = p.y;
  }, { passive: false });
  stage.addEventListener('touchend', () => { state.mouse.down = false; });

  // keyboard for tools
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') selectTool('hose');
    else if (e.key === '2') selectTool('foam');
    else if (e.key === '3') selectTool('sponge');
    else if (e.key === '4') selectTool('wax');
  });

  ui.tools.forEach((btn) => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  function selectTool(t) {
    state.tool = t;
    ui.tools.forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  }

  ui.startBtn.addEventListener('click', () => startRound());
  ui.nextBtn.addEventListener('click', () => startRound());

  // ------- Main loop ------------------------------------------------------
  function loop(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, state.lastFrame ? t - state.lastFrame : 0.016);
    state.lastFrame = t;
    update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  // ------- Init -----------------------------------------------------------
  function init() {
    buildBackground();
    buildMask();
    drawCarBody(carPresets[0]);
    generateDirt(1.0);
    calibrateInitialDirt();
    selectTool('hose');
    updateHUD();
    ui.timer.textContent = formatTime(state.timeLeft);
    requestAnimationFrame(loop);
  }

  // polyfill roundRect for older Safari
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = [r, r, r, r];
      this.moveTo(x + r[0], y);
      this.lineTo(x + w - r[1], y);
      this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
      this.lineTo(x + w, y + h - r[2]);
      this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
      this.lineTo(x + r[3], y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
      this.lineTo(x, y + r[0]);
      this.quadraticCurveTo(x, y, x + r[0], y);
      return this;
    };
  }

  init();
})();
