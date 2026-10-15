// Caixa clara (snare drum) 14" x 5,5" — mòdul d'instrument
// Unitats: mm. Eix Y amunt. Centre del casc a l'origen.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

  const G = groups(['baquetes', 'cercol_dalt', 'pell_dalt', 'casc', 'tensors', 'pell_baix', 'cercol_baix', 'bordons', 'palanca', 'peu']);

  /* ---------------- mides ---------------- */
  const R_OUT = 178, R_IN = 171.5;          // casc: 356 mm de diàmetre, 6,5 mm de gruix
  const HEADY = 70.4, R_HEAD = 175;         // pells (la vora del casc és a y = ±70)
  const N_LUG = 10, R_LUG = 190, R_ROD = 195;
  const lugAng = (k) => (k + 0.5) * TAU / N_LUG;
  const VENT_A = 108 * PI / 180, VENT_Y = 12;
  const rad = (r, y, a) => [r * Math.cos(a), y, r * Math.sin(a)];
  const mir = (pts) => pts.map(([r, y]) => [r, -y]).reverse();

  // perfil rectangle arrodonit (r, y) en sentit antihorari -> cares cap enfora al torn
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

  /* ---------------- materials ---------------- */
  const mShell = M.wood('casc', tex.mahogany(2, 1), { color: 0xD89A78, xray: true });
  const mShellIn = M.rawWood('casc', tex.maple(2, 1), { color: 0xF0DDC0, xray: true });
  const mAir = mat('casc', { color: 0x8fd0ff, transparent: true, opacity: 0, depthWrite: false, roughness: 1, metalness: 0 }, { phys: false });
  const mHoop = M.chrome('cercols');
  const mRod = M.nickel('cercols');
  const mTop = M.skin('pell_dalt'); mTop.color.set(0xC9C3B6); mTop.roughness = 0.9; mTop.envMapIntensity = 0.35; mTop.sheen = 0.25;
  const mBot = M.skin('pell_baix', { opacity: 0.8 }); mBot.color.set(0xEFE9D8); mBot.roughness = 0.3; mBot.clearcoat = 0.4;
  const mFleshT = M.nickel('pell_dalt'), mFleshB = M.nickel('pell_baix');
  const mWire = M.chrome('bordons'), mPlate = M.chrome('bordons'), mCord = M.plastic('bordons', 0xDDD4BD);
  const mStr = M.chrome('palanca'), mStrBlk = M.plastic('palanca', 0x151515);
  const mStick = M.wood('baquetes', tex.spruce(1, 0.15), { color: 0xFFF2DD });
  const mGrom = M.chrome('forat'), mHole = M.plastic('forat', 0x0b0806);
  const mStand = M.chrome('peu'), mRubber = M.plastic('peu', 0x1b1b1b);

  /* ---------------- casc ---------------- */
  // fusta lacada per fora i a les vores (tall a 45°), fusta crua per dins
  add(G.casc, geo.lathe([[R_IN, -66], [175.6, -70], [176.6, -69.6], [177.6, -68.4], [R_OUT, -66], [R_OUT, 66],
    [177.6, 68.4], [176.6, 69.6], [175.6, 70], [R_IN, 66]], 128), mShell, 'casc');
  add(G.casc, geo.lathe([[R_IN, 66], [R_IN, -66]], 128), mShellIn, 'casc');
  // aire de dins (només es veu amb raigs X)
  const airMesh = add(G.casc, geo.cyl(169, 134, 'y', 48), mAir, 'casc', { cast: false, pick: false });
  airMesh.visible = false;
  // forat d'aire amb ullet
  const gromG = geo.lathe([[5.0, -5], [5.0, 0], [7.9, 0], [8.5, 0.45], [8.3, 1.05], [7.4, 1.4], [5.3, 1.5], [4.5, 1.25], [4.2, 0.7], [4.2, -5], [5.0, -5]], 32);
  gromG.rotateZ(-PI / 2); gromG.translate(R_OUT, 0, 0);
  add(G.casc, gromG, mGrom, 'forat', { pos: [0, VENT_Y, 0], rot: [0, -VENT_A, 0] });
  const holeG = new THREE.CircleGeometry(4.25, 24); holeG.rotateY(PI / 2); holeG.translate(R_OUT + 0.45, 0, 0);
  add(G.casc, holeG, mHole, 'forat', { pos: [0, VENT_Y, 0], rot: [0, -VENT_A, 0], cast: false });

  /* ---------------- tensors (carcasses) ---------------- */
  const lugG = geo.lathe([[0, -36], [4, -35.6], [6.8, -34.2], [8.9, -31.5], [10.3, -27], [11, -20], [11, 20], [10.3, 27], [8.9, 31.5], [6.8, 34.2], [4, 35.6], [0, 36]], 28);
  const lugs = [];
  for (let k = 0; k < N_LUG; k++) {
    const a = lugAng(k);
    const m = add(G.tensors, lugG, mHoop, 'cercols', { pos: rad(R_LUG, 0, a), rot: [0, -a, 0], scale: [1.05, 1, 0.8] });
    lugs.push({ m, a });
  }

  /* ---------------- pells (malla polar deformable) ---------------- */
  function makeHead(group, part, material, y, up, note) {
    const NR = 40, NS = 64, n = 1 + NR * NS;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const m01 = new Float32Array(n), m11 = new Float32Array(n), m02 = new Float32Array(n);
    const cs = new Float32Array(n), sn = new Float32Array(n), edge = new Float32Array(n);
    let v = 0;
    const setV = (x, z, rho, c, s) => {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      uv[v * 2] = 0.5 + x / (2 * R_HEAD); uv[v * 2 + 1] = 0.5 + z / (2 * R_HEAD);
      m01[v] = J0(2.4048 * rho); m11[v] = J1(3.8317 * rho) / J1MAX; m02[v] = J0(5.5201 * rho);
      cs[v] = c; sn[v] = s; edge[v] = 1 - rho * rho; v++;
    };
    setV(0, 0, 0, 1, 0);
    for (let i = 1; i <= NR; i++) {
      const rho = i / NR, r = rho * R_HEAD;
      for (let j = 0; j < NS; j++) { const a = TAU * j / NS, c = Math.cos(a), s = Math.sin(a); setV(r * c, r * s, rho, c, s); }
    }
    const idx = [];
    const tri = (a, b, c) => { if (up) idx.push(a, b, c); else idx.push(a, c, b); };
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
    return { g, pos, col, base: pos.slice(), m01, m11, m02, cs, sn, edge, n, mesh, ov, dirty: false };
  }
  const TOP = makeHead(G.pell_dalt, 'pell_dalt', mTop, HEADY, true, 0);
  const BOT = makeHead(G.pell_baix, 'pell_baix', mBot, -HEADY, false, null);
  // coll de la pell (passa per sobre de la vora) i cèrcol d'alumini que la subjecta
  const collar = [[R_HEAD, HEADY], [177.4, 70.15], [178.8, 69.2], [179.4, 67.4], [179.5, 64], [179.5, 58.5]];
  add(G.pell_dalt, geo.lathe(collar, 128), mTop, 'pell_dalt', { cast: false });
  add(G.pell_dalt, geo.lathe(rrProfile(179.5, 181.7, 55.5, 61, 0.8), 128), mFleshT, 'pell_dalt');
  add(G.pell_baix, geo.lathe(collar.map(([r, y]) => [r, -y]), 128), mBot, 'pell_baix', { cast: false });
  add(G.pell_baix, geo.lathe(mir(rrProfile(179.5, 181.7, 55.5, 61, 0.8)), 128), mFleshB, 'pell_baix');

  /* ---------------- cèrcols, urpes i varetes de tensió ---------------- */
  const CLAW = [[180.5, 76], [180.5, 81.2], [181.6, 84.4], [184.2, 85.8], [187.0, 84.6], [188.8, 81.6], [188.8, 71.5], [200.5, 71.5],
    [201.5, 70.0], [200.5, 67.0], [187.2, 67.0], [187.2, 80.6], [186.3, 82.8], [184.2, 83.8], [182.4, 82.9], [181.8, 81], [181.8, 76]];
  const rodG = geo.cyl(2.6, 41, 'y', 12);
  const washG = geo.cyl(5.3, 1.2, 'y', 24);
  const headTop = geo.ext(geo.rrect(-3.6, 3.6, -3.6, 3.6, 1.1), 6.2, { bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 }); headTop.rotateX(-PI / 2);
  const headBot = geo.ext(geo.rrect(-3.6, 3.6, -3.6, 3.6, 1.1), 6.2, { bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 }); headBot.rotateX(PI / 2);
  function buildHoop(group, sg) {
    const P = rrProfile(182, 186.5, 58, 82, 2.1, 5), F = rrProfile(185.6, 189.6, 57.4, 60.6, 1.3, 3);
    add(group, geo.lathe(sg > 0 ? P : mir(P), 144), mHoop, 'cercols');
    add(group, geo.lathe(sg > 0 ? F : mir(F), 144), mHoop, 'cercols');
    const cg = geo.ext(geo.shape(CLAW.map(([r, y]) => [r, sg * y])), 11, { bevelThickness: 0.7, bevelSize: 0.5, bevelSegments: 2 });
    cg.translate(0, 0, -5.5);
    for (let k = 0; k < N_LUG; k++) {
      const a = lugAng(k), [x, , z] = rad(R_ROD, 0, a);
      add(group, cg, mHoop, 'cercols', { rot: [0, -a, 0] });
      add(group, rodG, mRod, 'cercols', { pos: [x, sg * 53.5, z], cast: false });
      add(group, washG, mHoop, 'cercols', { pos: [x, sg * 72.1, z] });
      add(group, sg > 0 ? headTop : headBot, mHoop, 'cercols', { pos: [x, sg * 73.3, z], rot: [0, -a, 0] });
    }
  }
  buildHoop(G.cercol_dalt, 1);
  buildHoop(G.cercol_baix, -1);

  /* ---------------- bordons ---------------- */
  class Coil extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const x = -158 + 316 * t, ax = Math.abs(x);
      let e = ax < 146 ? 1 : ax > 152 ? 0 : (152 - ax) / 6; e = e * e * (3 - 2 * e);
      const ph = (x / 2.6) * TAU;
      return target.set(x, e * 1.5 * Math.sin(ph), e * 1.5 * Math.cos(ph));
    }
  }
  const coilG = new THREE.TubeGeometry(new Coil(), 880, 0.32, 4, false);
  const WIRE_Y = -HEADY - 0.25 - 1.5 - 0.32;
  const wires = [];
  for (let k = 0; k < 20; k++) {
    const z = -38 + 4 * k;
    wires.push({ m: add(G.bordons, coilG, mWire, 'bordons', { pos: [0, WIRE_Y, z], cast: false }), z, k });
  }
  const snareRigid = [];
  for (const sx of [1, -1]) {
    const pg = geo.ext(sx > 0 ? geo.rrect(150, 166, -44, 44, 3) : geo.rrect(-166, -150, -44, 44, 3), 1.4, { bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 });
    pg.rotateX(PI / 2); pg.translate(0, -71.0, 0);
    snareRigid.push(add(G.bordons, pg, mPlate, 'bordons'));
    for (const zc of [-9, 9]) {
      const end = sx > 0 ? -57.3 : -56.3;
      const pts = [[164, -72.6, zc], [179, -73.2, zc], [188.5, -71.8, zc], [193.2, -66, zc], [194, end, zc]].map(([x, y, z]) => [sx * x, y, z]);
      snareRigid.push(add(G.bordons, geo.curveTube(pts, 1.1, 32, 8), mCord, 'bordons', { cast: false }));
    }
  }

  /* ---------------- palanca dels bordons (a +X) i topall (a -X) ---------------- */
  const hous = geo.ext(geo.rrect(-13, 13, -40, 18, 4), 13, { bevelThickness: 1, bevelSize: 1, bevelSegments: 3 });
  hous.rotateY(PI / 2); hous.translate(177, 0, 0);
  add(G.palanca, hous, mStr, 'palanca');
  const guide = geo.ext(geo.rrect(-10, 10, -46, -38, 2), 19, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 });
  guide.rotateY(PI / 2); guide.translate(177, 0, 0);
  add(G.palanca, guide, mStr, 'palanca');
  const sliderG = geo.ext(geo.rrect(-9, 9, -57, -47, 2), 6.5, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 });
  sliderG.rotateY(PI / 2); sliderG.translate(190.5, 0, 0);
  const slider = add(G.palanca, sliderG, mStr, 'palanca');
  add(G.palanca, geo.cyl(2.2, 8, 'y', 12), mStr, 'palanca', { pos: [186, 22, 0] });
  add(G.palanca, geo.lathe([[0, 24.5], [6, 24.5], [7.5, 26], [7.5, 33.5], [6.5, 35.2], [3, 35.9], [0, 36]], 28), mStr, 'palanca', { pos: [186, 0, 0] });
  const leverG = geo.ext(geo.rrect(-5, 5, -4, 48, 4.5), 4.2, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 });
  leverG.rotateY(PI / 2); leverG.translate(-2.1, 0, 0);
  const capG = geo.ext(geo.rrect(-5.7, 5.7, 33, 48.6, 5), 5.6, { bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 2 });
  capG.rotateY(PI / 2); capG.translate(-2.8, 0, 0);
  const LEV = [192.7, -34, 0];
  const leverMeshes = [add(G.palanca, leverG, mStr, 'palanca', { pos: LEV }), add(G.palanca, capG, mStrBlk, 'palanca', { pos: LEV })];
  add(G.palanca, geo.cyl(2.4, 15, 'z', 16), mStr, 'palanca', { pos: LEV });
  const butt = geo.ext(geo.rrect(-11, 11, -56, -28, 3), 19, { bevelThickness: 1, bevelSize: 1, bevelSegments: 3 });
  butt.rotateY(-PI / 2); butt.translate(-177, 0, 0);
  add(G.palanca, butt, mStr, 'palanca');

  /* ---------------- baquetes ---------------- */
  const stickG = swapUV(geo.lathe([[0, -130], [5.6, -129.6], [6.8, -128.2], [7.25, -125.5], [7.25, 128], [7.0, 148], [6.2, 175], [5.1, 203],
    [4.0, 228], [3.2, 246], [2.75, 256], [2.9, 259.5], [3.9, 261.6], [4.6, 263.8], [4.9, 266.2], [4.6, 268.8], [3.8, 271], [2.5, 272.7], [0, 273.6]], 28));
  stickG.rotateX(PI / 2);   // la punta mira cap a +Z
  const sticks = [0, 1].map(() => { const m = add(G.baquetes, stickG, mStick, 'baquetes'); m.rotation.order = 'YXZ'; return m; });
  const L_STICK = 266.2, TIPY = HEADY + 4.9, REST = 0.38;
  const YAW = [0.2, -0.2];                    // 0 = esquerra, 1 = dreta

  /* ---------------- peu ---------------- */
  const standMeshes = [];
  const sAdd = (g, m, o) => { const me = add(G.peu, g, m, 'peu', o); standMeshes.push(me); return me; };
  sAdd(geo.lathe([[0, -166], [14, -166], [16, -163], [16, -148], [13, -145], [0, -145]], 32), mStand);
  for (const d of [72, 216, 324]) {
    const a = d * PI / 180, P = (r, y) => rad(r, y, a);
    sAdd(geo.curveTube([[18, -156], [80, -150], [135, -128], [168, -104], [183, -91], [190.5, -84], [191.5, -75]].map(([r, y]) => P(r, y)), 4, 48, 10), mStand);
    sAdd(geo.curveTube([[183, -91], [190.5, -84], [191.6, -74.5]].map(([r, y]) => P(r, y)), 5.2, 16, 10), mRubber);
  }
  sAdd(geo.cyl(15, 26, 'x', 24), mStand, { pos: [0, -182, 0] });
  sAdd(geo.cyl(5, 12, 'x', 16), mStand, { pos: [19, -182, 0] });
  const wing = geo.ext(geo.rrect(-15, 15, -6, 6, 5.5), 4, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }); wing.rotateY(PI / 2);
  sAdd(wing, mRubber, { pos: [25, -182, 0] });
  sAdd(geo.cyl(11, 225, 'y', 24), mStand, { pos: [0, -307.5, 0] });
  sAdd(geo.cyl(17, 16, 'y', 24), mRubber, { pos: [0, -410, 0] });
  sAdd(geo.cyl(14.5, 195, 'y', 24), mStand, { pos: [0, -502.5, 0] });
  sAdd(geo.cyl(21, 22, 'y', 24), mStand, { pos: [0, -470, 0] });
  sAdd(geo.cyl(19, 14, 'y', 24), mStand, { pos: [0, -588, 0] });
  const footG = geo.lathe([[0, -641], [11, -641], [12.5, -638.5], [12, -630], [9.5, -626], [0, -626]], 24);
  for (const d of [30, 150, 270]) {
    const a = d * PI / 180, P = (r, y) => rad(r, y, a);
    sAdd(geo.curveTube([P(20, -468), P(110, -520), P(210, -582), P(296, -630)], 8.5, 40, 12), mStand);
    sAdd(geo.tube(P(18, -588), P(172, -558), 5, 1, 10), mStand);
    sAdd(footG, mRubber, { pos: P(296, 0) });
  }

  /* ---------------- notes (tipus de cop) ---------------- */
  const NOTES = [
    { label: 'Centre', f: 180, kind: 'c' },
    { label: 'Vora', f: 180, kind: 'v' },
    { label: 'Fort', f: 180, kind: 'f' },
    { label: 'Redoble', f: 180, kind: 'r' }
  ];
  function mkHit(t0, x, z, amp, stick, tau, bounce, pitch, mid, reb) {
    const r = Math.hypot(x, z) / R_HEAD, th = Math.atan2(z, x);
    return { t0, x, z, amp, stick, tau, bounce, pitch, mid, reb, ch: Math.cos(th), sh: Math.sin(th),
      a01: J0(2.4048 * r), a11: J1(3.8317 * r) / J1MAX, a02: J0(5.5201 * r) };
  }
  const HITS = NOTES.map((n) => {
    if (n.kind === 'c') return [mkHit(0.05, 5, 8, 1, 1, 0.35, 0.12, 0.2, 0, 0.3)];
    if (n.kind === 'v') return [mkHit(0.05, 38, -116, 1.1, 1, 0.28, 0.12, 0.27, 0, 0.3)];
    if (n.kind === 'f') return [mkHit(0.06, 3, 6, 1.6, 1, 0.5, 0.55, 0.2, 0, 0.45)];
    const out = [];
    for (let k = 0; k < 12; k++) {
      const R = k % 2 === 0;
      out.push(mkHit(0.05 + k * 0.085, R ? 22 : -20, R ? 20 : 4, R ? 0.6 : 0.5, R ? 1 : 0, 0.22, 0.1, 0.2, 0.24, 0.3));
    }
    return out;
  });
  const noteOf = (n) => {
    if (typeof n === 'number') return NOTES[n] || NOTES[0];
    if (n && n.kind) return NOTES.find((x) => x.kind === n.kind) || NOTES[0];
    if (n && n.label) return NOTES.find((x) => x.label === n.label) || NOTES[0];
    return NOTES[0];
  };
  const bordOn = (o) => {
    if (o == null) return true;
    if (typeof o === 'number') return o === 0;
    if (typeof o === 'string') return !/sense/i.test(o);
    return true;
  };

  /* ---------------- so ---------------- */
  const RAT = [1, 1.59, 2.14, 2.30, 2.65, 2.92];
  const AMP_C = [1, 0.16, 0.12, 0.5, 0.08, 0.06], TAU_C = [0.22, 0.13, 0.12, 0.16, 0.09, 0.08];
  const AMP_V = [0.55, 0.8, 0.7, 0.32, 0.55, 0.45], TAU_V = [0.17, 0.12, 0.11, 0.1, 0.08, 0.07];
  const timers = [];
  function hitSound(kind, on, amp) {
    const edge = kind === 'v', fort = kind === 'f', roll = kind === 'r';
    const A = edge ? AMP_V : AMP_C, T = edge ? TAU_V : TAU_C;
    const tm = (fort ? 1.3 : roll ? 0.8 : 1) * (on ? 1 : 1.35);
    const partials = RAT.map((k, i) => ({ k, a: A[i] * (fort && i > 0 ? 1.3 : 1), tau: T[i] * tm }));
    if (roll) {
      // un sol so per cop (pell + bordons o clic de baqueta)
      synth.additive({ f: 180, partials, attack: 0.001, dur: 0.55, gain: amp,
        noise: on ? { amount: 0.5, dur: 0.2, hp: 1500, lp: 9000 } : { amount: 0.3, dur: 0.02, hp: 2000, lp: 11000 } });
      return;
    }
    synth.additive({ f: fort ? 183 : 180, partials, attack: 0.001, gain: amp * (fort ? 0.85 : 0.6),
      noise: { amount: edge ? 0.32 : fort ? 0.35 : 0.25, dur: 0.02, hp: 2000, lp: 11000 } });
    if (on) synth.additive({ f: 180, partials: [{ k: 1, a: 0.03, tau: 0.04 }], attack: 0.002, gain: amp * (fort ? 0.6 : 0.45),
      noise: { amount: fort ? 0.8 : edge ? 0.6 : 0.5, dur: fort ? 0.32 : 0.25, hp: 1500, lp: 9000 } });
  }

  /* ---------------- animació ---------------- */
  function evalModes(hits, t, W) {
    let c01 = 0, c11x = 0, c11y = 0, c02 = 0, R = 0, last = null;
    for (const h of hits) {
      const tau = t - h.t0; if (tau < 0) continue;
      last = h; if (tau > 8 * h.tau) continue;
      const A = 4.5 * h.amp;
      c01 += -A * h.a01 * Math.exp(-tau / h.tau) * Math.sin(W * tau);
      const s11 = -A * h.a11 * Math.exp(-tau / (0.8 * h.tau)) * Math.sin(1.59 * W * tau);
      c11x += s11 * h.ch; c11y += s11 * h.sh;
      c02 += -A * 0.22 * h.a02 * Math.exp(-tau / (0.5 * h.tau)) * Math.sin(2.3 * W * tau);
      R += h.amp * Math.exp(-tau / 0.16);
    }
    return { c01, c11x, c11y, c02, R, last };
  }
  function deform(H, c01, c11x, c11y, c02, dA, hx, hz, norm) {
    const P = H.pos, B = H.base, C = H.col, inv = 1 / (2 * 22 * 22);
    for (let i = 0; i < H.n; i++) {
      let w = c01 * H.m01[i] + H.m11[i] * (c11x * H.cs[i] + c11y * H.sn[i]) + c02 * H.m02[i];
      if (dA !== 0) { const dx = B[i * 3] - hx, dz = B[i * 3 + 2] - hz; w += dA * Math.exp(-(dx * dx + dz * dz) * inv) * H.edge[i]; }
      P[i * 3 + 1] = B[i * 3 + 1] + w;
      heat.color(w / norm, C, i);
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
  // posició de la mà (pivot de la baqueta) perquè la punta toqui (hx, hz)
  function poseOf(h, k) {
    const yaw = YAW[k], p = h.pitch, cp = Math.cos(p);
    return [h.x - L_STICK * Math.sin(yaw) * cp, TIPY + L_STICK * Math.sin(p), h.z - L_STICK * Math.cos(yaw) * cp, p, yaw];
  }
  const DEF = [mkHit(0, -20, 4, 0, 0, 1, 0, 0.2, 0, 0.3), mkHit(0, 5, 8, 0, 1, 1, 0, 0.2, 0, 0.3)];
  const st = { ni: -2, lastT: 0, off: 0, lastTgt: [DEF[0], DEF[1]], hand: [poseOf(DEF[0], 0), poseOf(DEF[1], 1)], start: [null, null], lift: [REST, REST] };
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
  // lugs
  const ventDir = V3(Math.cos(VENT_A), 0, Math.sin(VENT_A));

  /* ---------------- textos ---------------- */
  const parts = {
    pell_dalt: { name: 'Pell de dalt', text: "És la pell que piques amb la baqueta. Com més tibada, més agut és el so.", dato: "Abans es feien de pell d'animal; avui són d'un plàstic (polièster) amb una capa blanca rugosa." },
    pell_baix: { name: 'Pell de baix', text: "És molt més prima que la de dalt. L'aire de dins la fa vibrar i ella fa saltar els bordons.", dato: "Fa menys d'una dècima de mil·límetre de gruix: és més prima que un full de paper." },
    bordons: { name: 'Bordons', text: "Són molls de filferro d'acer que toquen la pell de baix. Quan la pell vibra, piquen contra ella i fan el so rasposo de la caixa.", dato: "N'hi ha de 12 a més de 40 molls; aquesta caixa en porta 20." },
    casc: { name: 'Casc', text: "És el cilindre de fusta que aguanta les dues pells. A dins hi ha aire, que passa el moviment d'una pell a l'altra.", dato: "Fa 14 polzades d'amplada (36 cm) i 5,5 polzades d'alçada (14 cm), una mida molt habitual." },
    cercols: { name: 'Cèrcols i tensors', text: "Els cèrcols premen les pells contra el casc. Amb els tensors es tiba la pell: més tibada, so més agut.", dato: "Té 20 tensors, 10 a dalt i 10 a baix. Es giren amb una clau especial." },
    baquetes: { name: 'Baquetes', text: "Són bastons de fusta amb la punta arrodonida. El so canvia si piques al centre o a prop de la vora.", dato: "Solen ser de fusta d'hickory o d'auró i fan uns 40 cm de llarg." },
    palanca: { name: 'Palanca dels bordons', text: "Amb aquesta palanca apropes els bordons a la pell o els separes. Sense bordons, el so és més llarg i més buit, com el d'un tom.", dato: "Els bateries separen els bordons quan no toquen la caixa, perquè no vibrin sols amb els altres sons." },
    forat: { name: "Forat d'aire", text: "És un forat petit al casc. Deixa entrar i sortir una mica d'aire perquè les pells es moguin més lliures.", dato: "La peça de metall que l'envolta s'anomena ullet i protegeix la fusta." },
    peu: { name: 'Peu', text: "Aguanta la caixa a l'alçada de les mans. Tres braços amb goma subjecten el cèrcol de baix.", dato: "Es pot inclinar perquè la baqueta arribi més còmodament a la pell." }
  };

  return {
    id: 'caixa',
    family: 'Percussió no afinada',
    name: 'Caixa',
    intro: "La caixa és un tambor amb dues pells i uns molls d'acer a sota, els bordons. Quan la piques fa un so sec i rasposo, sense una nota clara.",
    floorY: -641,
    camera: {
      explore: { pos: [560, 610, 700], target: [0, -30, -30] },
      exploded: { pos: [700, 620, 1750], target: [-260, -80, 0] }
    },
    parts,
    labels: [
      { part: 'pell_dalt', group: 'pell_dalt', at: [40, 71, 95] },
      { part: 'pell_baix', group: 'pell_baix', at: [-70, -71, 95], internal: true },
      { part: 'bordons', group: 'bordons', at: [-60, -73, -36], internal: true },
      { part: 'casc', group: 'casc', at: [144, -25, 104.6] },
      { part: 'cercols', group: 'cercol_dalt', at: [56.9, 84, 175] },
      { part: 'baquetes', group: 'baquetes', at: [45, 150, -140] },
      { part: 'palanca', group: 'palanca', at: [196, -10, 0] },
      { part: 'forat', group: 'casc', at: rad(180, VENT_Y, VENT_A) },
      { part: 'peu', group: 'peu', at: [12, -330, 0] }
    ],
    explode: {
      baquetes: [0, 330, -90, 0],
      cercol_dalt: [0, 240, 0, 0.05],
      pell_dalt: [0, 140, 0, 0.12],
      casc: [0, 0, 0, 0],
      tensors: [0, 0, 0, 0.2],
      pell_baix: [0, -140, 0, 0.12],
      cercol_baix: [0, -230, 0, 0.05],
      bordons: [0, -345, 0, 0.22],
      palanca: [80, 0, 0, 0.28],
      peu: [-560, 0, 0, 0]
    },
    notes: NOTES,
    options: { label: 'Bordons', items: ['Amb bordons', 'Sense bordons'] },
    chain: ['Baqueta', 'Pell de dalt', 'Aire de dins', 'Pell de baix i bordons', 'Aire'],
    tour: [
      { part: 'baquetes', chain: 0, title: 'La baqueta', heat: false, xray: false, slow: 0.35,
        text: "La baqueta cau i pica la pell de dalt. El cop dura només unes mil·lèsimes de segon. Tota l'energia del so ve d'aquest cop.",
        cam: { pos: [360, 210, 60], target: [20, 100, -110] } },
      { part: 'pell_dalt', chain: 1, title: 'La pell de dalt', heat: true, xray: false, slow: 0.3,
        text: "La pell s'enfonsa i rebota amunt i avall (taronja: puja; blau: baixa). Si piques al centre, es mou tota alhora. Si piques a la vora, una meitat puja mentre l'altra baixa.",
        cam: { pos: [40, 560, 300], target: [0, 60, 0] } },
      { part: 'casc', chain: 2, title: "L'aire de dins", heat: true, xray: true, slow: 0.45,
        text: "Quan la pell de dalt baixa, empeny l'aire de dins del casc. Aquest aire empeny la pell de baix, que es mou una mica més tard i menys. Una mica d'aire surt pel forat.",
        cam: { pos: [600, 110, 360], target: [0, 0, 0] } },
      { part: 'bordons', chain: 3, title: 'La pell de baix i els bordons', heat: true, xray: false, slow: 0.4,
        text: "La pell de baix vibra i fa saltar els bordons, que piquen contra ella moltes vegades. Aquests copets fan el so rasposo de la caixa. Prova de treure els bordons amb la palanca i escolta la diferència.",
        cam: { pos: [430, -330, 330], target: [0, -75, 0] } },
      { part: 'forat', chain: 4, title: 'El so surt', heat: false, xray: false, slow: 1,
        text: "Les pells empenyen l'aire de la sala i el so arriba a les teves orelles. És «no afinada» perquè no fa una nota clara que puguis cantar. Per això és ideal per marcar el ritme.",
        cam: { pos: [780, 450, 950], target: [0, -40, 0] } }
    ],
    soundSource: { group: 'casc', at: [0, 0, 0] },

    play(note, opt) {
      const n = noteOf(note), on = bordOn(opt);
      while (timers.length) clearTimeout(timers.pop());
      try {
        if (n.kind === 'r') {
          for (let k = 0; k < 12; k++) {
            const a = (k % 2 === 0 ? 0.56 : 0.46) * (0.92 + 0.16 * Math.random()) * (k < 2 ? 0.85 : 1);
            if (k === 0) hitSound('r', on, a); else timers.push(setTimeout(() => hitSound('r', on, a), k * 85));
          }
          return { attack: 0.003, hold: 1.0, release: 0.35 };
        }
        hitSound(n.kind, on, n.kind === 'f' ? 1.15 : n.kind === 'v' ? 0.95 : 1);
      } catch (e) { /* sense àudio: l'animació continua */ }
      return { attack: 0.003, hold: 0, release: n.kind === 'f' ? 0.5 : 0.35 };
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

      /* palanca: amb bordons (0) o sense (1) */
      const on = bordOn(s.opt);
      st.off += ((on ? 0 : 1) - st.off) * (1 - Math.exp(-dt * 6));
      const offE = smooth(st.off);
      for (const m of leverMeshes) m.rotation.z = -1.9 * offE;
      slider.position.y = -6 * offE;
      const drop = -7 * offE;

      /* baquetes */
      const kLerp = 1 - Math.exp(-dt * 30);
      for (let k = 0; k < 2; k++) {
        const ss = playing ? stickState(k, hits, t) : { tgt: st.lastTgt[k], lift: REST, first: false };
        if (playing && ss.tgt !== DEF[k]) st.lastTgt[k] = ss.tgt;
        const want = poseOf(ss.tgt, k), H = st.hand[k];
        if (ss.first) { const u = smooth(ss.u); for (let i = 0; i < 5; i++) H[i] = st.start[k][i] + (want[i] - st.start[k][i]) * u; }
        else for (let i = 0; i < 5; i++) H[i] += (want[i] - H[i]) * kLerp;
        if (playing) st.lift[k] = ss.lift; else st.lift[k] += (REST - st.lift[k]) * (1 - Math.exp(-dt * 6));
        const lift = st.lift[k];
        sticks[k].position.set(H[0], H[1] + lift * 30, H[2]);
        sticks[k].rotation.set(H[3] - lift, H[4], 0);
      }

      /* pells */
      let c01 = 0, b01 = 0, R = 0;
      if (playing && hits) {
        const W = TAU * Math.max(3, 4.5 * (s.fvis || 0.8)), g = Math.min(1, env * 4);
        const E = evalModes(hits, t, W), Eb = evalModes(hits, t - 0.045, W);
        c01 = E.c01 * g; R = E.R * g;
        b01 = Eb.c01 * g * (on ? 0.5 : 0.58);
        let dA = 0, hx = 0, hz = 0;
        if (E.last) {
          const tl = t - E.last.t0;
          if (tl < 0.12) { dA = -2.4 * E.last.amp * (1 - Math.exp(-tl / 0.004)) * Math.exp(-tl / 0.028) * g; hx = E.last.x; hz = E.last.z; }
        }
        deform(TOP, c01, E.c11x * g, E.c11y * g, E.c02 * g, dA, hx, hz, 5.5);
        deform(BOT, b01, 0, 0, 0, 0, 0, 0, 2.6);
      } else if (TOP.dirty || BOT.dirty) { restore(TOP); restore(BOT); }

      /* bordons: segueixen la pell de baix i salten (si estan posats) */
      const jamp = on && playing ? Math.min(2.4, 1.3 * R + 0.35 * Math.abs(b01)) * (1 - offE) : 0;
      const follow = playing ? b01 * 0.9 * (1 - offE) : 0;
      for (const w of wires) {
        let j = 0, jz = 0;
        if (jamp > 0.001) {
          j = jamp * Math.abs(Math.sin(TAU * (19 + 2.3 * w.k) * t + 1.7 * w.k) * Math.cos(TAU * (13.4 + 1.1 * w.k) * t + 0.9 * w.k));
          jz = 0.18 * jamp * Math.sin(TAU * (23 + w.k) * t + w.k);
        }
        w.m.position.set(0, WIRE_Y + drop + follow - j, w.z + jz);
      }
      for (const m of snareRigid) m.position.y = drop + follow;

      /* aire */
      airMesh.visible = !!s.xray;
      if (s.xray) mAir.opacity = clamp(0.08 + 0.14 * clamp(-c01 / 4.5, -1, 1), 0.02, 0.3);
      if (playing) {
        const rate = 520 * Math.min(1, Math.abs(c01) / 4.5 * 1.6 + 0.25 * R);
        if (rate > 15) {
          fx.air(G.casc.localToWorld(V3(...rad(R_OUT + 2, VENT_Y, VENT_A))), ventDir.clone(), rate, 0.45, 170);
          if (s.xray) fx.air(G.casc.localToWorld(V3(0, 55, 0)), V3(0, -1, 0), rate * 0.8, 0.9, 80);
        }
      }

      /* tensors cap enfora en desmuntar */
      const e = smooth(((s.explode || 0) - 0.15) / 0.7);
      for (const l of lugs) { const p = rad(R_LUG + 45 * e, 0, l.a); l.m.position.set(p[0], p[1], p[2]); }

      /* el peu s'amaga quan mirem la caixa per sota a la visita */
      const hideStand = s.view === 'tour' && s.tourStep === 3;
      for (const m of standMeshes) m.visible = !hideStand;
    }
  };
}
