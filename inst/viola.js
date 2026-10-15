// Viola — mòdul d'instrument (corda fregada)
// Unitats: mm. Y amunt. La viola està estirada d'esquena (tapa cap a +Y), llarga en X:
// el botó final a x≈-213, la voluta a x≈+462 (≈ 675 mm). Costat greu (Do) a -Z, agut (La) a +Z.
// Cos de 410 mm, aros de 38 mm, corda vibrant de 370 mm, pont de 37 mm.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const ds = m => { m.side = THREE.DoubleSide; return m; };

  const G = groups(['arc', 'cordes', 'pont', 'tapa', 'interior', 'cos', 'mastil']);

  /* ================= silueta del cos (paramètrica) ================= */
  const L = 410, X0 = -205;                       // llargada del cos; x = X0 + u
  const crv = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
  function spl(P, n) {
    const o = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
      for (let s = 0; s < n; s++) { const t = s / n; o.push([crv(a[0], b[0], c[0], d[0], t), crv(a[1], b[1], c[1], d[1], t)]); }
    }
    return o;
  }
  // mateix dibuix que el violí, escalat: panxa inferior 240, cintura C 135, panxa superior 195 mm
  const SLX = L / 356, SWD = 1.154;
  const sc = (P, extra) => P.map(([u, w]) => [u * SLX, w * SWD + (extra ? extra(u) : 0)]);
  const segLow = sc([[0, 0], [1.2, 20], [6, 44], [17, 68], [35, 88], [60, 100], [92, 104], [118, 100], [136, 91], [146, 83]]);
  const segC = sc([[146, 83], [149, 72], [156, 63], [168, 57.5], [185, 56], [202, 57], [214, 60.5], [222, 66], [227, 73], [229, 79]],
    u => 2.9 * Math.sin(PI * clamp((u - 146) / 83)));          // cintura una mica més ampla (més espai per a l'arc)
  const segUp = sc([[229, 79], [236, 80.5], [250, 82.8], [268, 84], [288, 82.5], [308, 76], [325, 65], [339, 50], [349, 32], [354, 15], [356, 0]]);
  const HW = [...spl(segLow, 8), ...spl(segC, 8), ...spl(segUp, 8), [L, 0]];
  for (let i = 1; i < HW.length; i++) { if (HW[i][0] <= HW[i - 1][0]) HW[i][0] = HW[i - 1][0] + 0.01; HW[i][1] = Math.max(0, HW[i][1]); }
  HW[0] = [0, 0]; HW[HW.length - 1] = [L, 0];
  function W(u) {
    if (u <= 0 || u >= L) return 0;
    let lo = 0, hi = HW.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (HW[m][0] <= u) lo = m; else hi = m; }
    const a = HW[lo], b = HW[hi];
    return a[1] + (b[1] - a[1]) * (u - a[0]) / ((b[0] - a[0]) || 1);
  }
  const OUT = [];                                  // contorn [x, z]
  HW.forEach(p => OUT.push([X0 + p[0], p[1]]));
  for (let i = HW.length - 2; i >= 1; i--) OUT.push([X0 + HW[i][0], -HW[i][1]]);

  function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
  function offsetPoly(p, d) {             // d>0 cap enfora
    const s = polyArea(p) > 0 ? 1 : -1, n = p.length;
    return p.map((q, i) => { const a = p[(i - 1 + n) % n], b = p[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [q[0] + s * dy / l * d, q[1] - s * dx / l * d]; });
  }
  function inPoly(P, x, z) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; }
    return c;
  }
  function nearestOnPoly(P, x, z) {
    let best = 1e9, bx = x, bz = z;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2), px = a[0] + ex * t, pz = a[1] + ez * t, d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
    return [bx, bz, Math.sqrt(best)];
  }
  const ringShape = (o, i) => { const s = geo.shape(o); s.holes.push(geo.path(i)); return s; };
  // forma al pla (x, -z) extruïda cap a +Y
  const extY = (shape, y0, d, bev) => geo.ext(shape, d, bev).rotateX(-PI / 2).translate(0, y0, 0);

  /* ================= arcs de la tapa i el fons ================= */
  const RIB = 38;                                  // alçada dels aros
  const TOPE = RIB + 3.5, AT = 16.5, AB = 16;      // tapa a la vora; alçada de l'arc (≈16 mm)
  const longF = u => Math.pow(Math.max(0, Math.sin(PI * clamp(u / L))), 0.55);
  const crossH = a => Math.pow((1 + Math.cos(PI * clamp(Math.abs(a)))) / 2, 0.75);
  function archF(x, z) { const u = x - X0, w = W(u); if (w < 0.01) return 0; return longF(u) * crossH(z / w); }
  const topY = (x, z) => TOPE + AT * archF(x, z);
  const backY = (x, z) => -3.5 - AB * archF(x, z);

  /* ================= posicions clau ================= */
  const XB = -20;                              // pont (225 mm des de la vora de dalt)
  const YT = topY(XB, 0);
  const bridgeTopY = z => YT + 37 - z * z / 92 - 0.06 * z;   // corba de dalt del pont (37 mm)
  const XP = XB - 8, ZP = 17;                  // ànima: darrere el peu agut
  const ZBAR = -19;                            // barra harmònica sota el peu greu
  const TH = Math.atan(0.115), CT = Math.cos(TH), STH = Math.sin(TH), NX0 = 350, NY0 = 45.8;  // cellet (nut)
  const n2w = (lx, ly, lz) => [NX0 + lx * CT + ly * STH, NY0 - lx * STH + ly * CT, lz];
  const fbTopY = (x, z) => NY0 + (NX0 - x) * Math.tan(TH) - z * z / 92;

  /* ================= forats en f ================= */
  function fHole(sign) {
    const Le = [-60, 55], Ue = [20, 26], rL = 5.0, rU = 4.1;
    const dx = Ue[0] - Le[0], dz = Ue[1] - Le[1], len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len, px = -tz, pz = tx;
    const cAt = t => { const o = 5.0 * Math.sin(TAU * t); return [Le[0] + dx * t + px * o, Le[1] + dz * t + pz * o]; };
    const hw = t => 0.8 + 1.7 * Math.pow(Math.sin(PI * t), 0.8) + 1.1 * Math.exp(-Math.pow((t - 0.5) / 0.022, 2));
    const outC = p => Math.hypot(p[0] - Le[0], p[1] - Le[1]) > rL * 0.98 && Math.hypot(p[0] - Ue[0], p[1] - Ue[1]) > rU * 0.98;
    const left = [], right = [], N = 36;
    for (let k = 0; k <= N; k++) {
      const t = k / N, c = cAt(t), c2 = cAt(Math.min(1, t + 0.002)), c1 = cAt(Math.max(0, t - 0.002));
      let ex = c2[0] - c1[0], ez = c2[1] - c1[1]; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l;
      const nx = -ez, nz = ex, h = hw(t);
      const pl = [c[0] + nx * h, c[1] + nz * h], pr = [c[0] - nx * h, c[1] - nz * h];
      if (outC(pl)) left.push(pl);
      if (outC(pr)) right.push(pr);
    }
    const arc = (C, r, pA, pB, far, n) => {
      const a1 = Math.atan2(pA[1] - C[1], pA[0] - C[0]), a2 = Math.atan2(pB[1] - C[1], pB[0] - C[0]);
      const dc = (((a2 - a1) % TAU) + TAU) % TAU, dw = dc - TAU, fa = Math.atan2(far[1], far[0]);
      const sweep = Math.cos(a1 + dc / 2 - fa) >= Math.cos(a1 + dw / 2 - fa) ? dc : dw;
      const o = []; for (let k = 1; k < n; k++) { const a = a1 + sweep * k / n; o.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); }
      return o;
    };
    const poly = [...left, ...arc(Ue, rU, left[left.length - 1], right[right.length - 1], [tx, tz], 13),
      ...right.slice().reverse(), ...arc(Le, rL, right[0], left[0], [-tx, -tz], 13)];
    const P = poly.map(p => [p[0], p[1] * sign]);
    const c = cAt(0.5);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    return { poly: P, center: [c[0], c[1] * sign], bb: [x0 - 3, x1 + 3, z0 - 3, z1 + 3] };
  }
  const FH = [fHole(1), fHole(-1)];
  const inBB = (h, x, z) => x > h.bb[0] && x < h.bb[1] && z > h.bb[2] && z < h.bb[3];

  /* ================= malla de placa (tapa deformable / fons) ================= */
  function plateGrid(NXg, NZg, yFn, holes) {
    const nv = (NXg + 1) * (NZg + 1), X = new Float32Array(nv), Z = new Float32Array(nv), ok = new Uint8Array(nv);
    const S = NZg + 1;
    for (let i = 0; i <= NXg; i++) {
      const t = i / NXg, u = L * (0.5 * t + 0.25 * (1 - Math.cos(PI * t))), x = X0 + u, w = W(u);
      for (let j = 0; j <= NZg; j++) {
        const id = i * S + j, z = (-1 + 2 * j / NZg) * w;
        X[id] = x; Z[id] = z; ok[id] = 1;
        if (holes) for (const h of holes) if (inBB(h, x, z) && inPoly(h.poly, x, z)) ok[id] = 0;
      }
    }
    if (holes) {   // enganxa a la vora del forat els vèrtexs que hi toquen (vora menys dentada)
      const mv = [];
      for (let i = 1; i < NXg; i++) for (let j = 1; j < NZg; j++) {
        const id = i * S + j; if (!ok[id]) continue;
        if (ok[id - S] && ok[id + S] && ok[id - 1] && ok[id + 1]) continue;
        for (const h of holes) {
          if (!inBB(h, X[id], Z[id])) continue;
          const q = nearestOnPoly(h.poly, X[id], Z[id]);
          if (q[2] < 1.9) mv.push([id, q[0], q[1]]);
          break;
        }
      }
      for (const m of mv) { X[m[0]] = m[1]; Z[m[0]] = m[2]; }
    }
    const map = new Int32Array(nv).fill(-1), pos = [], uv = [];
    for (let id = 0; id < nv; id++) {
      if (!ok[id]) continue;
      map[id] = pos.length / 3;
      pos.push(X[id], yFn(X[id], Z[id]), Z[id]);
      uv.push((X[id] - X0) / L, (Z[id] + 125) / 250);
    }
    const idx = [];
    for (let i = 0; i < NXg; i++) for (let j = 0; j < NZg; j++) {
      const a = map[i * S + j], b = map[(i + 1) * S + j], c = map[(i + 1) * S + j + 1], d = map[i * S + j + 1];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, d, b, b, d, c);
      else { const q = [a, b, c, d].filter(v => v >= 0); if (q.length === 3) idx.push(q[0], q[2], q[1]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ================= ajudes: loft i tub amb gruix variable ================= */
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
  function taperTube(pts, rFn, seg, rad) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
    const a = g.attributes.position.array, P = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, P); const r = rFn(P);
      for (let j = 0; j <= rad; j++) { const id = (i * (rad + 1) + j) * 3; a[id] = P.x + (a[id] - P.x) * r; a[id + 1] = P.y + (a[id + 1] - P.y) * r; a[id + 2] = P.z + (a[id + 2] - P.z) * r; }
    }
    g.attributes.position.needsUpdate = true;
    return g;
  }
  const tubeAB = (a, b, r, seg = 1, rad = 7) => new THREE.TubeGeometry(new THREE.LineCurve3(V3(a[0], a[1], a[2]), V3(b[0], b[1], b[2])), seg, r, rad, false);

  /* ================= materials (vernís més fosc que el del violí) ================= */
  const VARN = 0x7E3C1E;                                   // vernís marró vermellós fosc
  const mTop = ds(M.wood('tapa', tex.spruce(1, 1), { color: 0xA4521F, xray: true }));
  const mTopEdge = M.wood('tapa', tex.spruce(1 / 250, 1 / 250), { color: 0x92471C, xray: true });
  const mPurf = mat('tapa', { color: 0x1a120c, roughness: 0.5 }, { phys: false, xray: true });
  const mSaddle = M.ebony('tapa');
  const mRim = ds(mat('forats', { color: 0x150c07, roughness: 0.85 }, { phys: false, xray: true }));
  const mBack = ds(M.wood('cos', tex.maple(1, 1), { color: VARN, xray: true }));
  const mBackEdge = M.wood('cos', tex.maple(1 / 250, 1 / 250), { color: VARN, xray: true });
  const mRib = M.wood('cos', tex.maple(1 / 160, 1 / 40), { color: VARN, xray: true });
  const mBlock = M.rawWood('cos', tex.spruce(1 / 60, 1 / 60), { color: 0xE9CF9F, xray: true });
  const mPurfB = mat('cos', { color: 0x1a120c, roughness: 0.5 }, { phys: false, xray: true });
  const mChin = M.ebony('cos'), mChinM = M.nickel('cos'), mButton = M.ebony('cos');
  const mPost = M.rawWood('anima', tex.spruce(1 / 30, 1 / 30), { color: 0xEFD8AA });
  const mBar = M.rawWood('barra', tex.spruce(1 / 200, 1 / 40), { color: 0xE8CC98 });
  const mBridge = M.rawWood('pont', tex.maple(1 / 30, 1 / 30), { color: 0xF3DDB2 });
  const mTail = ds(M.ebony('cordes')), mFine = M.nickel('cordes'), mGut = M.plastic('cordes', 0x262626);
  const mWound = M.string('cordes', true), mFinger = M.plastic('cordes', 0xE5AC8A);
  const mNeck = ds(M.wood('mastil', tex.maple(3, 1), { color: VARN }));
  const mHeel = M.wood('mastil', tex.maple(1 / 80, 1 / 80), { color: VARN });
  const mFb = ds(M.ebony('mastil')), mNut = M.ebony('mastil');
  const mScroll = ds(M.wood('voluta', tex.maple(5, 1), { color: VARN }));
  const mPegbox = M.wood('voluta', tex.maple(1 / 70, 1 / 70), { color: VARN });
  const mPeg = M.ebony('voluta'), mPegBead = M.bone('voluta');
  const mStick = M.wood('arc', tex.mahogany(10, 1), { color: 0x7E361C });
  const mFrog = M.ebony('arc'), mSilver = M.silver('arc'), mTipPlate = M.bone('arc');
  const mPearl = mat('arc', { color: 0xF2F5F7, roughness: 0.15, metalness: 0.1, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.3 });
  const mHair = mat('arc', { color: 0xF4F0E4, roughness: 0.85 }, { phys: false });
  const mLeather = mat('arc', { color: 0x3b2617, roughness: 0.9 }, { phys: false });
  const mProxy = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

  /* ================= TAPA ================= */
  const topGeo = plateGrid(150, 54, topY, FH);
  const nTop = topGeo.attributes.position.count;
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nTop * 3), 3));
  const topMesh = add(G.tapa, topGeo, mTop, 'tapa');
  heat.overlay(topMesh);
  // forma de vibració: es mou més pel costat greu (barra) i gairebé gens a sobre l'ànima
  function shpFn(x, z) {
    const u = x - X0, w = W(u); if (w < 0.5) return 0;
    const v = clamp(z / w, -1, 1);
    const bell = Math.exp(-Math.pow((u - 193) / 129, 2));
    const side = 0.78 - 0.32 * v;
    const post = 1 - 0.75 * Math.exp(-((x - XP) * (x - XP) + (z - ZP) * (z - ZP)) / (25 * 25));
    return (1 - v * v) * bell * side * post * longF(u);
  }
  const topBaseY = new Float32Array(nTop), topShp = new Float32Array(nTop);
  {
    const p = topGeo.attributes.position.array;
    for (let i = 0; i < nTop; i++) { topBaseY[i] = p[i * 3 + 1]; topShp[i] = shpFn(p[i * 3], p[i * 3 + 2]); }
  }
  const topBaseN = Float32Array.from(topGeo.attributes.normal.array);
  // vora de la tapa i filet (purfling)
  add(G.tapa, extY(ringShape(OUT, offsetPoly(OUT, -5)), TOPE - 3.3, 3.0, { bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 2 }), mTopEdge, 'tapa');
  {
    const pts = offsetPoly(OUT, -4.5).filter((p, i) => i % 2 === 0).map(p => V3(p[0], topY(p[0], p[1]) + 0.12, p[1]));
    add(G.tapa, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 600, 0.65, 5, true), mPurf, 'tapa', { cast: false });
  }
  // cantell fosc dels forats en f (segueix l'arc de la tapa i es mou amb ella)
  const rims = FH.map(h => {
    const sh = geo.shape(offsetPoly(h.poly, 1.0)); sh.holes.push(geo.path(h.poly));
    const g = geo.ext(sh, 3.4);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 1], e = p[i + 2]; p[i + 1] = topY(x, z) + 0.25 - (3.4 - e); p[i + 2] = z; }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    const n = p.length / 3, base = Float32Array.from(p), shp = new Float32Array(n);
    for (let i = 0; i < n; i++) shp[i] = shpFn(p[i * 3], p[i * 3 + 2]);
    const mesh = add(G.tapa, g, mRim, 'forats', { cast: false });
    return { g, base, shp, n, mesh };
  });
  // cadireta (saddle) de banús a la vora de baix
  add(G.tapa, geo.ext(geo.rrect(-205.6, -199.4, -12, 12, 1.2), 5.6, { bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 }).rotateX(-PI / 2).translate(0, TOPE - 0.3, 0), mSaddle, 'tapa');

  /* ================= FONS I COSTATS ================= */
  add(G.cos, plateGrid(90, 36, backY, null), mBack, 'cos');
  add(G.cos, extY(ringShape(OUT, offsetPoly(OUT, -5)), -3.2, 3.0, { bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 2 }), mBackEdge, 'cos');
  {
    const pts = offsetPoly(OUT, -4.5).filter((p, i) => i % 2 === 0).map(p => V3(p[0], backY(p[0], p[1]) - 0.12, p[1]));
    add(G.cos, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 600, 0.65, 5, true), mPurfB, 'cos', { cast: false });
  }
  add(G.cos, extY(ringShape(offsetPoly(OUT, -2.6), offsetPoly(OUT, -3.8)), 0, RIB), mRib, 'cos');      // aros (38 mm)
  add(G.cos, geo.box(188, 201, 0.3, RIB, -18, 18), mBlock, 'cos');                                     // tacs interiors
  add(G.cos, geo.box(-201, -189, 0.3, RIB, -18, 18), mBlock, 'cos');
  { // taló del fons (sota el mànec)
    const pts = []; for (let k = 0; k <= 16; k++) { const a = -PI / 2 + PI * k / 16; pts.push([203 + 12 * Math.cos(a), 12 * Math.sin(a)]); }
    add(G.cos, extY(geo.shape(pts), -3.3, 3.1), mBackEdge, 'cos');
  }
  // botó final
  add(G.cos, geo.lathe([[0, 0], [3.4, 0], [3.4, 2], [2.6, 3.6], [2.4, 4.7], [5.0, 5.8], [6.0, 8], [5.6, 10], [3.2, 11.2], [0, 11.6]], 32).rotateZ(PI / 2).translate(-201.5, RIB / 2, 0), mButton, 'cos');
  // mentonera (costat greu) amb les seves barres de subjecció
  {
    const pts = []; const cx = -183, cz = -57;
    for (let k = 0; k < 40; k++) { const a = TAU * k / 40; const x = cx + 25 * Math.cos(a), z = cz + 33 * Math.sin(a) * (1 - 0.1 * Math.cos(a)); pts.push([x, -z]); }
    add(G.cos, extY(geo.shape(pts), TOPE + 11.5, 5, { bevelThickness: 3, bevelSize: 2.5, bevelSegments: 4 }), mChin, 'cos');
    const uEdge = wq => { for (let u = 0; u < 180; u += 0.5) if (W(u) >= wq) return u; return 180; };
    const yTop = TOPE + 11.5, yBot = -6;
    for (const zq of [-36, -72]) {
      const x = X0 + uEdge(-zq) - 2.5;
      add(G.cos, geo.cyl(2.0, yTop - yBot, 'y', 16).translate(x, (yTop + yBot) / 2, zq), mChinM, 'cos');
      add(G.cos, geo.box(x - 2.5, x + 6, -6.5, -4.5, zq - 5, zq + 5), mChinM, 'cos');
    }
  }

  /* ================= INTERIOR: barra harmònica i ànima ================= */
  {
    const xb0 = X0 + 52, xb1 = X0 + 350, pts = [];
    for (let k = 0; k <= 40; k++) { const x = lerp(xb0, xb1, k / 40); pts.push([x, topY(x, ZBAR) - 3.0]); }
    for (let k = 40; k >= 0; k--) { const s = k / 40, x = lerp(xb0, xb1, s), h = 1.5 + 11 * Math.pow(Math.sin(PI * s), 0.7); pts.push([x, topY(x, ZBAR) - 3.0 - h]); }
    add(G.interior, geo.ext(geo.shape(pts), 5.6, { bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 }).translate(0, 0, ZBAR - 2.8), mBar, 'barra');
    const y0 = backY(XP, ZP) + 3.5, y1 = topY(XP, ZP) - 3.0;
    add(G.interior, geo.cyl(3.2, y1 - y0, 'y', 20).translate(XP, (y0 + y1) / 2, ZP), mPost, 'anima');
  }

  /* ================= PONT (bascula sobre el peu agut) ================= */
  const BZ = 1.1, BY = 37 / 33;                  // pont de violí ampliat
  const bf = z => topY(XB, z) - 0.3;
  const PV = [XB, bf(17.5), 17.5];
  const bridgePivot = new THREE.Group(); bridgePivot.position.set(PV[0], PV[1], PV[2]); G.pont.add(bridgePivot);
  {
    const Bp = [[-22.5, bf(-22.5)], [-12.6, bf(-12.6)]];
    [[-10.6, 3], [-9.2, 6], [-6, 8.2], [-2.5, 9], [0, 9.1], [2.5, 9], [6, 8.2], [9.2, 6], [10.6, 3]].forEach(p => Bp.push([p[0] * BZ, YT + p[1] * BY]));
    Bp.push([12.6, bf(12.6)], [22.5, bf(22.5)]);
    const side = [[20.6, 1.6], [19.8, 4], [17.8, 8], [16, 11.5], [15.6, 14.5], [13.6, 17.2], [12.2, 18.6], [12.6, 19.8], [14.4, 20.8], [16.2, 22.4], [16.9, 25.2]].map(p => [p[0] * BZ, p[1] * BY]);
    side.forEach(p => Bp.push([p[0], YT + p[1]]));
    const zt = 16.9 * BZ;
    for (let k = 0; k <= 16; k++) { const z = zt - 2 * zt * k / 16; Bp.push([z, bridgeTopY(z)]); }
    side.slice().reverse().forEach(p => Bp.push([-p[0], YT + p[1]]));
    const sh = geo.shape(Bp.map(p => [-p[0], p[1]]));
    const heart = []; for (let k = 0; k <= 14; k++) { const a = -PI / 2 + 0.7 + (TAU - 1.4) * k / 14; heart.push([2.5 * Math.cos(a), YT + 16.4 + 2.5 * Math.sin(a)]); }
    heart.push([0, YT + 12.3]);
    sh.holes.push(geo.path(heart.map(p => [-p[0], p[1]])));
    for (const sg of [-1, 1]) {
      const kid = []; for (let k = 0; k < 18; k++) { const a = TAU * k / 18, ex = 3.3 * Math.cos(a), ey = 1.7 * Math.sin(a), r = -0.35 * sg; kid.push([sg * 7.9 + ex * Math.cos(r) - ey * Math.sin(r), YT + 23.75 + ex * Math.sin(r) + ey * Math.cos(r)]); }
      sh.holes.push(geo.path(kid.map(p => [-p[0], p[1]])));
    }
    const g = geo.ext(sh, 2.4, { bevelThickness: 0.5, bevelSize: 0.35, bevelSegments: 2 }).rotateY(PI / 2).translate(XB - 1.2, 0, 0).translate(-PV[0], -PV[1], -PV[2]);
    add(bridgePivot, g, mBridge, 'pont');
  }

  /* ================= CORDAL (banús) + afinador fi ================= */
  const XT0 = -203, XT1 = -83;
  const hwT = s => { let h = 10.5 + 11 * Math.pow(clamp(s), 1.1); if (s > 0.9) h *= Math.sqrt(Math.max(0.02, 1 - Math.pow((s - 0.9) / 0.1, 2))); if (s < 0.06) h *= Math.sqrt(Math.max(0.02, 1 - Math.pow((0.06 - s) / 0.06, 2))); return h; };
  const ycT = s => 49.5 + 15 * s;
  const tailTop = (x, z) => { const s = clamp((x - XT0) / (XT1 - XT0)), h = hwT(s); return ycT(s) + 0.5 + 3.4 * Math.pow(clamp(1 - (z / h) * (z / h)), 0.25); };
  const XR = XT1 - 3, ZF = 16.8;                 // filet del cordal; corda La amb afinador fi
  {
    const rings = [];
    for (let k = 0; k <= 30; k++) {
      const s = k / 30, x = lerp(XT0, XT1, s), h = hwT(s), yc = ycT(s), r = [];
      for (let j = 0; j < 18; j++) { const a = TAU * j / 18, c = Math.cos(a), sn = Math.sin(a); r.push([x, yc + (sn >= 0 ? 0.5 + 3.4 * Math.pow(sn, 0.5) : 0.5 - 3.6 * Math.pow(-sn, 0.5)), h * c]); }
      rings.push(r);
    }
    add(G.pont, loft(rings), mTail, 'cordes');
    const yr = tailTop(XR, 0);
    add(G.pont, geo.ext(geo.rrect(XR - 1.6, XR + 1.4, -19, 19, 1.2), 2.6, { bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 }).rotateX(-PI / 2).translate(0, yr - 1.4, 0), mTail, 'cordes');
    // afinador fi a la corda La
    const tt = tailTop(-96, ZF);
    add(G.pont, geo.box(-101, -91, tt - 0.4, tt + 1.0, 13, 20.6), mFine, 'cordes');
    add(G.pont, geo.cyl(1.5, 7, 'y', 12).translate(-97.5, tt + 4.3, ZF), mFine, 'cordes');
    add(G.pont, geo.cyl(3.6, 2.6, 'y', 24).translate(-97.5, tt + 8.6, ZF), mFine, 'cordes');
    add(G.pont, geo.curveTube([[-97.5, tt + 4.5, ZF], [-94.5, tt + 5.2, ZF], [-91.5, tt + 3.8, ZF], [-89.8, tt + 1.9, ZF]], 0.9, 16, 8), mFine, 'cordes');
    // corda de subjecció fins al botó final
    for (const sz of [-1, 1]) add(G.pont, geo.curveTube([[-196.5, 47.5, sz * 3.8], [-203, 47.4, sz * 3.8], [-206.3, 46.0, sz * 3.6], [-207.9, 41, sz * 3.3], [-207.7, 30, sz * 3.0], [-206.7, RIB / 2 + 3, sz * 2.7]], 1.0, 24, 8), mGut, 'cordes');
  }

  /* ================= MÀNEC, DIAPASÓ, CLAVILLER, VOLUTA ================= */
  const neckRig = new THREE.Group(); neckRig.position.set(NX0, NY0, 0); neckRig.rotation.z = -TH; G.mastil.add(neckRig);
  const FBL = 300, NKL = 148;
  const fbW = lx => 24.5 + 20.5 * clamp(-lx / FBL);
  { // diapasó de banús (300 mm, bombat)
    const rings = [];
    for (let k = 0; k <= 30; k++) {
      const lx = -FBL + FBL * k / 30, h = fbW(lx) / 2, r = [];
      for (let j = 0; j <= 12; j++) { const z = h - 2 * h * j / 12; r.push([lx, -z * z / 92, z]); }
      r.push([lx, -5.2, -h + 0.4], [lx, -5.6, -h * 0.5], [lx, -5.6, h * 0.5], [lx, -5.2, h - 0.4]);
      rings.push(r);
    }
    add(neckRig, loft(rings), mFb, 'mastil');
  }
  { // mànec (secció en D)
    const rings = [];
    for (let k = 0; k <= 24; k++) {
      const lx = -NKL + (NKL + 4) * k / 24, w = (fbW(lx) - 1.5) / 2, dn = 18 + 3.5 * clamp(-lx / NKL), r = [];
      for (let j = 0; j <= 14; j++) { const a = PI * j / 14; r.push([lx, -5.5 - dn * Math.pow(Math.sin(a), 0.8), w * Math.cos(a)]); }
      rings.push(r);
    }
    add(neckRig, loft(rings), mNeck, 'mastil');
  }
  { // cellet (nut)
    const pts = [[-12.5, -5.6], [12.5, -5.6]];
    for (let k = 0; k <= 12; k++) { const z = 12.5 - 25 * k / 12; pts.push([z, 1.0 - z * z / 92]); }
    add(neckRig, geo.ext(geo.shape(pts), 5.4).rotateY(PI / 2).translate(0.2, 0, 0), mNut, 'mastil');
  }
  // taló del mànec (al món, recolzat al cos): el del violí, ampliat
  add(G.mastil, geo.ext(geo.shape([[174.5, 47], [174.5, -0.3], [180, -0.3], [185, 1.5], [190, 7], [195, 14.5], [201, 21], [209, 25.5], [219, 28], [232, 29], [236, 36], [228, 43], [200, 46]]
    .map(([x, y]) => [205 + (x - 174.5) * 1.12, -0.3 + (y + 0.3) * 1.17])), 21, { bevelThickness: 3.8, bevelSize: 3.3, bevelSegments: 4 }).translate(0, 0, -10.5), mHeel, 'mastil');
  // claviller, voluta i clavilles: el dibuix del violí una mica més gran
  const SP = 1.06;
  const headRig = new THREE.Group(); headRig.scale.setScalar(SP); neckRig.add(headRig);
  { // claviller (parets + fons)
    const cheek = geo.shape([[4, 0.6], [70, 0.6], [76, -1.8], [81, -6.5], [85, -12.5], [88, -19.5], [89.2, -27.5], [60, -27.5], [30, -25.5], [12, -23.5], [4, -23]]);
    const bev = { bevelThickness: 0.7, bevelSize: 0.7, bevelSegments: 2 };
    add(headRig, geo.ext(cheek, 4.0, bev).translate(0, 0, 8.3), mPegbox, 'voluta');
    add(headRig, geo.ext(cheek, 4.0, bev).translate(0, 0, -12.3), mPegbox, 'voluta');
    add(headRig, geo.ext(geo.shape([[4, -16.5], [40, -19.5], [89, -20.5], [89.2, -27.5], [60, -27.5], [30, -25.5], [12, -23.5], [4, -23]]), 17, bev).translate(0, 0, -8.5), mPegbox, 'voluta');
  }
  const SC = [89, -9];
  { // voluta: espiral que es fa estreta cap a l'ull
    const R0 = 18, KS = 0.12, PH = 2.35 * TAU, Rf = p => R0 * Math.exp(-KS * p), rings = [];
    for (let k = 0; k <= 130; k++) {
      const p = PH * k / 130, a = -PI / 2 + p, ex = Math.cos(a), ey = Math.sin(a);
      const ro = Rf(p), ri = Math.max(0.5, Rf(p + TAU) + 0.3), hz = 13.2 - 6.2 * (p / PH), c = Math.min(1.6, (ro - ri) * 0.3);
      const q = [[ro, -hz + c], [ro, hz - c], [ro - c, hz], [ri + c, hz], [ri, hz - c], [ri, -hz + c], [ri + c, -hz], [ro - c, -hz]];
      rings.push(q.map(([r, z]) => [SC[0] + ex * r, SC[1] + ey * r, z]));
    }
    add(headRig, loft(rings), mScroll, 'voluta');
    add(headRig, geo.cyl(3.2, 13.2, 'z', 24).translate(SC[0], SC[1], 0), mScroll, 'voluta');
  }
  // clavilles: La i Re a +Z, Sol i Do a -Z
  const PEG = [{ x: 57, s: -1, zw: -4.5 }, { x: 30, s: -1, zw: -1.2 }, { x: 44, s: 1, zw: 1.2 }, { x: 18, s: 1, zw: 4.5 }];
  for (const pg of PEG) {
    add(headRig, geo.cyl(2.8, 31, 'z', 16).translate(pg.x, -11, pg.s * 3), mPeg, 'voluta');
    add(headRig, geo.cyl(4.4, 2.4, 'z', 20).translate(pg.x, -11, pg.s * 13.8), mPeg, 'voluta');
    add(headRig, geo.cyl(4.7, 0.9, 'z', 20).translate(pg.x, -11, pg.s * 15.4), mPegBead, 'voluta');
    add(headRig, new THREE.SphereGeometry(1, 24, 16).scale(2.8, 9.5, 12.5).translate(pg.x, -11, pg.s * 28), mPeg, 'voluta');
  }

  /* ================= CORDES ================= */
  const ZB = [-18.5, -6.17, 6.17, 18.5], ZN = [-8.75, -2.92, 2.92, 8.75], ZT = [-ZF, -5.6, 5.6, ZF];
  const RS = [0.6, 0.5, 0.42, 0.34];
  const SEG = 160, RAD = 7, LS = NX0 - XB;     // 370 mm de corda vibrant
  const XC = XB + 27;                           // punt on frega l'arc
  const strings = [], CON = [], BETA = [], DIRB = [];
  for (let i = 0; i < 4; i++) {
    const r = RS[i], m = mWound;
    const B = [XB, bridgeTopY(ZB[i]) + r * 0.5, ZB[i]];
    const N = n2w(0.8, 1.0 - ZN[i] * ZN[i] / 92 + r * 0.6, ZN[i]);
    const g = tubeAB(B, N, r, SEG, RAD);
    const mesh = add(G.cordes, g, m, 'cordes', { cast: false, note: i });
    add(G.cordes, tubeAB(B, N, 3.4, 1, 6), mProxy, 'cordes', { cast: false, note: i });
    strings.push({ mesh, base: Float32Array.from(g.attributes.position.array), B, N, r, moved: false });
    // darrere el pont fins al cordal
    const Rr = [XR, tailTop(XR, 0) + 1.7 + r, ZT[i]];          // sobre el filet del cordal
    add(G.cordes, tubeAB(B, Rr, r, 1, 6), m, 'cordes', { cast: false, pick: false });
    const H = i === 3 ? [-89.8, tailTop(-96, ZF) + 2.2, ZF] : [-92, tailTop(-92, ZT[i]) - 0.3, ZT[i]];
    add(G.cordes, tubeAB(Rr, H, r, 1, 6), m, 'cordes', { cast: false, pick: false });
    // del cellet a la clavilla
    const pg = PEG[i], Wp = n2w(pg.x * SP, (-11 + 3.6) * SP + r, pg.zw * SP);
    add(G.cordes, tubeAB(N, Wp, r, 1, 6), m, 'cordes', { cast: false, pick: false });
    add(headRig, geo.cyl(3.7, 3.2, 'z', 16).translate(pg.x, -11, pg.zw), mWound, 'cordes', { cast: false, pick: false });
    // dades per a l'arc
    const uc = (XC - B[0]) / (N[0] - B[0]);
    CON.push([XC, lerp(B[1], N[1], uc), lerp(B[2], N[2], uc)]);
    const beta = 0.85 * Math.atan(ZB[i] / 46 + 0.06);
    BETA.push(beta); DIRB.push([0, Math.sin(beta), -Math.cos(beta)]);
  }
  const strAt = (S, u) => [lerp(S.B[0], S.N[0], u), lerp(S.B[1], S.N[1], u), lerp(S.B[2], S.N[2], u)];
  const strDepth = (S, u) => { const p = strAt(S, u); return Math.max(0, p[1] - (fbTopY(p[0], p[2]) + S.r + 0.1)); };
  const fingerGeo = new THREE.SphereGeometry(1, 20, 14).scale(7.5, 5.3, 8.5);
  const fingerL = add(G.cordes, fingerGeo, mFinger, 'cordes', { pick: false }); fingerL.visible = false;
  const fingerR = add(G.cordes, fingerGeo.clone(), mFinger, 'cordes', { pick: false }); fingerR.visible = false;
  const DIRP = [0, 0.243, 0.970];

  /* ================= ARC (una mica més curt i més gruixut que el del violí) ================= */
  const bowRig = new THREE.Group(); G.arc.add(bowRig);
  const BSX = 0.985, BSR = 1.07;
  const bowBody = new THREE.Group(); bowBody.scale.set(BSX, BSR, BSR); bowRig.add(bowBody);
  {
    const yS = x => 10 + 8.8 * Math.pow((x - 40) / 410, 2);
    const rS = x => 4.2 - 1.5 * clamp((x + 250) / 600);
    const sp = []; for (let x = -366; x <= 352.1; x += 12) sp.push([x, yS(x), 0]);
    add(bowBody, taperTube(sp, P => rS(P.x), 180, 12), mStick, 'arc');
    const sub = (x0, x1) => { const o = []; for (let k = 0; k <= 8; k++) { const x = lerp(x0, x1, k / 8); o.push([x, yS(x), 0]); } return o; };
    add(bowBody, taperTube(sub(-302, -286), P => rS(P.x) + 0.7, 16, 12), mLeather, 'arc');
    add(bowBody, taperTube(sub(-286, -232), P => rS(P.x) + 0.35, 40, 12), mSilver, 'arc');
    // nou (frog) de banús amb ull de nacre; la de viola té la cantonada de baix arrodonida
    add(bowBody, geo.ext(geo.shape([[-306, 13], [-306, 8], [-309, 3.5], [-313, 0.5], [-318, -2.5], [-330, -5.6], [-340, -6.4], [-348, -5], [-353.5, -1.5], [-356.5, 3.5], [-357.2, 8], [-356, 13]]), 12, { bevelThickness: 1.2, bevelSize: 1, bevelSegments: 2 }).translate(0, 0, -6), mFrog, 'arc');
    add(bowBody, geo.box(-317, -309, -2.6, 3.0, -7.1, 7.1), mSilver, 'arc');
    add(bowBody, geo.box(-350, -337, -6.9, -5.7, -5.5, 5.5), mSilver, 'arc');
    for (const sz of [-1, 1]) add(bowBody, geo.cyl(2.6, 0.6, 'z', 24).translate(-334, 4, sz * 7.3), mPearl, 'arc');
    // botó
    const yb = yS(-374);
    add(bowBody, geo.cyl(4.3, 16, 'x', 24).translate(-374, yb, 0), mFrog, 'arc');
    for (const x of [-367, -381]) add(bowBody, geo.cyl(4.5, 1.6, 'x', 24).translate(x, yb, 0), mSilver, 'arc');
    add(bowBody, geo.cyl(3, 1, 'x', 20).translate(-382.5, yb, 0), mSilver, 'arc');
    // punta (cap) amb placa blanca
    add(bowBody, geo.ext(geo.shape([[336, 12.5], [346, 17.5], [357, 20.5], [364, 19.5], [368.5, 14], [369.5, 6], [367.5, -1.2], [352, -1.2], [344, 2], [338, 6.5]]), 6.4, { bevelThickness: 0.8, bevelSize: 0.6, bevelSegments: 2 }).translate(0, 0, -3.2), mStick, 'arc');
    add(bowBody, geo.box(367.6, 370.4, -1.6, 12, -3.6, 3.6), mTipPlate, 'arc');
    // cerres (cinta blanca)
    add(bowBody, geo.box(-313, 365, -0.7, 0, -5.2, 5.2), mHair, 'arc', { cast: false });
  }
  const qPlay = new THREE.Quaternion(), qRest = new THREE.Quaternion(), eul = new THREE.Euler();
  const pPlay = new THREE.Vector3(), pRest = V3(35, 4, 255);
  function playPose(c, beta, bowX, lift, outP, outQ) {
    const sb = Math.sin(beta), cb = Math.cos(beta), off = lift + 0.75 + 0.5;
    outP.set(c[0], c[1] + cb * off - sb * bowX, c[2] + sb * off + cb * bowX);
    outQ.setFromEuler(eul.set(beta, PI / 2, 0, 'XYZ'));
  }
  playPose(CON[2], BETA[2], 25, 3, pPlay, qPlay);
  bowRig.position.copy(pPlay); bowRig.quaternion.copy(qPlay);
  const arcLabel = V3(-120 * BSX, 16 * BSR, 0).applyQuaternion(qPlay).add(pPlay);

  /* ================= notes ================= */
  const notes = [
    { label: 'Do', f: 130.81, str: 0, ratio: 1, stop: 370 },
    { label: 'Sol', f: 196, str: 1, ratio: 1, stop: 370 },
    { label: 'Re', f: 293.66, str: 2, ratio: 1, stop: 370 },
    { label: 'La', f: 440, str: 3, ratio: 1, stop: 370 },
    { label: 'Si', f: 246.94, str: 1, ratio: 196 / 246.94, stop: Math.round(370 * 196 / 246.94), dit: true },
    { label: 'Mi', f: 329.63, str: 2, ratio: 293.66 / 329.63, stop: Math.round(370 * 293.66 / 329.63), dit: true }
  ];
  const isPizz = o => o === 1 || o === 'Pizzicato' || (typeof o === 'string' && o.toLowerCase().indexOf('pizz') === 0) || (o && typeof o === 'object' && (o.label === 'Pizzicato' || o.index === 1));
  // ressonàncies de la caixa més greus que les del violí i menys brillantor als aguts
  const bodyGain = fr => {
    const l0 = Math.log2(fr / 230), l1 = Math.log2(fr / 420), l2 = Math.log2(fr / 2200);
    return (0.6 + 0.4 * Math.exp(-l0 * l0 / 0.25) + 0.45 * Math.exp(-l1 * l1 / 0.3) + 0.35 * Math.exp(-l2 * l2 / 0.35)) * (fr > 3200 ? Math.pow(3200 / fr, 0.8) : 1);
  };
  const lowBoost = k => (k <= 3 ? 1.4 - 0.12 * k : 1);   // harmònics greus més forts: so més fosc

  /* ================= estat d'animació ================= */
  const st = { kb: 1, bowX: 25, bowPh: 0, lift: 3, sf: 2, press: 0, curPizz: false, fing: null, topMoved: false };
  const Tk = new Float32Array(11), Ck = new Float32Array(11);
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const fCenters = FH.map(h => V3(h.center[0], topY(h.center[0], h.center[1]) + 1, h.center[1]));
  const UP = V3(0, 1, 0);

  const cam = {
    explore: { pos: [450, 735, 895], target: [130, 18, 45] },
    exploded: { pos: [545, 945, 1205], target: [168, 150, 0] }
  };

  return {
    id: 'viola',
    family: 'Corda fregada',
    name: 'Viola',
    intro: "La viola sembla un violí una mica més gran i sona una cinquena més greu, amb un so més fosc i càlid. Les seves partitures s'escriuen sobretot en clau de do, a la tercera línia.",
    floorY: -220,
    camera: cam,
    parts: {
      tapa: { name: 'Tapa', text: "És la fusta de dalt, d'avet, una fusta lleugera i forta. Vibra amb el pont i empeny l'aire.", dato: "No és plana: fa una corba suau, com una petita volta." },
      cos: { name: 'Fons i costats', text: "El fons i els costats (els aros) són d'auró. Fan una caixa buida plena d'aire que ressona.", dato: "No hi ha una mida única de viola: n'hi ha de més petites i de més grans." },
      forats: { name: 'Forats en f', text: "Són dos forats amb forma de lletra f. Per aquí entra i surt l'aire de dins de la caixa.", dato: "Són una mica més llargs que els del violí, perquè la caixa també és més gran." },
      pont: { name: 'Pont', text: "És una peça d'auró que aguanta les cordes i passa la seva vibració a la tapa. No està enganxat: l'aguanta la pressió de les cordes.", dato: "És una mica més alt i més ample que el del violí." },
      anima: { name: 'Ànima', text: "És un bastonet de fusta dins la caixa, entre la tapa i el fons. No està enganxat: només està pressionat.", dato: "El lutier la posa al seu lloc a través d'un forat en f, amb una eina especial." },
      barra: { name: 'Barra harmònica', text: "És un llistó de fusta enganxat sota la tapa, al costat de les cordes greus. Fa la tapa més forta i l'ajuda a vibrar sencera.", dato: "És més llarga que la del violí, perquè la tapa també és més llarga." },
      mastil: { name: 'Mànec i diapasó', text: "El mànec és on posem la mà esquerra. Sobre el diapasó, de banús, premem les cordes amb els dits per canviar de nota.", dato: "Com que les cordes són més llargues, els dits s'han de separar més que al violí." },
      voluta: { name: 'Voluta i clavilles', text: "Les clavilles giren per tensar o afluixar les cordes i afinar-les. La voluta és l'espiral de la punta, un adorn.", dato: "La voluta, el claviller i el mànec es tallen d'un sol tros d'auró." },
      cordes: { name: 'Cordes', text: "N'hi ha quatre: Do, Sol, Re i La. Com més curta és la part que vibra, més aguda és la nota.", dato: "Té les cordes Sol, Re i La com el violí, però no té el Mi: en el seu lloc té un Do més greu." },
      arc: { name: 'Arc', text: "Les cerres són de cua de cavall. S'hi posa colofònia (una resina) perquè enganxin a la corda i la facin vibrar.", dato: "Pesa una mica més que el del violí, perquè ha de fer vibrar cordes més gruixudes." }
    },
    labels: [
      { part: 'tapa', group: 'tapa', at: [-140, topY(-140, -62) + 0.5, -62], internal: false },
      { part: 'cos', group: 'cos', at: [-95, RIB / 2, W(110) - 2.4], internal: false },
      { part: 'forats', group: 'tapa', at: [fCenters[0].x, fCenters[0].y, fCenters[0].z], internal: false },
      { part: 'pont', group: 'pont', at: [XB, YT + 35, 0], internal: false },
      { part: 'anima', group: 'interior', at: [XP, 22, ZP], internal: true },
      { part: 'barra', group: 'interior', at: [12, topY(12, ZBAR) - 9, ZBAR], internal: true },
      { part: 'mastil', group: 'mastil', at: [265, fbTopY(265, 0) + 0.5, 0], internal: false },
      { part: 'voluta', group: 'mastil', at: n2w(SC[0] * SP, SC[1] * SP, 13.5 * SP), internal: false },
      { part: 'cordes', group: 'cordes', at: strAt(strings[2], 0.48), internal: false },
      { part: 'arc', group: 'arc', at: [arcLabel.x, arcLabel.y, arcLabel.z], internal: false }
    ],
    explode: {
      arc: [0, 330, 0, 0],
      cordes: [0, 245, 0, 0.05],
      pont: [0, 160, 0, 0.1],
      tapa: [0, 100, 0, 0.16],
      interior: [0, 45, 0, 0.22],
      mastil: [170, 35, 0, 0.27],
      cos: [0, -50, 0, 0.32]
    },
    notes,
    options: { label: 'Tècnica', items: ['Arc', 'Pizzicato'] },
    chain: ['Arc', 'Corda', 'Pont', 'Tapa', 'Aire'],
    tour: [
      { part: 'arc', chain: 0, title: "L'arc", text: "La viola sembla un violí, però és més gran i sona més greu. Les cerres, amb colofònia, enganxen la corda, l'estiren una mica i la deixen anar. Això passa centenars de vegades per segon, i la corda no para de vibrar.", cam: { pos: [-170, 260, 295], target: [XC, 88, 17] }, slow: 0.5, xray: false },
      { part: 'cordes', chain: 1, title: 'La corda', text: "La corda vibra entre el pont i el dit (o fins al final del diapasó, si no la premem). Si premem amb el dit, la part que vibra és més curta i la nota és més aguda. Les cordes de la viola són més llargues i més gruixudes que les del violí: per això sonen més greus.", cam: { pos: [-100, 215, 130], target: [160, 70, 0] }, slow: 0.35, xray: false },
      { part: 'pont', chain: 2, title: 'El pont', text: "La corda fa balancejar el pont d'un costat a l'altre. El pont passa aquest moviment a la tapa.", cam: { pos: [-140, 160, 160], target: [XB, 76, 0] }, slow: 0.4, xray: false },
      { part: 'anima', chain: 3, title: "L'ànima i la tapa", text: "Dins la caixa, l'ànima aguanta un peu del pont. Sota l'altre peu hi ha la barra harmònica. Així el pont fa vibrar tota la tapa, que mou molt d'aire.", cam: { pos: [-210, 228, 268], target: [-23, 30, 0] }, slow: 0.5, xray: true },
      { part: 'forats', chain: 4, title: 'Els forats en f', text: "La tapa i el fons empenyen l'aire de dins de la caixa. L'aire entra i surt pels forats en f, i el so arriba fins a les nostres orelles. Escolta-ho: la viola té un so més fosc i suau que el violí.", cam: { pos: [-50, 300, 222], target: [-20, 52, 12] }, slow: 0.6, xray: false }
    ],
    soundSource: { group: 'tapa', at: [XB, 60, 0] },

    play(note, opt) {
      const n = typeof note === 'number' ? (notes[note] || notes[2]) : (note || notes[2]);
      const f = n.f, pz = isPizz(opt);
      const rho = n.ratio || 1, si = n.str !== undefined ? n.str : 2;
      st.curPizz = pz;
      if (rho < 0.999) st.fing = { si, uf: rho, depth: strDepth(strings[si], rho) };
      try {
        if (pz) {
          const xp = clamp(0.19 / rho, 0.06, 0.45), parts = [];
          for (let k = 1; k <= 12; k++) {
            if (k * f > 10000) break;
            parts.push({ k, a: Math.max(0.02, Math.abs(Math.sin(k * PI * xp))) / Math.pow(k, 1.4) * bodyGain(k * f) * lowBoost(k), tau: 1.1 - 0.5 * (k - 1) / 11 });
          }
          synth.additive({ f, partials: parts, attack: 0.003, noise: { amount: 0.05, dur: 0.035, lp: 1500, hp: 150 }, gain: 0.95 });
        } else {
          const parts = [];
          for (let k = 1; k <= 16; k++) { if (k * f > 11000) break; parts.push({ k, a: Math.pow(k, -1.15) * bodyGain(k * f) * lowBoost(k), tau: 4 }); }
          synth.additive({ f, partials: parts, attack: 0.09, hold: 1.3, release: 0.4, vibrato: { rate: 5.2, depth: 13 }, noise: { amount: 0.03, dur: 1.8, hp: 2500, lp: 7000 }, gain: 0.85 });
        }
      } catch (e) { /* sense àudio */ }
      return pz ? { attack: 0.005, hold: 0, release: 1.0 } : { attack: 0.09, hold: 1.3, release: 0.4 };
    },

    update(dt, s) {
      dt = Math.min(Math.max(dt || 0, 0), 0.05);
      const env = s.env || 0;
      const nObj = (typeof s.noteIndex === 'number' && notes[s.noteIndex]) ? notes[s.noteIndex] : (s.note && typeof s.note === 'object' && s.note.str !== undefined ? s.note : null);
      const si = nObj ? nObj.str : 2;
      const optP = isPizz(s.opt);
      const on = !!nObj && env > 0.002;
      const pz = on ? st.curPizz : optP;
      const t = s.t || 0, fv = s.fvis || 1, wt = TAU * fv * t;
      const rho = nObj ? nObj.ratio : 1;

      /* ---- coeficients de la corda i força al pont ---- */
      const K = 10; let F = 0, xp = 0.2;
      if (pz) {
        xp = clamp(0.19 / rho, 0.06, 0.45);
        const nn = 2 / (PI * PI * xp * (1 - xp)); let nrm = 0;
        for (let k = 1; k <= K; k++) {
          Ck[k] = nn * Math.sin(k * PI * xp) / (k * k);
          Tk[k] = Math.cos(k * wt) * Math.exp(-t * (0.13 + 0.11 * k));
          const c = Math.sin(k * PI * xp) / k; F += c * Tk[k]; nrm += Math.abs(c);
        }
        F = clamp(1.6 * F / (nrm || 1), -1, 1);
      } else {
        for (let k = 1; k <= K; k++) { Ck[k] = 1 / (k * k * 1.2337); Tk[k] = Math.sin(k * wt); }
        for (let k = 1; k <= 6; k++) F += Math.sin(k * wt) / k;
        F = clamp(F / 1.7, -1, 1);
      }

      /* ---- corda que vibra (suma de modes) ---- */
      const fingered = on && rho < 0.999;
      st.press += ((fingered ? 1 : 0) - st.press) * Math.min(1, dt * 12);
      const amp = (pz ? 5 : 3.8) * env;
      const dir = pz ? DIRP : DIRB[si];
      const fing = st.fing;
      for (let i = 0; i < 4; i++) {
        const S = strings[i];
        const pressOn = fing && fing.si === i && st.press > 0.002;
        const active = (i === si && on) || pressOn;
        if (!active) {
          if (S.moved) { S.mesh.geometry.attributes.position.array.set(S.base); S.mesh.geometry.attributes.position.needsUpdate = true; S.moved = false; }
          continue;
        }
        const arr = S.mesh.geometry.attributes.position.array, b = S.base;
        const vib = i === si && on;
        const rr = vib ? rho : 1, uf = pressOn ? fing.uf : 1, pd = pressOn ? fing.depth * st.press : 0;
        for (let r = 0; r <= SEG; r++) {
          const u = r / SEG; let d = 0;
          if (vib && u < rr) { const xi = u / rr; let sum = 0; for (let k = 1; k <= K; k++) sum += Ck[k] * Math.sin(k * PI * xi) * Tk[k]; d = amp * sum; }
          const dp = pd > 0 ? pd * (u < uf ? u / uf : (1 - u) / (1 - uf + 1e-6)) : 0;
          const dy = d * dir[1] - dp, dz = d * dir[2];
          for (let j = 0; j <= RAD; j++) { const id = (r * (RAD + 1) + j) * 3; arr[id] = b[id]; arr[id + 1] = b[id + 1] + dy; arr[id + 2] = b[id + 2] + dz; }
        }
        S.mesh.geometry.attributes.position.needsUpdate = true; S.moved = true;
      }
      // dit de la mà esquerra (notes trepitjades)
      if (fing && st.press > 0.05) {
        const S = strings[fing.si], p = strAt(S, fing.uf);
        fingerL.visible = true;
        fingerL.position.set(p[0] + 2, p[1] - fing.depth * st.press + S.r + 4.9, p[2]);
      } else fingerL.visible = false;
      // dit de la mà dreta (pizzicato)
      if (on && pz && t < 0.7) {
        const S = strings[si], p = strAt(S, xp * rho), k = t / 0.7;
        fingerR.visible = true;
        fingerR.position.set(p[0], p[1] + 5.8 + 30 * k + DIRP[1] * 4, p[2] + DIRP[2] * (5 + 45 * k));
      } else fingerR.visible = false;

      /* ---- tapa: vibració + mapa de calor ---- */
      if (env > 0.002) {
        const A = 3.2 * env * F, pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array;
        for (let i = 0; i < nTop; i++) { const d = topShp[i] * A; pa[i * 3 + 1] = topBaseY[i] + d; if (s.heat) heat.color(clamp(d / 2.6, -1, 1), ca, i); }
        topGeo.attributes.position.needsUpdate = true;
        if (s.heat) topGeo.attributes.color.needsUpdate = true;
        topGeo.computeVertexNormals();
        for (const R of rims) { const p = R.g.attributes.position.array; for (let i = 0; i < R.n; i++) p[i * 3 + 1] = R.base[i * 3 + 1] + R.shp[i] * A; R.g.attributes.position.needsUpdate = true; }
        st.topMoved = true;
      } else if (st.topMoved) {
        const pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array;
        for (let i = 0; i < nTop; i++) pa[i * 3 + 1] = topBaseY[i];
        ca.fill(0);
        topGeo.attributes.position.needsUpdate = true; topGeo.attributes.color.needsUpdate = true;
        topGeo.attributes.normal.array.set(topBaseN); topGeo.attributes.normal.needsUpdate = true;
        for (const R of rims) { R.g.attributes.position.array.set(R.base); R.g.attributes.position.needsUpdate = true; }
        st.topMoved = false;
      }

      /* ---- el pont balanceja ---- */
      bridgePivot.rotation.x = 0.035 * env * F;

      /* ---- aire pels forats en f ---- */
      if (env > 0.03) {
        G.tapa.updateWorldMatrix(true, false);
        const up = UP.clone().transformDirection(G.tapa.matrixWorld);
        const rate = env * (170 + 400 * Math.max(0, F));
        for (const c of fCenters) fx.air(G.tapa.localToWorld(c.clone()), up, rate, 0.45, 190);
      }

      /* ---- arc ---- */
      st.kb += ((optP ? 0 : 1) - st.kb) * Math.min(1, dt * 2.4);
      const playing = !optP && on && !st.curPizz;
      if (playing) st.bowPh += dt * 1.2 * Math.min(1, env * 2.5);
      st.bowX = 25 + 195 * Math.sin(st.bowPh);
      st.lift += ((playing ? 0 : 3) - st.lift) * Math.min(1, dt * 8);
      st.sf += (si - st.sf) * Math.min(1, dt * 6);
      const i0 = Math.min(3, Math.max(0, Math.floor(st.sf))), i1 = Math.min(3, i0 + 1), fr = clamp(st.sf - i0);
      const c = [XC, lerp(CON[i0][1], CON[i1][1], fr), lerp(CON[i0][2], CON[i1][2], fr)];
      const beta = lerp(BETA[i0], BETA[i1], fr);
      playPose(c, beta, st.bowX, st.lift, tmpP, tmpQ);
      const k = smooth(clamp(st.kb));
      bowRig.position.lerpVectors(pRest, tmpP, k);
      bowRig.position.y += 150 * Math.sin(PI * k);
      bowRig.quaternion.slerpQuaternions(qRest, tmpQ, k);
    }
  };
}
