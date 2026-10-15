// Violoncel — mòdul d'instrument (corda fregada)
// Unitats: mm. Y amunt al món.
// Es construeix en un marc "local" com el del violí (llarg en X, tapa cap a +Y, corda Do a +Z)
// i cada grup del motor té un fill "rig" que el posa dret, com es toca: mànec amunt, pica avall
// tocant a terra i una mica inclinat enrere. Local X -> món Y, local Y (tapa) -> món Z (davant),
// local Z -> món X (Do a la dreta del públic, La a l'esquerra, on hi ha la mà de l'arc).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const ds = m => { m.side = THREE.DoubleSide; return m; };

  const G = groups(['arc', 'cordes', 'pont', 'tapa', 'interior', 'mastil', 'cos', 'pica']);

  /* ================= posició dreta (local -> món) ================= */
  const TILT = 0.29;                                 // ≈17° enrere, cap al músic
  const XF = new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0, 0, 1), V3(1, 0, 0));
  XF.premultiply(new THREE.Matrix4().makeRotationX(-TILT));
  const XQ = new THREE.Quaternion().setFromRotationMatrix(XF);
  const R = {};
  for (const k in G) { const r = new THREE.Group(); r.quaternion.copy(XQ); G[k].add(r); R[k] = r; }
  const toW = p => { const v = V3(p[0], p[1], p[2]).applyMatrix4(XF); return [v.x, v.y, v.z]; };
  const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

  /* ================= silueta del cos (paramètrica) ================= */
  const L = 755, X0 = -L / 2, SC0 = L / 356;           // 755 mm de cos; x = X0 + u
  const crv = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
  function spl(P, n) {
    const o = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
      for (let s = 0; s < n; s++) { const t = s / n; o.push([crv(a[0], b[0], c[0], d[0], t), crv(a[1], b[1], c[1], d[1], t)]); }
    }
    return o;
  }
  // mateix dibuix que el violí, escalat: panxa inferior 440, cintura C 235, panxa superior 345
  const segLow = [[0, 0], [1.2, 20], [6, 44], [17, 68], [35, 88], [60, 100], [92, 104], [118, 100], [136, 91], [146, 83]];
  const segC = [[146, 83], [149, 72], [156, 63], [168, 57.5], [185, 55.4], [202, 56.4], [214, 60.5], [222, 66], [227, 73], [229, 79]];
  const segUp = [[229, 79], [236, 80.5], [250, 82.8], [268, 84], [288, 82.5], [308, 76], [325, 65], [339, 50], [349, 32], [354, 15], [356, 0]];
  const sc = P => P.map(p => [p[0] * SC0, p[1] * SC0 * (1 - 0.034 * clamp((p[0] - 229) / 40))]);
  const HW = [...spl(sc(segLow), 8), ...spl(sc(segC), 8), ...spl(sc(segUp), 8), [L, 0]];
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
  const extY = (shape, y0, d, bev) => geo.ext(shape, d, bev).rotateX(-PI / 2).translate(0, y0, 0);

  /* ================= alçades: aros de 120 mm, tapa i fons bombats ================= */
  const RIB = 120, PL = 4.5;                       // alçada dels aros, gruix de les vores
  const TOPE = RIB + 0.2 + PL, AT = 24, AB = 23;   // tapa a la vora; volta d'uns 24 mm
  const longF = u => Math.pow(Math.max(0, Math.sin(PI * clamp(u / L))), 0.55);
  const crossH = a => Math.pow((1 + Math.cos(PI * clamp(Math.abs(a)))) / 2, 0.75);
  function archF(x, z) { const u = x - X0, w = W(u); if (w < 0.01) return 0; return longF(u) * crossH(z / w); }
  const topY = (x, z) => TOPE + AT * archF(x, z);
  const backY = (x, z) => -0.4 - PL - AB * archF(x, z);

  /* ================= posicions clau ================= */
  const XB = -22.5;                            // pont: 400 mm des de la vora de dalt del cos
  const YT = topY(XB, 0);
  const BH = 88;                               // alçada del pont
  const bridgeTopY = z => YT + BH - z * z / 66 + 0.06 * z;   // costat de Do més alt
  const ZBAR = 30;                             // barra harmònica sota el peu greu (+Z)
  const XP = XB - 15, ZP = -33;                // ànima: darrere el peu agut (La)
  const FBR = 120;                             // corba del diapasó
  const FB_EDGE = 164;                         // diapasó a la vora del cos
  const TT = (YT + 80 - FB_EDGE) / (-X0 - XB); // pendent del mànec
  const TH = Math.atan(TT), CT = Math.cos(TH), STH = Math.sin(TH);
  let NX0 = XB + 680, NY0 = 0;
  for (let it = 0; it < 6; it++) {            // cellet a 690 mm del pont (llargada de corda)
    NY0 = FB_EDGE - (NX0 + X0) * TT;
    const dx = NX0 - XB, dy = bridgeTopY(7.8) - (NY0 + 1.2), d = Math.hypot(dx, dy);
    NX0 += (690 - d) * dx / d;
  }
  NY0 = FB_EDGE - (NX0 + X0) * TT;
  const n2w = (lx, ly, lz) => [NX0 + lx * CT + ly * STH, NY0 - lx * STH + ly * CT, lz];
  const fbTopY = (x, z) => NY0 + (NX0 - x) * TT - z * z / FBR;

  /* ================= forats en f ================= */
  const FS = 1.75;                              // ~12,5 cm de llarg
  function fHole(sign) {
    const cx = XB + 2, cz = 76;
    const Le = [cx - 35 * FS, cz + 13 * FS], Ue = [cx + 35 * FS, cz - 13 * FS], rL = 4.4 * FS, rU = 3.7 * FS;
    const dx = Ue[0] - Le[0], dz = Ue[1] - Le[1], len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len, px = -tz, pz = tx;
    const cAt = t => { const o = 4.5 * FS * Math.sin(TAU * t); return [Le[0] + dx * t + px * o, Le[1] + dz * t + pz * o]; };
    const hw = t => FS * (0.7 + 1.55 * Math.pow(Math.sin(PI * t), 0.8) + 1.0 * Math.exp(-Math.pow((t - 0.5) / 0.022, 2)));
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
    const poly = [...left, ...arc(Ue, rU, left[left.length - 1], right[right.length - 1], [tx, tz], 15),
      ...right.slice().reverse(), ...arc(Le, rL, right[0], left[0], [-tx, -tz], 15)];
    const P = poly.map(p => [p[0], p[1] * sign]);
    const c = cAt(0.5);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    return { poly: P, center: [c[0], c[1] * sign], bb: [x0 - 5, x1 + 5, z0 - 5, z1 + 5] };
  }
  const FH = [fHole(1), fHole(-1)];
  const inBB = (h, x, z) => x > h.bb[0] && x < h.bb[1] && z > h.bb[2] && z < h.bb[3];

  /* ================= malla de placa (tapa deformable / fons) ================= */
  // files en u: més denses als extrems (contorn rodó) i on hi ha els forats en f
  function rowsU(step, fine, fx0, fx1) {
    const U = [0]; let u = 0;
    while (u < L) {
      const x = X0 + u, inF = fine > 0 && x > fx0 - 12 && x < fx1 + 12;
      const h = Math.min(inF ? fine : step, 1.6 + u / 5, 1.6 + (L - u) / 5);
      u = Math.min(L, u + h); U.push(u);
    }
    return U;
  }
  function plateGrid(U, NZg, yFn, holes) {
    const NXg = U.length - 1;
    const nv = (NXg + 1) * (NZg + 1), X = new Float32Array(nv), Z = new Float32Array(nv), ok = new Uint8Array(nv);
    const S = NZg + 1;
    for (let i = 0; i <= NXg; i++) {
      const u = U[i], x = X0 + u, w = W(u);
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
          if (q[2] < 3.2) mv.push([id, q[0], q[1]]);
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
      uv.push((X[id] - X0) / L, (Z[id] + 230) / 460);
    }
    const idx = [];
    for (let i = 0; i < NXg; i++) for (let j = 0; j < NZg; j++) {
      const a = map[i * S + j], b = map[(i + 1) * S + j], c = map[(i + 1) * S + j + 1], d = map[i * S + j + 1];
      const ids = [i * S + j, (i + 1) * S + j, (i + 1) * S + j + 1, i * S + j + 1];
      const tri = (p, q, r, vp, vq, vr) => {   // no tapa els forats: treu els triangles que hi cauen a dins
        if (holes) {
          const cx = (X[p] + X[q] + X[r]) / 3, cz = (Z[p] + Z[q] + Z[r]) / 3;
          for (const h of holes) if (inBB(h, cx, cz) && inPoly(h.poly, cx, cz)) return;
        }
        idx.push(vp, vq, vr);
      };
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { tri(ids[0], ids[3], ids[1], a, d, b); tri(ids[1], ids[3], ids[2], b, d, c); }
      else {
        const q = [0, 1, 2, 3].filter(k => [a, b, c, d][k] >= 0);
        if (q.length === 3) { const v = [a, b, c, d]; tri(ids[q[0]], ids[q[2]], ids[q[1]], v[q[0]], v[q[2]], v[q[1]]); }
      }
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

  /* ================= materials ================= */
  const VARN = 0xB05E28;                                   // vernís ambre-marró
  const mTop = ds(M.wood('tapa', tex.spruce(1, 2), { color: 0xD07F38, xray: true }));
  const mTopEdge = M.wood('tapa', tex.spruce(1 / 500, 1 / 500), { color: 0xBE7031, xray: true });
  const mPurf = mat('tapa', { color: 0x1c140e, roughness: 0.5 }, { phys: false, xray: true });
  const mSaddle = M.ebony('tapa');
  const mRim = ds(mat('forats', { color: 0x170e08, roughness: 0.85 }, { phys: false, xray: true }));
  const mBack = ds(M.wood('cos', tex.maple(1, 1.5), { color: VARN, xray: true }));
  const mBackEdge = M.wood('cos', tex.maple(1 / 500, 1 / 500), { color: VARN, xray: true });
  const mRib = M.wood('cos', tex.maple(1 / 320, 1 / 130), { color: VARN, xray: true });
  const mBlock = M.rawWood('cos', tex.spruce(1 / 120, 1 / 120), { color: 0xE9CF9F, xray: true });
  const mPurfB = mat('cos', { color: 0x1c140e, roughness: 0.5 }, { phys: false, xray: true });
  const mPost = M.rawWood('anima', tex.spruce(1 / 60, 1 / 60), { color: 0xEFD8AA });
  const mBar = M.rawWood('barra', tex.spruce(1 / 400, 1 / 60), { color: 0xE8CC98 });
  const mBridge = M.rawWood('pont', tex.maple(1 / 60, 1 / 60), { color: 0xF3DDB2 });
  const mTail = ds(M.ebony('cordes')), mFine = M.nickel('cordes'), mGut = M.plastic('cordes', 0x262626);
  const mWound = M.string('cordes', true), mFinger = M.plastic('cordes', 0xE5AC8A);
  const mNeck = ds(M.wood('mastil', tex.maple(3, 1), { color: VARN }));
  const mHeel = M.wood('mastil', tex.maple(1 / 160, 1 / 160), { color: VARN });
  const mFb = ds(M.ebony('mastil')), mNut = M.ebony('mastil');
  const mScroll = ds(M.wood('voluta', tex.maple(5, 1), { color: VARN }));
  const mPegbox = M.wood('voluta', tex.maple(1 / 130, 1 / 130), { color: VARN });
  const mPeg = M.ebony('voluta'), mPegBead = M.bone('voluta');
  const mStick = M.wood('arc', tex.mahogany(10, 1), { color: 0x8E3E22 });
  const mFrog = M.ebony('arc'), mSilver = M.silver('arc'), mTipPlate = M.bone('arc');
  const mPearl = mat('arc', { color: 0xF2F5F7, roughness: 0.15, metalness: 0.1, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.3 });
  const mHair = mat('arc', { color: 0xF4F0E4, roughness: 0.85 }, { phys: false });
  const mLeather = mat('arc', { color: 0x3b2617, roughness: 0.9 }, { phys: false });
  const mCollar = M.ebony('pica'), mRod = M.chrome('pica'), mScrew = M.nickel('pica');
  const mRubber = mat('pica', { color: 0x1b1b1b, roughness: 0.95 }, { phys: false });
  const mProxy = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

  /* ================= TAPA ================= */
  const FX0 = Math.min(FH[0].bb[0], FH[1].bb[0]), FX1 = Math.max(FH[0].bb[1], FH[1].bb[1]);
  const topGeo = plateGrid(rowsU(7.2, 2.6, FX0, FX1), 70, topY, FH);
  const nTop = topGeo.attributes.position.count;
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nTop * 3), 3));
  const topMesh = add(R.tapa, topGeo, mTop, 'tapa');
  heat.overlay(topMesh);
  // forma de vibració: es mou més pel costat greu (barra, +Z) i gairebé gens a sobre l'ànima
  function shpFn(x, z) {
    const u = x - X0, w = W(u); if (w < 0.5) return 0;
    const v = clamp(z / w, -1, 1);
    const bell = Math.exp(-Math.pow((u - 0.47 * L) / (0.315 * L), 2));
    const side = 0.78 + 0.32 * v;
    const post = 1 - 0.75 * Math.exp(-((x - XP) * (x - XP) + (z - ZP) * (z - ZP)) / (46 * 46));
    return (1 - v * v) * bell * side * post * longF(u);
  }
  const topBaseY = new Float32Array(nTop), topShp = new Float32Array(nTop);
  {
    const p = topGeo.attributes.position.array;
    for (let i = 0; i < nTop; i++) { topBaseY[i] = p[i * 3 + 1]; topShp[i] = shpFn(p[i * 3], p[i * 3 + 2]); }
  }
  const topBaseN = Float32Array.from(topGeo.attributes.normal.array);
  // vora de la tapa i filet (purfling)
  add(R.tapa, extY(ringShape(OUT, offsetPoly(OUT, -7)), RIB + 0.2, PL, { bevelThickness: 0.6, bevelSize: 0.9, bevelSegments: 2 }), mTopEdge, 'tapa');
  {
    const pts = offsetPoly(OUT, -6).filter((p, i) => i % 2 === 0).map(p => V3(p[0], topY(p[0], p[1]) + 0.15, p[1]));
    add(R.tapa, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 480, 0.8, 5, true), mPurf, 'tapa', { cast: false });
  }
  // cantell fosc dels forats en f (segueix l'arc de la tapa i es mou amb ella)
  const rims = FH.map(h => {
    const sh = geo.shape(offsetPoly(h.poly, 2.6)); sh.holes.push(geo.path(h.poly));
    const g = geo.ext(sh, PL);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 1], e = p[i + 2]; p[i + 1] = topY(x, z) + 0.3 - (PL - e); p[i + 2] = z; }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    const n = p.length / 3, base = Float32Array.from(p), shp = new Float32Array(n);
    for (let i = 0; i < n; i++) shp[i] = shpFn(p[i * 3], p[i * 3 + 2]);
    const mesh = add(R.tapa, g, mRim, 'forats', { cast: false });
    return { g, base, shp, n, mesh };
  });
  // cadireta (saddle) de banús a la vora de baix, on recolza la corda del cordal
  add(R.tapa, geo.ext(geo.rrect(X0 - 0.8, X0 + 11, -24, 24, 2), 8, { bevelThickness: 1, bevelSize: 0.8, bevelSegments: 2 }).rotateX(-PI / 2).translate(0, TOPE - 0.6, 0), mSaddle, 'tapa');

  /* ================= FONS I COSTATS ================= */
  add(R.cos, plateGrid(rowsU(9, 0), 40, backY, null), mBack, 'cos');
  add(R.cos, extY(ringShape(OUT, offsetPoly(OUT, -7)), -0.2 - PL, PL, { bevelThickness: 0.6, bevelSize: 0.9, bevelSegments: 2 }), mBackEdge, 'cos');
  {
    const pts = offsetPoly(OUT, -6).filter((p, i) => i % 2 === 0).map(p => V3(p[0], backY(p[0], p[1]) - 0.15, p[1]));
    add(R.cos, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 480, 0.8, 5, true), mPurfB, 'cos', { cast: false });
  }
  add(R.cos, extY(ringShape(offsetPoly(OUT, -3.5), offsetPoly(OUT, -5.0)), 0, RIB), mRib, 'cos');      // aros (120 mm)
  add(R.cos, geo.box(-X0 - 30, -X0 - 5, 0.3, RIB, -36, 36), mBlock, 'cos');                              // tacs interiors
  add(R.cos, geo.box(X0 + 5, X0 + 32, 0.3, RIB, -40, 40), mBlock, 'cos');
  { // taló del fons (sota el mànec)
    const pts = []; for (let k = 0; k <= 20; k++) { const a = -PI / 2 + PI * k / 20; pts.push([-X0 - 4 + 24 * Math.cos(a), 24 * Math.sin(a)]); }
    add(R.cos, extY(geo.shape(pts), -0.3 - PL, PL), mBackEdge, 'cos');
  }

  /* ================= INTERIOR: barra harmònica i ànima ================= */
  {
    const xb0 = X0 + 0.11 * L, xb1 = X0 + 0.88 * L, pts = [];
    for (let k = 0; k <= 48; k++) { const x = lerp(xb0, xb1, k / 48); pts.push([x, topY(x, ZBAR) - PL]); }
    for (let k = 48; k >= 0; k--) { const s = k / 48, x = lerp(xb0, xb1, s), h = 3 + 22 * Math.pow(Math.sin(PI * s), 0.7); pts.push([x, topY(x, ZBAR) - PL - h]); }
    add(R.interior, geo.ext(geo.shape(pts), 8, { bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 1 }).translate(0, 0, ZBAR - 4), mBar, 'barra');
    const y0 = backY(XP, ZP) + PL, y1 = topY(XP, ZP) - PL;
    add(R.interior, geo.cyl(5.5, y1 - y0, 'y', 24).translate(XP, (y0 + y1) / 2, ZP), mPost, 'anima');
  }

  /* ================= PONT (bascula sobre el peu agut) ================= */
  const SZ = 2.25, SH = BH / 33;               // escala respecte al pont del violí
  const bf = z => topY(XB, z) - 0.3;
  const PV = [XB, bf(-36), -36];
  const bridgePivot = new THREE.Group(); bridgePivot.position.set(PV[0], PV[1], PV[2]); R.pont.add(bridgePivot);
  {
    const Bp = [[-20.5 * SZ, bf(-20.5 * SZ)], [-11.5 * SZ, bf(-11.5 * SZ)]];
    [[-10.6, 3], [-9.2, 6], [-6, 8.2], [-2.5, 9], [0, 9.1], [2.5, 9], [6, 8.2], [9.2, 6], [10.6, 3]].forEach(p => Bp.push([p[0] * SZ, YT + p[1] * SH]));
    Bp.push([11.5 * SZ, bf(11.5 * SZ)], [20.5 * SZ, bf(20.5 * SZ)]);
    const side = [[20.6, 1.6], [19.8, 4], [17.8, 8], [16, 11.5], [15.6, 14.5], [13.6, 17.2], [12.2, 18.6], [12.6, 19.8], [14.4, 20.8], [16.2, 22.4], [16.9, 25.2]];
    const zTop = 16.9 * SZ;
    side.forEach(p => Bp.push([p[0] * SZ, YT + p[1] * SH]));
    for (let k = 0; k <= 20; k++) { const z = zTop - 2 * zTop * k / 20; Bp.push([z, bridgeTopY(z)]); }
    side.slice().reverse().forEach(p => Bp.push([-p[0] * SZ, YT + p[1] * SH]));
    const sh = geo.shape(Bp.map(p => [-p[0], p[1]]));
    const heart = []; for (let k = 0; k <= 16; k++) { const a = -PI / 2 + 0.7 + (TAU - 1.4) * k / 16; heart.push([2.3 * SZ * Math.cos(a), YT + 14.6 * SH + 2.3 * SH * 0.85 * Math.sin(a)]); }
    heart.push([0, YT + 11.4 * SH]);
    sh.holes.push(geo.path(heart.map(p => [-p[0], p[1]])));
    for (const sg of [-1, 1]) {
      const kid = []; for (let k = 0; k < 22; k++) { const a = TAU * k / 22, ex = 3.0 * SZ * Math.cos(a), ey = 1.6 * SH * Math.sin(a), r = -0.35 * sg; kid.push([sg * 7.2 * SZ + ex * Math.cos(r) - ey * Math.sin(r), YT + 21.2 * SH + ex * Math.sin(r) + ey * Math.cos(r)]); }
      sh.holes.push(geo.path(kid.map(p => [-p[0], p[1]])));
    }
    const g = geo.ext(sh, 3.6, { bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 }).rotateY(PI / 2).translate(XB - 1.8, 0, 0).translate(-PV[0], -PV[1], -PV[2]);
    add(bridgePivot, g, mBridge, 'pont');
  }

  /* ================= CORDAL (banús) + 4 afinadors fins ================= */
  const XT0 = X0 + 13.5, XT1 = -128;            // ≈ 24 cm
  const hwT = s => { let h = 18 + 18 * Math.pow(clamp(s), 1.1); if (s > 0.93) h *= Math.sqrt(Math.max(0.02, 1 - Math.pow((s - 0.93) / 0.07, 2))); if (s < 0.05) h *= Math.sqrt(Math.max(0.02, 1 - Math.pow((0.05 - s) / 0.05, 2))); return h; };
  const ycT = s => TOPE + 17 + 28 * s;
  const tailTop = (x, z) => { const s = clamp((x - XT0) / (XT1 - XT0)), h = hwT(s); return ycT(s) + 0.8 + 5.2 * Math.pow(clamp(1 - (z / h) * (z / h)), 0.25); };
  const ZT = [21, 7, -7, -21];
  const XFRET = XT1 - 4, XFT = -158;
  {
    const rings = [];
    for (let k = 0; k <= 40; k++) {
      const s = k / 40, x = lerp(XT0, XT1, s), h = hwT(s), yc = ycT(s), r = [];
      for (let j = 0; j < 20; j++) { const a = TAU * j / 20, c = Math.cos(a), sn = Math.sin(a); r.push([x, yc + (sn >= 0 ? 0.8 + 5.2 * Math.pow(sn, 0.5) : 0.8 - 5.4 * Math.pow(-sn, 0.5)), h * c]); }
      rings.push(r);
    }
    add(R.pont, loft(rings), mTail, 'cordes');
    const yr = tailTop(XFRET, 0);
    add(R.pont, geo.ext(geo.rrect(XFRET - 2.2, XFRET + 2.2, -31, 31, 1.6), 4, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }).rotateX(-PI / 2).translate(0, yr - 2, 0), mTail, 'cordes');
    // afinadors fins (un per corda)
    for (const zf of ZT) {
      const tt = tailTop(XFT, zf);
      add(R.pont, geo.box(XFT - 8, XFT + 6, tt - 0.6, tt + 1.4, zf - 5, zf + 5), mFine, 'cordes');
      add(R.pont, geo.cyl(2.0, 10, 'y', 12).translate(XFT - 3, tt + 5.5, zf), mFine, 'cordes');
      add(R.pont, geo.cyl(5.0, 3.6, 'y', 24).translate(XFT - 3, tt + 11.6, zf), mFine, 'cordes');
      add(R.pont, geo.curveTube([[XFT - 3, tt + 6, zf], [XFT + 2, tt + 6.8, zf], [XFT + 7, tt + 5, zf], [XFT + 10, tt + 2.6, zf]], 1.25, 16, 8), mFine, 'cordes');
    }
    // corda del cordal: passa per sobre la cadireta i s'enganxa a la pica
    for (const sz of [-1, 1]) add(R.pont, geo.curveTube([[XT0 + 12, ycT(0.05) - 2.5, sz * 6], [XT0 - 2, TOPE + 10.6, sz * 7], [X0 + 1, TOPE + 9.8, sz * 8], [X0 - 5, TOPE - 6, sz * 9.5], [X0 - 8.5, 100, sz * 11.5], [X0 - 10, 82, sz * 14], [X0 - 10, 68, sz * 17]], 1.7, 32, 8), mGut, 'cordes');
  }

  /* ================= PICA (barra de metall amb punta de goma) ================= */
  const PY = 60, ROD0 = X0 - 15, ROD1 = X0 - 345;
  {
    add(R.pica, geo.lathe([[0, 0], [17, 0], [17, 4], [15.5, 7], [18, 10], [19, 16], [17.5, 22], [13, 26], [8.5, 28], [0, 28]], 40).rotateZ(PI / 2).translate(X0 + 1.5, PY, 0), mCollar, 'pica');
    add(R.pica, geo.cyl(5, ROD0 - ROD1, 'x', 24).translate((ROD0 + ROD1) / 2, PY, 0), mRod, 'pica');
    add(R.pica, geo.cyl(2.6, 14, 'z', 12).translate(X0 - 14, PY, 21), mScrew, 'pica');
    add(R.pica, geo.cyl(7, 5, 'z', 24).translate(X0 - 14, PY, 29), mScrew, 'pica');
    add(R.pica, geo.lathe([[0, 0], [8, 0], [11, 3], [12, 10], [12, 20], [10.5, 26], [7, 29.5], [0, 31]], 32).rotateZ(PI / 2).translate(ROD1 + 20, PY, 0), mRubber, 'pica');
  }

  /* ================= MÀNEC, DIAPASÓ, CLAVILLER, VOLUTA ================= */
  const neckRig = new THREE.Group(); neckRig.position.set(NX0, NY0, 0); neckRig.rotation.z = -TH; R.mastil.add(neckRig);
  const FBL = 580;
  const fbW = lx => 31 + 33 * clamp(-lx / FBL);
  const lxE = (-X0 - NX0) / CT;                     // vora del cos (negatiu)
  const dnF = lx => 24 + 6 * clamp(-lx / -lxE);
  { // diapasó de banús (58 cm, bombat)
    const rings = [];
    for (let k = 0; k <= 40; k++) {
      const lx = -FBL + FBL * k / 40, h = fbW(lx) / 2, r = [], yb = -h * h / FBR - 6;
      for (let j = 0; j <= 14; j++) { const z = h - 2 * h * j / 14; r.push([lx, -z * z / FBR, z]); }
      r.push([lx, yb + 0.4, -h + 0.5], [lx, yb, -h * 0.5], [lx, yb, h * 0.5], [lx, yb + 0.4, h - 0.5]);
      rings.push(r);
    }
    add(neckRig, loft(rings), mFb, 'mastil');
  }
  const neckTopL = lx => { const w = (fbW(lx) - 1.5) / 2; return -w * w / FBR - 5.6; };
  { // mànec (secció en D)
    const rings = [];
    for (let k = 0; k <= 30; k++) {
      const lx = lxE - 8 + (-lxE + 14) * k / 30, w = (fbW(lx) - 1.5) / 2, dn = dnF(lx), y0 = neckTopL(lx), r = [];
      for (let j = 0; j <= 16; j++) { const a = PI * j / 16; r.push([lx, y0 - dn * Math.pow(Math.sin(a), 0.8), w * Math.cos(a)]); }
      rings.push(r);
    }
    add(neckRig, loft(rings), mNeck, 'mastil');
  }
  { // cellet (nut)
    const hw = 16, pts = [[-hw, -8], [hw, -8]];
    for (let k = 0; k <= 14; k++) { const z = hw - 2 * hw * k / 14; pts.push([z, 1.4 - z * z / FBR]); }
    add(neckRig, geo.ext(geo.shape(pts), 7.5).rotateY(PI / 2).translate(0.2, 0, 0), mNut, 'mastil');
  }
  { // taló del mànec (recolzat al cos)
    const neckUnder = x => { const lx = (x - NX0) / CT; return fbTopY(x, 0) + neckTopL(lx) - dnF(lx); };
    const xa = -X0 - 6, xe = -X0 + 64, ye = neckUnder(xe) + 4;
    const prof = [[0, 0], [0.08, 0], [0.16, 0.03], [0.26, 0.12], [0.38, 0.3], [0.5, 0.5], [0.62, 0.68], [0.75, 0.82], [0.88, 0.93], [1, 1]];
    const ybAt = t => { for (let k = 1; k < prof.length; k++) if (t <= prof[k][0]) { const a = prof[k - 1], b = prof[k], f = (t - a[0]) / (b[0] - a[0]); return -0.3 + (ye + 0.3) * lerp(a[1], b[1], smooth(f)); } return ye; };
    const rings = [];   // secció en U arrodonida que s'aprima cap al botó del fons
    for (let k = 0; k <= 28; k++) {
      const t = k / 28, x = lerp(xa, xe, t), yt = neckUnder(x) + 9, yb = Math.min(ybAt(t), yt - 2), hw = 22.5 - 1.5 * (1 - t), r = [];
      for (let j = 0; j <= 18; j++) { const a = PI * j / 18; r.push([x, yt - (yt - yb) * Math.pow(Math.sin(a), 0.45), hw * Math.cos(a)]); }
      rings.push(r);
    }
    add(R.mastil, loft(rings), mHeel, 'mastil');
  }
  const PB = 1.8;                                  // escala del claviller respecte al violí
  { // claviller (parets + fons)
    const cheek = geo.shape([[4, 0.6], [70, 0.6], [76, -1.8], [81, -6.5], [85, -12.5], [88, -19.5], [89.2, -27.5], [60, -27.5], [30, -25.5], [12, -23.5], [4, -23]].map(p => [p[0] * PB, p[1] * PB]));
    const bev = { bevelThickness: 1, bevelSize: 1, bevelSegments: 2 };
    add(neckRig, geo.ext(cheek, 5.8, bev).translate(0, 0, 12), mPegbox, 'voluta');
    add(neckRig, geo.ext(cheek, 5.8, bev).translate(0, 0, -17.8), mPegbox, 'voluta');
    add(neckRig, geo.ext(geo.shape([[4, -16.5], [40, -19.5], [89, -20.5], [89.2, -27.5], [60, -27.5], [30, -25.5], [12, -23.5], [4, -23]].map(p => [p[0] * PB, p[1] * PB])), 24, bev).translate(0, 0, -12), mPegbox, 'voluta');
  }
  const SC = [89 * PB, -9 * PB], HZ = 1.62;
  { // voluta: espiral que es fa estreta cap a l'ull
    const R0 = 18 * PB, KS = 0.12, PH = 2.35 * TAU, Rf = p => R0 * Math.exp(-KS * p), rings = [];
    for (let k = 0; k <= 150; k++) {
      const p = PH * k / 150, a = -PI / 2 + p, ex = Math.cos(a), ey = Math.sin(a);
      const ro = Rf(p), ri = Math.max(0.8, Rf(p + TAU) + 0.5), hz = (13.2 - 6.2 * (p / PH)) * HZ, c = Math.min(2.6, (ro - ri) * 0.3);
      const q = [[ro, -hz + c], [ro, hz - c], [ro - c, hz], [ri + c, hz], [ri, hz - c], [ri, -hz + c], [ri + c, -hz], [ro - c, -hz]];
      rings.push(q.map(([r, z]) => [SC[0] + ex * r, SC[1] + ey * r, z]));
    }
    add(neckRig, loft(rings), mScroll, 'voluta');
    add(neckRig, geo.cyl(5.8, 7 * HZ * 2, 'z', 24).translate(SC[0], SC[1], 0), mScroll, 'voluta');
  }
  // clavilles: Do i Sol al costat greu (+Z), Re i La a l'agut (-Z)
  const PYG = -20;
  const PEG = [{ x: 103, s: 1, zw: 8 }, { x: 54, s: 1, zw: 2.2 }, { x: 79, s: -1, zw: -2.2 }, { x: 32, s: -1, zw: -8 }];
  for (const pg of PEG) {
    add(neckRig, geo.cyl(4.6, 56, 'z', 16).translate(pg.x, PYG, pg.s * 5), mPeg, 'voluta');
    add(neckRig, geo.cyl(7.5, 4, 'z', 24).translate(pg.x, PYG, pg.s * 24.5), mPeg, 'voluta');
    add(neckRig, geo.cyl(8, 1.4, 'z', 24).translate(pg.x, PYG, pg.s * 27.2), mPegBead, 'voluta');
    add(neckRig, new THREE.SphereGeometry(1, 24, 16).scale(4.6, 15.5, 20).translate(pg.x, PYG, pg.s * 47), mPeg, 'voluta');
  }

  /* ================= CORDES ================= */
  const ZB = [23.5, 7.8, -7.8, -23.5], ZN = [11.2, 3.75, -3.75, -11.2];
  const RS = [0.82, 0.64, 0.52, 0.42];
  const SEG = 120, RAD = 7;
  const XC = 30;                                // punt on frega l'arc
  const strings = [], CON = [], BETA = [], DIRB = [];
  for (let i = 0; i < 4; i++) {
    const r = RS[i], m = mWound;
    const B = [XB, bridgeTopY(ZB[i]) + r * 0.5, ZB[i]];
    const N = n2w(1.2, 1.4 - ZN[i] * ZN[i] / FBR + r * 0.6, ZN[i]);
    const g = tubeAB(B, N, r, SEG, RAD);
    const mesh = add(R.cordes, g, m, 'cordes', { cast: false, note: i });
    add(R.cordes, tubeAB(B, N, 4.5, 1, 6), mProxy, 'cordes', { cast: false, note: i });
    strings.push({ mesh, base: Float32Array.from(g.attributes.position.array), B, N, r, moved: false });
    // darrere el pont fins a l'afinador fi del cordal
    const Rr = [XFRET, tailTop(XFRET, 0) + 2 + r, ZT[i]];
    add(R.cordes, tubeAB(B, Rr, r, 1, 6), m, 'cordes', { cast: false, pick: false });
    const H = [XFT + 10, tailTop(XFT + 10, ZT[i]) + 2.6, ZT[i]];
    add(R.cordes, tubeAB(Rr, H, r, 1, 6), m, 'cordes', { cast: false, pick: false });
    // del cellet a la clavilla
    const pg = PEG[i], Wp = n2w(pg.x, PYG + 6 + r, pg.zw);
    add(R.cordes, tubeAB(N, Wp, r, 1, 6), m, 'cordes', { cast: false, pick: false });
    add(neckRig, geo.cyl(6, 5, 'z', 16).translate(pg.x, PYG, pg.zw), mWound, 'cordes', { cast: false, pick: false });
    // dades per a l'arc
    const uc = (XC - B[0]) / (N[0] - B[0]);
    CON.push([XC, lerp(B[1], N[1], uc), lerp(B[2], N[2], uc)]);
    const beta = 0.8 * Math.atan(lerp(B[2], N[2], uc) / 30);
    BETA.push(beta); DIRB.push([0, -Math.sin(beta), Math.cos(beta)]);
  }
  const strAt = (S, u) => [lerp(S.B[0], S.N[0], u), lerp(S.B[1], S.N[1], u), lerp(S.B[2], S.N[2], u)];
  const strDepth = (S, u) => { const p = strAt(S, u); return Math.max(0, p[1] - (fbTopY(p[0], p[2]) + S.r + 0.1)); };
  const fingerGeo = new THREE.SphereGeometry(1, 20, 14).scale(8.5, 6, 9.5);
  const fingerL = add(R.cordes, fingerGeo, mFinger, 'cordes', { pick: false }); fingerL.visible = false;
  const fingerR = add(R.cordes, fingerGeo.clone(), mFinger, 'cordes', { pick: false }); fingerR.visible = false;
  const DIRP = [0, 0.243, -0.970];

  /* ================= ARC (≈73 cm) ================= */
  const bowRig = new THREE.Group(); R.arc.add(bowRig);
  {
    const yS = x => 11.5 + 10 * Math.pow((x - 40) / 400, 2);
    const rS = x => 4.9 - 1.7 * clamp((x + 250) / 590);
    const fmx = x => -297 + (x + 306) * 1.12;          // nou: una mica més gran que la del violí
    const sp = []; for (let x = -356; x <= 343.1; x += 12) sp.push([x, yS(x), 0]);
    add(bowRig, taperTube(sp, P => rS(P.x), 180, 12), mStick, 'arc');
    const sub = (x0, x1) => { const o = []; for (let k = 0; k <= 8; k++) { const x = lerp(x0, x1, k / 8); o.push([x, yS(x), 0]); } return o; };
    add(bowRig, taperTube(sub(-292, -276), P => rS(P.x) + 0.8, 16, 12), mLeather, 'arc');
    add(bowRig, taperTube(sub(-276, -222), P => rS(P.x) + 0.4, 40, 12), mSilver, 'arc');
    // nou (frog) de banús amb ull de nacre
    add(bowRig, geo.ext(geo.shape([[-306, 13], [-306, 8], [-309, 3.5], [-313, 0.5], [-318, -2.5], [-332, -6], [-346, -5.5], [-354, -1], [-357, 6], [-356, 13]].map(p => [fmx(p[0]), p[1] * 1.3])), 15, { bevelThickness: 1.4, bevelSize: 1.2, bevelSegments: 3 }).translate(0, 0, -7.5), mFrog, 'arc');
    add(bowRig, geo.box(fmx(-317), fmx(-309), -3.4, 3.9, -8.9, 8.9), mSilver, 'arc');
    add(bowRig, geo.box(fmx(-357.5), fmx(-341), -8.6, -7.0, -6.8, 6.8), mSilver, 'arc');
    for (const sz of [-1, 1]) add(bowRig, geo.cyl(3.3, 0.6, 'z', 24).translate(fmx(-336), 5.2, sz * 9.0), mPearl, 'arc');
    // botó
    const yb = yS(-364);
    add(bowRig, geo.cyl(5.0, 17, 'x', 24).translate(-364, yb, 0), mFrog, 'arc');
    for (const x of [-356.5, -371.5]) add(bowRig, geo.cyl(5.2, 1.8, 'x', 24).translate(x, yb, 0), mSilver, 'arc');
    add(bowRig, geo.cyl(3.4, 1.2, 'x', 20).translate(-373, yb, 0), mSilver, 'arc');
    // punta (cap) amb placa blanca
    add(bowRig, geo.ext(geo.shape([[336, 12.5], [346, 17.5], [357, 20.5], [364, 19.5], [368.5, 14], [369.5, 6], [367.5, -1.2], [352, -1.2], [344, 2], [338, 6.5]].map(p => [p[0] * 0.97, p[1] * 1.2])), 8, { bevelThickness: 1, bevelSize: 0.8, bevelSegments: 2 }).translate(0, 0, -4), mStick, 'arc');
    add(bowRig, geo.box(367.6 * 0.97, 370.4 * 0.97, -1.9, 14.4, -4.5, 4.5), mTipPlate, 'arc');
    // cerres (cinta blanca, més ampla que al violí)
    add(bowRig, geo.box(fmx(-313), 355, -0.8, 0, -6.5, 6.5), mHair, 'arc', { cast: false });
  }
  const qPlay = new THREE.Quaternion(), eul = new THREE.Euler();
  const pPlay = new THREE.Vector3(), pRest = V3(70, 70, 330), qRest = new THREE.Quaternion();
  const _ax = new THREE.Vector3(), _nr = new THREE.Vector3();
  function playPose(c, beta, bowX, lift, outP, outQ) {
    outQ.setFromEuler(eul.set(beta, -PI / 2, 0, 'XYZ'));
    _ax.set(1, 0, 0).applyQuaternion(outQ); _nr.set(0, 1, 0).applyQuaternion(outQ);
    const off = lift + 0.8 + 0.5;
    outP.set(c[0], c[1], c[2]).addScaledVector(_nr, off).addScaledVector(_ax, -bowX);
  }
  playPose(CON[2], BETA[2], 30, 4, pPlay, qPlay);
  bowRig.position.copy(pPlay); bowRig.quaternion.copy(qPlay);
  const arcLabelL = V3(-150, 18, 0).applyQuaternion(qPlay).add(pPlay);

  /* ================= notes ================= */
  const notes = [
    { label: 'Do', f: 65.41, str: 0, ratio: 1, stop: 690 },
    { label: 'Sol', f: 98, str: 1, ratio: 1, stop: 690 },
    { label: 'Re', f: 146.83, str: 2, ratio: 1, stop: 690 },
    { label: 'La', f: 220, str: 3, ratio: 1, stop: 690 },
    { label: 'Si', f: 123.47, str: 1, ratio: 98 / 123.47, stop: Math.round(690 * 98 / 123.47), dit: true },
    { label: 'Mi', f: 164.81, str: 2, ratio: 146.83 / 164.81, stop: Math.round(690 * 146.83 / 164.81), dit: true }
  ];
  const isPizz = o => o === 1 || o === 'Pizzicato' || (typeof o === 'string' && o.toLowerCase().indexOf('pizz') === 0) || (o && typeof o === 'object' && (o.label === 'Pizzicato' || o.index === 1));
  // ressonàncies de la caixa: aire (~100), fusta (~190), més amunt i brillantor; talla els aguts
  const bodyGain = fr => {
    const g = (c, w, a) => { const l = Math.log2(fr / c); return a * Math.exp(-l * l / w); };
    return (0.5 + g(100, 0.12, 0.45) + g(195, 0.2, 0.55) + g(410, 0.3, 0.35) + g(2200, 0.5, 0.35)) * (fr > 4000 ? 4000 / fr : 1);
  };
  // els harmònics 2–4 es reforcen perquè el violoncel se senti als altaveus petits
  const boost = k => (k === 1 ? 0.6 : k <= 4 ? 1.8 : k <= 7 ? 1.15 : 1);

  /* ================= estat d'animació ================= */
  const st = { kb: 1, bowX: 30, bowPh: 0, lift: 4, sf: 2, press: 0, curPizz: false, fing: null, topMoved: false };
  const Tk = new Float32Array(11), Ck = new Float32Array(11);
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const fCenters = FH.map(h => V3(h.center[0], topY(h.center[0], h.center[1]) + 1, h.center[1]));
  const UP = V3(0, 1, 0);

  /* ================= càmeres i despiece (coordenades del món) ================= */
  const cTgt = addv(toW([60, 70, 0]), [0, 0, 0]);
  const cam = {
    explore: { pos: addv(cTgt, [1650, 560, 2750]), target: cTgt },
    exploded: { pos: addv(cTgt, [2900, 850, 3150]), target: addv(cTgt, [-80, 100, 220]) }
  };
  const explode = {
    arc: [...addv(toW([60, 560, 0]), [-280, 60, 0]), 0],
    cordes: [...addv(toW([0, 420, 0]), [-200, 0, 0]), 0.05],
    pont: [...addv(toW([0, 300, 0]), [-140, 0, 0]), 0.1],
    tapa: [...addv(toW([0, 190, 0]), [-85, 0, 0]), 0.15],
    interior: [...addv(toW([0, 90, 0]), [-40, 0, 0]), 0.2],
    mastil: [...toW([330, 150, 0]), 0.25],
    cos: [...addv(toW([0, -170, 0]), [90, 0, 0]), 0.3],
    pica: [...toW([0, 120, -320]), 0.35]
  };
  // terra: la punta de goma de la pica
  G.pica.updateMatrixWorld(true);
  const pb = new THREE.Box3().setFromObject(G.pica);
  const floorY = Math.floor(pb.min.y);

  const conW = toW(CON[2]);
  const tour = [
    { part: 'arc', chain: 0, title: "L'arc", text: "Les cerres, amb colofònia, enganxen la corda i l'estiren. La corda rellisca, torna enrere i l'arc la torna a enganxar. Això passa moltes vegades per segon, i la corda no para de vibrar.", cam: { pos: addv(conW, [-420, 190, 520]), target: conW }, slow: 0.5, xray: false },
    { part: 'cordes', chain: 1, title: 'La corda', text: "La corda vibra entre el pont i el dit, o fins a dalt del diapasó si no la premem. Les cordes del violoncel són llargues i gruixudes: per això vibren més a poc a poc i sonen greus. Soles, gairebé no sonen, perquè són massa primes per moure l'aire.", cam: { pos: addv(toW([250, 210, 0]), [560, 160, 640]), target: toW([250, 200, 0]) }, slow: 0.35, xray: false },
    { part: 'pont', chain: 2, title: 'El pont', text: "La corda fa balancejar el pont d'un costat a l'altre. El pont passa aquest moviment a la tapa.", cam: { pos: toW([XB + 300, YT + 190, 150]), target: toW([XB, YT + 40, 0]) }, slow: 0.4, xray: false },
    { part: 'anima', chain: 3, title: "L'ànima i la tapa", text: "Dins la caixa, l'ànima aguanta un peu del pont. Sota l'altre peu hi ha la barra harmònica. Així el pont fa vibrar tota la tapa, que és gran i mou molt d'aire.", cam: { pos: addv(toW([XB, 70, 0]), [430, 170, 540]), target: toW([XB, 70, 0]) }, slow: 0.5, xray: true },
    { part: 'forats', chain: 4, title: 'Els forats en f', text: "La tapa i el fons empenyen l'aire de dins de la caixa, que és molt gran. L'aire entra i surt pels forats en f, i el so greu arriba a les nostres orelles. Per la pica, una mica de vibració passa també a terra.", cam: { pos: addv(toW([XB, YT, 0]), [-170, 330, 600]), target: toW([XB, YT, 0]) }, slow: 0.6, xray: false }
  ];

  return {
    id: 'violoncel',
    family: 'Corda fregada',
    name: 'Violoncel',
    intro: "El violoncel es toca assegut, amb l'instrument entre les cames i la pica recolzada a terra. Està afinat una octava per sota de la viola i té un so greu i càlid. En italià, «violoncello» vol dir «violone petit».",
    floorY,
    camera: cam,
    parts: {
      tapa: { name: 'Tapa', text: "És la fusta del davant, d'avet, una fusta lleugera i forta. Vibra amb el pont i empeny l'aire.", dato: "Normalment es fa amb dues peces d'avet enganxades pel mig." },
      cos: { name: 'Fons i costats', text: "El fons i els costats (els aros) són d'auró. Formen una caixa buida, plena d'aire, que ressona.", dato: "Els costats fan uns 12 cm d'alçada: unes quatre vegades més que els del violí." },
      forats: { name: 'Forats en f', text: "Són dos forats amb forma de lletra f. Per aquí entra i surt l'aire de dins de la caixa.", dato: "El lutier col·loca l'ànima ficant una eina especial per un dels forats en f." },
      pont: { name: 'Pont', text: "És una peça d'auró que aguanta les cordes i passa la seva vibració a la tapa. No està enganxat: l'aguanta la pressió de les cordes.", dato: "Fa uns 9 cm d'alçada, gairebé tres vegades més que el del violí." },
      anima: { name: 'Ànima', text: "És un bastonet de fusta dins la caixa, entre la tapa i el fons, sota el peu del pont del costat agut. No està enganxat: només està pressionat.", dato: "És molt més gruixuda que la del violí: fa uns 11 mm de diàmetre." },
      barra: { name: 'Barra harmònica', text: "És un llistó de fusta enganxat sota la tapa, al costat de les cordes greus. Fa la tapa més forta i l'ajuda a vibrar sencera.", dato: 'Fa uns 60 cm de llarg, més del doble que la del violí.' },
      mastil: { name: 'Mànec i diapasó', text: "La mà esquerra prem les cordes sobre el diapasó, de banús, per canviar de nota. Com que les cordes són llargues, els dits s'han de separar més que en el violí.", dato: "El violoncel no té trasts: cal trobar el lloc de cada nota d'oïda." },
      voluta: { name: 'Voluta i clavilles', text: "Les clavilles giren per tensar o afluixar les cordes i afinar-les. La voluta és l'espiral de dalt de tot, un adorn.", dato: "La voluta, el claviller i el mànec es tallen d'un sol tros d'auró." },
      cordes: { name: 'Cordes', text: "N'hi ha quatre: Do, Sol, Re i La, una octava per sota de la viola. Com més curta és la part que vibra, més aguda és la nota.", dato: "La part que vibra fa uns 69 cm, més del doble que en el violí." },
      arc: { name: 'Arc', text: "Les cerres són de cua de cavall, amb colofònia (una resina) perquè enganxin a la corda. És més curt i més gruixut que l'arc del violí.", dato: "Fa uns 72 cm, una mica menys que el del violí, però pesa més: uns 80 grams." },
      pica: { name: 'Pica', text: "És una barra de metall amb una punta de goma que surt de baix de tot. Es recolza a terra i aguanta el violoncel mentre el músic toca assegut.", dato: "Es pot allargar o escurçar segons l'alçada del músic. Abans, el violoncel s'aguantava només amb les cames." }
    },
    labels: [
      { part: 'tapa', group: 'tapa', at: toW([-215, topY(-215, 115) + 0.8, 115]), internal: false },
      { part: 'cos', group: 'cos', at: toW([-180, 62, W(-180 - X0) - 3.3]), internal: false },
      { part: 'forats', group: 'tapa', at: toW([fCenters[0].x, fCenters[0].y, fCenters[0].z]), internal: false },
      { part: 'pont', group: 'pont', at: toW([XB, YT + 78, 0]), internal: false },
      { part: 'anima', group: 'interior', at: toW([XP, 60, ZP]), internal: true },
      { part: 'barra', group: 'interior', at: toW([60, topY(60, ZBAR) - 18, ZBAR]), internal: true },
      { part: 'mastil', group: 'mastil', at: toW(n2w(-150, 0.5, 0)), internal: false },
      { part: 'voluta', group: 'mastil', at: toW(n2w(SC[0], SC[1], 13.2 * HZ)), internal: false },
      { part: 'cordes', group: 'cordes', at: toW(strAt(strings[1], 0.42)), internal: false },
      { part: 'arc', group: 'arc', at: toW([arcLabelL.x, arcLabelL.y, arcLabelL.z]), internal: false },
      { part: 'pica', group: 'pica', at: toW([X0 - 170, PY, 0]), internal: false }
    ],
    explode,
    notes,
    options: { label: 'Tècnica', items: ['Arc', 'Pizzicato'] },
    chain: ['Arc', 'Corda', 'Pont', 'Tapa', 'Aire'],
    tour,
    soundSource: { group: 'tapa', at: toW([XB, 110, 0]) },

    play(note, opt) {
      const n = typeof note === 'number' ? (notes[note] || notes[2]) : (note || notes[2]);
      const f = n.f, pz = isPizz(opt), ratio = n.ratio || 1;
      st.curPizz = pz;
      if (ratio < 0.999 && n.str !== undefined) st.fing = { si: n.str, uf: ratio, depth: strDepth(strings[n.str], ratio) };
      try {
        if (pz) {
          const xp = clamp(0.19 / ratio, 0.06, 0.45), parts = [];
          for (let k = 1; k <= 24; k++) {
            const fr = k * f; if (fr > 8000) break;
            parts.push({ k, a: Math.max(0.02, Math.abs(Math.sin(k * PI * xp))) / Math.pow(k, 1.2) * bodyGain(fr) * boost(k), tau: Math.max(0.22, 1.7 - 1.3 * (k - 1) / 23) });
          }
          synth.additive({ f, partials: parts, attack: 0.004, noise: { amount: 0.06, dur: 0.035, lp: 1200, hp: 120 }, gain: 1 });
        } else {
          const parts = [];
          for (let k = 1; k <= 40; k++) { const fr = k * f; if (fr > 9000) break; parts.push({ k, a: (1 / k) * bodyGain(fr) * boost(k), tau: 4 }); }
          synth.additive({ f, partials: parts, attack: 0.12, hold: 1.5, release: 0.45, vibrato: { rate: 5.2, depth: 11 }, noise: { amount: 0.03, dur: 2.0, hp: 1500, lp: 6000 }, gain: 0.9 });
        }
      } catch (e) { /* sense àudio */ }
      return pz ? { attack: 0.005, hold: 0, release: 1.3 } : { attack: 0.12, hold: 1.5, release: 0.45 };
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
      const rho = nObj ? (nObj.ratio || 1) : 1;

      /* ---- coeficients de la corda i força al pont ---- */
      const K = 10; let F = 0, xp = 0.2;
      if (pz) {
        xp = clamp(0.19 / rho, 0.06, 0.45);
        const nn = 2 / (PI * PI * xp * (1 - xp)); let nrm = 0;
        for (let k = 1; k <= K; k++) {
          Ck[k] = nn * Math.sin(k * PI * xp) / (k * k);
          Tk[k] = Math.cos(k * wt) * Math.exp(-t * (0.12 + 0.1 * k));
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
      const amp = (pz ? 7 : 5.2) * env;
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
        fingerL.position.set(p[0] + 3, p[1] - fing.depth * st.press + S.r + 5.6, p[2]);
      } else fingerL.visible = false;
      // dit de la mà dreta (pizzicato)
      if (on && pz && t < 0.7) {
        const S = strings[si], p = strAt(S, xp * rho), k = t / 0.7;
        fingerR.visible = true;
        fingerR.position.set(p[0], p[1] + 6.5 + 36 * k + DIRP[1] * 5, p[2] + DIRP[2] * (6 + 55 * k));
      } else fingerR.visible = false;

      /* ---- tapa: vibració + mapa de calor ---- */
      if (env > 0.002) {
        const A = 4.2 * env * F, pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array;
        for (let i = 0; i < nTop; i++) { const d = topShp[i] * A; pa[i * 3 + 1] = topBaseY[i] + d; if (s.heat) heat.color(clamp(d / 3.3, -1, 1), ca, i); }
        topGeo.attributes.position.needsUpdate = true;
        if (s.heat) topGeo.attributes.color.needsUpdate = true;
        topGeo.computeVertexNormals();
        for (const Rm of rims) { const p = Rm.g.attributes.position.array; for (let i = 0; i < Rm.n; i++) p[i * 3 + 1] = Rm.base[i * 3 + 1] + Rm.shp[i] * A; Rm.g.attributes.position.needsUpdate = true; }
        st.topMoved = true;
      } else if (st.topMoved) {
        const pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array;
        for (let i = 0; i < nTop; i++) pa[i * 3 + 1] = topBaseY[i];
        ca.fill(0);
        topGeo.attributes.position.needsUpdate = true; topGeo.attributes.color.needsUpdate = true;
        topGeo.attributes.normal.array.set(topBaseN); topGeo.attributes.normal.needsUpdate = true;
        for (const Rm of rims) { Rm.g.attributes.position.array.set(Rm.base); Rm.g.attributes.position.needsUpdate = true; }
        st.topMoved = false;
      }

      /* ---- el pont balanceja ---- */
      bridgePivot.rotation.x = 0.03 * env * F;

      /* ---- aire pels forats en f ---- */
      if (env > 0.03) {
        R.tapa.updateWorldMatrix(true, false);
        const up = UP.clone().transformDirection(R.tapa.matrixWorld);
        const rate = env * (200 + 420 * Math.max(0, F));
        for (const c of fCenters) fx.air(R.tapa.localToWorld(c.clone()), up, rate, 0.5, 210);
      }

      /* ---- arc: va i ve en horitzontal entre el pont i el diapasó ---- */
      st.kb += ((optP ? 0 : 1) - st.kb) * Math.min(1, dt * 2.4);
      const playing = !optP && on && !st.curPizz;
      if (playing) st.bowPh += dt * 1.1 * Math.min(1, env * 2.5);
      st.bowX = 30 + 230 * Math.sin(st.bowPh);
      st.lift += ((playing ? 0 : 4) - st.lift) * Math.min(1, dt * 8);
      st.sf += (si - st.sf) * Math.min(1, dt * 6);
      const i0 = Math.min(3, Math.max(0, Math.floor(st.sf))), i1 = Math.min(3, i0 + 1), fr = clamp(st.sf - i0);
      const c = [XC, lerp(CON[i0][1], CON[i1][1], fr), lerp(CON[i0][2], CON[i1][2], fr)];
      const beta = lerp(BETA[i0], BETA[i1], fr);
      playPose(c, beta, st.bowX, st.lift, tmpP, tmpQ);
      const k = smooth(clamp(st.kb));
      bowRig.position.lerpVectors(pRest, tmpP, k);
      bowRig.position.y += 170 * Math.sin(PI * k);
      bowRig.quaternion.slerpQuaternions(qRest, tmpQ, k);
    }
  };
}
