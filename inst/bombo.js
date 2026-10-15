// Bombo de concert (gran caixa) 34" x 18" — mòdul d'instrument
// Unitats: mm. Eix Y amunt. Centre del casc a l'origen; l'eix del tambor va al llarg de Z.
// Pells verticals: la de davant (la que es pica) és a +Z, on hi ha el músic; la de darrere, a -Z.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, u) => a + (b - a) * u;

  const G = groups(['maces', 'apagador', 'cercol_davant', 'pell_davant', 'casc', 'tensors', 'pell_darrere', 'cercol_darrere', 'anell', 'suport']);

  /* ---------------- mides ---------------- */
  const R_OUT = 431, R_IN = 423;            // casc: 862 mm de diàmetre (34"), 8 mm de gruix
  const HZ = 230.4, R_HEAD = 428;           // pells (la vora del casc és a z = ±230; 460 mm de fons)
  const N_LUG = 16, R_ROD = 471;            // 16 tensors per costat
  const lugAng = (k) => (k + 0.5) * TAU / N_LUG;
  const VENT_A = 62 * PI / 180, VENT_Z = 95;
  const R_RING = 506;                       // anell del suport
  const TILT = -0.3;                        // inclinació del bombo (rad) quan se selecciona el suport
  const pol = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  const mirZ = (pts) => pts.map(([r, z]) => [r, -z]).reverse();
  const extLow = (shape, depth, bevel, cs = 5) => new THREE.ExtrudeGeometry(shape, Object.assign({ depth, curveSegments: cs, bevelEnabled: !!bevel }, bevel || {}));
  const latheZ = (pts, seg = 64) => { const g = geo.lathe(pts, seg); g.rotateX(PI / 2); return g; }; // perfil (r, z)

  function rrProfile(r0, r1, y0, y1, rr, n = 4) {
    const pts = [];
    const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } };
    arc(r1 - rr, y0 + rr, -PI / 2, 0);
    arc(r1 - rr, y1 - rr, 0, PI / 2);
    arc(r0 + rr, y1 - rr, PI / 2, PI);
    arc(r0 + rr, y0 + rr, PI, 1.5 * PI);
    pts.push(pts[0].slice());
    return pts;
  }
  function swapUV(g) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
    uv.needsUpdate = true; return g;
  }
  // funcions de Bessel (sèrie), per a les formes dels modes de la membrana circular
  function J0(x) { let s = 0, t = 1; const h = x * x / 4; for (let k = 0; k < 26; k++) { s += t; t *= -h / ((k + 1) * (k + 1)); } return s; }
  function J1(x) { let s = 0, t = x / 2; const h = x * x / 4; for (let k = 0; k < 26; k++) { s += t; t *= -h / ((k + 1) * (k + 2)); } return s; }
  const J1MAX = 0.58187;

  // textura procedural (DataTexture) de pell clapejada, tipus pell natural
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function headTexture(seed, hex) {
    const N = 256, R = rng(seed), d = new Uint8Array(N * N * 4);
    const cr = (hex >> 16) & 255, cg = (hex >> 8) & 255, cb = hex & 255;
    const oct = [6, 12, 24, 48, 96].map((n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = R(); return { n, a }; });
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let v = 0, amp = 0.5, tot = 0;
      for (const o of oct) {
        const fx_ = i * o.n / N, fy_ = j * o.n / N, x0 = Math.floor(fx_), y0 = Math.floor(fy_);
        let tx = fx_ - x0, ty = fy_ - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const x1 = (x0 + 1) % o.n, y1 = (y0 + 1) % o.n, a = o.a, n = o.n;
        const top = a[y0 * n + x0] + (a[y0 * n + x1] - a[y0 * n + x0]) * tx;
        const bot = a[y1 * n + x0] + (a[y1 * n + x1] - a[y1 * n + x0]) * tx;
        v += amp * (top + (bot - top) * ty); tot += amp; amp *= 0.55;
      }
      const k = 1 + 0.17 * (v / tot - 0.5), q = (j * N + i) * 4;
      d[q] = clamp(cr * k, 0, 255); d[q + 1] = clamp(cg * k, 0, 255); d[q + 2] = clamp(cb * k * 0.99, 0, 255); d[q + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }

  /* ---------------- materials ---------------- */
  const mShell = M.wood('casc', tex.mahogany(4, 1), { color: 0xC58060, xray: true });
  const mShellIn = M.rawWood('casc', tex.maple(4, 1), { color: 0xEBD3B0, xray: true });
  const mAir = mat('casc', { color: 0x8fd0ff, transparent: true, opacity: 0, depthWrite: false, roughness: 1, metalness: 0 }, { phys: false });
  const mHoopW = M.wood('cercols', tex.mahogany(8, 1), { color: 0x8C4C32 });
  const mClaw = M.chrome('cercols'), mRod = M.nickel('cercols');
  const mLug = M.chrome('cercols', { xray: true });
  const mFront = M.skin('pell_davant'); mFront.color.set(0xffffff); mFront.map = headTexture(11, 0xE6DCC5); mFront.roughness = 0.82; mFront.sheen = 0.3;
  const mBack = M.skin('pell_darrere'); mBack.color.set(0xffffff); mBack.map = headTexture(29, 0xEADFC8); mBack.roughness = 0.8; mBack.sheen = 0.3;
  const mFleshF = M.nickel('pell_davant'), mFleshB = M.nickel('pell_darrere');
  const mHandle = M.wood('maca', tex.spruce(1, 0.15), { color: 0xF2D9B4 });
  const mWool = M.felt('maca', 0xF0E9DA), mWool2 = M.felt('maca', 0xE9E1D1);
  const mCollar = M.plastic('maca', 0x5E3E26); mCollar.roughness = 0.7; mCollar.clearcoat = 0.1;
  const mPad = M.felt('apagador', 0x4A5468);
  const mKnob = M.wood('apagador', tex.rosewood(1, 1), { color: 0xffffff });
  const mGrom = M.chrome('forat'), mHole = M.plastic('forat', 0x0b0806);
  const mRing = M.chrome('suport', { xray: true });
  const mRubX = M.plastic('suport', 0x171717, { xray: true }); mRubX.roughness = 0.8; mRubX.clearcoat = 0;
  const mFrame = mat('suport', { color: 0x23262B, metalness: 0.7, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const mHub = M.chrome('suport');
  const mRubber = M.plastic('suport', 0x161616); mRubber.roughness = 0.8; mRubber.clearcoat = 0;

  /* ---------------- casc ---------------- */
  // fusta lacada per fora i a les vores (tall a 45°), fusta crua per dins
  add(G.casc, latheZ([[R_IN, -226], [427.6, -230], [428.8, -229.6], [430, -228.4], [R_OUT, -226], [R_OUT, 226],
    [430, 228.4], [428.8, 229.6], [427.6, 230], [R_IN, 226]], 192), mShell, 'casc');
  add(G.casc, latheZ([[R_IN, 226], [R_IN, -226]], 192), mShellIn, 'casc');
  // aire de dins (només es veu amb raigs X)
  const airMesh = add(G.casc, geo.cyl(420, 452, 'z', 64), mAir, 'casc', { cast: false, pick: false });
  airMesh.visible = false;
  // forat d'aire amb ullet
  const gromG = geo.lathe([[9, -9], [9, 0], [14.2, 0], [15.3, 0.8], [14.9, 1.9], [13.3, 2.5], [9.5, 2.7], [8.1, 2.25], [7.6, 1.26], [7.6, -9], [9, -9]], 36);
  gromG.rotateZ(-PI / 2); gromG.translate(R_OUT, 0, 0);
  add(G.casc, gromG, mGrom, 'forat', { pos: [0, 0, VENT_Z], rot: [0, 0, VENT_A] });
  const holeG = new THREE.CircleGeometry(7.65, 28); holeG.rotateY(PI / 2); holeG.translate(R_OUT + 0.8, 0, 0);
  add(G.casc, holeG, mHole, 'forat', { pos: [0, 0, VENT_Z], rot: [0, 0, VENT_A], cast: false });

  /* ---------------- tensors (carcasses sobre el casc) ---------------- */
  const lugG = latheZ([[0, -32], [5, -31.6], [8, -29.5], [9.2, -26], [9.6, -20], [9.6, 20], [9.2, 26], [8, 29.5], [5, 31.6], [0, 32]], 24);
  const lugs = [];
  for (const sg of [1, -1]) {
    const baseG = extLow(geo.rrect(R_OUT - 3, R_ROD - 5, sg > 0 ? 150 : -198, sg > 0 ? 198 : -150, 6), 15, { bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2 }, 5);
    baseG.translate(0, 0, -7.5); baseG.rotateX(PI / 2);
    for (let k = 0; k < N_LUG; k++) {
      const a = lugAng(k);
      const body = add(G.tensors, lugG, mLug, 'cercols', { pos: pol(R_ROD, a, sg * 172) });
      const base = add(G.tensors, baseG, mLug, 'cercols', { rot: [0, 0, a] });
      lugs.push({ body, base, a, z: sg * 172 });
    }
  }

  /* ---------------- pells (malla polar deformable, en el pla XY) ---------------- */
  function makeHead(group, part, material, z, front, note) {
    const NR = 44, NS = 96, n = 1 + NR * NS;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const m01 = new Float32Array(n), m11 = new Float32Array(n), m02 = new Float32Array(n);
    const cs = new Float32Array(n), sn = new Float32Array(n), edge = new Float32Array(n);
    let v = 0;
    const setV = (x, y, rho, c, s) => {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      uv[v * 2] = 0.5 + x / (2 * R_HEAD); uv[v * 2 + 1] = 0.5 + y / (2 * R_HEAD);
      m01[v] = J0(2.4048 * rho); m11[v] = J1(3.8317 * rho) / J1MAX; m02[v] = J0(5.5201 * rho);
      cs[v] = c; sn[v] = s; edge[v] = 1 - rho * rho; v++;
    };
    setV(0, 0, 0, 1, 0);
    for (let i = 1; i <= NR; i++) {
      const rho = i / NR, r = rho * R_HEAD;
      for (let j = 0; j < NS; j++) { const a = TAU * j / NS, c = Math.cos(a), s = Math.sin(a); setV(r * c, r * s, rho, c, s); }
    }
    const idx = [];
    const tri = (a, b, c) => { if (front) idx.push(a, c, b); else idx.push(a, b, c); };
    for (let j = 0; j < NS; j++) tri(0, 1 + (j + 1) % NS, 1 + j);
    for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) {
      const p = 1 + (i - 1) * NS + j, q = 1 + (i - 1) * NS + (j + 1) % NS;
      tri(p, q, q + NS); tri(p, q + NS, p + NS);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = add(group, g, material, part, note != null ? { note } : {});
    const ov = heat.overlay(mesh);
    return { g, pos, col, base: pos.slice(), m01, m11, m02, cs, sn, edge, n, mesh, ov, dirty: false, sign: front ? 1 : -1 };
  }
  const FRONT = makeHead(G.pell_davant, 'pell_davant', mFront, HZ, true, 0);
  const BACK = makeHead(G.pell_darrere, 'pell_darrere', mBack, -HZ, false, null);
  // coll de la pell (passa per sobre de la vora del casc) i cèrcol metàl·lic que la subjecta
  const collar = [[R_HEAD, HZ], [430.4, HZ - 0.25], [432, HZ - 1.3], [432.8, HZ - 3], [433, HZ - 7], [433, HZ - 13]];
  add(G.pell_davant, latheZ(collar, 192), mFront, 'pell_davant', { cast: false });
  add(G.pell_davant, latheZ(rrProfile(433, 436.5, HZ - 17, HZ - 10, 1), 192), mFleshF, 'pell_davant');
  add(G.pell_darrere, latheZ(collar.map(([r, z]) => [r, -z]), 192), mBack, 'pell_darrere', { cast: false });
  add(G.pell_darrere, latheZ(mirZ(rrProfile(433, 436.5, HZ - 17, HZ - 10, 1)), 192), mFleshB, 'pell_darrere');

  /* ---------------- cèrcols de fusta, urpes i tensors amb nansa en T ---------------- */
  const HF = 251;  // cara exterior del cèrcol
  const CLAW = [[447, HF], [447, HF + 3], [449, HF + 6], [453, HF + 7.5], [459, HF + 7], [462.5, HF + 4], [463.5, HF - 3], [463.5, 238],
    [477, 238], [480, 234], [477, 230], [459.5, 230], [459.5, HF - 1.5], [458, HF + 1.2], [453, HF + 1.8], [449.5, HF + 1], [448.5, HF]];
  const rodG = geo.cyl(3.4, 36, 'z', 12);
  const washG = geo.cyl(7.5, 1.8, 'z', 20);
  const NECK = [[0, 240], [6.8, 240], [6.8, 243], [5.2, 246.5], [4.6, 251], [5.6, 254], [6.2, 257], [6.2, 261], [0, 261]];
  const barG = geo.lathe([[0, -25], [3.5, -24.5], [5.2, -22.5], [5.5, -19], [4.3, -14], [3.9, 0], [4.3, 14], [5.5, 19], [5.2, 22.5], [3.5, 24.5], [0, 25]], 16);
  function buildHoop(group, sg) {
    const P = rrProfile(438, 457, 218, HF, 4, 5);
    add(group, latheZ(sg > 0 ? P : mirZ(P), 192), mHoopW, 'cercols');
    const cg = geo.ext(geo.shape(CLAW.map(([r, z]) => [r, sg * z])), 16, { bevelThickness: 0.8, bevelSize: 0.6, bevelSegments: 2 });
    cg.translate(0, 0, -8); cg.rotateX(PI / 2);
    const neckG = latheZ(sg > 0 ? NECK : mirZ(NECK), 18);
    for (let k = 0; k < N_LUG; k++) {
      const a = lugAng(k);
      add(group, cg, mClaw, 'cercols', { rot: [0, 0, a] });
      add(group, rodG, mRod, 'cercols', { pos: pol(R_ROD, a, sg * 222), cast: false });
      add(group, washG, mClaw, 'cercols', { pos: pol(R_ROD, a, sg * 239) });
      add(group, neckG, mClaw, 'cercols', { pos: pol(R_ROD, a, 0) });
      add(group, barG, mClaw, 'cercols', { pos: pol(R_ROD, a, sg * 257.5), rot: [0, 0, a] });
    }
  }
  buildHoop(G.cercol_davant, 1);
  buildHoop(G.cercol_darrere, -1);

  /* ---------------- suport: anell que s'inclina (grup 'anell') ---------------- */
  add(G.anell, new THREE.TorusGeometry(R_RING, 13, 18, 220), mRing, 'suport');
  for (const sx of [1, -1]) {
    add(G.anell, geo.cyl(19, 30, 'x', 24), mRing, 'suport', { pos: [sx * (R_RING + 6), 0, 0] });
    add(G.anell, geo.cyl(10, 52, 'x', 20), mRing, 'suport', { pos: [sx * (R_RING + 34), 0, 0] });
  }
  for (const d of [45, 135, 225, 315]) {
    const a = d * PI / 180;
    add(G.anell, geo.tube(pol(R_RING - 10, a, 0), pol(450, a, 0), 7, 1, 12), mRing, 'suport');
    add(G.anell, geo.cyl(15, 18, 'x', 20), mRubX, 'suport', { pos: pol(441, a, 0), rot: [0, 0, a] });
    add(G.anell, geo.cyl(5, 28, 'x', 12), mRing, 'suport', { pos: pol(R_RING + 22, a, 0), rot: [0, 0, a] });
    add(G.anell, geo.lathe([[0, -7], [11, -7], [13, -5], [13, 5], [11, 7], [0, 7]], 20), mRubX, 'suport', { pos: pol(R_RING + 40, a, 0), rot: [0, 0, a - PI / 2] });
  }

  /* ---------------- suport: forquilla, base i rodes (grup 'suport') ---------------- */
  const sp = (g, m, o) => add(G.suport, g, m, 'suport', o);
  const RAIL_Y = -610, XP = 572;
  const forkG = extLow(geo.rrect(-13, 13, -50, 0, 5), 3, { bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 1 }); forkG.rotateY(PI / 2);
  const tireG = geo.lathe([[16, -11], [26, -11], [30, -9.5], [32, -5], [32, 5], [30, 9.5], [26, 11], [16, 11]], 36); tireG.rotateZ(-PI / 2);
  for (const sx of [1, -1]) {
    const X = sx * XP;
    sp(geo.cyl(24, 40, 'x', 32), mHub, { pos: [X, 0, 0] });                                  // coixinet del pivot
    sp(geo.tube([X, -20, 0], [X, RAIL_Y + 10, 0], 15, 1, 20), mFrame);                        // pal
    sp(geo.cyl(21, 46, 'y', 28), mHub, { pos: [X, -300, 0] });                                 // abraçadora d'alçada
    sp(geo.cyl(4, 26, 'z', 12), mHub, { pos: [X, -300, 30] });
    sp(geo.lathe([[0, -6], [10, -6], [12, -4], [12, 4], [10, 6], [0, 6]], 20), mRubber, { pos: [X, -300, 46], rot: [PI / 2, 0, 0] });
    sp(geo.tube([X, RAIL_Y, -345], [X, RAIL_Y, 345], 16, 1, 20), mFrame);                    // travesser de terra
    sp(geo.cyl(24, 64, 'z', 24), mFrame, { pos: [X, RAIL_Y, 0] });
    for (const sz of [1, -1]) {
      sp(geo.cyl(16.5, 12, 'z', 20), mRubber, { pos: [X, RAIL_Y, sz * 350] });
      sp(geo.tube([X, -420, 0], [X, RAIL_Y, sz * 250], 8, 1, 12), mFrame);                   // tirant
      const Z = sz * 300;                                                                      // roda
      sp(geo.cyl(22, 8, 'y', 24), mHub, { pos: [X, RAIL_Y - 20, Z] });
      sp(geo.cyl(10, 12, 'y', 20), mHub, { pos: [X, RAIL_Y - 30, Z] });
      sp(forkG, mHub, { pos: [X + 13, RAIL_Y - 30, Z] });
      sp(forkG, mHub, { pos: [X - 16, RAIL_Y - 30, Z] });
      sp(tireG, mRubber, { pos: [X, -688, Z] });
      sp(geo.cyl(17, 20, 'x', 24), mHub, { pos: [X, -688, Z] });
      sp(geo.cyl(4.5, 38, 'x', 12), mHub, { pos: [X, -688, Z] });
    }
  }
  sp(geo.tube([-XP, RAIL_Y, 0], [XP, RAIL_Y, 0], 14, 1, 18), mFrame);
  // pom per fixar la inclinació (a la dreta del músic) i tapa a l'altre costat
  sp(geo.cyl(6, 36, 'x', 16), mHub, { pos: [XP + 37, 0, 0] });
  sp(geo.lathe([[0, -40], [5, -39.5], [8.5, -37], [9.5, -32], [8, -20], [7.5, 0], [8, 20], [9.5, 32], [8.5, 37], [5, 39.5], [0, 40]], 20), mRubber, { pos: [XP + 58, 0, 0] });
  sp(geo.cyl(14, 8, 'x', 24), mHub, { pos: [-XP - 24, 0, 0] });

  /* ---------------- maces ---------------- */
  function woolHead(rx, ry, L, seed) {
    const pts = [], n = 24;
    for (let i = 0; i <= n; i++) { const th = -PI / 2 + PI * i / n; pts.push([i === 0 || i === n ? 0 : rx * Math.cos(th), L + ry * Math.sin(th)]); }
    const g = geo.lathe(pts, 44), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) - L, z = p.getZ(i);
      const nz = Math.sin(x * 0.37 + seed) * Math.sin(y * 0.33 + 1.3) * Math.sin(z * 0.39 + 2.1)
        + 0.5 * Math.sin(x * 0.9 + y * 0.7 + seed) * Math.sin(z * 0.8 - y * 0.5);
      const k = 1 + 0.03 * nz;
      p.setXYZ(i, x * k, L + y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  }
  const MAL = [
    { L: 320, rx: 46, ry: 42,
      handle: [[0, -78], [6, -77.6], [9, -75.5], [10.5, -71], [10.8, -60], [10.8, -20], [10.2, 80], [9.2, 180], [8.4, 250], [8, 290], [0, 292]],
      collar: [[0, 254], [8.6, 254], [11.5, 261], [16, 269], [20, 276], [0, 280]], wool: mWool },
    { L: 255, rx: 31, ry: 29,
      handle: [[0, -62], [5, -61.6], [7.2, -60], [8.4, -56], [8.6, -48], [8.6, -15], [8.1, 60], [7.3, 140], [6.6, 205], [6.3, 232], [0, 234]],
      collar: [[0, 200], [6.8, 200], [9, 206], [12.5, 214], [15, 221], [0, 228]], wool: mWool2 }
  ];
  const mallets = MAL.map((m, k) => {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; G.maces.add(g);
    add(g, swapUV(geo.lathe(m.handle, 24)), mHandle, 'maca');
    add(g, geo.lathe(m.collar, 24), mCollar, 'maca');
    add(g, woolHead(m.rx, m.ry, m.L, 1.7 + k), m.wool, 'maca');
    return g;
  });
  const P0 = -0.44, REST = 0.85, YAW = [0.12, -0.12], ROLL = [0.3, -0.3];
  const HIT = [[95, 135], [-105, 115]];        // on piquen la maça gran (mà dreta) i la petita (mà esquerra)
  const eul = new THREE.Euler(0, 0, 0, 'YXZ'), tmpV = new THREE.Vector3();
  function headOffset(k, pitch, frac = 1) { eul.set(pitch, YAW[k], ROLL[k]); return tmpV.set(0, MAL[k].L * frac, 0).applyEuler(eul); }
  // posició de la mà (pivot de la maça) perquè el cap toqui (x, y) de la pell de davant
  function poseOf(h, k) {
    const o = headOffset(k, P0), rC = (MAL[k].rx + MAL[k].ry) / 2 - 4;
    return [h.x - o.x, h.y - o.y, HZ + rC - o.z, P0, YAW[k]];
  }
  const liftOff = (lift) => [0, 22 * lift, 60 * lift];

  /* ---------------- apagador (coixinet de feltre amb forma de mà) ---------------- */
  const mit = new THREE.Shape();
  mit.moveTo(-38, -72); mit.lineTo(36, -72); mit.quadraticCurveTo(48, -72, 48, -58);
  mit.lineTo(49, -28); mit.quadraticCurveTo(58, -14, 74, 2); mit.quadraticCurveTo(86, 16, 74, 28);
  mit.quadraticCurveTo(60, 38, 47, 22); mit.lineTo(46, 58); mit.quadraticCurveTo(44, 102, 0, 104);
  mit.quadraticCurveTo(-46, 102, -47, 58); mit.lineTo(-48, -58); mit.quadraticCurveTo(-48, -72, -38, -72);
  const padG = geo.ext(mit, 14, { bevelThickness: 7, bevelSize: 7, bevelSegments: 5 }); padG.translate(0, 0, -7);
  const pad = new THREE.Group(); G.apagador.add(pad);
  add(pad, padG, mPad, 'apagador');
  add(pad, geo.lathe([[0, 0], [16, 0], [17, 3], [12, 9], [11, 16], [15, 24], [16, 30], [12, 35], [0, 36]], 28), mKnob, 'apagador', { pos: [0, 10, 13], rot: [PI / 2, 0, 0] });
  const PADX = -215, PADY = -20;
  const PAD_REST = [-235, -110, HZ + 170], PAD_ROT0 = [0.6, -0.25, 0.45], PAD_ROT1 = [0, 0, 0.3];

  /* ---------------- notes (tipus de cop) ---------------- */
  const NOTES = [
    { label: 'Cop', f: 55, kind: 'c' },
    { label: 'Fort', f: 55, kind: 'f' },
    { label: 'Apagat', f: 55, kind: 'a' },
    { label: 'Redoble', f: 55, kind: 'r' }
  ];
  function mkHit(t0, x, y, amp, stick, tau, bounce, mid, reb, damp = null) {
    const r = Math.hypot(x, y) / R_HEAD, th = Math.atan2(y, x);
    return { t0, x, y, amp, stick, tau, bounce, mid, reb, damp, ch: Math.cos(th), sh: Math.sin(th),
      a01: J0(2.4048 * r), a11: J1(3.8317 * r) / J1MAX, a02: J0(5.5201 * r) };
  }
  const ROLL_N = 14, ROLL_DT = 0.105;
  const HITS = NOTES.map((n) => {
    if (n.kind === 'c') return [mkHit(0.06, 95, 135, 1, 0, 0.95, 0.16, 0, 0.5)];
    if (n.kind === 'f') return [mkHit(0.07, 88, 128, 1.55, 0, 1.25, 0.32, 0, 0.65)];
    if (n.kind === 'a') return [mkHit(0.06, 95, 135, 1, 0, 0.95, 0.16, 0, 0.5, 0.32)];
    const out = [];
    for (let k = 0; k < ROLL_N; k++) {
      const R = k % 2 === 0, j = Math.sin(k * 2.3) * 8;
      out.push(mkHit(0.05 + k * ROLL_DT, (R ? 95 : -105) + j, (R ? 135 : 115) - j, 0.34 + 0.16 * k / (ROLL_N - 1), R ? 0 : 1, 0.7, 0.08, 0.34, 0.4));
    }
    return out;
  });
  const noteOf = (n) => {
    if (typeof n === 'number') return NOTES[n] || NOTES[0];
    if (n && n.kind) return NOTES.find((x) => x.kind === n.kind) || NOTES[0];
    if (n && n.label) return NOTES.find((x) => x.label === n.label) || NOTES[0];
    return NOTES[0];
  };

  /* ---------------- so ---------------- */
  // parcials d'una membrana (1; 1,59; 2,14; 2,30; 2,65) sobre ~55 Hz, amb els del mig reforçats
  // i un cop de soroll greu filtrat perquè se senti també en altaveus petits
  const RAT = [1, 1.59, 2.14, 2.30, 2.65];
  const AMP = [1, 0.85, 0.66, 0.58, 0.34], TAUS = [0.95, 0.55, 0.42, 0.36, 0.26];
  const timers = [];
  function drop(amp, dur) {
    // "bum" que baixa d'altura en els primers instants (com un bombo de veritat)
    try {
      const ac = synth.ctx, out = synth.out; if (!ac || !out) return;
      const t0 = ac.currentTime + 0.002, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(98, t0); o.frequency.exponentialRampToValueAtTime(54, t0 + 0.09);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3 * amp, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* sense àudio */ }
  }
  function boom(kind, amp) {
    const fort = kind === 'f', ap = kind === 'a', roll = kind === 'r';
    const tm = fort ? 1.35 : roll ? 0.75 : 1;
    const partials = RAT.map((k, i) => ({ k, a: AMP[i] * (fort && i > 0 ? 1.15 : 1), tau: TAUS[i] * tm }));
    if (roll) {
      synth.additive({ f: 55, partials, attack: 0.004, hold: 0.35, release: 0.2, gain: amp,
        noise: { amount: 1.2, dur: 0.06, lp: 650, hp: 35 } });
      return;
    }
    const o = { f: fort ? 56 : 55, partials, attack: 0.004, gain: amp,
      noise: { amount: fort ? 1.7 : 1.4, dur: fort ? 0.09 : 0.07, lp: 420, hp: 30 } };
    if (ap) { o.hold = 0.3; o.release = 0.06; }
    synth.additive(o);
    // cop sord del feltre (se sent fins i tot en un portàtil)
    synth.additive({ f: 110, partials: [], attack: 0.002, gain: amp * (fort ? 0.42 : 0.32), dur: 0.3,
      noise: { amount: 1, dur: fort ? 0.07 : 0.05, lp: 1400, hp: 90 } });
    drop(amp, ap ? 0.3 : fort ? 0.6 : 0.45);
  }

  /* ---------------- animació ---------------- */
  const SAT = 15, sat = (c) => SAT * Math.tanh(c / SAT);
  function evalModes(hits, t, W) {
    let c01 = 0, c11x = 0, c11y = 0, c02 = 0, R = 0, last = null;
    for (const h of hits) {
      const tau = t - h.t0; if (tau < 0) continue;
      last = h; if (tau > 8 * h.tau) continue;
      const d = h.damp != null && t > h.damp ? Math.exp(-(t - h.damp) / 0.07) : 1;
      const A = 9 * h.amp * d;
      c01 += -A * h.a01 * Math.exp(-tau / h.tau) * Math.sin(W * tau);
      const s11 = -A * 0.8 * h.a11 * Math.exp(-tau / (0.75 * h.tau)) * Math.sin(1.59 * W * tau);
      c11x += s11 * h.ch; c11y += s11 * h.sh;
      c02 += -A * 0.25 * h.a02 * Math.exp(-tau / (0.5 * h.tau)) * Math.sin(2.3 * W * tau);
      R += h.amp * d * Math.exp(-tau / 0.3);
    }
    return { c01: sat(c01), c11x: sat(c11x), c11y: sat(c11y), c02: sat(c02), R, last };
  }
  // w = desplaçament al llarg de Z (el mateix sentit per a les dues pells); el color mostra "cap a fora" (taronja) o "cap a dins" (blau)
  function deform(H, c01, c11x, c11y, c02, dents, norm) {
    const P = H.pos, B = H.base, C = H.col;
    for (let i = 0; i < H.n; i++) {
      let w = c01 * H.m01[i] + H.m11[i] * (c11x * H.cs[i] + c11y * H.sn[i]) + c02 * H.m02[i];
      for (const dn of dents) {
        if (dn.A === 0) continue;
        const dx = B[i * 3] - dn.x, dy = B[i * 3 + 1] - dn.y;
        w += dn.A * Math.exp(-(dx * dx + dy * dy) * dn.inv) * H.edge[i];
      }
      P[i * 3 + 2] = B[i * 3 + 2] + w;
      heat.color(H.sign * w / norm, C, i);
    }
    H.g.attributes.position.needsUpdate = true; H.g.attributes.color.needsUpdate = true;
    H.g.computeVertexNormals(); H.dirty = true;
  }
  function restore(H) {
    H.pos.set(H.base);
    for (let i = 0; i < H.n; i++) heat.color(0, H.col, i);
    H.g.attributes.position.needsUpdate = true; H.g.attributes.color.needsUpdate = true;
    H.g.computeVertexNormals(); H.dirty = false;
  }
  const DEF = [mkHit(0, HIT[0][0], HIT[0][1], 0, 0, 1, 0, 0, 0.5), mkHit(0, HIT[1][0], HIT[1][1], 0, 1, 1, 0, 0, 0.5)];
  const st = { ni: -2, lastT: 0, tilt: 0, pad: 0, lastTgt: [DEF[0], DEF[1]], hand: [poseOf(DEF[0], 0), poseOf(DEF[1], 1)], start: [null, null], lift: [REST, REST] };
  st.start = [st.hand[0].slice(), st.hand[1].slice()];
  function stickState(k, hits, t) {
    let prev = null, next = null;
    if (hits) for (const h of hits) { if (h.stick !== k) continue; if (h.t0 <= t) prev = h; else { next = h; break; } }
    if (!prev && !next) return { tgt: st.lastTgt[k], lift: REST, first: false };
    if (!prev) { const u = clamp(t / next.t0); return { tgt: next, lift: REST * (1 - u * u), first: true, u }; }
    if (next) { const u = clamp((t - prev.t0) / (next.t0 - prev.t0)); return { tgt: next, lift: next.mid * Math.sin(PI * u), first: false }; }
    const tau = t - prev.t0, D = prev.reb;
    return { tgt: prev, lift: REST * smooth(tau / D) + prev.bounce * Math.sin(PI * clamp(tau / (D * 0.8))), first: false };
  }
  const dentHit = { A: 0, x: 0, y: 0, inv: 1 / (2 * 50 * 50) };
  const dentPad = { A: 0, x: PADX, y: PADY, inv: 1 / (2 * 62 * 62) };
  const DENTS = [dentHit, dentPad];
  const ventDir = V3(Math.cos(VENT_A), Math.sin(VENT_A), 0);
  const TILTG = [G.casc, G.tensors, G.pell_davant, G.pell_darrere, G.cercol_davant, G.cercol_darrere, G.anell];

  // etiquetes de les peces mòbils (posició de repòs)
  const H0 = poseOf(DEF[0], 0), lo = liftOff(REST), mid0 = headOffset(0, P0 + REST, 0.6);
  const MACA_AT = [H0[0] + lo[0] + mid0.x, H0[1] + lo[1] + mid0.y, H0[2] + lo[2] + mid0.z];

  /* ---------------- textos ---------------- */
  const parts = {
    pell_davant: { name: 'Pell de davant', text: "És la pell que pica la maça. És molt gran i poc tibada, per això vibra lentament i fa un so molt greu.", dato: "Abans totes eren de pell de vedella. Avui moltes són de plàstic (polièster), que no canvia amb la humitat." },
    pell_darrere: { name: 'Pell de darrere', text: "És la pell de l'altre costat del tambor. Ningú no la pica: la fa vibrar l'aire de dins.", dato: "Es mou una mica més tard que la de davant: l'aire triga un instant a arribar-hi." },
    casc: { name: 'Casc', text: "És el gran cilindre de fusta que aguanta les dues pells. A dins hi ha molt d'aire, que passa el moviment d'una pell a l'altra.", dato: "Fa 86 cm d'amplada (34 polzades) i 46 cm de fons: és més ample que una roda de bicicleta." },
    cercols: { name: 'Cèrcols i tensors', text: "Els cèrcols de fusta premen les pells contra el casc. Girant els tensors per la nansa en forma de T, la pell es tiba o s'afluixa.", dato: "Aquest bombo en té 32, 16 a cada costat. Gràcies a la nansa en T es poden girar amb la mà, sense clau." },
    maca: { name: 'Maça', text: "És un pal de fusta amb un cap gros i tou, de feltre cobert de llana. El cap tou fa un so rodó i profund, sense un cop sec.", dato: "Per fer redobles, el músic agafa una maça a cada mà i pica molt de pressa, alternant les mans." },
    apagador: { name: 'Apagador (mà)', text: "Per fer un cop curt, el músic posa la mà o el genoll sobre la pell just després de picar. Aquí la mà es representa amb un coixinet de feltre.", dato: "Molts percussionistes també posen un drap o un feltre sobre la pell per fer el so més curt." },
    suport: { name: 'Suport', text: "És un anell de metall sobre un peu amb rodes, que aguanta el bombo. El bombo s'hi pot inclinar per tocar-lo més còmodament (mira com s'inclina ara).", dato: "Amb les rodes es pot moure aquest tambor tan gran per l'escenari sense haver-lo d'aixecar." },
    forat: { name: "Forat d'aire", text: "És un forat petit al casc. Deixa sortir i entrar una mica d'aire quan les pells es mouen.", dato: "La peça de metall que l'envolta s'anomena ullet i protegeix la fusta." }
  };

  return {
    id: 'bombo',
    family: 'Percussió no afinada',
    name: 'Bombo',
    intro: "El bombo és el tambor més gran de l'orquestra. Té dues pells i es toca amb una maça de cap tou. Fa un so molt greu i profund, com un tro, però sense una nota clara.",
    floorY: -720,
    camera: {
      explore: { pos: [1800, 700, 2150], target: [0, -110, 0] },
      exploded: { pos: [3300, 1400, 1450], target: [0, -80, -250] }
    },
    parts,
    labels: [
      { part: 'pell_davant', group: 'pell_davant', at: [60, -260, HZ + 1] },
      { part: 'pell_darrere', group: 'pell_darrere', at: [170, 200, -HZ - 1], internal: true },
      { part: 'casc', group: 'casc', at: pol(R_OUT, -20 * PI / 180, 60) },
      { part: 'cercols', group: 'cercol_davant', at: pol(457, PI / 4, 236) },
      { part: 'maca', group: 'maces', at: MACA_AT },
      { part: 'apagador', group: 'apagador', at: PAD_REST.slice() },
      { part: 'suport', group: 'suport', at: [XP + 2, -330, 15] },
      { part: 'forat', group: 'casc', at: pol(R_OUT + 3, VENT_A, VENT_Z) }
    ],
    explode: {
      maces: [380, 120, 520, 0],
      apagador: [-380, 60, 480, 0.05],
      cercol_davant: [0, 0, 330, 0.05],
      pell_davant: [0, 0, 190, 0.12],
      casc: [0, 0, 0, 0],
      tensors: [0, 0, 0, 0.2],
      pell_darrere: [0, 0, -190, 0.12],
      cercol_darrere: [0, 0, -330, 0.05],
      anell: [0, 0, -1350, 0.3],
      suport: [0, 0, -1350, 0.26]
    },
    notes: NOTES,
    options: null,
    chain: ['Maça', 'Pell de davant', 'Aire de dins', 'Pell de darrere', 'Aire'],
    tour: [
      { part: 'maca', chain: 0, note: 0, title: 'La maça', heat: false, xray: false, slow: 0.35,
        text: "La maça fa un arc i pica la pell una mica fora del centre, on sona millor. El cap tou fa un cop rodó, sense soroll sec. Tota l'energia del so ve d'aquest cop.",
        cam: { pos: [720, 360, 1150], target: [60, 70, 380] } },
      { part: 'pell_davant', chain: 1, note: 0, title: 'La pell de davant', heat: true, xray: false, slow: 0.4,
        text: "La pell s'enfonsa i rebota endavant i enrere (taronja: cap a fora; blau: cap a dins). Com que és molt gran i poc tibada, vibra poques vegades per segon. Per això el so és tan greu.",
        cam: { pos: [800, 520, 1650], target: [0, 0, 230] } },
      { part: 'casc', chain: 2, note: 0, title: "L'aire de dins", heat: true, xray: true, slow: 0.5,
        text: "Quan la pell de davant s'enfonsa, empeny l'aire de dins del tambor. L'aire tarda una mica a arribar a l'altra pell i l'empeny cap a fora. Una mica d'aire surt pel forat.",
        cam: { pos: [1600, 450, 420], target: [0, 0, 0] } },
      { part: 'pell_darrere', chain: 3, note: 0, title: 'La pell de darrere', heat: true, xray: false, slow: 0.4,
        text: "La pell de darrere es mou un instant més tard i una mica menys. Ningú no la pica: la mou l'aire. Les dues pells juntes fan el so més ple i llarg.",
        cam: { pos: [-850, 480, -1650], target: [0, 0, -230] } },
      { part: 'forat', chain: 4, note: 0, title: 'El so surt', heat: false, xray: false, slow: 1,
        text: "Les dues pells empenyen l'aire de la sala i el so arriba a les teves orelles. Es diu que és «no afinat» perquè no fa una nota clara que puguis cantar. És ideal per a cops forts i redobles que sonen com un tro.",
        cam: { pos: [1500, 900, 1700], target: [0, -50, 0] } }
    ],
    soundSource: { group: 'casc', at: [0, 0, 0] },

    play(note) {
      const n = noteOf(note);
      while (timers.length) clearTimeout(timers.pop());
      try {
        if (n.kind === 'r') {
          for (let k = 0; k < ROLL_N; k++) {
            const a = (0.42 + 0.3 * k / (ROLL_N - 1)) * (k % 2 === 0 ? 1 : 0.9) * (0.92 + 0.16 * Math.random());
            const last = k === ROLL_N - 1;
            const fn = () => (last ? boom('c', a * 1.05) : boom('r', a));
            if (k === 0) fn(); else timers.push(setTimeout(fn, Math.round(k * ROLL_DT * 1000)));
          }
          return { attack: 0.004, hold: 1.45, release: 0.5 };
        }
        boom(n.kind, n.kind === 'f' ? 1 : n.kind === 'a' ? 0.8 : 0.78);
      } catch (e) { /* sense àudio: l'animació continua */ }
      return { attack: 0.004, hold: 0, release: n.kind === 'f' ? 0.75 : n.kind === 'a' ? 0.3 : 0.55 };
    },

    update(dt, s) {
      dt = clamp(dt || 0, 0, 0.05);
      const t = s.t || 0, env = s.env || 0;
      let ni = typeof s.noteIndex === 'number' ? s.noteIndex : -1;
      if (!(ni >= 0 && ni < NOTES.length)) ni = s.note ? NOTES.indexOf(noteOf(s.note)) : -1;
      const hits = ni >= 0 ? HITS[ni] : null;
      if (ni !== st.ni || t < st.lastT - 1e-6) { st.ni = ni; st.start = [st.hand[0].slice(), st.hand[1].slice()]; }
      st.lastT = t;
      const playing = env > 0.0005;

      /* inclinació: el bombo gira sobre els pivots de l'anell quan se selecciona el suport */
      const wantTilt = (!playing && s.selected === 'suport' && s.view !== 'tour' && (s.explode || 0) < 0.05) ? TILT : 0;
      st.tilt += (wantTilt - st.tilt) * (1 - Math.exp(-dt * (playing ? 9 : 1.5)));
      if (Math.abs(st.tilt) < 1e-5) st.tilt = 0;
      for (const g of TILTG) g.rotation.x = st.tilt;

      /* maces */
      const kLerp = 1 - Math.exp(-dt * 30);
      for (let k = 0; k < 2; k++) {
        const ss = playing ? stickState(k, hits, t) : { tgt: st.lastTgt[k], lift: REST, first: false };
        if (playing && ss.tgt !== DEF[k]) st.lastTgt[k] = ss.tgt;
        const want = poseOf(ss.tgt, k), H = st.hand[k];
        if (ss.first) { const u = smooth(ss.u); for (let i = 0; i < 5; i++) H[i] = st.start[k][i] + (want[i] - st.start[k][i]) * u; }
        else for (let i = 0; i < 5; i++) H[i] += (want[i] - H[i]) * kLerp;
        if (playing) st.lift[k] = ss.lift; else st.lift[k] += (REST - st.lift[k]) * (1 - Math.exp(-dt * 5));
        const lift = st.lift[k], o = liftOff(lift);
        mallets[k].position.set(H[0] + o[0], H[1] + o[1], H[2] + o[2]);
        mallets[k].rotation.set(H[3] + lift, H[4], ROLL[k]);
      }

      /* apagador: s'acosta i prem la pell en els cops apagats */
      const h0 = hits && hits[0];
      if (playing && h0 && h0.damp != null) st.pad = smooth((t - h0.damp + 0.16) / 0.16);
      else st.pad += (0 - st.pad) * (1 - Math.exp(-dt * 4));
      if (st.pad < 1e-4) st.pad = 0;
      const u = st.pad, press = playing ? 3.5 * u : 0;
      pad.position.set(lerp(PAD_REST[0], PADX, u), lerp(PAD_REST[1], PADY, u), lerp(PAD_REST[2], HZ + 14 - press, u));
      pad.rotation.set(lerp(PAD_ROT0[0], PAD_ROT1[0], u), lerp(PAD_ROT0[1], PAD_ROT1[1], u), lerp(PAD_ROT0[2], PAD_ROT1[2], u));

      /* pells: la de davant vibra; l'aire empeny la de darrere una mica més tard */
      let c01 = 0, b01 = 0, R = 0;
      if (playing && hits) {
        const W = TAU * Math.max(1.4, 2.6 * (s.fvis || 0.55)), g = Math.min(1, env * 4);
        const E = evalModes(hits, t, W), Eb = evalModes(hits, t - 0.13, W);
        c01 = E.c01 * g; R = E.R * g;
        b01 = Eb.c01 * g * 0.6;
        dentHit.A = 0;
        if (E.last) {
          const tl = t - E.last.t0;
          if (tl < 0.3) { dentHit.A = -8 * E.last.amp * (1 - Math.exp(-tl / 0.008)) * Math.exp(-tl / 0.06) * g; dentHit.x = E.last.x; dentHit.y = E.last.y; }
        }
        dentPad.A = -press;
        deform(FRONT, c01, E.c11x * g, E.c11y * g, E.c02 * g, DENTS, 11);
        deform(BACK, b01, 0, 0, Eb.c02 * g * 0.3, [], 6);
      } else if (FRONT.dirty || BACK.dirty) { restore(FRONT); restore(BACK); }

      /* aire */
      airMesh.visible = !!s.xray;
      if (s.xray) mAir.opacity = clamp(0.08 + 0.14 * clamp(-c01 / 9, -1, 1), 0.02, 0.3);
      if (playing) {
        const rate = 500 * Math.min(1, Math.abs(c01) / 9 * 1.4 + 0.2 * R);
        if (rate > 15) {
          fx.air(G.casc.localToWorld(V3(...pol(R_OUT + 4, VENT_A, VENT_Z))), ventDir.clone().transformDirection(G.casc.matrixWorld), rate, 0.45, 170);
          if (s.xray) fx.air(G.casc.localToWorld(V3(0, 0, 175)), V3(0, 0, -1).transformDirection(G.casc.matrixWorld), rate * 0.9, 0.9, 110);
        }
        const rb = 360 * Math.min(1, Math.abs(b01) / 5);
        if (!s.xray && rb > 20) fx.air(G.pell_darrere.localToWorld(V3(0, 0, -HZ - 15)), V3(0, 0, -1).transformDirection(G.pell_darrere.matrixWorld), rb, 0.7, 120);
      }

      /* tensors cap enfora en desmuntar */
      const e = smooth(((s.explode || 0) - 0.15) / 0.7), dr = 45 * e;
      for (const l of lugs) {
        const c = Math.cos(l.a), sn = Math.sin(l.a);
        l.body.position.set((R_ROD + dr) * c, (R_ROD + dr) * sn, l.z);
        l.base.position.set(dr * c, dr * sn, 0);
      }
    }
  };
}
