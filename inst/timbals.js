// Timbals de pedal (parella de 29" i 26") — mòdul d'instrument (Percussió afinada)
// Unitats: mm. Eix Y amunt. Les pells són a y = 0, el terra a y = -840.
// El timbaler és a +Z. El timbal gran (greu) és a l'esquerra del músic (-X), el petit a la dreta (+X).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

  const G = groups(['baquetes', 'cercols', 'pells', 'calderes', 'indicador', 'pedal', 'base']);

  /* ---------------- mides ---------------- */
  const FL = -840;            // terra
  const YS = 40;              // tram recte de la caldera sota la vora
  const T_CU = 2.6;           // gruix de la planxa de coure (exagerat una mica)
  const RH = 13;              // forat del fons de la caldera
  const N_ROD = 8;
  const rodAng = (k) => (k + 0.5) * TAU / N_ROD;          // angles dels tensors (davant, a 90°, queda lliure)
  const LEG_A = [45, 135, 270].map((d) => d * PI / 180);  // potes i puntals (entre tensors)
  const Z_P = 270, Y_P = FL + 70;                         // eix del pedal
  const DRUMS = [
    { name: 'gran', x0: -440, R: 368, fBase: 87.31, semis: 7, aG: 140 * PI / 180, hitA: PI / 2 - 0.12, p: 0 },
    { name: 'petit', x0: 400, R: 330, fBase: 110.0, semis: 8, aG: 40 * PI / 180, hitA: PI / 2 + 0.12, p: 3 / 8 }
  ];
  for (const d of DRUMS) {
    d.a = d.R + 4; d.b = 0.9 * d.R;           // semieixos de la caldera (radi, fondària)
    d.yBot = -YS - d.b;                        // fons de la caldera
    d.hubY = d.yBot - 38;                      // centre de l'aranya
    d.colTop = d.yBot - 75;                    // dalt de la columna del peu
    d.hx = d.x0 + 0.75 * d.R * Math.cos(d.hitA);   // punt de cop: a 1/4 del radi des de la vora
    d.hz = 0.75 * d.R * Math.sin(d.hitA);
  }
  // extrusió amb poques divisions a les cantonades (moltes peces repetides)
  const ext = (shape, depth, bevel, cs = 5) => new THREE.ExtrudeGeometry(shape, Object.assign({ depth, curveSegments: cs, bevelEnabled: !!bevel }, bevel || {}));
  const radX = (d, r, y, a) => [d.x0 + r * Math.cos(a), y, r * Math.sin(a)];

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
  // funcions de Bessel Jn (sèrie): formes dels modes de la membrana circular
  function Jn(n, x) {
    let t = 1; for (let k = 1; k <= n; k++) t *= (x / 2) / k;
    const h = x * x / 4; let s = 0;
    for (let k = 0; k < 34; k++) { s += t; t *= -h / ((k + 1) * (k + 1 + n)); }
    return s;
  }
  const JZ = [2.4048, 3.8317, 5.1356, 6.3802];   // primer zero de J0..J3
  const JMAX = JZ.map((z, n) => { let m = 0; for (let i = 0; i <= 400; i++) m = Math.max(m, Math.abs(Jn(n, z * i / 400))); return m; });
  const modeShape = (n, rho) => Jn(n, JZ[n] * rho) / JMAX[n];

  /* ---------------- materials ---------------- */
  const mCopper = mat('caldera', { color: 0xDB8B5E, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.12 }, { xray: true });
  const mCopperIn = mat('caldera', { color: 0xB7714A, metalness: 1, roughness: 0.42 }, { xray: true });
  const mVent = M.chrome('caldera', { xray: true });
  const mAirs = DRUMS.map(() => mat('caldera', { color: 0x8fd0ff, transparent: true, opacity: 0, depthWrite: false, roughness: 1, metalness: 0 }, { phys: false }));
  const mHead = M.skin('pell', { opacity: 0.95 });
  mHead.color.set(0xF2EDE1); mHead.roughness = 0.5; mHead.envMapIntensity = 0.45; mHead.sheen = 0.3;
  const mFlesh = M.silver('pell');
  const mHoop = M.chrome('cercol'), mRod = M.nickel('cercol');
  const mSpider = mat('cercol', { color: 0x2a2b2f, metalness: 0.6, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const mBase = mat('base', { color: 0x26272b, metalness: 0.55, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const mStrut = M.chrome('base'), mColumn = M.chrome('base', { xray: true }), mRubber = M.plastic('base', 0x141414);
  const mPed = M.chrome('pedal'), mPedPad = M.plastic('pedal', 0x161616), mSpring = M.nickel('pedal');
  const mPedCast = mat('pedal', { color: 0x26272b, metalness: 0.55, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const mGPlate = M.plastic('indicador', 0x18191b), mGTick = M.plastic('indicador', 0xF2F2EE);
  const mGNeedle = M.plastic('indicador', 0xC8322A), mGMark = M.plastic('indicador', 0xE6B43C), mGFrame = M.chrome('indicador');
  const mShaft = M.wood('baquetes', tex.maple(1, 0.25), { color: 0xF4E3C4 });
  const mFelt = M.felt('baquetes', 0xEFE7D6);
  const mCore = M.plastic('baquetes', 0x3a2a1e);

  /* ---------------- calderes de coure ---------------- */
  for (const [di, d] of DRUMS.entries()) {
    const { a, b, R } = d;
    // cara de fora + vora arrodonida (on recolza la pell)
    const out = [];
    const th0 = Math.acos(RH / a);
    for (let i = 0; i <= 56; i++) { const th = th0 * (1 - i / 56); out.push([a * Math.cos(th), -YS - b * Math.sin(th)]); }
    out.push([a, -14], [a - 0.3, -6], [a - 1.2, -2.2], [a - 2.6, -0.45], [R, 0], [R - 1.1, -1.1], [R - 1.3, -3.6], [R - 0.2, -6.2], [a - T_CU, -9]);
    add(G.calderes, geo.lathe(out, 128), mCopper, 'caldera', { pos: [d.x0, 0, 0] });
    // cara de dins (més mat) i forat del fons
    const ai = a - T_CU, bi = b - T_CU, th1 = Math.acos(RH / ai);
    const inn = [[ai, -9]];
    for (let i = 0; i <= 56; i++) { const th = th1 * i / 56; inn.push([ai * Math.cos(th), -YS - bi * Math.sin(th)]); }
    inn.push([RH, -YS - b * Math.sin(th0)]);
    add(G.calderes, geo.lathe(inn, 128), mCopperIn, 'caldera', { pos: [d.x0, 0, 0] });
    const ringG = new THREE.TorusGeometry(RH + 2.5, 2.4, 10, 36); ringG.rotateX(PI / 2);
    add(G.calderes, ringG, mVent, 'caldera', { pos: [d.x0, d.yBot - 0.5, 0] });
    // aire de dins (només es veu amb raigs X)
    const aa = ai - 5, bb = bi - 5, air = [];
    for (let i = 0; i <= 28; i++) { const th = PI / 2 * (1 - i / 28); air.push([Math.max(0, aa * Math.cos(th)), -YS - bb * Math.sin(th)]); }
    air.push([aa, -4], [0, -4]);
    d.air = add(G.calderes, geo.lathe(air, 64), mAirs[di], 'caldera', { pos: [d.x0, 0, 0], cast: false, pick: false });
    d.air.visible = false;
  }

  /* ---------------- pells (malla polar deformable) ---------------- */
  function makeHead(d, note) {
    const NR = 34, NS = 72, n = 1 + NR * NS, Y = 0.4;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const S0 = new Float32Array(n), S1 = new Float32Array(n), S2 = new Float32Array(n), S3 = new Float32Array(n), edge = new Float32Array(n);
    const hA = d.hitA;
    let v = 0;
    const setV = (rho, ang) => {
      const r = rho * d.R, c = Math.cos(ang), s = Math.sin(ang);
      pos[v * 3] = d.x0 + r * c; pos[v * 3 + 1] = Y; pos[v * 3 + 2] = r * s;
      uv[v * 2] = 0.5 + 0.5 * rho * c; uv[v * 2 + 1] = 0.5 + 0.5 * rho * s;
      // formes dels modes, ja orientades cap al punt de cop
      S0[v] = modeShape(0, rho);
      S1[v] = modeShape(1, rho) * Math.cos(ang - hA);
      S2[v] = modeShape(2, rho) * Math.cos(2 * (ang - hA));
      S3[v] = modeShape(3, rho) * Math.cos(3 * (ang - hA));
      edge[v] = 1 - rho * rho; v++;
    };
    setV(0, 0);
    for (let i = 1; i <= NR; i++) for (let j = 0; j < NS; j++) setV(i / NR, TAU * j / NS);
    const idx = [];
    for (let j = 0; j < NS; j++) idx.push(0, 1 + (j + 1) % NS, 1 + j);
    for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) {
      const p = 1 + (i - 1) * NS + j, q = 1 + (i - 1) * NS + (j + 1) % NS;
      idx.push(p, q, q + NS, p, q + NS, p + NS);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = add(G.pells, g, mHead, 'pell', { note });
    const ov = heat.overlay(mesh);
    // amplitud de cada mode al punt de cop (a 3/4 del radi)
    const hit = [modeShape(0, 0.75), modeShape(1, 0.75), modeShape(2, 0.75), modeShape(3, 0.75)].map(Math.abs);
    return { g, pos, col, base: pos.slice(), S0, S1, S2, S3, edge, n, mesh, ov, hit, dirty: false };
  }
  DRUMS[0].head = makeHead(DRUMS[0], 0);
  DRUMS[1].head = makeHead(DRUMS[1], 3);
  for (const d of DRUMS) {
    const R = d.R;
    // coll de la pell que passa per sobre de la vora i cèrcol d'alumini on va enganxada
    add(G.pells, geo.lathe([[R, 0.4], [R + 1.6, 0.1], [R + 2.8, -1.2], [R + 3.6, -3.5], [R + 4.2, -8], [R + 4.4, -14], [R + 4.5, -31]], 128), mHead, 'pell', { pos: [d.x0, 0, 0], cast: false });
    add(G.pells, geo.lathe(rrProfile(R + 4.6, R + 9.4, -44, -31.5, 0.9), 128), mFlesh, 'pell', { pos: [d.x0, 0, 0] });
  }

  /* ---------------- cèrcol, tensors i aranya (es mouen junts amb el pedal) ---------------- */
  for (const d of DRUMS) {
    const { R, a, b } = d;
    const mv = new THREE.Group(); G.cercols.add(mv); d.mv = mv;
    const O = [d.x0, 0, 0];
    // contracèrcol d'acer cromat
    add(mv, geo.lathe([[R + 5.2, -31], [R + 34, -31], [R + 35.6, -29.4], [R + 35.6, -12], [R + 34.2, -9.6], [R + 31.5, -9], [R + 13.5, -9],
      [R + 11.6, -10.5], [R + 11.6, -26], [R + 10, -27.5], [R + 5.2, -27.5], [R + 5.2, -31]], 144), mHoop, 'cercol', { pos: O });
    // braç de l'aranya: segueix la caldera per fora, a 30 mm
    const off = (th, o) => {
      const c = Math.cos(th), s = Math.sin(th), nx = b * c, ny = -a * s, nl = Math.hypot(nx, ny);
      return [a * c + o * nx / nl, -YS - b * s + o * ny / nl];
    };
    const arm = [[26, d.hubY + 2], off(1.35, 30), off(1.1, 30), off(0.85, 30), off(0.62, 30)];
    const last = arm[arm.length - 1];
    const yRB = last[1] + 40;                       // punta de baix del tensor
    arm.push([(last[0] + R + 48) / 2 + 6, last[1] + 16], [R + 48, yRB]);
    d.yRB = yRB;
    const earG = ext(geo.rrect(R + 33, R + 58, -29, -12, 4), 20, { bevelThickness: 0.8, bevelSize: 0.7, bevelSegments: 2 });
    earG.translate(0, 0, -10);
    const rodLen = 8 - yRB;
    const rodG = geo.cyl(4.2, rodLen, 'y', 12);
    const stemG = geo.cyl(5.4, 20, 'y', 16), washG = geo.cyl(8.5, 2.4, 'y', 24), barG = geo.cyl(4.4, 58, 'x', 14);
    const ballG = new THREE.SphereGeometry(6.2, 16, 12), knuckG = geo.cyl(8.5, 18, 'y', 16);
    for (let k = 0; k < N_ROD; k++) {
      const ang = rodAng(k);
      add(mv, earG, mHoop, 'cercol', { pos: O, rot: [0, -ang, 0] });
      add(mv, rodG, mRod, 'cercol', { pos: radX(d, R + 48, 8 - rodLen / 2, ang), cast: false });
      add(mv, washG, mHoop, 'cercol', { pos: radX(d, R + 48, -10.8, ang) });
      add(mv, stemG, mHoop, 'cercol', { pos: radX(d, R + 48, -2, ang) });
      // mànec en forma de T
      add(mv, barG, mHoop, 'cercol', { pos: radX(d, R + 48, 11, ang), rot: [0, -ang - PI / 2, 0] });
      const c = radX(d, R + 48, 11, ang), tx = -Math.sin(ang) * 29, tz = Math.cos(ang) * 29;
      add(mv, ballG, mHoop, 'cercol', { pos: [c[0] + tx, 11, c[2] + tz] });
      add(mv, ballG, mHoop, 'cercol', { pos: [c[0] - tx, 11, c[2] - tz] });
      // braç de l'aranya, sota la caldera
      add(mv, geo.curveTube(arm.map(([r, y]) => radX(d, r, y, ang)), 6.5, 48, 10), mSpider, 'cercol');
      add(mv, knuckG, mSpider, 'cercol', { pos: radX(d, R + 48, yRB, ang) });
    }
    add(mv, geo.lathe([[0, -13], [24, -13], [31, -7], [31, 7], [23, 13], [0, 13]], 40), mSpider, 'cercol', { pos: [d.x0, d.hubY, 0] });
    add(mv, geo.cyl(11, 10, 'y', 6), mRod, 'cercol', { pos: [d.x0, d.hubY - 17, 0] });
  }

  /* ---------------- base: anell, puntals, columna, potes i rodes ---------------- */
  for (const d of DRUMS) {
    const { R } = d;
    const O = [d.x0, 0, 0];
    // anell de suspensió que abraça la caldera
    add(G.base, geo.lathe(rrProfile(R + 5, R + 22, -74, -52, 3), 128), mStrut, 'base', { pos: O });
    const brG = ext(geo.rrect(R + 20, R + 57, -71, -57, 3), 16, { bevelThickness: 0.8, bevelSize: 0.7, bevelSegments: 2 });
    brG.translate(0, 0, -8);
    const colG = geo.cyl(8.5, 22, 'y', 18);
    for (let k = 0; k < N_ROD; k++) {
      const ang = rodAng(k);
      add(G.base, brG, mBase, 'base', { pos: O, rot: [0, -ang, 0] });
      add(G.base, colG, mBase, 'base', { pos: radX(d, R + 48, -64, ang) });
    }
    // peça central (a dins hi ha la molla i la vareta del pedal)
    add(G.base, geo.lathe([[14, FL + 128], [48, FL + 128], [58, FL + 140], [60, FL + 175], [52, FL + 203], [28, FL + 212], [14, FL + 212]], 48), mBase, 'base', { pos: O });
    const colLen = d.colTop - (FL + 205);
    add(G.base, geo.cyl(22, colLen, 'y', 32), mColumn, 'base', { pos: [d.x0, FL + 205 + colLen / 2, 0] });
    add(G.base, geo.lathe([[10, -8], [27, -8], [29, -5], [29, 5], [26, 8], [10, 8]], 32), mBase, 'base', { pos: [d.x0, d.colTop, 0] });
    add(G.base, geo.lathe([[22, -6], [27, -6], [28, 0], [27, 6], [22, 6]], 32), mBase, 'base', { pos: [d.x0, FL + 212, 0] });
    // potes, rodes i puntals
    const tyreG = geo.lathe([[14, -11], [27, -11], [31, -9.5], [33, -5], [33.6, 0], [33, 5], [31, 9.5], [27, 11], [14, 11]], 32);
    tyreG.rotateX(PI / 2);
    const hubCapG = geo.cyl(15, 25, 'z', 20);
    const forkG = geo.box(-11, 11, -27, 27, -2, 2);
    for (const ang of LEG_A) {
      const P = (r, y) => radX(d, r, y, ang);
      add(G.base, geo.curveTube([P(38, FL + 168), P(0.35 * R, FL + 150), P(0.62 * R, FL + 126), P(0.86 * R, FL + 112)], 15, 40, 14), mBase, 'base');
      add(G.base, geo.cyl(16, 30, 'y', 24), mBase, 'base', { pos: P(0.86 * R, FL + 104) });
      add(G.base, geo.cyl(7, 12, 'y', 12), mStrut, 'base', { pos: P(0.86 * R, FL + 84) });
      add(G.base, geo.box(-20, 20, -3, 3, -20, 20), mStrut, 'base', { pos: P(0.86 * R + 8, FL + 80), rot: [0, -ang, 0] });
      const cR = 0.86 * R + 14, cy = FL + 34, tx = -Math.sin(ang), tz = Math.cos(ang);
      const C = P(cR, cy);
      for (const sd of [1, -1]) add(G.base, forkG, mStrut, 'base', { pos: [C[0] + sd * 16 * tx, cy + 22, C[2] + sd * 16 * tz], rot: [0, -ang, 0] });
      add(G.base, tyreG, mRubber, 'base', { pos: C, rot: [0, -ang, 0] });
      add(G.base, hubCapG, mStrut, 'base', { pos: C, rot: [0, -ang, 0] });
      // puntal cromat des de la pota fins a l'anell
      const p0 = [0.4 * R, FL + 150], p3 = [R + 20, -64];
      const lerp = (u) => [p0[0] + (p3[0] - p0[0]) * u, p0[1] + (p3[1] - p0[1]) * u];
      const q1 = lerp(0.33), q2 = lerp(0.66);
      add(G.base, geo.curveTube([P(p0[0], p0[1]), P(q1[0] + 0.12 * R, q1[1]), P(q2[0] + 0.1 * R, q2[1]), P(p3[0], p3[1])], 9, 48, 12), mStrut, 'base');
    }
  }

  /* ---------------- pedal (pedal equilibrat) ---------------- */
  class Helix extends THREE.Curve {
    constructor(r, h, turns) { super(); this.r = r; this.h = h; this.turns = turns; }
    getPoint(t, target = new THREE.Vector3()) { const a = TAU * this.turns * t; return target.set(this.r * Math.cos(a), this.h * t, this.r * Math.sin(a)); }
  }
  const pedAng = (p) => 0.16 - 0.22 * p;            // punta amunt (nota greu) -> punta avall (nota aguda)
  const LUG = [0, -8, -60];                         // on s'enganxa la biela, sota el pedal
  const lugY = (th) => LUG[1] * Math.cos(th) - LUG[2] * Math.sin(th);
  const lugZ = (th) => LUG[1] * Math.sin(th) + LUG[2] * Math.cos(th);
  const pullDrop = (p) => lugY(pedAng(0)) - lugY(pedAng(p));   // el mateix recorregut per a vareta, aranya i cèrcol
  const ARM_Y = FL + 30;
  const footG = ext(geo.rrect(-46, 46, -175, 105, 16), 12, { bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2 });
  footG.rotateX(PI / 2); footG.translate(0, 20, 0);
  const padG = ext(geo.rrect(-39, 39, -165, 95, 12), 3, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 });
  padG.rotateX(PI / 2); padG.translate(0, 24.5, 0);
  const plateG = ext(geo.rrect(Z_P - 50, Z_P + 40, FL + 18, Y_P + 26, 10), 8, { bevelThickness: 1, bevelSize: 1, bevelSegments: 2 });
  plateG.rotateY(-PI / 2);
  const linkG = geo.cyl(4.5, 1, 'y', 12);
  for (const d of DRUMS) {
    const x0 = d.x0;
    // suport del pedal (forquilla) i braços cap a la peça central
    for (const sd of [1, -1]) {
      add(G.pedal, plateG, mPedCast, 'pedal', { pos: [x0 + sd * 60 + 4, 0, 0] });
      add(G.pedal, geo.curveTube([[x0 + sd * 16, FL + 160, 30], [x0 + sd * 40, FL + 118, 120], [x0 + sd * 60, FL + 74, Z_P - 46]], 10, 32, 10), mPedCast, 'pedal');
      add(G.pedal, geo.cyl(12, 18, 'y', 18), mRubber, 'pedal', { pos: [x0 + sd * 50, FL + 9, Z_P + 20] });
    }
    add(G.pedal, geo.cyl(10, 132, 'x', 16), mPedCast, 'pedal', { pos: [x0, FL + 28, Z_P + 20] });
    add(G.pedal, geo.cyl(7, 128, 'x', 16), mPed, 'pedal', { pos: [x0, Y_P, Z_P] });
    // peu del pedal (gira al voltant de l'eix)
    const fb = new THREE.Group(); fb.position.set(x0, Y_P, Z_P); G.pedal.add(fb); d.fb = fb;
    add(fb, footG, mPed, 'pedal');
    add(fb, padG, mPedPad, 'pedal');
    add(fb, geo.cyl(13, 64, 'x', 20), mPed, 'pedal');
    add(fb, geo.box(-6, 6, -16, 8, -68, -52), mPed, 'pedal');
    // vareta central que estira l'aranya + braç de baix + molla
    const pull = new THREE.Group(); G.pedal.add(pull); d.pull = pull;
    const upLen = d.hubY - (d.colTop - 30);
    add(pull, geo.cyl(7.5, upLen, 'y', 16), mPed, 'pedal', { pos: [x0, d.colTop - 30 + upLen / 2, 0] });
    add(pull, geo.cyl(7, FL + 140 - (ARM_Y - 6), 'y', 16), mPed, 'pedal', { pos: [x0, (FL + 140 + ARM_Y - 6) / 2, 0] });
    add(pull, geo.tube([x0, ARM_Y, 0], [x0, ARM_Y, Z_P - 60], 6.5, 1, 12), mPed, 'pedal');
    add(pull, geo.cyl(9, 16, 'x', 16), mPed, 'pedal', { pos: [x0, ARM_Y, Z_P - 60] });
    d.spLen = d.colTop - 40 - (FL + 215);
    d.spring = add(G.pedal, new THREE.TubeGeometry(new Helix(15, d.spLen, 11), 330, 2.4, 6, false), mSpring, 'pedal', { pos: [x0, FL + 215, 0], cast: false });
    d.link = add(G.pedal, linkG, mPed, 'pedal');
  }
  const _a = V3(0, 0, 0), _b = V3(0, 0, 0), _up = V3(0, 1, 0), _dir = V3(0, 0, 0);
  function setLink(d, dz, th) {
    _a.set(d.x0, Y_P + lugY(th), Z_P + lugZ(th));
    _b.set(d.x0, ARM_Y - dz, Z_P - 60);
    _dir.subVectors(_a, _b); const L = Math.max(1, _dir.length()); _dir.multiplyScalar(1 / L);
    d.link.position.addVectors(_a, _b).multiplyScalar(0.5);
    d.link.quaternion.setFromUnitVectors(_up, _dir);
    d.link.scale.set(1, L, 1);
  }

  /* ---------------- indicador d'afinació ---------------- */
  const NOTES = [
    { label: 'Fa', f: 87.31, drum: 0, pedal: 0 },
    { label: 'Sol', f: 98.00, drum: 0, pedal: 2 / 7 },
    { label: 'La', f: 110.00, drum: 0, pedal: 4 / 7 },
    { label: 'Do', f: 130.81, drum: 1, pedal: 3 / 8 },
    { label: 'Re', f: 146.83, drum: 1, pedal: 5 / 8 },
    { label: 'Mi', f: 164.81, drum: 1, pedal: 7 / 8 },
    { label: 'Glissando', f: 98.00, drum: 0, pedal: 2 / 7, glideTo: 1 }
  ];
  const needleAng = (p) => 0.44 - 0.88 * p;           // greu a l'esquerra, agut a la dreta
  const sector = (r0, r1, a0, a1, n = 24) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; pts.push([r1 * Math.cos(t), r1 * Math.sin(t)]); }
    for (let i = n; i >= 0; i--) { const t = a0 + (a1 - a0) * i / n; pts.push([r0 * Math.cos(t), r0 * Math.sin(t)]); }
    return geo.shape(pts);
  };
  const plateGG = ext(sector(36, 104, 58 * PI / 180, 122 * PI / 180), 4, { bevelThickness: 1, bevelSize: 1, bevelSegments: 2 });
  plateGG.translate(0, 0, -5);
  const tickG = geo.box(-0.9, 0.9, 85, 97, 0, 1.2);
  const markG = geo.box(-3.4, 3.4, 70, 80, 0, 1.2);
  const needleG = ext(geo.shape([[-3, -14], [3, -14], [0.7, 98], [-0.7, 98]]), 1.6);
  const housG = ext(geo.rrect(-22, 22, -28, 14, 6), 16, { bevelThickness: 1, bevelSize: 1, bevelSegments: 2 });
  housG.translate(0, 0, -23);
  for (const [di, d] of DRUMS.entries()) {
    const R = d.R, aG = d.aG;
    const root = new THREE.Group(); G.indicador.add(root);
    root.position.set(...radX(d, R + 66, 26, aG));
    root.rotation.order = 'YXZ'; root.rotation.set(-0.55, PI / 2 - aG, 0);
    add(root, plateGG, mGPlate, 'indicador');
    add(root, housG, mGFrame, 'indicador');
    const arcPts = []; for (let i = 0; i <= 24; i++) { const t = (58 + 64 * i / 24) * PI / 180; arcPts.push([105 * Math.cos(t), 105 * Math.sin(t), -2]); }
    add(root, geo.curveTube(arcPts, 2.2, 48, 8), mGFrame, 'indicador');
    for (let i = 0; i <= 8; i++) add(root, tickG, mGTick, 'indicador', { rot: [0, 0, needleAng(i / 8)] });
    for (const n of NOTES) if (n.drum === di && n.glideTo == null) add(root, markG, mGMark, 'indicador', { rot: [0, 0, needleAng(n.pedal)] });
    const needle = new THREE.Group(); needle.position.z = 1.5; root.add(needle); d.needle = needle;
    add(needle, needleG, mGNeedle, 'indicador');
    add(root, geo.cyl(6.5, 6, 'z', 20), mGFrame, 'indicador', { pos: [0, 0, 3] });
    // pal de suport fins a l'anell
    add(G.indicador, geo.tube(radX(d, R + 67, -2, aG), radX(d, R + 42, -60, aG), 5.5, 1, 12), mGFrame, 'indicador');
    const footI = ext(geo.rrect(R + 20, R + 47, -71, -56, 3), 18, { bevelThickness: 0.7, bevelSize: 0.6, bevelSegments: 2 });
    footI.translate(0, 0, -9);
    add(G.indicador, footI, mGFrame, 'indicador', { pos: [d.x0, 0, 0], rot: [0, -aG, 0] });
  }

  /* ---------------- baquetes ---------------- */
  const LM = 355, HEAD_R = 18.5, HEAD_Y = 0.4 + HEAD_R;
  const TH_C = -0.3, TH_R = -0.05, TH_W = 0.12;     // inclinació: cop, repòs, preparació
  const T_DOWN = 0.07, T_DWELL = 0.03, T_BACK = 0.4;   // el feltre toca la pell un instant i rebota
  const shaftG = swapUV(geo.lathe([[0, -24], [4.5, -23.6], [6.2, -22], [6.6, -18], [6.6, 40], [6.0, 160], [5.2, 280], [4.6, LM - 12], [0, LM - 11]], 20));
  shaftG.rotateX(-PI / 2);                     // la punta mira cap a -Z
  const feltG = new THREE.SphereGeometry(HEAD_R, 32, 22);
  const coreG = geo.cyl(6.5, 8, 'z', 16);
  const offsetOf = (th, psi) => { const c = Math.cos(th); return [-LM * c * Math.sin(psi), LM * Math.sin(th), -LM * c * Math.cos(psi)]; };
  const mallets = DRUMS.map((d, k) => {
    const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; G.baquetes.add(pivot);
    add(pivot, shaftG, mShaft, 'baquetes');
    add(pivot, coreG, mCore, 'baquetes', { pos: [0, 0, -(LM - HEAD_R - 1)] });
    add(pivot, feltG, mFelt, 'baquetes', { pos: [0, 0, -LM], scale: [1, 1, 0.92] });
    return { pivot, psi: k === 0 ? 0.12 : -0.12, d };
  });
  function poseMallet(m, th) {
    const oc = offsetOf(TH_C, m.psi);
    m.pivot.position.set(m.d.hx - oc[0], HEAD_Y - oc[1], m.d.hz - oc[2]);
    m.pivot.rotation.set(th, m.psi, 0);
  }
  function malletAngle(tau, tPre, rest) {
    const wEnd = Math.max(0, tPre - T_DOWN), wStart = Math.max(0, wEnd - 0.16);
    if (tau < wStart) return rest;
    if (tau < wEnd) return TH_R + (TH_W - TH_R) * smooth((tau - wStart) / (wEnd - wStart));
    const top = wEnd > 0 ? TH_W : TH_R;
    if (tau < tPre) { const v = (tau - wEnd) / Math.max(1e-3, tPre - wEnd); return top + (TH_C - top) * v * v; }
    if (tau < tPre + T_DWELL) return TH_C;
    const v = (tau - tPre - T_DWELL) / T_BACK;
    if (v < 1) return TH_C + (TH_R - TH_C) * (1 - Math.pow(1 - v, 3));
    return rest;
  }
  // punt mig de la baqueta dreta en repòs (per a l'etiqueta)
  const malletLabel = (() => {
    const m = mallets[1], oc = offsetOf(TH_C, m.psi), orr = offsetOf(TH_R, m.psi);
    const px = m.d.hx - oc[0], py = HEAD_Y - oc[1], pz = m.d.hz - oc[2];
    return [px + orr[0] * 0.55, py + orr[1] * 0.55, pz + orr[2] * 0.55];
  })();

  /* ---------------- posa el mecanisme en una posició de pedal ---------------- */
  function setPedal(d, p) {
    const th = pedAng(p), dz = pullDrop(p);
    d.fb.rotation.x = th;
    d.pull.position.y = -dz;
    d.mv.position.y = -dz;
    d.spring.scale.y = (d.spLen - dz) / d.spLen;
    d.needle.rotation.z = needleAng(p);
    setLink(d, dz, th);
  }
  for (const d of DRUMS) setPedal(d, d.p);
  for (const m of mallets) poseMallet(m, TH_R);

  /* ---------------- so ---------------- */
  // modes del timbal: gràcies a l'aire de la caldera, gairebé harmònics (1 = to principal)
  const PARTS = [{ k: 1, a: 1, tau: 1 }, { k: 1.5, a: 0.5, tau: 0.68 }, { k: 1.99, a: 0.32, tau: 0.5 }, { k: 2.44, a: 0.17, tau: 0.32 }, { k: 2.9, a: 0.1, tau: 0.22 }];
  const partialsFor = (T1, amp = 1) => PARTS.map((p) => ({ k: p.k, a: p.a * amp, tau: p.tau * T1 }));
  const timers = [], live = [];
  const later = (fn, ms) => { if (ms < 15) fn(); else timers.push(setTimeout(() => { try { fn(); } catch (e) { /* res */ } }, ms)); };
  function hitSound(f, drum, gain = 1) {
    const T1 = drum === 0 ? 2.4 : 2.0;
    synth.additive({ f, partials: [...partialsFor(T1), { k: 0.62, a: 0.3, tau: 0.08 }], attack: 0.004, gain,
      noise: { amount: 0.1, dur: 0.035, lp: 500, hp: 40 } });
  }
  function stopLive() {
    let now = 0; try { now = live.length ? live[0].o.context.currentTime : 0; } catch (e) { /* res */ }
    while (live.length) {
      const v = live.pop();
      try { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.03); v.o.stop(now + 0.25); } catch (e) { /* res */ }
    }
  }
  const fOf = (d, p) => d.fBase * Math.pow(2, d.semis * p / 12);
  // glissando de veritat: oscil·ladors amb la freqüència que segueix el pedal
  function glideSound(d, p1, p2, tHit, tG0, tG1) {
    const ac = synth.ctx;
    if (!ac || !ac.createOscillator) return false;
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    const out = synth.out, now = ac.currentTime + 0.02, t0 = now + tHit, T1 = 3.0;
    const bus = ac.createGain(); bus.gain.value = 0.3; bus.connect(out);
    const NC = 64, curve = new Float32Array(NC);
    for (const p of PARTS) {
      for (let i = 0; i < NC; i++) curve[i] = fOf(d, p1 + (p2 - p1) * smooth(i / (NC - 1))) * p.k;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(curve[0], now);
      o.frequency.setValueCurveAtTime(curve.slice(), t0 + tG0, Math.max(0.05, tG1 - tG0));
      g.gain.setValueAtTime(0, now); g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(p.a, t0 + 0.005);
      g.gain.setTargetAtTime(0, t0 + 0.005, p.tau * T1);
      o.connect(g); g.connect(bus); o.start(now); o.stop(t0 + 0.01 + p.tau * T1 * 6);
      live.push({ o, g });
    }
    later(() => synth.additive({ f: fOf(d, p1), partials: [{ k: 0.62, a: 0.3, tau: 0.08 }], attack: 0.004, gain: 0.3,
      noise: { amount: 0.25, dur: 0.035, lp: 500, hp: 40 } }), tHit * 1000);
    return true;
  }
  // sense accés directe a l'àudio: el glissando es fa amb petits cops de so que pugen
  function glideFallback(d, p1, p2, tHit, tG0, tG1) {
    later(() => hitSound(fOf(d, p1), 0, 1), tHit * 1000);
    const N = 9;
    for (let i = 1; i <= N; i++) {
      const u = i / N, tt = tHit + tG0 + (tG1 - tG0) * u;
      const f = fOf(d, p1 + (p2 - p1) * smooth(u)), amp = Math.exp(-(tt - tHit) / 1.6);
      later(() => synth.additive({ f, partials: partialsFor(0.35, amp), attack: 0.04, gain: 0.55 * amp }), tt * 1000);
    }
  }

  /* ---------------- estat de l'animació ---------------- */
  const T_PRE = 0.07, T_PRE_MOVE = 0.42, G_DELAY = 0.3, G_DUR = 1.6;
  const st = { clk: 0, lastT: 0, view: 'explore', step: -1 };
  let pending = null;
  const noteOf = (n) => {
    if (typeof n === 'number') return NOTES[n] || NOTES[0];
    if (n && NOTES.includes(n)) return n;
    if (n && n.label) return NOTES.find((x) => x.label === n.label) || NOTES[0];
    return NOTES[0];
  };
  function startStrike(n, start) {
    const d = DRUMS[n.drum];
    const move = Math.abs(d.p - n.pedal) > 0.01;
    d.sk = { start, tPre: move ? T_PRE_MOVE : T_PRE, p0: d.p, p1: n.pedal, pG: n.glideTo != null ? n.glideTo : null, hit: false };
  }
  const BASE_A = 7.5;      // mm (exagerat)
  function deform(d, a0, a1, a2, a3, dA) {
    const H = d.head, P = H.pos, B = H.base, C = H.col, inv = 1 / (2 * 32 * 32);
    for (let i = 0; i < H.n; i++) {
      let w = a0 * H.S0[i] + a1 * H.S1[i] + a2 * H.S2[i] + a3 * H.S3[i];
      if (dA !== 0) { const dx = B[i * 3] - d.hx, dz = B[i * 3 + 2] - d.hz; w += dA * Math.exp(-(dx * dx + dz * dz) * inv) * H.edge[i]; }
      P[i * 3 + 1] = B[i * 3 + 1] + w;
      heat.color(clamp(w / 6, -1, 1), C, i);
    }
    H.g.attributes.position.needsUpdate = true; H.g.attributes.color.needsUpdate = true;
    H.g.computeVertexNormals(); H.dirty = true;
  }
  function restore(d) {
    const H = d.head;
    H.pos.set(H.base); H.col.fill(0);
    H.g.attributes.position.needsUpdate = true; H.g.attributes.color.needsUpdate = true;
    H.g.computeVertexNormals(); H.dirty = false;
  }
  const UPD = V3(0, 1, 0), DOWN = V3(0, -1, 0);

  /* ---------------- textos ---------------- */
  const parts = {
    pell: { name: 'Pell', text: "És la membrana que piques amb la baqueta. Com més tibada està, més aguda és la nota.",
      dato: "Abans es feien de pell de vedella; avui gairebé sempre són de plàstic (polièster)." },
    caldera: { name: 'Caldera', text: "És el cos del timbal, una mena d'olla gran de metall. L'aire de dins vibra amb la pell i ajuda que el so tingui una nota clara.",
      dato: "Sol ser de coure. Al fons té un forat petit perquè l'aire de dins no quedi tancat del tot." },
    pedal: { name: 'Pedal', text: "Amb el pedal el timbaler tiba o afluixa la pell. Així canvia la nota sense fer servir les mans, fins i tot mentre la pell sona.",
      dato: "Una molla dins del peu equilibra la força de la pell. Per això el pedal es queda quiet on el deixes." },
    cercol: { name: 'Tensors i cèrcol', text: "El cèrcol és l'anell de metall que estira la pell cap avall. Els tensors el subjecten i serveixen per afinar el timbal a mà.",
      dato: "Cada timbal d'aquests té 8 tensors amb un mànec en forma de T, per girar-los sense clau." },
    indicador: { name: 'Indicador', text: "L'agulla es mou amb el pedal i mostra quina nota està preparada. Així el timbaler pot canviar de nota sense haver de provar-la abans.",
      dato: "Els timbalers també afinen d'oïda: abans d'entrar, toquen la pell molt fluix amb el dit i escolten." },
    baquetes: { name: 'Baquetes', text: "Tenen un mànec de fusta i un cap tou de feltre. El cap tou fa un so rodó, sense cops secs.",
      dato: "El timbaler en canvia segons la música: amb caps més durs el so és més clar i més sec." },
    base: { name: 'Base', text: "És l'estructura de metall que aguanta la caldera a l'alçada de les mans. Té rodes per poder moure els timbals.",
      dato: "Aquí n'hi ha dos: un de 74 cm (29 polzades) i un de 66 cm (26 polzades). El més gran fa les notes més greus." }
  };
  const TOUR = [
    { part: 'baquetes', chain: 0, title: 'La baqueta', note: 0, heat: false, xray: false, slow: 0.35,
      text: "El timbaler pica la pell a prop de la vora, no al centre. El cap de feltre és tou i rebota de seguida. Al centre, el so seria curt i apagat.",
      cam: { pos: [60, 330, 1050], target: [-400, 50, 300] } },
    { part: 'pell', chain: 1, title: 'La pell', note: 0, heat: true, xray: false, slow: 0.35,
      text: "La pell vibra: les zones taronja pugen i les blaves baixen. Com que la piques a prop de la vora, una meitat puja mentre l'altra baixa. Aquesta manera de vibrar és la que fa la nota.",
      cam: { pos: [-360, 1250, 720], target: [-440, 0, 40] } },
    { part: 'caldera', chain: 2, title: "L'aire de la caldera", note: 0, heat: true, xray: true, slow: 0.45,
      text: "La caldera és com una olla de coure tapada per la pell. L'aire de dins vibra amb la pell i ajuda que el timbal faci una nota clara, que es pot cantar. Una mica d'aire surt pel forat del fons.",
      cam: { pos: [-1450, 120, 1050], target: [-440, -190, 0] } },
    { part: 'pedal', chain: 1, title: 'El pedal', note: 6, heat: true, xray: false, slow: 1,
      text: "Si prems el pedal amb la punta del peu, la pell es tiba i la nota puja. L'agulla de l'indicador mostra la nota nova. Pots canviar la nota mentre la pell encara sona: és un glissando.",
      cam: { pos: [-60, -150, 2000], target: [-560, -360, 180] } },
    { part: 'pell', chain: 3, title: 'El so surt', note: 4, heat: false, xray: false, slow: 1,
      text: "La pell empeny l'aire de la sala i el so arriba a les teves orelles. A diferència de la caixa, el timbal sí que fa una nota que es pot afinar. Per això a l'orquestra se'n fan servir dos o més, cadascun amb notes diferents.",
      cam: { pos: [950, 650, 2400], target: [-20, -280, 0] } }
  ];
  const slowNow = () => {
    if (st.view === 'tour' && TOUR[st.step]) return Math.max(0.2, TOUR[st.step].slow ?? 1);
    return 1;
  };
  const B = DRUMS[0], S = DRUMS[1];

  return {
    id: 'timbals',
    family: 'Percussió afinada',
    name: 'Timbals',
    intro: "Els timbals són tambors grans amb una caldera de coure tapada per una pell. A diferència de la caixa, fan una nota que es pot afinar, i amb el pedal la pots canviar mentre toques.",
    floorY: FL,
    camera: {
      explore: { pos: [500, 700, 2200], target: [-20, -300, 40] },
      exploded: { pos: [1900, 1500, 3300], target: [-50, -100, -150] }
    },
    parts,
    labels: [
      { part: 'pell', group: 'pells', at: [B.x0 + 90, 1, -150] },
      { part: 'caldera', group: 'calderes', at: [S.x0 + 147, -182, 254] },
      { part: 'cercol', group: 'cercols', at: radX(B, B.R + 36, -18, 100 * PI / 180) },
      { part: 'indicador', group: 'indicador', at: radX(B, B.R + 30, 88, B.aG) },
      { part: 'baquetes', group: 'baquetes', at: malletLabel },
      { part: 'pedal', group: 'pedal', at: [S.x0, Y_P + 30, Z_P - 60] },
      { part: 'base', group: 'base', at: radX(B, 0.6 * B.R, FL + 126, 135 * PI / 180) }
    ],
    explode: {
      calderes: [0, 0, -1150, 0],
      cercols: [0, 900, 0, 0.08],
      pells: [0, 330, 520, 0.16],
      indicador: [0, 500, 300, 0.22],
      baquetes: [0, 250, 900, 0],
      pedal: [0, 0, 480, 0.28],
      base: [0, 0, 0, 0]
    },
    notes: NOTES,
    options: null,
    chain: ['Baqueta', 'Pell', 'Aire de la caldera', 'Aire'],
    tour: TOUR,
    soundSource: { group: 'pells', at: [0, 0, 0] },

    play(note) {
      const n = noteOf(note), d = DRUMS[n.drum];
      while (timers.length) clearTimeout(timers.pop());
      stopLive();
      const move = Math.abs(d.p - n.pedal) > 0.01;
      const sl = slowNow(), tPre = move ? T_PRE_MOVE : T_PRE, delay = tPre / sl;
      pending = n;
      const glide = n.glideTo != null;
      try {
        if (glide) {
          const tG0 = G_DELAY / sl, tG1 = (G_DELAY + G_DUR) / sl;
          if (!glideSound(d, n.pedal, n.glideTo, delay, tG0, tG1)) glideFallback(d, n.pedal, n.glideTo, delay, tG0, tG1);
        } else later(() => hitSound(n.f, n.drum, 1), delay * 1000);
      } catch (e) {
        try {
          if (glide) glideFallback(d, n.pedal, n.glideTo, delay, G_DELAY / sl, (G_DELAY + G_DUR) / sl);
          else later(() => hitSound(n.f, n.drum, 1), delay * 1000);
        } catch (e2) { /* sense àudio: l'animació continua */ }
      }
      return { attack: 0.003, hold: delay + (glide ? (G_DELAY + G_DUR) / sl : 0), release: 1.8 };
    },

    update(dt, s) {
      const t = s.t || 0, env = s.env || 0;
      st.view = s.view; st.step = s.tourStep;
      let dtv = t >= st.lastT ? t - st.lastT : t;
      st.lastT = t; dtv = clamp(dtv, 0, 0.1);
      st.clk += dtv;
      if (pending) { startStrike(pending, st.clk - t); pending = null; }
      const g = Math.min(1, env * 4), alive = env > 0.0005;

      for (let di = 0; di < 2; di++) {
        const d = DRUMS[di], sk = d.sk;
        let th = TH_R + 0.012 * Math.sin((s.time || 0) * 1.3 + di * 1.7);
        if (sk) {
          const tau = st.clk - sk.start, tm = sk.tPre - 0.1;
          let p = tau < sk.tPre && tm > 0.05 ? sk.p0 + (sk.p1 - sk.p0) * smooth(tau / tm) : sk.p1;
          if (sk.pG != null) { const u = (tau - sk.tPre - G_DELAY) / G_DUR; if (u > 0) p = sk.p1 + (sk.pG - sk.p1) * smooth(u); }
          d.p = p;
          if (!sk.hit && tau >= sk.tPre) { sk.hit = true; d.hitT = sk.start + sk.tPre; d.ph = 0; d.glide = sk.pG != null; }
          th = malletAngle(tau, sk.tPre, th);
          if (tau > sk.tPre + T_DWELL + T_BACK + (sk.pG != null ? G_DELAY + G_DUR : 0) + 0.3) d.sk = null;
        }
        poseMallet(mallets[di], th);
        setPedal(d, d.p);

        /* pell: modes (1,1), (2,1), (3,1) i una mica de (0,1) */
        let e = 0;
        if (alive && d.hitT != null && st.clk - d.hitT < 14) {
          const tl = st.clk - d.hitT;
          const W = TAU * 1.25 * Math.pow(fOf(d, d.p) / 87.31, 0.9);   // més tibada -> vibra més de pressa
          d.ph += W * Math.min(dtv, Math.max(0, tl));
          const T1 = d.glide ? 2.6 : 1.7, A = BASE_A * g, H = d.head, ph = d.ph;
          const e1 = Math.exp(-tl / T1);
          const a1 = -A * H.hit[1] * e1 * Math.sin(ph);
          const a2 = -A * 0.55 * H.hit[2] * Math.exp(-tl / (0.65 * T1)) * Math.sin(1.5 * ph);
          const a3 = -A * 0.35 * H.hit[3] * Math.exp(-tl / (0.45 * T1)) * Math.sin(2 * ph);
          const a0 = -A * 0.5 * H.hit[0] * Math.exp(-tl / 0.18) * Math.sin(0.8 * ph);
          const dA = tl < 0.15 ? -3.2 * (1 - Math.exp(-tl / 0.006)) * Math.exp(-tl / 0.035) * g : 0;
          deform(d, a0, a1, a2, a3, dA);
          e = e1 * g;

          /* aire */
          if (e > 0.03) {
            const rate = 380 * e, c = Math.cos(d.hitA), sn = Math.sin(d.hitA), rr = 0.48 * d.R;
            for (const sg of [1, -1]) fx.air(G.pells.localToWorld(V3(d.x0 + sg * rr * c, 6, sg * rr * sn)), UPD.clone(), rate * 0.5, 0.5, 160);
            fx.air(G.calderes.localToWorld(V3(d.x0, d.yBot - 4, 0)), DOWN.clone(), rate * 0.25, 0.5, 90);
            if (s.xray) fx.air(G.calderes.localToWorld(V3(d.x0, -60, 0)), DOWN.clone(), rate * 0.6, 0.9, 70);
          }
        } else if (d.head.dirty) restore(d);

        d.air.visible = !!s.xray;
        if (s.xray) mAirs[di].opacity = clamp(0.08 + 0.14 * e * (0.5 + 0.5 * Math.sin(d.ph || 0)), 0.02, 0.3);
      }
    }
  };
}
