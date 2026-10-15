// Arpa de concert (arpa de pedals) — mòdul d'instrument (corda pinçada)
// Unitats: mm. Y amunt. L'arpa està dreta sobre el terra (la base a y = 0).
// Vista de costat al pla XY: la columna és a x ≈ 0; la caixa puja inclinada cap a +X
// (cap a l'arpista). Les cordes són verticals al pla z = 0: les greus (llargues) a prop
// de la columna, les agudes (curtes) a dalt de la caixa. El coll està a +Z de les cordes.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const ds = m => { m.side = THREE.DoubleSide; return m; };
  const bev = (t, s, n = 2) => ({ bevelThickness: t, bevelSize: s, bevelSegments: n });

  const G = groups(['cordes', 'coll', 'columna', 'tapa', 'caixa', 'base']);

  /* ================= ajudes ================= */
  // ajunta geometries (amb índexs) en una sola: menys objectes a dibuixar
  function merge(list) {
    let n = 0, ni = 0;
    for (const h of list) { if (!h.attributes.normal) h.computeVertexNormals(); n += h.attributes.position.count; ni += h.index ? h.index.count : h.attributes.position.count; }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
    let o = 0, oi = 0;
    for (const h of list) {
      const c = h.attributes.position.count;
      pos.set(h.attributes.position.array, o * 3);
      nor.set(h.attributes.normal.array, o * 3);
      if (h.attributes.uv) uv.set(h.attributes.uv.array, o * 2);
      if (h.index) { const a = h.index.array; for (let i = 0; i < a.length; i++) idx[oi + i] = a[i] + o; oi += a.length; }
      else { for (let i = 0; i < c; i++) idx[oi + i] = o + i; oi += c; }
      o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }
  function loft(rings, caps = true) {
    const N = rings.length, Mr = rings[0].length, pos = [], uv = [], idx = [];
    for (let i = 0; i < N; i++) for (let j = 0; j <= Mr; j++) { const p = rings[i][j % Mr]; pos.push(p[0], p[1], p[2]); uv.push(i / (N - 1), j / Mr); }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < Mr; j++) { const a = i * (Mr + 1) + j, b = a + Mr + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    if (caps) {
      for (const [ring, fl] of [[rings[0], false], [rings[N - 1], true]]) {
        const c0 = pos.length / 3; let cx = 0, cy = 0, cz = 0;
        for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
        pos.push(cx / Mr, cy / Mr, cz / Mr); uv.push(0.5, 0.5);
        for (const p of ring) { pos.push(p[0], p[1], p[2]); uv.push(0.5, 0.5); }
        for (let j = 0; j < Mr; j++) { const a = c0 + 1 + j, b = c0 + 1 + (j + 1) % Mr; if (fl) idx.push(c0, a, b); else idx.push(c0, b, a); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // polígon amb cantonades arrodonides (corba quadràtica a cada vèrtex)
  function roundPoly(P, r, n = 6) {
    const out = [], N = P.length;
    for (let i = 0; i < N; i++) {
      const a = P[(i - 1 + N) % N], b = P[i], c = P[(i + 1) % N];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const rr = Math.min(r, l1 * 0.45, l2 * 0.45);
      const p0 = [b[0] + (a[0] - b[0]) * rr / l1, b[1] + (a[1] - b[1]) * rr / l1], p2 = [b[0] + (c[0] - b[0]) * rr / l2, b[1] + (c[1] - b[1]) * rr / l2];
      for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p2[1]]); }
    }
    return out;
  }
  const rr = (x0, x1, y0, y1, r) => geo.shape(roundPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r, 3));
  // forma al pla (x, -z) extruïda cap a +Y
  const extY = (pts, y0, d, bv) => geo.ext(geo.shape(pts.map(p => [p[0], -p[1]])), d, bv).rotateX(-PI / 2).translate(0, y0, 0);
  function splinePts(ctrl, n) {
    const c = new THREE.SplineCurve(ctrl.map(p => new THREE.Vector2(p[0], p[1])));
    return c.getSpacedPoints(n).map(v => [v.x, v.y]);
  }
  function interpX(arr, x) {   // arr ordenat per x creixent
    if (x <= arr[0][0]) return arr[0][1];
    if (x >= arr[arr.length - 1][0]) return arr[arr.length - 1][1];
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][0] <= x) lo = m; else hi = m; }
    const a = arr[lo], b = arr[hi];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1);
  }
  function smoothArr(v, w, it = 1) {
    let a = v.slice();
    for (let k = 0; k < it; k++) {
      const b = a.slice();
      for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let j = -w; j <= w; j++) { const q = i + j; if (q >= 0 && q < a.length) { s += a[q]; n++; } } b[i] = s / n; }
      a = b;
    }
    return a;
  }

  /* ================= materials ================= */
  const MAPLE = 0xE3B57A;
  const colTex = tex.maple(1, 3); colTex.rotation = PI / 2;
  const mCol = M.wood('columna', colTex, { color: MAPLE, xray: true });
  const mGoldC = M.brass('columna');
  const mRod = M.nickel('pedals');
  const mNeck = M.wood('coll', tex.maple(1 / 420, 1 / 420), { color: MAPLE });
  const mPlate = mat('coll', { color: 0xB48A45, metalness: 0.9, roughness: 0.42 });
  const mDisc = M.brass('coll');
  const mPin = M.nickel('coll');
  const mGoldN = M.brass('coll');
  const mGoldB = M.brass('caixa');
  const mSB = ds(M.wood('tapa', tex.spruce(1 / 340, 1 / 340), { color: 0xF2D9A2, xray: true }));
  const mStrip = M.wood('tapa', tex.maple(1 / 260, 1 / 60), { color: 0xC98F55, xray: true });
  const mEye = M.bone('tapa');
  const mGoldT = M.brass('tapa');
  const mBox = ds(M.wood('caixa', tex.maple(1 / 650, 1 / 260), { color: MAPLE, xray: true }));
  const mBoxIn = ds(M.rawWood('caixa', tex.spruce(1 / 400, 1 / 400), { color: 0xD9BC8C, xray: true }));
  const mBand = M.wood('caixa', tex.maple(1 / 200, 1 / 200), { color: 0x8A5A2E, xray: true });
  const mHoleRim = M.wood('caixa', tex.maple(1 / 100, 1 / 100), { color: 0x9A6634, xray: true });
  const mBaseW = M.wood('pedals', tex.maple(1 / 380, 1 / 380), { color: MAPLE });
  const mPedal = M.brass('pedals');
  const mSlot = mat('pedals', { color: 0x0d0b0a, roughness: 0.9 }, { phys: false });
  const sMat = (c, o = {}) => mat('cordes', Object.assign({ color: c, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }, o));
  const mNylon = sMat(0xF3EEE3, { roughness: 0.22, clearcoat: 0.8 });
  const mGut = sMat(0xE4C98F);
  const mRed = sMat(0xC4202B);
  const mBlue = sMat(0x18203E);
  const mWound = M.string('cordes', true);
  const mWoundC = mat('cordes', { color: 0xB06A55, metalness: 0.85, roughness: 0.35 }, { phys: false });
  const mWoundF = mat('cordes', { color: 0x3A4058, metalness: 0.85, roughness: 0.35 }, { phys: false });
  const mFinger = M.plastic('cordes', 0xE5AC8A);
  const mProxy = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

  /* ================= geometria principal ================= */
  const YB = 140;                                   // dalt de la base
  const SLOPE = 1.72;                               // pendent de la tapa (≈ 30° de la vertical)
  const UX = 1 / Math.hypot(1, SLOPE), UY = SLOPE / Math.hypot(1, SLOPE);   // eix de la caixa (cap amunt)
  const NX = -UY, NY = UX;                          // normal de la tapa (cap a les cordes)
  const AX = 125 - (235 - YB) / SLOPE, AY = YB;     // punt de baix de la tapa
  const LSB = 1620;                                 // llargada de la tapa
  const ySB = x => 235 + (x - 125) * SLOPE;         // línia de la tapa (a = 0) vista de costat
  const sbPt = (s, z, a) => [AX + UX * s + NX * a, AY + UY * s + NY * a, z];
  const hwS = s => 46 + 159 * Math.pow(clamp(1 - s / LSB), 1.1);   // mitja amplada de la tapa
  const dS = s => 100 + 185 * Math.pow(clamp(1 - s / LSB), 1.2);    // fondària de la caixa

  /* ================= cordes: posicions i llargades ================= */
  // índex 0 = Sol7 (la més aguda) … 46 = Do1 (la més greu). 47 cordes.
  const NS = 47;
  const CL = [[0, 64], [4, 98], [11, 182], [18, 335], [25, 590], [32, 930], [39, 1235], [46, 1440]];
  const Lnom = i => { for (let k = 0; k < CL.length - 1; k++) { const [a, la] = CL[k], [b, lb] = CL[k + 1]; if (i >= a && i <= b) return Math.exp(lerp(Math.log(la), Math.log(lb), (i - a) / (b - a))); } return 64; };
  const NAMES = ['Sol', 'Fa', 'Mi', 'Re', 'Do', 'Si', 'La'];   // de dalt a baix
  const SX = [];
  { let x = 125; for (let i = NS - 1; i >= 0; i--) { SX[i] = x; x += 14 + 3.2 * (i / 46); } }
  const STR = [];
  for (let i = 0; i < NS; i++) {
    const x = SX[i], L = Lnom(i), yt = ySB(x) + L;
    const yb = AY + (3 - (x - AX) * NX) / NY;        // dins la tira central (a = 3)
    const sAt = (x - AX) * UX + (yb - AY) * UY;      // posició al llarg de la tapa
    const name = NAMES[i % 7];
    const wound = i >= 35, nylon = i <= 11;
    const r = wound ? 1.05 + 0.8 * (i - 35) / 11 : nylon ? 0.42 + 0.25 * i / 11 : 0.62 + 0.48 * (i - 12) / 22;
    const rd = 4.5 + 4.5 * Math.sqrt(L / 1440);      // radi dels discs
    const hasDisc = i < 45;                          // el Do i el Re més greus no en tenen
    const d1 = Math.max(0.0561 * L, rd + 4), d2 = Math.max(0.109 * L, d1 + 2 * rd + 3);
    STR.push({ i, x, L, yt, yb, s: sAt, name, wound, nylon, r, rd, hasDisc, yD1: yt - d1, yD2: yt - d2 });
  }
  const YT = x => interpX(STR.map(S => [S.x, S.yt]).reverse(), x);

  /* ================= TAPA HARMÒNICA (deformable) ================= */
  const NR = 120, NW = 24;
  const sbGeo = (() => {
    const pos = [], uv = [], idx = [];
    for (let r = 0; r <= NR; r++) {
      const s = LSB * r / NR, hw = hwS(s) * 0.995;
      for (let c = 0; c <= NW; c++) { const v = -1 + 2 * c / NW, p = sbPt(s, v * hw, 0.8); pos.push(p[0], p[1], p[2]); uv.push(v * hw, s); }
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NW; c++) { const a = r * (NW + 1) + c, b = a + NW + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  const sbMesh = add(G.tapa, sbGeo, mSB, 'tapa');
  heat.overlay(sbMesh);
  const nSB = sbGeo.attributes.position.count;
  const sbBase = Float32Array.from(sbGeo.attributes.position.array), sbBaseN = Float32Array.from(sbGeo.attributes.normal.array);
  const sbCV = new Float32Array(NW + 1);
  for (let c = 0; c <= NW; c++) { const v = -1 + 2 * c / NW; sbCV[c] = Math.cos(PI * v / 2); }
  const rowS = new Float32Array(NR + 1), rowSin = new Float32Array(NR + 1), rowD = new Float32Array(NR + 1);
  for (let r = 0; r <= NR; r++) { rowS[r] = LSB * r / NR; rowSin[r] = Math.sin(PI * r / NR); }
  const rowAt = s => { const f = clamp(s / LSB) * NR, i = Math.min(NR - 1, Math.floor(f)), t = f - i; return rowD[i] * (1 - t) + rowD[i + 1] * t; };

  // peces que segueixen la tapa: tira central i ullets
  const followers = [];
  function follow(g, mt, part, opts) {
    const me = add(G.tapa, g, mt, part, opts);
    const p = g.attributes.position.array, n = p.length / 3, sv = new Float32Array(n);
    for (let i = 0; i < n; i++) sv[i] = (p[i * 3] - AX) * UX + (p[i * 3 + 1] - AY) * UY;
    followers.push({ g, base: Float32Array.from(p), sv, n });
    return me;
  }
  const S0 = STR[NS - 1].s - 55, S1 = STR[0].s + 40;
  {
    const rings = [];
    for (let k = 0; k <= 110; k++) {
      const s = lerp(S0, S1, k / 110), w = lerp(14, 9, k / 110);
      rings.push([[-w, 0.6], [-w, 4.6], [-w * 0.72, 6], [w * 0.72, 6], [w, 4.6], [w, 0.6]].map(([z, a]) => sbPt(s, z, a)));
    }
    follow(loft(rings), mStrip, 'tapa');
    const eyes = [];
    const rotZ = Math.atan2(-NX, NY);
    for (const S of STR) {
      const p = sbPt(S.s, 0, 6.1);
      eyes.push(geo.cyl(2.6 + S.r * 0.7, 1.2, 'y', 10).rotateZ(rotZ).translate(p[0], p[1], p[2]));
    }
    follow(merge(eyes), mEye, 'tapa', { cast: false });
  }
  // filets daurats als costats de la tapa
  for (const sg of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 40; k++) { const s = lerp(25, LSB - 30, k / 40); pts.push(sbPt(s, sg * (hwS(s) - 13), 1.2)); }
    add(G.tapa, geo.curveTube(pts, 1.6, 120, 6), mGoldT, 'tapa', { cast: false });
  }

  /* ================= CAIXA (closca de darrere amb forats ovalats) ================= */
  const HOLES = [{ sc: 420, hl: 74, hw: 50 }, { sc: 680, hl: 66, hw: 44 }, { sc: 920, hl: 57, hw: 38 }, { sc: 1140, hl: 47, hw: 31 }];
  const Rk = s => 0.45 * (hwS(s) + dS(s));
  function shellPt(s, ph, inset) {
    const hw = hwS(s) - inset, d = dS(s) - inset, c = Math.cos(ph), sn = Math.sin(ph);
    const z = hw * Math.sign(c) * Math.pow(Math.abs(c), 0.8), a = -d * Math.pow(Math.abs(sn), 0.9);
    let x = AX + UX * s + NX * a, y = AY + UY * s + NY * a;
    if (y < YB) { const t = (YB - y) / UY; x += UX * t; y = YB; }
    return [x, y, z];
  }
  function holeRho(s, ph) {
    for (const h of HOLES) {
      const dsv = (s - h.sc) / h.hl, dw = (ph - PI / 2) * Rk(s) / h.hw, r = Math.hypot(dsv, dw);
      if (r < 1.35) return { h, r, dsv, dw };
    }
    return null;
  }
  function shellGeo(inset) {
    const NSb = 150, NP = 72, S = NP + 1, nv = (NSb + 1) * S;
    const sA = new Float32Array(nv), pA = new Float32Array(nv), ok = new Uint8Array(nv);
    for (let i = 0; i <= NSb; i++) for (let j = 0; j <= NP; j++) {
      const id = i * S + j, s = LSB * i / NSb, ph = PI * j / NP;
      sA[id] = s; pA[id] = ph; ok[id] = 1;
      const q = holeRho(s, ph); if (q && q.r < 1) ok[id] = 0;
    }
    for (let i = 1; i < NSb; i++) for (let j = 1; j < NP; j++) {          // vores dels forats més netes
      const id = i * S + j; if (!ok[id]) continue;
      if (ok[id - S] && ok[id + S] && ok[id - 1] && ok[id + 1]) continue;
      const q = holeRho(sA[id], pA[id]); if (!q) continue;
      sA[id] = q.h.sc + q.dsv / q.r * q.h.hl; pA[id] = PI / 2 + q.dw / q.r * q.h.hw / Rk(sA[id]);
    }
    const map = new Int32Array(nv).fill(-1), pos = [], uv = [], idx = [];
    for (let id = 0; id < nv; id++) {
      if (!ok[id]) continue; map[id] = pos.length / 3;
      const p = shellPt(sA[id], pA[id], inset); pos.push(p[0], p[1], p[2]); uv.push(sA[id], pA[id] * Rk(sA[id]));
    }
    for (let i = 0; i < NSb; i++) for (let j = 0; j < NP; j++) {
      const a = map[i * S + j], b = map[(i + 1) * S + j], c = map[(i + 1) * S + j + 1], d = map[i * S + j + 1];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, b, d, b, c, d);
      else { const q = [a, b, c, d].filter(v => v >= 0); if (q.length === 3) idx.push(q[0], q[1], q[2]); }
    }
    // tapes de dalt i de baix
    for (const [i, fl] of [[0, false], [NSb, true]]) {
      const c0 = pos.length / 3, s = LSB * i / NSb, ring = [];
      for (let j = 0; j <= NP; j++) ring.push(shellPt(s, PI * j / NP, inset));
      const m = sbPt(s, 0, -dS(s) * 0.45); if (m[1] < YB) m[1] = YB;
      pos.push(m[0], m[1], m[2]); uv.push(0, 0);
      for (const p of ring) { pos.push(p[0], p[1], p[2]); uv.push(p[0], p[2]); }
      for (let j = 0; j < NP; j++) { const a = c0 + 1 + j, b = c0 + 2 + j; if (fl) idx.push(c0, b, a); else idx.push(c0, a, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  add(G.caixa, shellGeo(0), mBox, 'caixa');
  add(G.caixa, shellGeo(7), mBoxIn, 'caixa', { cast: false });
  // vores dels forats i centres (per a l'aire)
  const holeC = [];
  for (const h of HOLES) {
    const pts = [];
    for (let k = 0; k < 44; k++) {
      const th = TAU * k / 44, s = h.sc + h.hl * Math.cos(th), ph = PI / 2 + h.hw * Math.sin(th) / Rk(s);
      pts.push(shellPt(s, ph, -1.2));
    }
    add(G.caixa, geo.curveTube(pts, 4.2, 132, 8, true), mHoleRim, 'caixa');
    const c = shellPt(h.sc, PI / 2, 0);
    holeC.push(V3(c[0] + 4 * -NX, c[1] + 4 * -NY, c[2]));
  }
  // vores de fusta fosca on s'enganxa la tapa
  for (const sg of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 40; k++) { const s = lerp(0, LSB, k / 40); pts.push(sbPt(s, sg * (hwS(s) + 1.5), 0.2)); }
    add(G.caixa, geo.curveTube(pts, 4.5, 160, 8), mBand, 'caixa');
  }
  // espatlla de dalt de la caixa: el bloc on recolza la punta del coll
  {
    const a1 = sbPt(1585, 0, 1), b1 = sbPt(1585, 0, -dS(1585) - 4);
    const pts = [[a1[0], a1[1]], [870, 1530], [884, 1560], [928, 1537], [970, 1515], [990, 1512], [976, 1492], [b1[0], b1[1]]];
    add(G.caixa, geo.ext(geo.shape(pts), 92, bev(8, 7, 4)).translate(0, 0, -42), mBox, 'caixa');
    const g = []; for (let k = 0; k <= 16; k++) { const t = k / 16; g.push([lerp(a1[0], b1[0], t) + 4 * UX, lerp(a1[1], b1[1], t) + 4 * UY, -51]); }
    add(G.caixa, geo.curveTube(g, 2.4, 40, 6), mGoldB, 'caixa', { cast: false });
  }

  /* ================= CORDES ================= */
  const ANIM_LO = 14, ANIM_HI = 25;           // Sol5 … Do4: les que poden vibrar
  const SEG = 64, RAD = 6, K = 8;
  const anim = {};
  const strMat = S => {
    const isC = S.name === 'Do', isF = S.name === 'Fa';
    if (S.wound) return isC ? mWoundC : isF ? mWoundF : mWound;
    return isC ? mRed : isF ? mBlue : (S.nylon ? mNylon : mGut);
  };
  const tops = new Map();
  for (const S of STR) {
    const m = strMat(S), live = S.i >= ANIM_LO && S.i <= ANIM_HI;
    const B = V3(S.x, S.yb, 0), T = V3(S.x, S.yt, 0);
    const g = new THREE.TubeGeometry(new THREE.LineCurve3(B, T), live ? SEG : 1, S.r, RAD, false);
    const noteIdx = { 25: 0, 24: 1, 23: 2, 22: 3, 21: 4, 20: 5, 19: 6, 18: 7 }[S.i];
    const mesh = add(G.cordes, g, m, 'cordes', noteIdx !== undefined ? { cast: false, note: noteIdx } : { cast: false });
    if (noteIdx !== undefined) add(G.cordes, geo.tube([S.x, S.yb + 10, 0], [S.x, S.yD1, 0], 6, 1, 6), mProxy, 'cordes', { cast: false, note: noteIdx });
    // del pont de dalt a la clavilla
    if (!tops.has(m)) tops.set(m, []);
    tops.get(m).push(geo.tube([S.x, S.yt, 0], [S.x + 2, S.yt + 29, -2.5], S.r, 1, 5));
    if (live) {
      const uv = S.hasDisc ? (S.yD1 - S.yb) / (S.yt - S.yb) : 1;
      const tab = new Float32Array((SEG + 1) * K);
      for (let r = 0; r <= SEG; r++) { const u = r / SEG; for (let k = 0; k < K; k++) tab[r * K + k] = u < uv ? Math.sin((k + 1) * PI * u / uv) : 0; }
      anim[S.i] = { S, mesh, base: Float32Array.from(g.attributes.position.array), uv, tab, moved: false };
    }
  }
  for (const [m, list] of tops) add(G.cordes, merge(list), m, 'cordes', { cast: false, pick: false });

  // dit de l'arpista (sense ungla)
  const fingerRig = new THREE.Group(); G.cordes.add(fingerRig);
  {
    // falange de la punta i falange del mig, unides pel nus del dit
    const capsule = (a, b, r) => {
      const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length();
      return new THREE.CapsuleGeometry(r, l, 6, 14).translate(0, l / 2, 0)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize())).translate(a[0], a[1], a[2]);
    };
    const J1 = [0.42 * 30, 1.5, -0.91 * 30], J2 = [J1[0] + 0.78 * 34, J1[1] + 6, J1[2] - 0.6 * 34];
    add(fingerRig, merge([capsule([0, 0, 0], J1, 7.2), capsule(J1, J2, 7.9), new THREE.SphereGeometry(8.1, 14, 10).translate(J1[0], J1[1], J1[2])]), mFinger, 'cordes', { pick: false });
  }
  fingerRig.visible = false;
  fingerRig.position.set(SX[25], 1100, 0);

  /* ================= COLL (forma de S, plaques, discs i clavilles) ================= */
  const lowCtl = [], topCtl = [];
  {
    const lowS = smoothArr(STR.map(S => S.yD2 - S.rd - 11), 3, 3);
    const topS = smoothArr(STR.map(S => S.yt + 92), 4, 4);
    lowCtl.push([22, 1452], [60, 1466], [96, 1484]);
    for (let i = NS - 1; i >= 0; i--) lowCtl.push([STR[i].x, Math.min(lowS[i], STR[i].yt - 24)]);
    lowCtl.push([857, 1498], [870, 1516], [884, 1546], [928, 1522], [970, 1500], [994, 1508], [1006, 1532]);
    topCtl.push([22, 1774], [55, 1787], [92, 1779]);
    for (let i = NS - 1; i >= 0; i--) topCtl.push([STR[i].x, Math.max(topS[i], STR[i].yt + 84)]);
    topCtl.push([880, 1650], [915, 1660], [952, 1645], [982, 1615], [1000, 1580], [1008, 1552]);
  }
  const LOW = splinePts(lowCtl, 170), TOP = splinePts(topCtl, 170);
  const lowAt = x => interpX(LOW, x), topAt = x => interpX(TOP, x);
  {
    const outline = LOW.concat(TOP.slice().reverse());
    add(G.coll, geo.ext(geo.shape(outline), 40, bev(4, 4, 2)).translate(0, 0, 12), mNeck, 'coll');
  }
  // plaques de llautó (a les dues cares) on hi ha el mecanisme
  {
    const xs = [], X0p = 104, X1p = 858;
    for (let k = 0; k <= 120; k++) xs.push(lerp(X0p, X1p, k / 120));
    const ptTop = smoothArr(xs.map(x => YT(x) + 14), 3, 2);
    const pts = xs.map(x => [x, lowAt(x) - 1]).concat(xs.map((x, k) => [x, ptTop[k]]).reverse());
    const sh = geo.shape(pts);
    add(G.coll, geo.ext(sh, 2.2, bev(0.6, 0.6, 1)).translate(0, 0, 5.2), mPlate, 'coll');
    add(G.coll, geo.ext(sh, 2.2, bev(0.6, 0.6, 1)).translate(0, 0, 56.2), mPlate, 'coll');
  }
  // filets daurats a dalt del coll
  for (const z of [6.5, 57.5]) {
    const pts = []; for (let k = 0; k <= 60; k++) { const x = lerp(70, 985, k / 60); pts.push([x, topAt(x) - 8, z]); }
    add(G.coll, geo.curveTube(pts, 2.2, 220, 6), mGoldN, 'coll', { cast: false });
  }
  // discs (dos per corda), pius, pont de dalt i clavilles
  {
    const discs = [], pins = [], tpins = [], heads = [];
    for (const S of STR) {
      const xc = S.x - 2.6;
      if (S.hasDisc) {
        for (const [yc, ang] of [[S.yD1, 0.32], [S.yD2, PI / 2]]) {
          discs.push(geo.cyl(S.rd, 2.6, 'z', 16).translate(xc, yc, 3.6));
          discs.push(geo.cyl(S.rd * 0.35, 1.2, 'z', 8).translate(xc, yc, 2));
          const R = S.rd * 0.62, ca = Math.cos(ang), sa = Math.sin(ang);
          for (const sg of [-1, 1]) pins.push(geo.cyl(1.05, 5.6, 'z', 6).translate(xc + sg * R * ca, yc + sg * R * sa, -0.4));
        }
      }
      pins.push(geo.cyl(1.5, 9, 'z', 8).translate(S.x - S.r - 1.5, S.yt, 0.5));
      const ty = S.yt + 31, tx = S.x + 2;
      tpins.push(geo.cyl(2.9, 80, 'z', 12).translate(tx, ty, 30));
      tpins.push(geo.cyl(4.2, 5, 'z', 12).translate(tx, ty, -2.5));
      heads.push(geo.box(tx - 3.6, tx + 3.6, ty - 3.6, ty + 3.6, 64, 78));
    }
    add(G.coll, merge(discs), mDisc, 'coll');
    add(G.coll, merge(pins), mPin, 'coll', { cast: false });
    add(G.coll, merge(tpins), mPin, 'coll');
    add(G.coll, merge(heads), mPin, 'coll');
  }

  /* ================= COLUMNA ================= */
  const CZ = 32;
  function flutedGeo(R0, R1, y0, y1, nF, depth) {
    const seg = nF * 8, g = new THREE.CylinderGeometry(R1, R0, y1 - y0, seg, 6, true);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2], r = Math.hypot(x, z) || 1, th = Math.atan2(x, z);
      const ph = (((th / TAU) * nF) % 1 + 1) % 1, t = (ph - 0.12) / 0.76;
      const f = t > 0 && t < 1 ? depth * Math.sqrt(1 - (2 * t - 1) * (2 * t - 1)) : 0;
      const k = (r - f) / r; p[i] = x * k; p[i + 2] = z * k;
    }
    g.computeVertexNormals();
    return g.translate(0, (y0 + y1) / 2, CZ);
  }
  add(G.columna, flutedGeo(40.5, 37.5, 326, 1436, 16, 2.6), mCol, 'columna');
  const lath = (pts, seg = 48) => geo.lathe(pts, seg).translate(0, 0, CZ);
  // peu de la columna (daurat)
  add(G.columna, lath([[0, YB], [64, YB], [64, 150], [58, 156], [60, 170], [52, 184], [47, 200], [50, 218], [45, 236], [43, 290], [48, 302], [48, 314], [42, 324], [41, 330], [0, 330]]), mGoldC, 'columna');
  // collar, cap de la columna i corona (daurats)
  add(G.columna, lath([[0, 1430], [44, 1430], [47, 1440], [47, 1452], [43, 1460], [41, 1470], [0, 1470]]), mGoldC, 'columna');
  add(G.columna, lath([[0, 1468], [39, 1468], [38, 1520], [40, 1560], [44, 1590], [0, 1590]]), mCol, 'columna');
  add(G.columna, lath([[0, 1588], [46, 1588], [50, 1598], [46, 1606], [52, 1622], [58, 1645], [60, 1668], [56, 1684], [50, 1692], [54, 1700], [0, 1700]]), mGoldC, 'columna');
  add(G.columna, lath([[0, 1698], [52, 1698], [55, 1706], [48, 1714], [44, 1728], [50, 1742], [60, 1762], [63, 1780], [56, 1792], [44, 1797], [46, 1806], [36, 1816], [20, 1825], [9, 1831], [0, 1834]]), mGoldC, 'columna');
  {
    const leaves = [], beads = [];
    for (let k = 0; k < 10; k++) {
      const a = TAU * k / 10, ca = Math.cos(a), sa = Math.sin(a);
      leaves.push(new THREE.SphereGeometry(1, 12, 10).scale(9, 26, 5).rotateX(-0.35).rotateY(a).translate(sa * 57, 1640, CZ + ca * 57));
      leaves.push(new THREE.SphereGeometry(1, 12, 10).scale(8, 20, 5).rotateX(-0.45).rotateY(a + PI / 10).translate(Math.sin(a + PI / 10) * 58, 1772, CZ + Math.cos(a + PI / 10) * 58));
    }
    for (let k = 0; k < 22; k++) { const a = TAU * k / 22; beads.push(new THREE.SphereGeometry(4, 10, 8).translate(Math.sin(a) * 52, 1712, CZ + Math.cos(a) * 52)); }
    add(G.columna, merge(leaves), mGoldC, 'columna');
    add(G.columna, merge(beads), mGoldC, 'columna', { cast: false });
  }
  // set varetes dels pedals, dins la columna (es veuen amb raigs X)
  {
    const rods = [];
    for (let k = 0; k < 7; k++) { const a = TAU * k / 7; rods.push(geo.cyl(2.6, 1440, 'y', 8).translate(Math.sin(a) * 19, 150 + 720, CZ + Math.cos(a) * 19)); }
    add(G.columna, merge(rods), mRod, 'pedals', { cast: false });
  }

  /* ================= BASE I PEDALS ================= */
  const baseOut = roundPoly([[-100, -170], [-100, 232], [458, 262], [458, -240]], 44, 6);
  add(G.base, extY(baseOut, 33, 88, bev(5, 5, 3)), mBaseW, 'pedals');
  {
    const top = roundPoly([[-108, -178], [-108, 240], [466, 270], [466, -248]], 48, 6);
    add(G.base, extY(top, 129, 7, bev(2, 2, 2)), mBaseW, 'pedals');
    const tr = roundPoly([[-104, -174], [-104, 236], [462, 266], [462, -244]], 46, 6);
    add(G.base, geo.curveTube(tr.map(p => [p[0], 127, p[1]]), 3, 220, 6, true), mPedal, 'pedals', { cast: false });
    const feet = [];
    for (const [x, z] of [[-55, -125], [-55, 190], [415, 215], [415, -195]]) feet.push(geo.lathe([[0, 0], [34, 0], [36, 5], [31, 12], [26, 24], [33, 30], [33, 34], [0, 34]], 28).translate(x, 0, z));
    add(G.base, merge(feet), mBaseW, 'pedals');
  }
  // 7 pedals: Re, Do, Si (peu esquerre) · Mi, Fa, Sol, La (peu dret)
  const PEDZ = [205, 160, 115, -45, -90, -135, -180];
  {
    const plates = [], slots = [], bars = [], pads = [];
    const XR = 463;
    for (const z of PEDZ) {
      plates.push(geo.ext(rr(-z - 17, -z + 17, 40, 122, 4), 2.4, bev(0.5, 0.5, 1)).rotateY(PI / 2).translate(XR, 0, 0));
      slots.push(geo.ext(rr(-z - 6.5, -z + 6.5, 48, 114, 6), 1.2).rotateY(PI / 2).translate(XR + 3.2, 0, 0));
      for (const y of [56, 81, 106]) slots.push(geo.box(XR + 3.4, XR + 4.4, y - 1.5, y + 1.5, z + 6.5, z + 10));
      bars.push(geo.ext(rr(400, 532, 75, 86, 3), 11, bev(1, 1, 1)).translate(0, 0, z - 6.5));
      pads.push(geo.ext(rr(518, 566, 73, 89, 6), 30, bev(2, 2, 2)).translate(0, 0, z - 17));
    }
    add(G.base, merge(plates), mPedal, 'pedals');
    add(G.base, merge(slots), mSlot, 'pedals', { cast: false });
    add(G.base, merge(bars), mPedal, 'pedals');
    add(G.base, merge(pads), mPedal, 'pedals');
  }

  /* ================= notes i so ================= */
  const notes = [
    { label: 'Do', f: 261.63, str: 25 },
    { label: 'Re', f: 293.66, str: 24 },
    { label: 'Mi', f: 329.63, str: 23 },
    { label: 'Fa', f: 349.23, str: 22 },
    { label: 'Sol', f: 392.0, str: 21 },
    { label: 'La', f: 440.0, str: 20 },
    { label: 'Si', f: 493.88, str: 19 },
    { label: 'Do agut', f: 523.25, str: 18 },
    { label: 'Glissando', f: 392.0, gliss: true }
  ];
  const GL = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14];   // Do4 … Sol5
  const GF = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99];
  const GD = 0.075;                                          // segons entre cordes
  const fvisOf = f => 0.45 + 0.0018 * Math.min(f, 1000);
  function harpTone(f, short) {
    const tf = Math.pow(261.63 / f, 0.45), p = 0.47, parts = [];
    for (let k = 1; k <= (short ? 7 : 12); k++) {
      if (k * f > 9000) break;
      parts.push({ k, a: Math.pow(k, -1.5) * (0.3 + 0.7 * Math.abs(Math.sin(k * PI * p))), tau: (short ? 1.7 : 2.7) * tf / (1 + 0.3 * (k - 1)) });
    }
    parts.push({ k: 1.0009, a: 0.18, tau: 2.2 * tf });
    try { synth.additive({ f, partials: parts, attack: 0.008, noise: { amount: 0.04, dur: 0.04, lp: 1600, hp: 150 }, gain: short ? 0.7 : 0.85 }); } catch (e) { /* sense àudio */ }
  }
  let timers = [];
  const noteOf = n => (typeof n === 'number' ? notes[n] : n) || notes[0];

  /* ================= estat d'animació ================= */
  const TP = 0.2;                                            // el dit estira la corda abans de deixar-la
  let plucks = [], pending = null, lastT = 0, sbMoved = false, glissT0 = null;
  const DIR = V3(0.94, 0, -0.34).normalize();
  function modeCoef(p) {
    const c = new Float32Array(K), f = new Float32Array(K), nn = 2 / (PI * PI * p * (1 - p));
    let nrm = 0;
    for (let k = 1; k <= K; k++) { c[k - 1] = nn * Math.sin(k * PI * p) / (k * k); f[k - 1] = Math.sin(k * PI * p) / k; nrm += Math.abs(f[k - 1]); }
    for (let k = 0; k < K; k++) f[k] /= nrm || 1;
    return { c, f };
  }
  function addPluck(si, t0, p, kind) {
    const A = anim[si]; if (!A) return;
    const L = A.S.yt - A.S.yb;
    plucks.push({ si, t0, p, kind, amp: clamp(L * 0.017, 3.5, 10), fv: fvisOf(GF[GL.indexOf(si)] || 392), ...modeCoef(p) });
  }
  function trigger(n) {
    for (const P of plucks) P.t0 -= lastT;                   // la nota d'abans continua
    if (n.gliss) {
      const yg = 1240;
      GL.forEach((si, j) => { const A = anim[si]; addPluck(si, j * GD, clamp((yg - A.S.yb) / (A.uv * (A.S.yt - A.S.yb)), 0.2, 0.8), 'g'); });
      glissT0 = 0;
    } else {
      addPluck(n.str, TP, 0.5, 'n');
      glissT0 = null;
    }
    lastT = 0;
  }
  function stringPoint(si, u) { const A = anim[si], S = A.S; return [S.x, lerp(S.yb, S.yt, u * A.uv), 0]; }
  const tmpV = V3(0, 0, 0), tmpD = V3(0, 0, 0);
  const outN = V3(-NX, -NY, 0);

  function restoreAll() {
    for (const k in anim) { const A = anim[k]; if (A.moved) { const pa = A.mesh.geometry.attributes.position; pa.array.set(A.base); pa.needsUpdate = true; A.moved = false; } }
    if (sbMoved) {
      sbGeo.attributes.position.array.set(sbBase); sbGeo.attributes.position.needsUpdate = true;
      sbGeo.attributes.normal.array.set(sbBaseN); sbGeo.attributes.normal.needsUpdate = true;
      sbGeo.attributes.color.array.fill(0); sbGeo.attributes.color.needsUpdate = true;
      for (const F of followers) { F.g.attributes.position.array.set(F.base); F.g.attributes.position.needsUpdate = true; }
      sbMoved = false;
    }
    fingerRig.visible = false;
  }

  function update(dt, s) {
    const env = s.env || 0, t = s.t || 0;
    if (pending) { trigger(pending); pending = null; }
    if (t < lastT - 1e-6) for (const P of plucks) P.t0 -= lastT;
    lastT = t;
    if (env <= 0.003) { plucks = []; restoreAll(); return; }
    if (plucks.length) plucks = plucks.filter(P => t - P.t0 < 12).slice(-40);
    const gEnv = clamp(env * 3);

    /* ---- cordes ---- */
    const strF = new Map();
    let Fsum = 0;
    for (const k in anim) anim[k].hit = null;
    for (const P of plucks) {
      const tau = t - P.t0, A = anim[P.si];
      if (tau > 14) continue;
      if (!A.hit) A.hit = [];
      A.hit.push(P);
      // força sobre la tapa
      let F = 0;
      if (tau < 0) F = P.kind === 'n' ? -0.35 * smooth((tau + TP) / TP) : 0;
      else { const w = TAU * P.fv * tau; for (let k = 0; k < K; k++) F += P.f[k] * Math.cos((k + 1) * w) * Math.exp(-tau * (0.12 + 0.1 * k)); F *= Math.exp(-tau / 3.2); }
      F *= gEnv * Math.sqrt(P.amp / 10);
      strF.set(P, F); Fsum += F;
    }
    for (const k in anim) {
      const A = anim[k], pa = A.mesh.geometry.attributes.position, arr = pa.array, b = A.base;
      if (!A.hit) { if (A.moved) { arr.set(b); pa.needsUpdate = true; A.moved = false; } continue; }
      const cs = new Float32Array(K); let pull = 0, pp = 0.5;
      for (const P of A.hit) {
        const tau = t - P.t0;
        if (tau < 0) { if (P.kind === 'n') { pull += P.amp * smooth((tau + TP) / TP) * gEnv; pp = P.p; } continue; }
        const w = TAU * P.fv * tau, a = P.amp * Math.exp(-tau / 3.0) * gEnv;
        for (let m = 0; m < K; m++) cs[m] += a * P.c[m] * Math.cos((m + 1) * w) * Math.exp(-tau * (0.1 + 0.16 * m));
      }
      for (let r = 0; r <= SEG; r++) {
        const u = r / SEG; let d = 0;
        for (let m = 0; m < K; m++) d += cs[m] * A.tab[r * K + m];
        if (pull > 0 && u < A.uv) { const x = u / A.uv; d += pull * (x < pp ? x / pp : (1 - x) / (1 - pp)); }
        const dx = d * DIR.x, dz = d * DIR.z;
        for (let q = 0; q <= RAD; q++) { const id = (r * (RAD + 1) + q) * 3; arr[id] = b[id] + dx; arr[id + 1] = b[id + 1]; arr[id + 2] = b[id + 2] + dz; }
      }
      pa.needsUpdate = true; A.moved = true;
    }

    /* ---- dit ---- */
    const last = plucks[plucks.length - 1];
    if (last && last.kind === 'n') {
      const tau = t - last.t0, A = anim[last.si], P0 = stringPoint(last.si, last.p);
      if (tau < 0.55) {
        const k = smooth((tau + TP) / TP), back = tau > 0 ? smooth(tau / 0.55) : 0;
        const dsp = last.amp * k * gEnv + 26 * back;
        fingerRig.visible = true;
        fingerRig.position.set(P0[0] - A.S.r - 7.4 + DIR.x * dsp, P0[1] + 18 * back, P0[2] + DIR.z * dsp - 40 * back);
      } else fingerRig.visible = false;
    } else if (last && last.kind === 'g' && glissT0 !== null) {
      const ph = t / GD;                                   // per quina corda passa el dit
      if (ph < GL.length + 3) {
        const j = clamp(Math.floor(ph), 0, GL.length - 1), fr = ph - Math.floor(ph);
        const a = anim[GL[j]].S, bS = anim[GL[Math.min(GL.length - 1, j + 1)]].S;
        const x = ph >= GL.length ? a.x + 15 * (ph - GL.length + 1) : lerp(a.x, bS.x, fr) - 8;
        fingerRig.visible = true;
        fingerRig.position.set(x, 1240, -3 - Math.max(0, ph - GL.length) * 12);
      } else fingerRig.visible = false;
    } else fingerRig.visible = false;

    /* ---- tapa harmònica (mapa de vibració) ---- */
    let any = false;
    for (let r = 0; r <= NR; r++) rowD[r] = 0;
    for (const [P, F] of strF) {
      if (Math.abs(F) < 1e-4) continue; any = true;
      const sp = anim[P.si].S.s;
      for (let r = 0; r <= NR; r++) { const q = (rowS[r] - sp) / 200; rowD[r] += F * (0.5 * rowSin[r] + 0.9 * Math.exp(-q * q)); }
    }
    if (any) {
      const AMP = 3.4, pa = sbGeo.attributes.position.array, ca = sbGeo.attributes.color.array;
      for (let r = 0; r <= NR; r++) {
        rowD[r] = AMP * Math.max(-1.3, Math.min(1.3, rowD[r]));
        for (let c = 0; c <= NW; c++) {
          const i = r * (NW + 1) + c, d = rowD[r] * sbCV[c];
          pa[i * 3] = sbBase[i * 3] + NX * d; pa[i * 3 + 1] = sbBase[i * 3 + 1] + NY * d;
          if (s.heat) heat.color(clamp(d / 2.4, -1, 1), ca, i);
        }
      }
      sbGeo.attributes.position.needsUpdate = true;
      if (s.heat) sbGeo.attributes.color.needsUpdate = true;
      sbGeo.computeVertexNormals();
      for (const Fo of followers) {
        const p = Fo.g.attributes.position.array;
        for (let i = 0; i < Fo.n; i++) { const d = rowAt(Fo.sv[i]); p[i * 3] = Fo.base[i * 3] + NX * d; p[i * 3 + 1] = Fo.base[i * 3 + 1] + NY * d; }
        Fo.g.attributes.position.needsUpdate = true;
      }
      sbMoved = true;
    }

    /* ---- aire pels forats de l'esquena ---- */
    if (env > 0.03) {
      G.caixa.updateWorldMatrix(true, false);
      tmpD.copy(outN).transformDirection(G.caixa.matrixWorld);
      const rate = env * (140 + 420 * clamp(-Fsum * 1.5 + 0.2));
      for (const c of holeC) { tmpV.copy(c); G.caixa.localToWorld(tmpV); fx.air(tmpV, tmpD, rate, 0.45, 200); }
    }
  }

  function play(note, opt) {
    const n = noteOf(note);
    for (const id of timers) { try { clearTimeout(id); } catch (e) { /* res */ } }
    timers = [];
    pending = n;
    if (n.gliss) {
      harpTone(GF[0], true);
      for (let j = 1; j < GF.length; j++) {
        const f = GF[j];
        try { timers.push(setTimeout(() => harpTone(f, true), Math.round(j * GD * 1000))); } catch (e) { harpTone(f, true); }
      }
      return { attack: 0.005, hold: 1.0, release: 1.6 };
    }
    harpTone(n.f, false);
    return { attack: 0.005, hold: 0.35, release: 1.7 };
  }

  /* ================= dades ================= */
  const C4 = STR[25], A4i = STR[20];
  const sbLbl = sbPt(430, -0.62 * hwS(430), 1.5);
  const boxLbl = shellPt(820, PI - 0.55, 0);
  const s25 = C4.s;
  return {
    id: 'arpa',
    family: 'Corda pinçada',
    name: 'Arpa',
    intro: "L'arpa és un instrument de corda pinçada: l'arpista pinça les cordes amb la punta dels dits. Les cordes fan vibrar la tapa harmònica, i la caixa de darrere fa que el so arribi més lluny.",
    floorY: 0,
    camera: {
      explore: { pos: [-1350, 1350, -3700], target: [440, 900, 0] },
      exploded: { pos: [-1800, 1700, -4300], target: [380, 1000, 60] }
    },
    parts: {
      columna: { name: 'Columna', text: "És el pal llarg i dret de davant. Aguanta el coll, que les cordes tibades estiren cap a la caixa.", dato: "És buida per dins: hi passen les varetes que uneixen els pedals amb el mecanisme del coll." },
      coll: { name: 'Coll', text: "És la peça corbada de dalt, on s'aguanten les cordes. Té les clavilles per afinar i els discs de llautó que mouen els pedals.", dato: "Té forma de S perquè cada corda té una llargada diferent." },
      cordes: { name: 'Cordes', text: "Una arpa de concert en té 47. Les de Do són vermelles i les de Fa, negres o blaves, per orientar-se.", dato: "Les més agudes són de niló, les del mig de tripa i les més greus porten un fil de metall enrotllat." },
      tapa: { name: 'Tapa harmònica', text: "És una làmina prima de fusta d'avet. Les cordes s'hi lliguen al llarg d'una tira central i la fan vibrar.", dato: "Cada corda passa per un forat de la tira central i, per dins, s'aguanta amb un nus." },
      caixa: { name: 'Caixa', text: "És la caixa buida que hi ha darrere la tapa, plena d'aire. Té uns forats ovalats a l'esquena per on també surt el so.", dato: "Per aquests forats també s'hi fica la mà per canviar les cordes. L'arpista recolza la caixa a l'espatlla dreta." },
      pedals: { name: 'Base i pedals', text: "Hi ha 7 pedals, un per a cada nota de l'escala. Cada pedal fa que totes les cordes d'aquella nota sonin més agudes o més greus.", dato: "Els pedals de Re, Do i Si es toquen amb el peu esquerre, i els de Mi, Fa, Sol i La, amb el dret." }
    },
    labels: [
      { part: 'columna', group: 'columna', at: [0, 960, CZ - 40], internal: false },
      { part: 'coll', group: 'coll', at: [330, topAt(330) - 30, 7], internal: false },
      { part: 'cordes', group: 'cordes', at: [A4i.x, lerp(A4i.yb, A4i.yt, 0.55), 0], internal: false },
      { part: 'tapa', group: 'tapa', at: sbLbl, internal: false },
      { part: 'caixa', group: 'caixa', at: boxLbl, internal: false },
      { part: 'pedals', group: 'base', at: [548, 89, PEDZ[4]], internal: false }
    ],
    explode: {
      cordes: [0, 120, -420, 0],
      coll: [0, 330, 40, 0.07],
      columna: [-320, 160, 0, 0.14],
      tapa: [-250, 190, 0, 0.2],
      caixa: [240, 110, 0, 0.27],
      base: [0, 0, 340, 0.33]
    },
    notes,
    options: null,
    chain: ['Dit', 'Corda', 'Tapa harmònica', 'Caixa', 'Aire'],
    tour: [
      { part: 'cordes', chain: 0, note: 0, title: 'El dit pinça la corda', text: "L'arpista estira la corda amb la punta del dit i la deixa anar. Toca sense ungles i no fa servir el dit petit. La corda vibra d'un costat a l'altre.", cam: { pos: [170, 1260, -470], target: [C4.x, lerp(C4.yb, C4.yD1, 0.5), 0] }, slow: 0.35, xray: false },
      { part: 'cordes', chain: 1, note: 8, title: 'Cordes llargues i curtes', text: "Les cordes llargues i gruixudes, a prop de la columna, fan les notes greus. Les curtes, a dalt, fan les agudes. Si passes el dit per moltes cordes seguides, fas un glissando.", cam: { pos: [60, 1500, -1500], target: [560, 1150, 0] }, slow: 0.6, xray: false },
      { part: 'coll', chain: 1, note: 0, title: 'Els discs i els pedals', text: "Quan l'arpista mou un pedal, una vareta que passa per dins de la columna fa girar uns discs del coll. Els discs pessiguen la corda: la part que vibra és més curta i la nota puja.", cam: { pos: [300, 1520, -360], target: [C4.x, C4.yt - 40, 0] }, slow: 0.4, xray: false },
      { part: 'tapa', chain: 2, note: 0, title: 'La tapa harmònica', text: "Les cordes estan lligades a la tira central de la tapa. Quan vibren, estiren la tapa i la fan vibrar sencera. Com que és gran, mou molt més aire que una corda sola.", cam: { pos: [-1050, 1500, -1500], target: [sbPt(s25, 0, 0)[0], sbPt(s25, 0, 0)[1] - 80, 0] }, slow: 0.5, xray: false },
      { part: 'caixa', chain: 4, note: 4, title: "La caixa i l'aire", text: "La tapa també empeny l'aire de dins de la caixa. Aquest aire entra i surt pels forats ovalats de l'esquena. Així el so surt per davant i per darrere de l'arpa.", cam: { pos: [2150, 1150, -850], target: [620, 800, 0] }, slow: 0.6, xray: false }
    ],
    soundSource: { group: 'tapa', at: sbPt(700, 0, 20) },
    play,
    update
  };
}
