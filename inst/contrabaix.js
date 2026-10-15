// Contrabaix (mida 3/4) — mòdul d'instrument (corda fregada)
// Unitats: mm. Y amunt. Dret com quan es toca: la punta de la pica és a l'origen (terra).
// Es construeix en un marc "local" (instrument vertical, tapa cap a +Z, corda Mi a -X,
// pla central de la caixa a z = 0) i cada grup del motor té un fill inclinat (TILT)
// cap enrere, cap al músic. tw() passa del marc local al món (per a etiquetes i càmeres).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const ds = m => { m.side = THREE.DoubleSide; return m; };

  const NAMES = ['arc', 'cordes', 'pont', 'tapa', 'interior', 'cos', 'mastil', 'pica'];
  const G = groups(NAMES);
  const TILT = -0.15, cT = Math.cos(TILT), sT = Math.sin(TILT);
  const T = {};
  for (const n of NAMES) { const g = new THREE.Group(); g.rotation.x = TILT; G[n].add(g); T[n] = g; }
  const tw = p => [p[0], p[1] * cT - p[2] * sT, p[1] * sT + p[2] * cT];
  // permutació cíclica (x,y,z) -> (z,x,y): una forma feta al pla (a,b) i extruïda en e queda (e,a,b)
  const CYC = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const cyc = g => g.applyMatrix4(CYC);

  /* ================= silueta del cos (espatlles caigudes) ================= */
  const L = 1100, YB0 = 230;                 // llargada del cos; y = YB0 + v
  const ZE = 95;                             // vora de la tapa (z); el fons pla és a z ≈ -95 (aros de 190 mm)
  const crv = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
  function spl(P, n) {
    const o = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
      for (let s = 0; s < n; s++) { const t = s / n; o.push([crv(a[0], b[0], c[0], d[0], t), crv(a[1], b[1], c[1], d[1], t)]); }
    }
    return o;
  }
  // [v, mitja amplada]: panxa inferior 636, cintura 394, panxa superior 514, i espatlles que baixen fins al mànec
  const segLow = [[0, 0], [1.5, 42], [7, 100], [20, 160], [42, 212], [75, 255], [120, 288], [170, 309], [222, 318], [272, 315], [315, 302], [348, 284], [368, 268], [376, 258]];
  const segC = [[376, 258], [383, 240], [398, 222], [425, 207], [460, 199], [500, 197], [540, 200], [572, 209], [596, 222], [610, 238]];
  const segUp = [[610, 238], [628, 244], [665, 252], [710, 257], [755, 257], [800, 251], [845, 238], [890, 218], [935, 192], [975, 163], [1012, 132], [1045, 104], [1068, 85], [1084, 70], [1094, 52], [1099, 28], [1100, 0]];
  const HW = [...spl(segLow, 8), ...spl(segC, 8), ...spl(segUp, 8), [L, 0]];
  for (let i = 1; i < HW.length; i++) { if (HW[i][0] <= HW[i - 1][0]) HW[i][0] = HW[i - 1][0] + 0.01; HW[i][1] = Math.max(0, HW[i][1]); }
  HW[0] = [0, 0]; HW[HW.length - 1] = [L, 0];
  function W(v) {
    if (v <= 0 || v >= L) return 0;
    let lo = 0, hi = HW.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (HW[m][0] <= v) lo = m; else hi = m; }
    const a = HW[lo], b = HW[hi];
    return a[1] + (b[1] - a[1]) * (v - a[0]) / ((b[0] - a[0]) || 1);
  }
  const OUT = [];                                  // contorn [x, v]
  HW.forEach(p => OUT.push([p[1], p[0]]));
  for (let i = HW.length - 2; i >= 1; i--) OUT.push([-HW[i][1], HW[i][0]]);

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
  // forma al pla (x, v) extruïda (profunditat 1) i reubicada en z amb una funció de (x, v, e)
  function extZ(shape, zFn, bevel) {
    const g = geo.ext(shape, 1, bevel), p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], v = p[i + 1], e = p[i + 2]; p[i + 1] = YB0 + v; p[i + 2] = zFn(x, v, e); }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    return g;
  }

  /* ================= tapa bombada i fons pla (doblegat a dalt) ================= */
  const AT = 26;                                   // alçada de l'arc de la tapa
  const longF = v => Math.pow(Math.max(0, Math.sin(PI * clamp(v / L))), 0.55);
  const crossH = a => Math.pow((1 + Math.cos(PI * clamp(Math.abs(a)))) / 2, 0.75);
  function archF(x, v) { const w = W(v); if (w < 0.01) return 0; return longF(v) * crossH(x / w); }
  const topZ = (x, v) => ZE + AT * archF(x, v);
  const VBRK = 830;                                // on el fons es doblega cap endavant
  const zBack = v => -95 + Math.max(0, v - VBRK) * 0.27;
  const zBk = v => zBack(v) - 3;                   // cara de fora del fons

  /* ================= posicions clau ================= */
  const VBR = 470, YBR = YB0 + VBR;                // pont (630 mm per sota de la vora de dalt)
  const SLEN = 1050, Yn = YBR + SLEN;              // corda vibrant: 1050 mm (3/4)
  const XP = 55, VP = VBR - 28;                    // ànima: darrere el peu agut (Sol)
  const XBAR = -55;                                // barra harmònica sota el peu greu (Mi)
  const Zn = ZE + 40;                              // diapasó al cellet
  const TPHI = 0.1305, PHI = Math.atan(TPHI), CPHI = Math.cos(PHI), SPHI = Math.sin(PHI);
  const n2w = (lx, ly, lz) => [lx, Yn + ly * CPHI + lz * SPHI, Zn - ly * SPHI + lz * CPHI];
  const NFB = V3(0, SPHI, CPHI);                   // normal del diapasó
  const FBL = (Yn - (YBR + 170)) / CPHI;           // diapasó: acaba 17 cm per sobre del pont
  const fbH = ly => (44 + 74 * clamp(-ly / FBL)) / 2;
  const fbTopZ = (x, y) => Zn + (Yn - y) * TPHI - x * x / 240;
  const lyOf = y => (y - Yn) / CPHI;

  /* ================= forats en f ================= */
  function fHole(sign) {                           // es calcula en [v, x] i es retorna en [x, v]
    const Le = [VBR - 112, 147], Ue = [VBR + 119, 69], rL = 13.5, rU = 11.2;
    const dx = Ue[0] - Le[0], dz = Ue[1] - Le[1], len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len, px = -tz, pz = tx;
    const cAt = t => { const o = 14 * Math.sin(TAU * t); return [Le[0] + dx * t + px * o, Le[1] + dz * t + pz * o]; };
    const hw = t => 2.2 + 4.8 * Math.pow(Math.sin(PI * t), 0.8) + 3.2 * Math.exp(-Math.pow((t - 0.5) / 0.022, 2));
    const outC = p => Math.hypot(p[0] - Le[0], p[1] - Le[1]) > rL * 0.98 && Math.hypot(p[0] - Ue[0], p[1] - Ue[1]) > rU * 0.98;
    const left = [], right = [], N = 44;
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
    const poly = [...left, ...arc(Ue, rU, left[left.length - 1], right[right.length - 1], [tx, tz], 16),
      ...right.slice().reverse(), ...arc(Le, rL, right[0], left[0], [-tx, -tz], 18)];
    const P = poly.map(p => [p[1] * sign, p[0]]);
    const c = cAt(0.5);
    let x0 = 1e9, x1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
    return { poly: P, center: [c[1] * sign, c[0]], bb: [x0 - 4, x1 + 4, v0 - 4, v1 + 4] };
  }
  const FH = [fHole(1), fHole(-1)];
  const inBB = (h, x, v) => x > h.bb[0] && x < h.bb[1] && v > h.bb[2] && v < h.bb[3];

  /* ================= malla de placa (tapa deformable / fons) ================= */
  function plateGrid(VS, NX, zFn, holes) {
    const NV = VS.length - 1, S = NX + 1, nv = (NV + 1) * S;
    const X = new Float32Array(nv), Vv = new Float32Array(nv), ok = new Uint8Array(nv);
    for (let i = 0; i <= NV; i++) {
      const v = VS[i], w = W(v);
      for (let j = 0; j <= NX; j++) {
        const id = i * S + j, x = (-1 + 2 * j / NX) * w;
        X[id] = x; Vv[id] = v; ok[id] = 1;
        if (holes) for (const h of holes) if (inBB(h, x, v) && inPoly(h.poly, x, v)) ok[id] = 0;
      }
    }
    if (holes) {   // enganxa a la vora del forat els vèrtexs que hi toquen
      const mv = [];
      for (let i = 1; i < NV; i++) for (let j = 1; j < NX; j++) {
        const id = i * S + j; if (!ok[id]) continue;
        if (ok[id - S] && ok[id + S] && ok[id - 1] && ok[id + 1]) continue;
        for (const h of holes) {
          if (!inBB(h, X[id], Vv[id])) continue;
          const q = nearestOnPoly(h.poly, X[id], Vv[id]);
          if (q[2] < 4.2) mv.push([id, q[0], q[1]]);
          break;
        }
      }
      for (const m of mv) { X[m[0]] = m[1]; Vv[m[0]] = m[2]; }
    }
    const map = new Int32Array(nv).fill(-1), pos = [], uv = [];
    for (let id = 0; id < nv; id++) {
      if (!ok[id]) continue;
      map[id] = pos.length / 3;
      pos.push(X[id], YB0 + Vv[id], zFn(X[id], Vv[id]));
      uv.push(Vv[id] / L, (X[id] + 330) / 660);
    }
    const idx = [];
    for (let i = 0; i < NV; i++) for (let j = 0; j < NX; j++) {
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
  const rowsTop = []; { let v = 0; while (v < L - 0.5) { rowsTop.push(v); v += (v < 25 || v > L - 25) ? 4 : (v > 325 && v < 620 ? 3.8 : 11); } rowsTop.push(L); }
  const rowsBack = []; { let v = 0; while (v < L - 0.5) { rowsBack.push(v); v += (v < 25 || v > L - 25) ? 5 : 18; } rowsBack.push(L); }

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
    g.computeVertexNormals();
    return g;
  }
  const tubeAB = (a, b, r, seg = 1, rad = 7) => new THREE.TubeGeometry(new THREE.LineCurve3(V3(a[0], a[1], a[2]), V3(b[0], b[1], b[2])), seg, r, rad, false);

  /* ================= materials ================= */
  const VARN = 0x7A3B1A;                                   // vernís marró fosc
  const mTop = ds(M.wood('tapa', tex.spruce(1, 2.2), { color: 0xB0642C, xray: true }));
  const mTopEdge = M.wood('tapa', tex.spruce(1 / 600, 1 / 600), { color: 0x9A5426, xray: true });
  const mPurf = mat('tapa', { color: 0x1c140e, roughness: 0.5 }, { phys: false, xray: true });
  const mSaddle = M.ebony('tapa');
  const mRim = ds(mat('forats', { color: 0x120a06, roughness: 0.9 }, { phys: false, xray: true }));
  const mBack = ds(M.wood('cos', tex.maple(1, 1.6), { color: VARN, xray: true }));
  const mBackEdge = M.wood('cos', tex.maple(1 / 600, 1 / 600), { color: VARN, xray: true });
  const mRib = M.wood('cos', tex.maple(1 / 300, 1), { color: VARN, xray: true });
  const mPurfB = mat('cos', { color: 0x1c140e, roughness: 0.5 }, { phys: false, xray: true });
  const mBlock = M.rawWood('cos', tex.spruce(1 / 80, 1 / 80), { color: 0xE2C594, xray: true });
  const mBrace = M.rawWood('cos', tex.spruce(1 / 300, 1 / 40), { color: 0xE2C594, xray: true });
  const mPost = M.rawWood('anima', tex.spruce(1 / 60, 1 / 60), { color: 0xEFD8AA });
  const mBar = M.rawWood('barra', tex.spruce(1 / 500, 1 / 60), { color: 0xE8CC98 });
  const mBridge = M.rawWood('pont', tex.maple(1 / 60, 1 / 60), { color: 0xF0D7A8 });
  const mAdj = M.brass('pont'), mAdjRod = M.nickel('pont');
  const mTail = ds(M.ebony('cordes')), mTailFret = M.ebony('cordes'), mWire = M.nickel('cordes');
  const mWound = M.string('cordes', true), mFinger = M.plastic('cordes', 0xE5AC8A), mSilk = M.plastic('cordes', 0x7A2A6A);
  const mNeck = ds(M.wood('mastil', tex.maple(3, 1), { color: VARN }));
  const mFb = ds(M.ebony('mastil')), mNut = M.ebony('mastil');
  const mScroll = ds(M.wood('clavillers', tex.maple(6, 1), { color: VARN }));
  const mPegbox = M.wood('clavillers', tex.maple(1 / 150, 1 / 150), { color: VARN });
  const mMach = M.brass('clavillers'), mKey = M.brass('clavillers'), mScrew = M.nickel('clavillers');
  const mStick = M.wood('arc', tex.mahogany(10, 1), { color: 0x8A3C20 });
  const mFrog = M.ebony('arc'), mSilver = M.silver('arc'), mTipPlate = M.bone('arc');
  const mPearl = mat('arc', { color: 0xF2F5F7, roughness: 0.15, metalness: 0.1, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.3 });
  const mHair = mat('arc', { color: 0xF2EDE0, roughness: 0.85 }, { phys: false });
  const mLeather = mat('arc', { color: 0x3b2617, roughness: 0.9 }, { phys: false });
  const mSock = M.ebony('pica'), mPinCol = M.nickel('pica'), mRod = M.chrome('pica');
  const mProxy = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

  /* ================= TAPA ================= */
  const topGeo = plateGrid(rowsTop, 72, topZ, FH);
  const nTop = topGeo.attributes.position.count;
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nTop * 3), 3));
  const topMesh = add(T.tapa, topGeo, mTop, 'tapa');
  heat.overlay(topMesh);
  // forma de vibració: es mou més pel costat greu (barra) i gairebé gens a sobre l'ànima
  function shpFn(x, v) {
    const w = W(v); if (w < 0.5) return 0;
    const a = clamp(x / w, -1, 1);
    const bell = Math.exp(-Math.pow((v - (VBR + 40)) / 360, 2));
    const side = 0.8 - 0.3 * a;
    const post = 1 - 0.75 * Math.exp(-((x - XP) * (x - XP) + (v - VP) * (v - VP)) / (60 * 60));
    return (1 - a * a) * bell * side * post * longF(v);
  }
  const topBaseZ = new Float32Array(nTop), topShp = new Float32Array(nTop);
  {
    const p = topGeo.attributes.position.array;
    for (let i = 0; i < nTop; i++) { topBaseZ[i] = p[i * 3 + 2]; topShp[i] = shpFn(p[i * 3], p[i * 3 + 1] - YB0); }
  }
  const topBaseN = Float32Array.from(topGeo.attributes.normal.array);
  // vora de la tapa i filet
  add(T.tapa, geo.ext(ringShape(OUT, offsetPoly(OUT, -7)), 4, { bevelThickness: 0.8, bevelSize: 1.0, bevelSegments: 2 }).translate(0, YB0, ZE - 4), mTopEdge, 'tapa');
  {
    const pts = offsetPoly(OUT, -6).filter((p, i) => i % 2 === 0).map(p => V3(p[0], YB0 + p[1], topZ(p[0], p[1]) + 0.2));
    add(T.tapa, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 560, 1.3, 5, true), mPurf, 'tapa', { cast: false });
  }
  // cantell fosc dels forats en f (segueix l'arc de la tapa i es mou amb ella)
  const rims = FH.map(h => {
    const sh = geo.shape(offsetPoly(h.poly, 1.8)); sh.holes.push(geo.path(h.poly));
    const g = geo.ext(sh, 5);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], v = p[i + 1], e = p[i + 2]; p[i + 1] = YB0 + v; p[i + 2] = topZ(x, v) + 0.3 - (5 - e); }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    const n = p.length / 3, base = Float32Array.from(p), shp = new Float32Array(n);
    for (let i = 0; i < n; i++) shp[i] = shpFn(p[i * 3], p[i * 3 + 1] - YB0);
    const mesh = add(T.tapa, g, mRim, 'forats', { cast: false });
    return { g, base, shp, n, mesh };
  });
  // cadireta (saddle) de banús a la vora de baix, on passa el cable del cordal
  add(T.tapa, geo.ext(geo.rrect(-42, 42, -4, 12, 3), 16, { bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2 }).translate(0, YB0, ZE - 4), mSaddle, 'tapa');

  /* ================= FONS I COSTATS ================= */
  add(T.cos, plateGrid(rowsBack, 30, (x, v) => zBk(v), null), mBack, 'cos');
  add(T.cos, extZ(ringShape(OUT, offsetPoly(OUT, -7)), (x, v, e) => zBk(v) + 4 * e), mBackEdge, 'cos');
  {
    const pts = offsetPoly(OUT, -6).filter((p, i) => i % 2 === 0).map(p => V3(p[0], YB0 + p[1], zBk(p[1]) - 0.2));
    add(T.cos, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 560, 1.3, 5, true), mPurfB, 'cos', { cast: false });
  }
  // aros: de 190 mm a baix, més prims a dalt perquè el fons es doblega
  add(T.cos, extZ(ringShape(offsetPoly(OUT, -2.5), offsetPoly(OUT, -6.5)), (x, v, e) => lerp(zBk(v) + 3.5, ZE - 3.5, e)), mRib, 'cos');
  // tacs interiors (a baix hi entra la pica; a dalt hi encaixa el mànec)
  add(T.cos, geo.box(-55, 55, YB0 + 6, YB0 + 42, zBk(0) + 4, ZE - 4.5), mBlock, 'cos');
  add(T.cos, geo.box(-40, 40, YB0 + 1048, YB0 + 1090, zBk(1070) + 4, ZE - 4.5), mBlock, 'cos');
  // barres travessades del fons pla (la més grossa al plec)
  for (const [v, h] of [[150, 16], [360, 18], [590, 18], [VBRK, 24]]) {
    const w = W(v) - 9;
    add(T.cos, geo.ext(geo.rrect(-w, w, v - 11, v + 11, 5), h, { bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2 }).translate(0, YB0, zBk(v) + 4), mBrace, 'cos');
  }

  /* ================= INTERIOR: barra harmònica i ànima ================= */
  {
    const vb0 = 140, vb1 = 860, pts = [];
    for (let k = 0; k <= 48; k++) { const v = lerp(vb0, vb1, k / 48); pts.push([v, topZ(XBAR, v) - 3.5]); }
    for (let k = 48; k >= 0; k--) { const s = k / 48, v = lerp(vb0, vb1, s), h = 4 + 28 * Math.pow(Math.sin(PI * s), 0.7); pts.push([v, topZ(XBAR, v) - 3.5 - h]); }
    add(T.interior, cyc(geo.ext(geo.shape(pts), 14, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 1 })).translate(XBAR - 7, YB0, 0), mBar, 'barra');
    const z0 = zBk(VP) + 1, z1 = topZ(XP, VP) - 1.5;
    add(T.interior, geo.cyl(10, z1 - z0, 'z', 24).translate(XP, YB0 + VP, (z0 + z1) / 2), mPost, 'anima');
  }

  /* ================= PONT alt amb ajustadors (bascula sobre el peu agut) ================= */
  const Zb0 = topZ(0, VBR), HBR = 165;
  const ZbT = x => Zb0 + HBR - x * x / 200 - 0.04 * x;     // corba de dalt (Mi una mica més alt)
  const zf = x => topZ(x, VBR) - 0.6;
  const XPIV = 59;
  const PV = [XPIV, YBR, zf(XPIV)];
  const bridgePivot = new THREE.Group(); bridgePivot.position.set(PV[0], PV[1], PV[2]); T.pont.add(bridgePivot);
  {
    const R = [];
    [[0, 38], [14, 36], [24, 30], [31, 20], [35, 9]].forEach(p => R.push([p[0], Zb0 + p[1]]));
    for (let k = 0; k <= 8; k++) { const x = 36.5 + (82 - 36.5) * k / 8; R.push([x, zf(x)]); }
    [[82, 6], [78, 15], [70, 30], [63, 45], [60, 58], [59, 68], [61, 76], [68, 83], [73, 91], [72, 99], [66, 104], [59, 106], [54, 111], [53, 119], [55, 128], [57, 136]].forEach(p => R.push([p[0], Zb0 + p[1]]));
    const top = []; for (let k = 0; k <= 22; k++) { const x = 57 - 114 * k / 22; top.push([x, ZbT(x)]); }
    const Lh = R.map(p => [-p[0], p[1]]).reverse().slice(0, -1);
    const sh = geo.shape([...R, ...top, ...Lh]);
    const heart = []; for (let k = 0; k <= 16; k++) { const a = -PI / 2 + 0.7 + (TAU - 1.4) * k / 16; heart.push([8.5 * Math.cos(a), Zb0 + 80 + 8.5 * Math.sin(a)]); }
    heart.push([0, Zb0 + 66]);
    sh.holes.push(geo.path(heart));
    for (const sg of [-1, 1]) {
      const kid = []; for (let k = 0; k < 20; k++) { const a = TAU * k / 20, ex = 12 * Math.cos(a), ey = 5 * Math.sin(a), r = -0.35 * sg; kid.push([sg * 27 + ex * Math.cos(r) - ey * Math.sin(r), Zb0 + 110 + ex * Math.sin(r) + ey * Math.cos(r)]); }
      sh.holes.push(geo.path(kid));
    }
    const g = geo.ext(sh, 24, { bevelThickness: 0.8, bevelSize: 0.6, bevelSegments: 2 }).rotateX(PI / 2).translate(0, 12, 0);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const h = clamp((p[i + 2] - Zb0) / HBR); p[i + 1] *= lerp(1, 0.38, Math.pow(h, 0.8)); }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    g.translate(-PV[0], YBR - PV[1], -PV[2]);
    add(bridgePivot, g, mBridge, 'pont');
    // ajustadors d'alçada: rodeta de llautó i vareta roscada a cada cama
    for (const sx of [-1, 1]) {
      const x = sx * 59.25;
      add(bridgePivot, geo.cyl(14.5, 4.5, 'z', 32).translate(x - PV[0], 0, Zb0 + 17 - PV[2]), mAdj, 'pont');
      add(bridgePivot, geo.cyl(3.6, 26, 'z', 12).translate(x - PV[0], 0, Zb0 + 17 - PV[2]), mAdjRod, 'pont');
    }
  }

  /* ================= MÀNEC, DIAPASÓ, CLAVILLER, VOLUTA ================= */
  const neckRig = new THREE.Group(); neckRig.position.set(0, Yn, Zn); neckRig.rotation.x = -PHI; T.mastil.add(neckRig);
  { // diapasó de banús, bombat
    const rings = [];
    for (let k = 0; k <= 36; k++) {
      const ly = -FBL + FBL * k / 36, h = fbH(ly), r = [], hb = -h * h / 240;
      for (let j = 0; j <= 12; j++) { const x = h - 2 * h * j / 12; r.push([x, ly, -x * x / 240]); }
      r.push([-h + 0.5, ly, hb - 7.5], [-h * 0.5, ly, hb - 8], [h * 0.5, ly, hb - 8], [h - 0.5, ly, hb - 7.5]);
      rings.push(r);
    }
    add(neckRig, loft(rings), mFb, 'mastil');
  }
  { // cellet (nut)
    const pts = [[-23, -10], [23, -10]];
    for (let k = 0; k <= 14; k++) { const x = 23 - 46 * k / 14; pts.push([x, 2.2 - x * x / 240]); }
    add(neckRig, geo.ext(geo.shape(pts), 12).rotateX(PI / 2).translate(0, 12, 0), mNut, 'mastil');
  }
  { // mànec en D i taló gros que baixa fins al botó del fons
    const rings = [], Y0 = YB0 + 1092, Y1 = Yn + 6;
    for (let k = 0; k <= 44; k++) {
      const s = k / 44, y = Y0 + (Y1 - Y0) * Math.pow(s, 1.6);
      const ly = lyOf(y), h = fbH(ly);
      const zt = Zn + (Yn - y) * TPHI - (h * h / 240 + 8) / CPHI + 1.5;
      const q = Math.pow(1 - clamp((y - Y0) / 135), 1.8);
      const w = h - 1.2 + 13 * q;
      const zbS = zt - (42 + 10 * clamp((Yn - y) / 430));
      const zb = lerp(zbS, zBk(1092) + 2, q);
      const r = [];
      for (let j = 0; j <= 16; j++) { const a = PI * j / 16; r.push([w * Math.cos(a), y, zt - (zt - zb) * Math.pow(Math.sin(a), 0.8)]); }
      rings.push(r);
    }
    add(T.mastil, loft(rings), mNeck, 'mastil');
  }
  // claviller: escala del del violí (llarg 2,35x, fons 2,6x)
  { // galtes i fons (a = al llarg, d = fondària; extrusió lateral)
    const cheek = geo.shape([[9, 1.6], [165, 1.6], [179, -4.7], [190, -16.9], [200, -32.5], [207, -50.7], [210, -71.5], [141, -71.5], [70.5, -66.3], [28, -61.1], [9, -59.8]]);
    const bev = { bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2 };
    add(neckRig, cyc(geo.ext(cheek, 10.4, bev)).translate(21.6, 0, 0), mPegbox, 'clavillers');
    add(neckRig, cyc(geo.ext(cheek, 10.4, bev)).translate(-32, 0, 0), mPegbox, 'clavillers');
    add(neckRig, cyc(geo.ext(geo.shape([[9, -42.9], [94, -50.7], [209, -53.3], [209.6, -71.5], [141, -71.5], [70.5, -66.3], [28, -61.1], [9, -59.8]]), 44, bev)).translate(-22, 0, 0), mPegbox, 'clavillers');
  }
  const SC = [209, -23.4];
  { // voluta: espiral que es fa estreta cap a l'ull
    const R0 = 46.8, KS = 0.12, PH = 2.35 * TAU, Rf = p => R0 * Math.exp(-KS * p), rings = [];
    for (let k = 0; k <= 130; k++) {
      const p = PH * k / 130, a = -PI / 2 + p, ex = Math.cos(a), ey = Math.sin(a);
      const ro = Rf(p), ri = Math.max(1.3, Rf(p + TAU) + 0.8), hz = 34.3 - 16.1 * (p / PH), c = Math.min(4, (ro - ri) * 0.3);
      const q = [[ro, -hz + c], [ro, hz - c], [ro - c, hz], [ri + c, hz], [ri, hz - c], [ri, -hz + c], [ri + c, -hz], [ro - c, -hz]];
      rings.push(q.map(([r, z]) => [z, SC[0] + ex * r, SC[1] + ey * r]));
    }
    add(neckRig, loft(rings), mScroll, 'clavillers');
    add(neckRig, geo.cyl(8.3, 34, 'x', 24).translate(0, SC[0], SC[1]), mScroll, 'clavillers');
  }
  // clavilles mecàniques: corró dins el claviller, roda dentada i vis sens fi a fora, clau al darrere
  const DR = -26;
  const MACH = [{ a: 42, s: 1, xw: 9 }, { a: 70, s: -1, xw: -3 }, { a: 103, s: 1, xw: 3 }, { a: 134, s: -1, xw: -9 }];  // Sol, La, Re, Mi (des del cellet)
  const MACH_OF = [3, 1, 2, 0];                    // corda (Mi, La, Re, Sol) -> clavilla
  function gearShape(R, n, t) {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a0 = TAU * k / n, da = TAU / n;
      for (const [f, r] of [[0, R], [0.22, R + t], [0.5, R + t], [0.72, R]]) pts.push([r * Math.cos(a0 + da * f), r * Math.sin(a0 + da * f)]);
    }
    return geo.shape(pts);
  }
  for (const side of [1, -1]) {   // placa de llautó a cada galta, amb dues clavilles
    const own = MACH.filter(m => m.s === side), a0 = Math.min(...own.map(m => m.a)) - 22, a1 = Math.max(...own.map(m => m.a)) + 22;
    add(neckRig, cyc(geo.ext(geo.rrect(a0, a1, -48, -9, 8), 2.2, { bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1 })).translate(side > 0 ? 32 : -34.2, 0, 0), mMach, 'clavillers');
    for (const m of own) for (const da of [-14, 14]) add(neckRig, geo.cyl(2.2, 1.2, 'x', 12).translate(side * 34.6, m.a + da, -40), mScrew, 'clavillers');
  }
  for (const m of MACH) {
    const gl = m.s * 36.45, aw = m.a + 17.2;
    add(neckRig, geo.cyl(4.3, 64, 'x', 16).translate(0, m.a, DR), mMach, 'clavillers');                                   // corró
    add(neckRig, cyc(geo.ext(gearShape(12, 22, 1.8), 4.5, { bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 })).translate(m.s > 0 ? 34.2 : -38.7, m.a, DR), mMach, 'clavillers');   // roda dentada
    add(neckRig, geo.cyl(4.5, 2, 'x', 16).translate(m.s * 39.6, m.a, DR), mScrew, 'clavillers');
    add(neckRig, geo.cyl(3.2, 44, 'z', 16).translate(gl, aw, DR - 4), mMach, 'clavillers');                               // vis sens fi
    const hel = []; for (let k = 0; k <= 60; k++) { const th = k * 0.7; hel.push([gl + 3.5 * Math.cos(th), aw + 3.5 * Math.sin(th), DR + 17 - k * 0.7]); }
    add(neckRig, geo.curveTube(hel, 0.9, 120, 6), mMach, 'clavillers');
    for (const d of [DR + 20, DR - 28]) add(neckRig, geo.cyl(3.8, 6, 'x', 12).translate(m.s * 35.2, aw, d), mMach, 'clavillers');
    add(neckRig, geo.cyl(2.4, 50, 'z', 12).translate(gl, aw, DR - 51), mMach, 'clavillers');                             // eix
    add(neckRig, geo.cyl(4.4, 6, 'z', 16).translate(gl, aw, -100), mMach, 'clavillers');
    add(neckRig, new THREE.SphereGeometry(1, 24, 16).scale(4.4, 15, 21).translate(gl, aw, -121), mKey, 'clavillers');   // clau
  }

  /* ================= CORDAL i cable ================= */
  const vT0 = 30, vT1 = 312;
  const hwT = s => { let h = 24 + 32 * Math.pow(clamp(s), 1.1); if (s > 0.93) h *= Math.sqrt(Math.max(0.02, 1 - Math.pow((s - 0.93) / 0.07, 2))); if (s < 0.05) h *= Math.sqrt(Math.max(0.02, 1 - Math.pow((0.05 - s) / 0.05, 2))); return h; };
  const ycT = s => ZE + lerp(26, 112, s);
  const tailTop = (v, x) => { const s = clamp((v - vT0) / (vT1 - vT0)), h = hwT(s); return ycT(s) + 1 + 7 * Math.pow(clamp(1 - (x / h) * (x / h)), 0.25); };
  {
    const rings = [];
    for (let k = 0; k <= 34; k++) {
      const s = k / 34, v = lerp(vT0, vT1, s), h = hwT(s), yc = ycT(s), r = [];
      for (let j = 0; j < 20; j++) { const a = TAU * j / 20, c = Math.cos(a), sn = Math.sin(a); r.push([h * c, YB0 + v, yc + (sn >= 0 ? 1 + 7 * Math.pow(sn, 0.5) : 1 - 8 * Math.pow(-sn, 0.5))]); }
      rings.push(r);
    }
    add(T.cordes, loft(rings), mTail, 'cordes');
    add(T.cordes, geo.ext(geo.rrect(-47, 47, vT1 - 16, vT1 - 8, 2.5), 5, { bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2 }).translate(0, YB0, tailTop(vT1 - 12, 0) - 1.5), mTailFret, 'cordes');
    // cable d'acer: passa per sobre la cadireta i s'enganxa a la pica
    for (const sz of [-1, 1]) add(T.cordes, geo.curveTube([[sz * 13, YB0 + vT0 + 14, ycT(0.05) - 6], [sz * 12, YB0 + 10, ZE + 14.5], [sz * 11, YB0 - 1, ZE + 9], [sz * 10, YB0 - 6, ZE - 25], [sz * 10, YB0 - 13, 40], [sz * 12, YB0 - 18, 15], [sz * 18, YB0 - 20, 0], [sz * 12, YB0 - 20, -13], [sz * 3, YB0 - 20, -18]], 1.8, 60, 8), mWire, 'cordes');
  }

  /* ================= CORDES ================= */
  const XB = [-45, -15, 15, 45], XN = [-14.5, -4.8, 4.8, 14.5], XT = [-33, -11, 11, 33];
  const RS = [1.2, 1.0, 0.85, 0.7];
  const SEG = 150, RAD = 7;
  const UC = 110 / SLEN;                         // on frega l'arc (11 cm per sobre del pont)
  const strings = [], CONV = [], NB = [], BB = [], QB = [], DIRB = [], DIRP = [];
  const mb = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    const r = RS[i];
    const B = [XB[i], YBR, ZbT(XB[i]) + r * 0.5];
    const N = n2w(XN[i], 0.5, 2.2 - XN[i] * XN[i] / 240 + r);
    const g = tubeAB(B, N, r, SEG, RAD);
    const mesh = add(T.cordes, g, mWound, 'cordes', { cast: false, note: i });
    add(T.cordes, tubeAB(B, N, 6, 1, 6), mProxy, 'cordes', { cast: false, note: i });
    strings.push({ mesh, base: Float32Array.from(g.attributes.position.array), B, N, r, moved: false });
    // darrere el pont fins al cordal
    const Rr = [XT[i], YB0 + vT1 - 12, tailTop(vT1 - 12, XT[i]) + 3.5 + r];
    const H = [XT[i] * 0.97, YB0 + vT1 - 46, tailTop(vT1 - 46, XT[i]) - 0.5];
    add(T.cordes, tubeAB(B, Rr, r, 1, 6), mWound, 'cordes', { cast: false, pick: false });
    add(T.cordes, tubeAB(Rr, H, r, 1, 6), mWound, 'cordes', { cast: false, pick: false });
    add(T.cordes, geo.cyl(r + 0.6, 14, 'y', 10).translate(XT[i] * 0.985, YB0 + vT1 - 30, tailTop(vT1 - 30, XT[i]) + 1.6 + r), mSilk, 'cordes', { cast: false, pick: false });
    // del cellet al corró de la clavilla
    const m = MACH[MACH_OF[i]], Wp = n2w(m.xw, m.a - 2, DR + 6.5 + r);
    add(T.cordes, tubeAB(N, Wp, r, 1, 6), mWound, 'cordes', { cast: false, pick: false });
    add(neckRig, geo.cyl(6.4, 10, 'x', 16).translate(m.xw, m.a, DR), mWound, 'cordes', { cast: false, pick: false });
    // dades per a l'arc: contacte, normal (cap enfora) i direcció de l'arc
    const C = V3(lerp(B[0], N[0], UC), lerp(B[1], N[1], UC), lerp(B[2], N[2], UC));
    const d = V3(N[0] - B[0], N[1] - B[1], N[2] - B[2]).normalize();
    const beta = 1.15 * Math.atan(C.x / 100);
    const n0 = V3(Math.sin(beta), 0, Math.cos(beta));
    const nn = n0.clone().addScaledVector(d, -n0.dot(d)).normalize();
    const bb = V3().crossVectors(d, nn).normalize();
    const bz = V3().crossVectors(bb, nn);
    mb.makeBasis(bb, nn, bz);
    CONV.push(C); NB.push(nn); BB.push(bb); QB.push(new THREE.Quaternion().setFromRotationMatrix(mb));
    DIRB.push([bb.x, bb.y, bb.z]);
    const dp = bb.clone().multiplyScalar(0.92).addScaledVector(nn, 0.38).normalize();
    DIRP.push([dp.x, dp.y, dp.z]);
  }
  const strAt = (S, u) => [lerp(S.B[0], S.N[0], u), lerp(S.B[1], S.N[1], u), lerp(S.B[2], S.N[2], u)];
  const strDepth = (S, u) => { const p = strAt(S, u); return Math.max(0, (p[2] - (fbTopZ(p[0], p[1]) + S.r + 0.3)) * CPHI); };
  const fingerL = add(T.cordes, new THREE.SphereGeometry(1, 20, 14).scale(9, 13, 8), mFinger, 'cordes', { pick: false }); fingerL.visible = false;
  const fingerR = add(T.cordes, new THREE.SphereGeometry(1, 20, 14).scale(8, 30, 8), mFinger, 'cordes', { pick: false }); fingerR.visible = false;
  fingerL.position.set(...strAt(strings[1], 0.84)); fingerR.position.set(...strAt(strings[1], 0.22));   // amagats, però dins la caixa de mides

  /* ================= PICA ================= */
  add(T.pica, geo.lathe([[0, YB0 + 6], [19, YB0 + 6], [21, YB0 + 2], [22, YB0 - 4], [20, YB0 - 14], [16, YB0 - 26], [14, YB0 - 36], [0, YB0 - 36]], 40), mSock, 'pica');
  add(T.pica, geo.cyl(15.5, 6, 'y', 32).translate(0, YB0 - 34, 0), mPinCol, 'pica');
  add(T.pica, geo.cyl(3, 22, 'x', 12).translate(14, YB0 - 22, 0), mPinCol, 'pica');
  add(T.pica, new THREE.SphereGeometry(1, 20, 12).scale(4, 10, 12).translate(27, YB0 - 22, 0), mPinCol, 'pica');
  add(T.pica, geo.cyl(5, YB0 - 38 - 30, 'y', 20).translate(0, (YB0 - 38 + 30) / 2, 0), mRod, 'pica');
  add(T.pica, geo.cyl(0.3, 30, 'y', 20, 5).translate(0, 15, 0), mRod, 'pica');

  /* ================= ARC (francès, ~70 cm) ================= */
  const bowRig = new THREE.Group(); T.arc.add(bowRig);
  {
    const yS = x => 13 + 11 * Math.pow((x - 30) / 400, 2);
    const rS = x => 5.4 - 1.9 * clamp((x + 250) / 580);
    const sp = []; for (let x = -352; x <= 340.1; x += 12) sp.push([x, yS(x), 0]);
    add(bowRig, taperTube(sp, P => rS(P.x), 170, 12), mStick, 'arc');
    const sub = (x0, x1) => { const o = []; for (let k = 0; k <= 8; k++) { const x = lerp(x0, x1, k / 8); o.push([x, yS(x), 0]); } return o; };
    add(bowRig, taperTube(sub(-284, -268), P => rS(P.x) + 0.9, 16, 12), mLeather, 'arc');
    add(bowRig, taperTube(sub(-268, -214), P => rS(P.x) + 0.45, 40, 12), mSilver, 'arc');
    // nou (frog) de banús amb ulls de nacre
    add(bowRig, geo.ext(geo.shape([[-290, 15], [-290, 9], [-294, 3], [-300, -1], [-307, -5], [-325, -11], [-343, -10.5], [-352, -4], [-355, 6], [-354, 15]]), 17, { bevelThickness: 1.4, bevelSize: 1.2, bevelSegments: 2 }).translate(0, 0, -8.5), mFrog, 'arc');
    add(bowRig, geo.box(-303, -293, -3.2, 3.6, -9.6, 9.6), mSilver, 'arc');
    add(bowRig, geo.box(-355.5, -336, -11.8, -10.4, -7, 7), mSilver, 'arc');
    for (const sz of [-1, 1]) add(bowRig, geo.cyl(3.2, 0.7, 'z', 24).translate(-322, 4, sz * 10), mPearl, 'arc');
    const yb = yS(-362);
    add(bowRig, geo.cyl(5.4, 18, 'x', 24).translate(-362, yb, 0), mFrog, 'arc');
    for (const x of [-354, -370]) add(bowRig, geo.cyl(5.6, 2, 'x', 24).translate(x, yb, 0), mSilver, 'arc');
    add(bowRig, geo.cyl(3.6, 1.2, 'x', 20).translate(-371.6, yb, 0), mSilver, 'arc');
    // punta amb placa blanca
    add(bowRig, geo.ext(geo.shape([[324, 14], [334, 19.5], [346, 23], [354, 22], [358.5, 16], [359.5, 7], [357.5, -1.4], [341, -1.4], [333, 2.5], [327, 7.5]]), 8, { bevelThickness: 1, bevelSize: 0.8, bevelSegments: 2 }).translate(0, 0, -4), mStick, 'arc');
    add(bowRig, geo.box(357.6, 360.6, -1.8, 14, -4.4, 4.4), mTipPlate, 'arc');
    // cerres
    add(bowRig, geo.box(-297, 357, -0.9, 0, -7, 7), mHair, 'arc', { cast: false });
  }
  const tv1 = V3(), tv2 = V3(), tv3 = V3();
  function bowPose(sf, bowX, lift, outP, outQ) {
    const i0 = Math.min(3, Math.max(0, Math.floor(sf))), i1 = Math.min(3, i0 + 1), fr = clamp(sf - i0);
    const c = tv1.lerpVectors(CONV[i0], CONV[i1], fr);
    const n = tv2.lerpVectors(NB[i0], NB[i1], fr).normalize();
    const b = tv3.lerpVectors(BB[i0], BB[i1], fr).normalize();
    outP.copy(c).addScaledVector(n, lerp(RS[i0], RS[i1], fr) + lift + 0.9).addScaledVector(b, -bowX);
    outQ.slerpQuaternions(QB[i0], QB[i1], fr);
  }
  const pPlay = V3(), qPlay = new THREE.Quaternion();
  bowPose(1, 30, 4, pPlay, qPlay);
  bowRig.position.copy(pPlay); bowRig.quaternion.copy(qPlay);
  const arcLabel = V3(-150, 20, 0).applyQuaternion(qPlay).add(pPlay);
  // repòs (pizzicato): l'arc penja a la mà dreta, al costat de la caixa
  const pRest = V3(-430, 640, 170), qRest = new THREE.Quaternion();
  {
    const bx = V3(Math.sin(0.12), -Math.cos(0.12), 0), ny = V3(0, 0, 1), bz = V3().crossVectors(bx, ny);
    qRest.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, ny, bz));
  }

  /* ================= notes ================= */
  const notes = [
    { label: 'Mi', f: 41.20, str: 0, ratio: 1 },
    { label: 'La', f: 55.00, str: 1, ratio: 1 },
    { label: 'Re', f: 73.42, str: 2, ratio: 1 },
    { label: 'Sol', f: 98.00, str: 3, ratio: 1 },
    { label: 'Do', f: 65.41, str: 1, ratio: 55 / 65.41, dit: true },
    { label: 'Fa', f: 87.31, str: 2, ratio: 73.42 / 87.31, dit: true }
  ];
  const isPizz = o => o === 1 || o === 'Pizzicato' || (typeof o === 'string' && o.toLowerCase().indexOf('pizz') === 0) || (o && typeof o === 'object' && (o.label === 'Pizzicato' || o.index === 1));
  // ressonància de la caixa + caiguda dels aguts (els altaveus petits no fan sonar la fonamental)
  const bodyGain = fr => { const l1 = Math.log2(fr / 180), l2 = Math.log2(fr / 700); return (0.5 + 0.6 * Math.exp(-l1 * l1 / 0.6) + 0.35 * Math.exp(-l2 * l2 / 0.5)) / (1 + Math.pow(fr / 2200, 2)); };
  const WK = [0, 0.3, 1.0, 0.95, 0.82, 0.7];
  const wk = k => (k <= 5 ? WK[k] : 0.7 * Math.pow(5 / k, 0.8));
  const WP = [0, 0.55, 1.0, 0.95, 0.8, 0.65];
  const wpz = k => (k <= 5 ? WP[k] : 0.65 * Math.pow(5 / k, 1.3));

  /* ================= estat d'animació ================= */
  const st = { kb: 1, bowX: 30, bowPh: 0, lift: 4, sf: 1, press: 0, curPizz: false, fing: null, topMoved: false };
  const K = 10, Tk = new Float32Array(K + 1), Ck = new Float32Array(K + 1);
  const tmpP = V3(), tmpQ = new THREE.Quaternion();
  const fCenters = FH.map(h => V3(h.center[0], YB0 + h.center[1], topZ(h.center[0], h.center[1]) + 1));
  const ZAX = V3(0, 0, 1), wp = V3(), wd = V3();

  /* ================= càmeres ================= */
  const camAt = (p, off) => { const t = tw(p); return { pos: [t[0] + off[0], t[1] + off[1], t[2] + off[2]], target: t }; };
  const cam = {
    explore: camAt([0, 960, 30], [1750, 650, 3900]),
    exploded: camAt([120, 1180, 80], [2500, 900, 5000])
  };
  const lab = p => tw(p);
  const fT = FH[0].center;

  return {
    id: 'contrabaix',
    family: 'Corda fregada',
    name: 'Contrabaix',
    intro: "El contrabaix és l'instrument de corda fregada més greu de l'orquestra. Es toca amb arc o pinçant les cordes amb els dits (pizzicato), que és com es toca gairebé sempre en el jazz.",
    floorY: 0,
    camera: cam,
    parts: {
      tapa: { name: 'Tapa', text: "És la fusta de davant, d'avet, lleugera i forta. Vibra amb el pont i empeny l'aire.", dato: "No és plana: fa una corba suau, com una volta d'uns 2 o 3 cm." },
      cos: { name: 'Fons i costats', text: "El fons i els costats (els aros) fan una caixa buida molt gran. El fons és pla i, a dalt, es doblega cap endavant.", dato: "Com que el fons és pla, per dins porta unes barres travessades que el reforcen." },
      forats: { name: 'Forats en f', text: "Són dos forats amb forma de lletra f. Per aquí entra i surt l'aire de dins de la caixa.", dato: 'Cada forat del contrabaix fa més de 20 cm de llarg.' },
      pont: { name: 'Pont', text: "És una peça d'auró, molt alta, que aguanta les cordes i passa la vibració a la tapa. No està enganxat: l'aguanta la pressió de les cordes.", dato: 'Fa uns 16 cm. Molts tenen unes rodetes a les cames per pujar-lo o baixar-lo.' },
      anima: { name: 'Ànima', text: "És un bastonet de fusta dins la caixa, entre la tapa i el fons, sota el peu agut del pont. No està enganxat: només està pressionat.", dato: "Si l'ànima es mou uns mil·límetres, el so canvia." },
      barra: { name: 'Barra harmònica', text: "És un llistó de fusta enganxat sota la tapa, al costat de les cordes greus. Fa la tapa més forta i l'ajuda a vibrar sencera.", dato: 'Fa més de mig metre de llarg.' },
      mastil: { name: 'Mànec i diapasó', text: "El diapasó és de banús, una fusta negra i dura. Allà la mà esquerra prem les cordes per canviar de nota.", dato: "No té trasts: cal trobar el lloc de cada nota d'oïda." },
      clavillers: { name: 'Claviller i clavilles', text: "Les cordes s'enrotllen en unes clavilles mecàniques, de metall i amb engranatges. Girant la clau, la corda es tensa o s'afluixa i s'afina.", dato: "Amb l'engranatge, poca força a la clau tensa molt la corda. La voluta de dalt de tot només és un adorn." },
      cordes: { name: 'Cordes i cordal', text: "N'hi ha quatre: Mi, La, Re i Sol. S'afinen per quartes, i no per quintes com el violí, la viola i el violoncel.", dato: "La part que vibra fa més d'un metre: unes tres vegades la del violí." },
      arc: { name: 'Arc', text: "Les cerres són de cua de cavall. S'hi posa colofònia, una resina, perquè enganxin a la corda i la facin vibrar.", dato: "Fa uns 70 cm: és més curt i més gruixut que l'arc del violí." },
      pica: { name: 'Pica', text: "És una vareta de metall que surt de sota i es clava a terra. Aguanta el contrabaix i es pot allargar o escurçar.", dato: 'Amb la pica a la mida justa, es pot tocar dret o assegut en un tamboret alt.' }
    },
    labels: [
      { part: 'tapa', group: 'tapa', at: lab([-190, YB0 + 240, topZ(-190, 240) + 0.5]), internal: false },
      { part: 'cos', group: 'cos', at: lab([W(270) + 1, YB0 + 270, -20]), internal: false },
      { part: 'forats', group: 'tapa', at: lab([fCenters[0].x, fCenters[0].y, fCenters[0].z]), internal: false },
      { part: 'pont', group: 'pont', at: lab([0, YBR, Zb0 + 140]), internal: false },
      { part: 'anima', group: 'interior', at: lab([XP, YB0 + VP, 0]), internal: true },
      { part: 'barra', group: 'interior', at: lab([XBAR, YB0 + 640, topZ(XBAR, 640) - 20]), internal: true },
      { part: 'mastil', group: 'mastil', at: lab([0, 1300, fbTopZ(0, 1300) + 0.5]), internal: false },
      { part: 'clavillers', group: 'mastil', at: lab(n2w(39, 103, DR)), internal: false },
      { part: 'cordes', group: 'cordes', at: lab(strAt(strings[1], 0.42)), internal: false },
      { part: 'arc', group: 'arc', at: lab([arcLabel.x, arcLabel.y, arcLabel.z]), internal: false },
      { part: 'pica', group: 'pica', at: lab([0, 120, 0]), internal: false }
    ],
    explode: {
      arc: [-420, 200, 420, 0],
      cordes: [0, 60, 330, 0.05],
      pont: [0, 20, 230, 0.1],
      tapa: [0, 0, 150, 0.16],
      interior: [560, 60, 120, 0.22],
      mastil: [0, 380, -20, 0.27],
      pica: [-300, 40, 80, 0.3],
      cos: [0, 0, -140, 0.33]
    },
    notes,
    options: { label: 'Tècnica', items: ['Arc', 'Pizzicato'] },
    chain: ['Arc', 'Corda', 'Pont', 'Tapa', 'Aire'],
    tour: [
      { part: 'arc', chain: 0, title: "L'arc", text: "Les cerres, amb colofònia, enganxen la corda i l'estiren. La corda rellisca, torna enrere i l'arc la torna a agafar. Això passa moltes vegades per segon i la corda no para de vibrar.", cam: camAt([0, YBR + 110, 268], [-620, 260, 760]), slow: 0.5, xray: false },
      { part: 'cordes', chain: 1, title: 'La corda', text: "Les cordes són molt llargues i gruixudes: per això vibren a poc a poc i fan notes molt greus. Si premem la corda amb un dit, la part que vibra és més curta i la nota puja.", cam: camAt(strAt(strings[1], 0.42), [650, -150, 820]), slow: 0.35, xray: false, note: 4 },
      { part: 'pont', chain: 2, title: 'El pont', text: "El pont és molt alt. La corda el fa balancejar d'un costat a l'altre, i el pont passa aquest moviment a la tapa.", cam: camAt([0, YBR, Zb0 + 80], [380, 160, 560]), slow: 0.4, xray: false },
      { part: 'anima', chain: 3, title: "L'ànima i la tapa", text: "Dins la caixa, l'ànima aguanta un peu del pont. Sota l'altre peu hi ha la barra harmònica. Així el pont fa vibrar tota la tapa, que és molt gran i mou molt d'aire.", cam: camAt([10, YBR - 20, 0], [760, 260, 900]), slow: 0.5, xray: true },
      { part: 'forats', chain: 4, title: 'Els forats en f', text: "La tapa i el fons empenyen l'aire de dins de la caixa. L'aire entra i surt pels forats en f, i el so arriba fins a les nostres orelles.", cam: camAt([fT[0], YB0 + fT[1], topZ(fT[0], fT[1])], [260, 160, 820]), slow: 0.6, xray: false }
    ],
    soundSource: { group: 'tapa', at: lab([0, YBR, Zb0 + 10]) },

    play(note, opt) {
      const n = typeof note === 'number' ? (notes[note] || notes[1]) : (note || notes[1]);
      const f = n.f, pz = isPizz(opt), rho = n.ratio || 1;
      st.curPizz = pz;
      if (rho < 0.999 && strings[n.str]) st.fing = { si: n.str, uf: rho, depth: strDepth(strings[n.str], rho) };
      try {
        if (pz) {
          // pizzicato de jazz: rodó, amb els harmònics 2–5 forts i un cop sord de la caixa
          const xp = clamp(0.22 / rho, 0.06, 0.45), parts = [];
          for (let k = 1; k <= 16; k++) {
            if (k * f > 3500) break;
            parts.push({ k, a: Math.max(0.15, Math.abs(Math.sin(k * PI * xp))) * wpz(k) * bodyGain(k * f), tau: 2.2 / (1 + 0.45 * (k - 1)) });
          }
          synth.additive({ f, partials: parts, attack: 0.004, noise: { amount: 0.06, dur: 0.04, lp: 900, hp: 120 }, gain: 0.95 });
          synth.additive({ f: 110, partials: [{ k: 1, a: 1, tau: 0.09 }, { k: 1.6, a: 0.6, tau: 0.06 }, { k: 2.5, a: 0.35, tau: 0.04 }, { k: 3.7, a: 0.2, tau: 0.03 }], attack: 0.002, noise: { amount: 0.35, dur: 0.05, lp: 450, hp: 50 }, gain: 0.3 });
        } else {
          const parts = [];
          for (let k = 1; k <= 30; k++) { if (k * f > 4500) break; parts.push({ k, a: wk(k) * bodyGain(k * f), tau: 4 }); }
          synth.additive({ f, partials: parts, attack: 0.12, hold: 1.4, release: 0.45, vibrato: { rate: 4.8, depth: 8 }, noise: { amount: 0.04, dur: 1.9, hp: 900, lp: 5000 }, gain: 0.85 });
        }
      } catch (e) { /* sense àudio */ }
      return pz ? { attack: 0.005, hold: 0, release: 1.7 } : { attack: 0.12, hold: 1.4, release: 0.45 };
    },

    update(dt, s) {
      dt = Math.min(Math.max(dt || 0, 0), 0.05);
      const env = s.env || 0;
      const nObj = (typeof s.noteIndex === 'number' && notes[s.noteIndex]) ? notes[s.noteIndex] : (s.note && typeof s.note === 'object' && s.note.str !== undefined ? s.note : null);
      const si = nObj ? nObj.str : 1;
      const optP = isPizz(s.opt);
      const on = !!nObj && env > 0.002;
      const pz = on ? st.curPizz : optP;
      const t = s.t || 0, fv = s.fvis || 0.6, wt = TAU * fv * t;
      const rho = nObj ? nObj.ratio : 1;

      /* ---- coeficients de la corda i força al pont ---- */
      let F = 0, xp = 0.22;
      if (pz) {
        xp = clamp(0.22 / rho, 0.06, 0.45);
        const nn = 2 / (PI * PI * xp * (1 - xp)); let nrm = 0;
        for (let k = 1; k <= K; k++) {
          Ck[k] = nn * Math.sin(k * PI * xp) / (k * k);
          Tk[k] = Math.cos(k * wt) * Math.exp(-t * (0.1 + 0.09 * k));
          const c = Math.sin(k * PI * xp) / k; F += c * Tk[k]; nrm += Math.abs(c);
        }
        F = clamp(1.6 * F / (nrm || 1), -1, 1);
      } else {
        for (let k = 1; k <= K; k++) { Ck[k] = 1 / (k * k * 1.2337); Tk[k] = Math.sin(k * wt); }
        for (let k = 1; k <= 6; k++) F += Math.sin(k * wt) / k;
        F = clamp(F / 1.7, -1, 1);
      }

      /* ---- corda que vibra (suma de modes), gran i lenta ---- */
      const fingered = on && rho < 0.999;
      st.press += ((fingered ? 1 : 0) - st.press) * Math.min(1, dt * 12);
      const amp = (pz ? 10 : 7) * env;
      const dir = pz ? DIRP[si] : DIRB[si];
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
          const dx = d * dir[0], dy = d * dir[1] - dp * NFB.y, dz = d * dir[2] - dp * NFB.z;
          for (let j = 0; j <= RAD; j++) { const id = (r * (RAD + 1) + j) * 3; arr[id] = b[id] + dx; arr[id + 1] = b[id + 1] + dy; arr[id + 2] = b[id + 2] + dz; }
        }
        S.mesh.geometry.attributes.position.needsUpdate = true; S.moved = true;
      }
      // dit de la mà esquerra (notes trepitjades)
      if (fing && st.press > 0.05) {
        const S = strings[fing.si], p = strAt(S, fing.uf), k = S.r + 7 - fing.depth * st.press;
        fingerL.visible = true;
        fingerL.position.set(p[0] + NFB.x * k, p[1] + NFB.y * k, p[2] + NFB.z * k);
      } else fingerL.visible = false;
      // dit de la mà dreta (pizzicato): estira la corda de costat i la deixa anar
      if (on && pz && t < 0.8) {
        const S = strings[si], p = strAt(S, xp * rho), k = t / 0.8, a = 10 + S.r + 8 + 70 * k, n = NB[si], up = 2 + 25 * k;
        fingerR.visible = true;
        fingerR.position.set(p[0] + DIRP[si][0] * a + n.x * up, p[1] + DIRP[si][1] * a + n.y * up, p[2] + DIRP[si][2] * a + n.z * up);
      } else fingerR.visible = false;

      /* ---- tapa: vibració + mapa de calor ---- */
      if (env > 0.002) {
        const A = 7 * env * F, pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array;
        for (let i = 0; i < nTop; i++) { const d = topShp[i] * A; pa[i * 3 + 2] = topBaseZ[i] + d; if (s.heat) heat.color(clamp(d / 5, -1, 1), ca, i); }
        topGeo.attributes.position.needsUpdate = true;
        if (s.heat) topGeo.attributes.color.needsUpdate = true;
        topGeo.computeVertexNormals();
        for (const R of rims) { const p = R.g.attributes.position.array; for (let i = 0; i < R.n; i++) p[i * 3 + 2] = R.base[i * 3 + 2] + R.shp[i] * A; R.g.attributes.position.needsUpdate = true; }
        st.topMoved = true;
      } else if (st.topMoved) {
        const pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array;
        for (let i = 0; i < nTop; i++) pa[i * 3 + 2] = topBaseZ[i];
        ca.fill(0);
        topGeo.attributes.position.needsUpdate = true; topGeo.attributes.color.needsUpdate = true;
        topGeo.attributes.normal.array.set(topBaseN); topGeo.attributes.normal.needsUpdate = true;
        for (const R of rims) { R.g.attributes.position.array.set(R.base); R.g.attributes.position.needsUpdate = true; }
        st.topMoved = false;
      }

      /* ---- el pont balanceja sobre el peu agut ---- */
      bridgePivot.rotation.y = 0.022 * env * F;

      /* ---- aire pels forats en f ---- */
      if (env > 0.03) {
        T.tapa.updateWorldMatrix(true, false);
        wd.copy(ZAX).transformDirection(T.tapa.matrixWorld);
        const rate = env * (220 + 420 * Math.max(0, F));
        for (const c of fCenters) { wp.copy(c); T.tapa.localToWorld(wp); fx.air(wp.clone(), wd.clone(), rate, 0.5, 210); }
      }

      /* ---- arc ---- */
      st.kb += ((optP ? 0 : 1) - st.kb) * Math.min(1, dt * 2.4);
      const playing = !optP && on && !st.curPizz;
      if (playing) st.bowPh += dt * 0.95 * Math.min(1, env * 2.5);
      st.bowX = 30 + 220 * Math.sin(st.bowPh);
      st.lift += ((playing ? 0 : 4) - st.lift) * Math.min(1, dt * 8);
      st.sf += (si - st.sf) * Math.min(1, dt * 6);
      bowPose(st.sf, st.bowX, st.lift, tmpP, tmpQ);
      const k = smooth(clamp(st.kb));
      bowRig.position.lerpVectors(pRest, tmpP, k);
      bowRig.position.z += 250 * Math.sin(PI * k);
      bowRig.quaternion.slerpQuaternions(qRest, tmpQ, k);
    }
  };
}
