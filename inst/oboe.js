// Oboè (sistema de conservatori, de grenadil·la) — mòdul d'instrument
// Unitats: mm. L'oboè està dret al llarg de l'eix Y: la canya a dalt (+Y) i la campana a baix.
// Les claus dels dits miren cap a +Z (davant). El suport del polze és darrere (-Z).
// Tub cònic: estret a dalt (uns 4,6 mm) i cada vegada més ample cap avall.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const noRay = () => {};

  const G = groups(['canya', 'cosDalt', 'clausDalt', 'cosBaix', 'clausBaix', 'campana', 'clausCampana', 'aire']);

  /* ---------------- mides ---------------- */
  const Y_TIP = 322;        // punta de la canya
  const Y_UJ_TOP = 256;     // dalt del cos de dalt
  const Y_J1 = 56;          // unió cos de dalt / cos de baix
  const Y_J2 = -150;        // unió cos de baix / campana
  const Y_BOT = -322;       // vora de la campana
  const Y_APEX = 450;       // vèrtex virtual del con (la canya i el tudel fan de punta del con)
  const L_DO = 655.6;       // llargada acústica del Do (des del vèrtex virtual)
  const OPEN_ANG = 0.24;    // gir d'una clau oberta (rad)

  // taules [y, radi] (y de dalt a baix) amb interpolació lineal
  const interp = (T, y) => {
    if (y >= T[0][0]) return T[0][1];
    for (let i = 1; i < T.length; i++) if (y >= T[i][0]) {
      const a = T[i - 1], b = T[i]; return b[1] + (a[1] - b[1]) * (y - b[0]) / (a[0] - b[0]);
    }
    return T[T.length - 1][1];
  };
  // forat interior (cònic), amb el llavi de dins de la campana
  const BORE = [[322, 0.7], [300, 1.25], [276, 1.6], [256, 2.3], [-168, 8.0], [-200, 9.2], [-240, 11.5], [-270, 14.0],
    [-295, 17.5], [-310, 20.0], [-317, 18.0], [-322, 19.4]];
  const bore = y => interp(BORE, y);
  // radi exterior de la fusta (per col·locar forats, pilars i claus)
  const OUT = [[256, 12.0], [249, 12.0], [244, 12.5], [236, 12.6], [226, 11.9], [200, 12.2], [150, 13.0], [90, 13.8], [62, 14.2],
    [56.5, 14.3], [56, 17.4], [36, 17.4], [33, 17.0], [28, 15.7], [20, 15.8], [-138, 16.5], [-145, 16.6], [-150, 16.3],
    [-150.5, 18.8], [-172, 18.6], [-185, 17.8], [-195, 17.2], [-215, 17.4], [-245, 19.0], [-270, 21.5], [-290, 24.6], [-305, 27.4]];
  const outR = y => interp(OUT, y);

  /* ---------------- materials ---------------- */
  // grenadil·la: fusta gairebé negra, molt densa i polida
  const woodMat = part => mat(part, { map: tex.ebony(1, 1), color: 0xffffff, roughness: 0.3, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2 }, { xray: true });
  const mUJ = woodMat('cosDalt'), mLJ = woodMat('cosBaix'), mBell = woodMat('campana');
  const corkMat = part => mat(part, { color: 0xb58a5a, roughness: 0.95, metalness: 0 }, { xray: true });
  const darkMat = part => mat(part, { color: 0x040404, roughness: 0.95, metalness: 0 }, { xray: true });
  const mRingUJ = M.silver('cosDalt', { xray: true }), mRingLJ = M.silver('cosBaix', { xray: true }), mRingBell = M.silver('campana', { xray: true });
  const mKey = M.silver('claus');
  const mRod = M.nickel('claus');
  const mPost = M.silver('claus');
  const mPad = M.felt('claus', 0xe2d6b8);
  const mKeyDark = mat('claus', { color: 0x050505, roughness: 0.9, metalness: 0 });
  const mThumb = M.silver('polze');
  // canya doble
  const mBark = mat('canya', { color: 0xc99b4a, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  const mScrape = mat('canya', { color: 0xe6cd92, roughness: 0.75, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color(0xfff2d0), side: THREE.DoubleSide });
  const mThread = mat('canya', { color: 0x23885a, roughness: 0.6, metalness: 0, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x9ff0c8) }, { xray: true });
  const mThread2 = mat('canya', { color: 0xe0b23a, roughness: 0.55, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(0xfff0b0) }, { xray: true });
  const mReedCork = mat('canya', { color: 0xc49a68, roughness: 0.92, metalness: 0 }, { xray: true });
  const mStaple = M.brass('canya', { xray: true });
  const mAirCore = mat('columna', { color: 0x4aa8c8, transparent: true, opacity: 0.1, roughness: 0.6, metalness: 0, depthWrite: false }, { phys: false });
  const glowMat = o => new THREE.MeshBasicMaterial(Object.assign({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }, o));

  /* ---------------- ajudes de geometria ---------------- */
  // Lathe al voltant de Y amb UV pensades per a la veta: u al llarg del tub, v al voltant.
  function latheWood(pts, seg = 72, along = 300, around = 1.5) {
    const g = geo.lathe(pts, seg);
    const n = pts.length, pos = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const i = Math.floor(k / n);
      uv.setXY(k, pos.getY(k) / along, (i / seg) * around);
    }
    uv.needsUpdate = true;
    return g;
  }
  // Malla de quadrícula (u tancat o obert)
  function gridGeo(nu, nv, fn, closeU) {
    const pos = [], idx = [], cols = closeU ? nu : nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const i1 = closeU ? (i + 1) % nu : i + 1;
      const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const dirA = a => [Math.sin(a), Math.cos(a)];   // angle des de +Z cap a +X → [x, z]

  /* ================= COS DE DALT ================= */
  const b38 = bore(38.3), b248 = bore(248.4);
  add(G.cosDalt, latheWood([[b38, 38], [9.8, 38], [9.8, 55], [13.7, 55.3], [14.1, 56], [14.3, 58], [14.2, 62], [13.8, 90], [13.0, 150],
    [12.2, 200], [11.9, 226], [12.3, 231], [12.6, 236], [12.5, 244], [12.0, 248.4], [12.0, 255.6], [11.7, 256], [3.75, 256],
    [3.75, 249], [b248, 248.4], [b38, 38]]), mUJ, 'cosDalt');
  // junta folrada de suro i anella de dalt
  add(G.cosDalt, geo.lathe([[9.8, 38.6], [10.3, 38.6], [10.55, 39.6], [10.55, 53.8], [10.3, 54.6], [9.8, 54.6], [9.8, 38.6]], 48), corkMat('cosDalt'), 'cosDalt');
  add(G.cosDalt, geo.lathe([[12.0, 248.6], [12.65, 248.6], [12.85, 249.4], [12.85, 255.2], [12.6, 255.9], [12.0, 255.9], [12.0, 248.6]], 64), mRingUJ, 'cosDalt');

  /* ================= COS DE BAIX ================= */
  const b385 = bore(38.5);
  add(G.cosBaix, latheWood([[8.0, -168], [11.3, -168], [11.3, -151], [15.6, -150.6], [16.3, -150], [16.6, -145], [16.5, -138],
    [16.1, -60], [15.8, 20], [15.7, 28], [17.0, 33], [17.4, 36], [17.35, 49], [17.35, 55.6], [17.0, 56], [10.75, 56], [10.75, 38.5],
    [b385, 38.3], [8.0, -168]]), mLJ, 'cosBaix');
  add(G.cosBaix, geo.lathe([[11.3, -167.4], [11.75, -167.4], [12.0, -166.4], [12.0, -152.4], [11.75, -151.6], [11.3, -151.6], [11.3, -167.4]], 48), corkMat('cosBaix'), 'cosBaix');
  add(G.cosBaix, geo.lathe([[17.35, 49], [18.0, 49], [18.2, 49.7], [18.2, 55.3], [17.9, 56], [17.35, 56], [17.35, 49]], 64), mRingLJ, 'cosBaix');

  /* ================= CAMPANA ================= */
  add(G.campana, latheWood([[19.4, -322], [27.8, -322], [30.2, -321], [31.0, -318.5], [30.8, -315], [29.6, -311], [27.4, -305],
    [24.6, -290], [21.5, -270], [19.0, -245], [17.4, -215], [17.2, -195], [17.8, -185], [18.6, -172], [18.8, -157.5], [18.8, -150.6],
    [18.5, -150], [12.1, -150], [12.1, -168.5], [8.0, -169], [9.2, -200], [11.5, -240], [14.0, -270], [17.5, -295], [20.0, -310],
    [18.0, -317], [19.4, -322]], 80), mBell, 'campana');
  add(G.campana, geo.lathe([[18.75, -157.5], [19.4, -157.5], [19.6, -156.8], [19.6, -150.8], [19.3, -150.1], [18.75, -150.1], [18.75, -157.5]], 72), mRingBell, 'campana');

  /* ================= CANYA DOBLE ================= */
  // tudel de metall (tub cònic petit), suro i fil de colors
  add(G.canya, geo.lathe([[1.9, 250], [2.3, 250], [2.0, 293], [1.55, 293], [1.9, 250]], 24), mStaple, 'canya');
  add(G.canya, geo.lathe([[2.3, 250], [3.3, 250], [3.62, 251], [3.62, 253], [3.45, 274.5], [3.15, 275.3], [2.2, 275.3], [2.3, 250]], 40), mReedCork, 'canya');
  {
    const pts = [[2.05, 274.6], [3.2, 274.6]];
    const yA = 275, yB = 297;
    for (let k = 0; k <= 88; k++) {
      const y = yA + (yB - yA) * k / 88;
      const r0 = 3.2 - 0.25 * smooth(yA, yB - 6, y);
      pts.push([r0 + 0.07 * Math.abs(Math.sin(k * PI / 2)), y]);
    }
    pts.push([2.65, 297.7], [2.0, 297.7]);
    add(G.canya, geo.lathe(pts, 40), mThread, 'canya');
    // franja d'un altre color, com fan molts oboistes per reconèixer les seves canyes
    add(G.canya, geo.lathe([[3.18, 278], [3.32, 278], [3.32, 280.4], [3.18, 280.4]], 40), mThread2, 'canya');
  }
  // les dues làmines de canya (malles que es deformen)
  const RY0 = 284, NX = 18;
  const hwOf = v => 2.3 + 1.3 * Math.pow(v, 0.85);           // mitja amplada
  const flatOf = v => smooth(0.18, 1, v);                       // 0 = rodona, 1 = plana
  const thOf = v => (v < 0.6 ? 0.5 - 0.1 * v / 0.6 : 0.4 - 0.32 * smooth(0.6, 1, v));   // gruix (rebaixada a la punta)
  const H_REST = 0.45;
  function makeBlade(sgn, v0, v1, nv, m, withHeat) {
    const UL = 2 * (NX + 1);
    const count = UL * (nv + 1);
    const pX = new Float32Array(count), pC = new Float32Array(count), pV = new Float32Array(count), pO = new Uint8Array(count);
    for (let j = 0; j <= nv; j++) for (let i = 0; i < UL; i++) {
      const k = j * UL + i, outer = i > NX, q = outer ? (UL - 1 - i) : i;
      const th = PI * q / NX;
      pX[k] = -Math.cos(th); pC[k] = Math.sin(th); pV[k] = v0 + (v1 - v0) * j / nv; pO[k] = outer ? 1 : 0;
    }
    const g = gridGeo(UL, nv, () => [0, 0, 0], true);
    const B = { g, pX, pC, pV, pO, sgn, count, mesh: null, cols: null };
    setBlade(B, H_REST, 0, 0);
    B.mesh = add(G.canya, g, m, 'canya');
    if (withHeat) {
      B.cols = new Float32Array(count * 3);
      g.setAttribute('color', new THREE.BufferAttribute(B.cols, 3));
      heat.overlay(B.mesh);
    }
    return B;
  }
  function setBlade(B, Ht, wave, env) {
    const P = B.g.attributes.position.array;
    for (let k = 0; k < B.count; k++) {
      const v = B.pV[k], hw = hwOf(v), s = flatOf(v);
      const H = hw * (1 - s) + Ht * s;
      let z = B.sgn * H * B.pC[k];
      if (B.pO[k]) z += B.sgn * thOf(v) * (0.25 + 0.75 * B.pC[k]);
      P[k * 3] = hw * B.pX[k]; P[k * 3 + 1] = RY0 + (Y_TIP - RY0) * v; P[k * 3 + 2] = z;
      if (B.cols) heat.color(wave * env * s, B.cols, k);
    }
    B.g.attributes.position.needsUpdate = true;
    B.g.computeVertexNormals();
    if (B.cols) B.g.attributes.color.needsUpdate = true;
  }
  const blades = [
    makeBlade(1, 0, 0.6, 14, mBark, false), makeBlade(-1, 0, 0.6, 14, mBark, false),
    makeBlade(1, 0.6, 1, 16, mScrape, true), makeBlade(-1, 0.6, 1, 16, mScrape, true)
  ];
  let bladesAtRest = true;
  // brillantor de l'escletxa (quan s'obre, hi passa l'aire)
  const slit = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-PI / 2), glowMat({ color: 0x66d8ff, side: THREE.DoubleSide }));
  slit.position.set(0, Y_TIP - 0.4, 0); slit.raycast = noRay; slit.renderOrder = 6; slit.visible = false; G.canya.add(slit);

  /* ================= CLAUS ================= */
  // Una clau gira sobre una barra paral·lela al tub. at = primera nota (índex) en què el forat queda obert.
  // 99 = sempre tancada en aquestes notes. Digitacions simplificades: cada nota més aguda obre un forat més, des de baix.
  const cupProfile = rc => [[0, 0.3], [rc - 1.0, 0], [rc - 0.45, 0], [rc, 0.45], [rc, 2.0], [rc - 0.25, 3.0], [rc - 1.1, 3.85], [rc * 0.55, 4.35], [0, 4.5]];
  const plateProfile = rc => [[0, 0.3], [rc - 1.0, 0], [rc - 0.45, 0], [rc, 0.45], [rc, 1.6], [rc - 0.3, 2.4], [rc - 1.2, 3.0], [rc * 0.5, 3.3], [0, 3.35]];
  const KEYS = [];
  const HOLES = [];
  function rod(kg, a, d, y0, y1) {
    const [x, z] = dirA(a * DEG);
    add(kg, geo.cyl(1.0, y1 - y0, 'y', 12), mRod, 'claus', { pos: [x * d, (y0 + y1) / 2, z * d] });
    add(kg, geo.cyl(1.75, 1.4, 'y', 16), mRod, 'claus', { pos: [x * d, y1 + 0.5, z * d] });
    add(kg, geo.cyl(1.35, 1.0, 'y', 16), mRod, 'claus', { pos: [x * d, y0 - 0.3, z * d] });
  }
  function post(jg, a, d, y) {
    const [x, z] = dirA(a * DEG), R = outR(y);
    add(jg, geo.tube([x * (R - 0.5), y, z * (R - 0.5)], [x * d, y, z * d], 1.35, 1, 12), mPost, 'claus');
    add(jg, geo.tube([x * (R - 0.4), y, z * (R - 0.4)], [x * (R + 0.6), y, z * (R + 0.6)], 2.7, 1, 18), mPost, 'claus', { cast: false });
    add(jg, new THREE.SphereGeometry(2.4, 18, 12), mPost, 'claus', { pos: [x * d, y, z * d] });
  }
  // o: {kg, jg, jpart, y, a, rodA, rodD, rc, plate, perf, at, note, lever:{y, a}}
  function key(o) {
    const a = o.a * DEG, ra = o.rodA * DEG;
    const [nx, nz] = dirA(a), [px, pz] = dirA(ra);
    const R = outR(o.y), rc = o.rc, rh = rc - 2.0;
    const P = [px * o.rodD, pz * o.rodD];
    const C = [nx * (R + 0.55), nz * (R + 0.55)];
    // forat fosc a la fusta
    add(o.jg, geo.cyl(rh, 0.5, 'z', 32).rotateY(a), darkMat(o.jpart), o.jpart, { pos: [nx * (R - 0.12), o.y, nz * (R - 0.12)], cast: false });
    const kg = new THREE.Group();
    kg.position.set(P[0], 0, P[1]);
    o.kg.add(kg);
    const lc = [C[0] - P[0], o.y, C[1] - P[1]];      // centre de la tassa (local)
    const cupOpts = { pos: lc };
    if (o.note !== undefined) cupOpts.note = o.note;
    const prof = o.plate ? plateProfile(rc) : cupProfile(rc);
    const top = o.plate ? 3.35 : 4.5;
    add(kg, geo.lathe(prof, 48).rotateX(PI / 2).rotateY(a), mKey, 'claus', cupOpts);
    add(kg, geo.cyl(rc - 0.7, 1.0, 'z', 36).rotateY(a), mPad, 'claus', { pos: [lc[0] + nx * 0.5, o.y, lc[2] + nz * 0.5] });
    if (o.plate) {
      add(kg, new THREE.TorusGeometry(rc - 0.55, 0.5, 8, 40).rotateY(a), mKey, 'claus', { pos: [lc[0] + nx * 2.6, o.y, lc[2] + nz * 2.6], cast: false });
      if (o.perf) add(kg, geo.cyl(1.4, 0.3, 'z', 20).rotateY(a), mKeyDark, 'claus', { pos: [lc[0] + nx * (top + 0.02), o.y, lc[2] + nz * (top + 0.02)], cast: false });
    } else {
      add(kg, new THREE.SphereGeometry(1.2, 12, 6, 0, TAU, 0, PI / 2).rotateX(PI / 2).rotateY(a), mKey, 'claus', { pos: [lc[0] + nx * (top - 0.05), o.y, lc[2] + nz * (top - 0.05)], cast: false });
    }
    // braç: de la vora de la tassa fins al tub que gira sobre la barra
    let tx = -lc[0], tz = -lc[2];
    const dn = tx * nx + tz * nz; tx -= dn * nx; tz -= dn * nz;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const e0 = [lc[0] + tx * (rc - 1.2) + nx * (top - 1.2), o.y, lc[2] + tz * (rc - 1.2) + nz * (top - 1.2)];
    const e1 = [lc[0] + tx * (rc + 1.8) + nx * 1.6, o.y, lc[2] + tz * (rc + 1.8) + nz * 1.6];
    const e2 = [lc[0] * 0.3, o.y, lc[2] * 0.3];
    add(kg, geo.curveTube([e0, e1, e2, [0, o.y, 0]], 1.05, 20, 8), mKey, 'claus');
    // tub que gira sobre la barra
    let s0 = o.y - 5, s1 = o.y + 5;
    if (o.lever) { s0 = Math.min(s0, o.lever.y - 4); s1 = Math.max(s1, o.lever.y + 4); }
    add(kg, geo.cyl(1.9, s1 - s0, 'y', 16), mKey, 'claus', { pos: [0, (s0 + s1) / 2, 0] });
    add(kg, geo.cyl(2.25, 0.9, 'y', 16), mKey, 'claus', { pos: [0, s0 + 0.45, 0], cast: false });
    add(kg, geo.cyl(2.25, 0.9, 'y', 16), mKey, 'claus', { pos: [0, s1 - 0.45, 0], cast: false });
    // palanca (on prem el dit petit o el polze)
    if (o.lever) {
      const la = o.lever.a * DEG, [lx, lz] = dirA(la), RL = outR(o.lever.y) + (o.lever.lift || 4.2);
      const T = [lx * RL - P[0], o.lever.y, lz * RL - P[1]];
      add(kg, geo.curveTube([[0, o.lever.y, 0], [T[0] * 0.45 + lx * 1.5, o.lever.y + 1, T[2] * 0.45 + lz * 1.5], [T[0], o.lever.y, T[2]]], 1.1, 16, 8), mKey, 'claus');
      const sg = new THREE.SphereGeometry(1, 24, 12); sg.scale(o.lever.w || 4.0, o.lever.h || 6.5, 1.1); sg.rotateY(la);
      add(kg, sg, mKey, 'claus', { pos: T });
    }
    const sgn = Math.sign(lc[2] * nx - lc[0] * nz) || 1;
    const k = { kg, at: o.at, y: o.y, n: [nx, nz], R, jg: o.jg, sgn, open: 0 };
    KEYS.push(k);
    HOLES.push(k);
    return k;
  }

  // ---- cos de dalt (mà esquerra) ----
  const UR = { a: 68, d: 17.6 }, ULf = { a: -68, d: 17.4 }, UB = { a: -145, d: 17.2 };
  rod(G.clausDalt, UR.a, UR.d, 60, 194);
  rod(G.clausDalt, ULf.a, ULf.d, 150, 230);
  rod(G.clausDalt, UB.a, UB.d, 168, 210);
  for (const y of [62, 92, 123, 160, 192]) post(G.cosDalt, UR.a, UR.d, y);
  for (const y of [152, 190, 228]) post(G.cosDalt, ULf.a, ULf.d, y);
  for (const y of [169, 208.5]) post(G.cosDalt, UB.a, UB.d, y);
  const UJ = { kg: G.clausDalt, jg: G.cosDalt, jpart: 'cosDalt' };
  key({ ...UJ, y: 134, a: 0, rodA: UR.a, rodD: UR.d, rc: 5.8, plate: true, perf: true, at: 7, note: 7 });   // dit 1 (plat foradat)
  key({ ...UJ, y: 112, a: 0, rodA: UR.a, rodD: UR.d, rc: 6.0, plate: true, at: 6, note: 6 });              // dit 2
  key({ ...UJ, y: 72, a: 0, rodA: UR.a, rodD: UR.d, rc: 6.2, plate: true, at: 5, note: 5 });               // dit 3
  key({ ...UJ, y: 185, a: 38, rodA: UR.a, rodD: UR.d, rc: 3.8, at: 99 });                                   // clau de trinat
  key({ ...UJ, y: 165, a: -36, rodA: ULf.a, rodD: ULf.d, rc: 3.8, at: 99 });                                // clau de trinat
  key({ ...UJ, y: 215, a: -30, rodA: ULf.a, rodD: ULf.d, rc: 3.3, at: 99 });                                // clau d'octava lateral
  key({ ...UJ, y: 200, a: 180, rodA: UB.a, rodD: UB.d, rc: 3.5, at: 99, lever: { y: 177, a: 180, lift: 3.2, w: 5.2, h: 6 } }); // octava del polze

  // ---- cos de baix (mà dreta) ----
  const LR = { a: 68, d: 20.4 }, LL = { a: -68, d: 20.4 };
  rod(G.clausBaix, LR.a, LR.d, -134, 31);
  rod(G.clausBaix, LL.a, LL.d, -148, -35);
  for (const y of [29.5, -2, -45, -85, -132]) post(G.cosBaix, LR.a, LR.d, y);
  for (const y of [-38, -76, -146]) post(G.cosBaix, LL.a, LL.d, y);
  const LJ = { kg: G.clausBaix, jg: G.cosBaix, jpart: 'cosBaix' };
  key({ ...LJ, y: 22, a: 0, rodA: LR.a, rodD: LR.d, rc: 6.2, plate: true, at: 4, note: 4 });               // dit 1
  key({ ...LJ, y: -31, a: 0, rodA: LR.a, rodD: LR.d, rc: 6.2, plate: true, at: 3, note: 3 });              // dit 2
  key({ ...LJ, y: -60, a: 0, rodA: LR.a, rodD: LR.d, rc: 6.2, plate: true, at: 2, note: 2 });              // dit 3
  key({ ...LJ, y: -124, a: 22, rodA: LR.a, rodD: LR.d, rc: 5.0, at: 1, note: 1, lever: { y: -98, a: 48 } }); // clau del Do (dit petit)
  key({ ...LJ, y: -101, a: -28, rodA: LL.a, rodD: LL.d, rc: 4.4, at: 99, lever: { y: -86, a: -46 } });     // clau de Mi bemoll
  key({ ...LJ, y: -138, a: -25, rodA: LL.a, rodD: LL.d, rc: 4.4, at: 99, lever: { y: -114, a: -54 } });    // clau de Do sostingut
  key({ ...LJ, y: -45, a: -32, rodA: LL.a, rodD: LL.d, rc: 3.6, at: 99 });                                  // clau de ressonància

  // ---- campana (notes més greus) ----
  const BR = { a: 45, d: 23.2 };
  rod(G.clausCampana, BR.a, BR.d, -246, -176);
  for (const y of [-178, -214, -244]) post(G.campana, BR.a, BR.d, y);
  const BJ = { kg: G.clausCampana, jg: G.campana, jpart: 'campana' };
  key({ ...BJ, y: -196, a: 12, rodA: BR.a, rodD: BR.d, rc: 5.2, at: 0, note: 0, lever: { y: -166, a: 32, lift: 3.0, w: 3.2, h: 4.5 } }); // clau del Si greu
  key({ ...BJ, y: -232, a: 78, rodA: BR.a, rodD: BR.d, rc: 5.6, at: 0 });                                   // clau del Si bemoll greu

  /* ================= SUPORT DEL POLZE ================= */
  {
    const sh = geo.shape([[-15.4, -26], [-17.5, -26], [-17.8, -20], [-17.8, -13.5], [-26.5, -11], [-29.4, -12], [-30.3, -15],
      [-32.3, -14.8], [-32, -9.6], [-29.8, -7], [-26, -6.3], [-17.6, -5.8], [-15.4, -5.8]]);
    const g = geo.ext(sh, 11, { bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 });
    g.rotateY(-PI / 2); g.translate(5.5, 0, 0);
    add(G.cosBaix, g, mThumb, 'polze');
    for (const y of [-22.5, -9.2]) add(G.cosBaix, new THREE.SphereGeometry(1.3, 14, 8, 0, TAU, 0, PI / 2).rotateX(-PI / 2), mThumb, 'polze', { pos: [0, y, -18.35], cast: false });
  }

  /* ================= COLUMNA D'AIRE (interior) ================= */
  {
    const pts = [[0, -320.5]];
    for (let y = -320.5; y <= 306; y += 6) pts.push([Math.max(0.4, bore(y) * 0.8), y]);
    pts.push([0.8, 306], [0, 306]);
    add(G.aire, geo.lathe(pts, 28), mAirCore, 'columna', { cast: false });
  }
  // capa brillant amb colors per vèrtex: taronja = aire comprimit, blau = aire expandit
  const GY0 = 306, GY1 = -320, NGU = 20, NGV = 220;
  const glowGeo = gridGeo(NGU, NGV, (u, v) => {
    const y = GY0 + (GY1 - GY0) * v, r = Math.max(0.55, bore(y) * 0.92);
    return [r * Math.cos(u * TAU), y, r * Math.sin(u * TAU)];
  }, true);
  const gcol = new Float32Array(glowGeo.attributes.position.count * 3);
  glowGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  const glow = new THREE.Mesh(glowGeo, glowMat({ vertexColors: true, side: THREE.DoubleSide }));
  glow.raycast = noRay; glow.renderOrder = 3; G.aire.add(glow);
  const rowY = new Float32Array(NGV + 1);
  for (let j = 0; j <= NGV; j++) rowY[j] = GY0 + (GY1 - GY0) * j / NGV;
  // anelles d'aire que s'apropen (comprimit) i se separen (expandit)
  const NR = 44;
  const ringGeo = new THREE.TorusGeometry(1, 0.075, 6, 36); ringGeo.rotateX(PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, glowMat({ color: 0xffffff }), NR);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false; rings.raycast = noRay; rings.renderOrder = 4; G.aire.add(rings);
  const ringY0 = new Float32Array(NR);
  for (let j = 0; j < NR; j++) ringY0[j] = 304 - (304 + 316) * j / (NR - 1);
  const dummy = new THREE.Object3D(), tc = new THREE.Color();
  for (let j = 0; j < NR; j++) {
    const r = bore(ringY0[j]) * 0.95;
    dummy.position.set(0, ringY0[j], 0); dummy.scale.set(r, Math.max(r, 6), r); dummy.updateMatrix();
    rings.setMatrixAt(j, dummy.matrix); rings.setColorAt(j, tc.setRGB(0.05, 0.12, 0.15));
  }
  // anell que marca on s'acaba la columna (primer forat obert)
  const endRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 8, 40).rotateX(PI / 2), glowMat({ color: 0xffffff }));
  endRing.raycast = noRay; endRing.renderOrder = 4; G.aire.add(endRing);

  /* ================= lògica de notes ================= */
  const NOTES = [
    { label: 'Do', f: 261.63 }, { label: 'Re', f: 293.66 }, { label: 'Mi', f: 329.63 }, { label: 'Fa', f: 349.23 },
    { label: 'Sol', f: 392.0 }, { label: 'La', f: 440.0 }, { label: 'Si', f: 493.88 }, { label: 'Do agut', f: 523.25 }
  ];
  // final efectiu de la columna d'aire (una mica per sota del primer forat obert)
  const endFor = ni => { const n = NOTES[ni] || NOTES[0]; return Y_APEX - L_DO * NOTES[0].f / n.f; };
  const firstOpen = ni => { let best = null; for (const h of HOLES) if (ni >= h.at && (!best || h.y > best.y)) best = h; return best; };
  for (const k of KEYS) { k.open = 0 >= k.at ? 1 : 0; k.kg.rotation.y = k.sgn * OPEN_ANG * k.open; }
  let yEnd = endFor(0);
  const sinc = x => (Math.abs(x) < 1e-4 ? 1 : Math.sin(x) / x);
  const xiOf = u => (u < 0.02 ? 0 : (Math.sin(PI * u) - PI * u * Math.cos(PI * u)) / (PI * u * u) / 1.37);
  const tmp3 = new Float32Array(3);
  const vA = V3(0, 0, 0), vB = V3(0, 0, 0);

  return {
    id: 'oboe',
    family: 'Vent fusta',
    name: 'Oboè',
    intro: "L'oboè té un so brillant i una mica nasal. Bufes entre dues làmines de canya que vibren, i l'aire de dins del tub, que és cònic, fa el so.",
    floorY: -323,
    camera: {
      explore: { pos: [430, 210, 1180], target: [0, 0, 0] },
      exploded: { pos: [560, 360, 1560], target: [0, 100, 0] }
    },
    parts: {
      canya: { name: 'Canya doble', text: "Són dues làmines de canya molt primes, lligades amb fil sobre un tub petit de metall amb suro. Quan bufes, vibren i s'obren i es tanquen molt de pressa.", dato: 'Molts oboistes es fan les seves pròpies canyes a mà, amb ganivets i eines molt fines.' },
      cosDalt: { name: 'Cos de dalt', text: "És la peça on es posa la canya i on van els dits de la mà esquerra. Per dins, el forat és molt estret i es va eixamplant cap avall.", dato: "Les peces encaixen amb unes juntes folrades de suro, perquè no s'escapi l'aire." },
      cosBaix: { name: 'Cos de baix', text: "És la peça del mig, on van els dits de la mà dreta. Darrere hi ha el suport on es recolza el polze.", dato: "Sol ser de grenadil·la, una fusta africana molt dura i gairebé negra." },
      claus: { name: 'Claus', text: "Les claus tapen i destapen forats: com més forats tapats, més llarg és el tub d'aire i més greu és la nota. Aquí les posicions dels dits estan simplificades.", dato: 'Les claus solen ser de metall platejat i tornen al seu lloc gràcies a molls molt prims, com agulles.' },
      campana: { name: 'Campana', text: "És el final de l'oboè, una mica eixamplat. Per dins té una vora que el fa una mica més estret just al final.", dato: "Les notes més greus de l'oboè surten per la campana, que també té forats i claus." },
      polze: { name: 'Suport del polze', text: "És un ganxo de metall on es recolza el polze de la mà dreta. Així el polze aguanta l'oboè i els altres dits queden lliures.", dato: 'Alguns oboistes hi posen una funda de goma perquè no faci mal al polze.' },
      columna: { name: "Columna d'aire", text: "És l'aire de dins del tub: és el que vibra i fa el so. Va de la canya fins al primer forat obert, i és més estreta a dalt que a baix.", dato: "Per fer el La, l'aire de dins va i ve 440 vegades cada segon." }
    },
    labels: [
      { part: 'canya', group: 'canya', at: [3.4, 312, 0.8], internal: false },
      { part: 'cosDalt', group: 'cosDalt', at: [-11.8, 215, 5], internal: false },
      { part: 'cosBaix', group: 'cosBaix', at: [-14.5, -10, 7], internal: false },
      { part: 'claus', group: 'clausDalt', at: [0, 112, 17.8], internal: false },
      { part: 'campana', group: 'campana', at: [-18.6, -285, 15.2], internal: false },
      { part: 'polze', group: 'cosBaix', at: [0, -9, -31.5], internal: false },
      { part: 'columna', group: 'aire', at: [0, -100, 7], internal: true }
    ],
    explode: {
      clausCampana: [0, 0, 55, 0],
      clausBaix: [0, 45, 60, 0.05],
      clausDalt: [0, 120, 60, 0.1],
      campana: [0, 0, 0, 0],
      cosBaix: [0, 45, 0, 0.15],
      cosDalt: [0, 120, 0, 0.22],
      canya: [0, 200, 0, 0.3],
      aire: [-110, 60, 0, 0.35]
    },
    notes: NOTES,
    options: null,
    chain: ['Bufada', 'Canya doble', "Columna d'aire", 'Forats oberts', 'Aire'],
    tour: [
      { part: 'canya', chain: 1, title: 'La canya doble', note: 5,
        text: "Els llavis premen suaument les dues làmines de canya. Quan bufes, les làmines s'obren i es tanquen moltes vegades cada segon, i l'aire hi passa a cops. L'oboè té llengüeta doble, com el fagot.",
        cam: { pos: [80, 352, 95], target: [0, 303, 0] }, slow: 0.3, xray: false },
      { part: 'columna', chain: 2, title: 'Dins del tub', note: 0,
        text: "El tub és cònic: estret a dalt i cada vegada més ample cap avall. L'aire de dins es comprimeix (taronja) i s'expandeix (blau), i ho fa amb més força a prop de la canya. Com més llarga és la columna d'aire, més greu és la nota.",
        cam: { pos: [420, 120, 1100], target: [0, 0, 0] }, slow: 0.45, xray: true },
      { part: 'claus', chain: 3, title: 'Les claus', note: 7,
        text: "Quan prems una clau, el coixinet tapa el forat. Per al Do, tots els forats del cos estan tapats i, per a cada nota més aguda, se n'obre un més des de baix. Aquí les posicions dels dits estan simplificades.",
        cam: { pos: [250, 150, 400], target: [0, 70, 5] }, slow: 0.6, xray: false },
      { part: 'campana', chain: 4, title: 'La campana', note: 0,
        text: "Per al Do, l'aire arriba fins a la campana. El so surt pels forats de la campana i per baix. Per dins, la campana té una vora que la fa una mica més estreta al final.",
        cam: { pos: [190, -150, 330], target: [0, -250, 0] }, slow: 0.7, xray: false },
      { part: 'cosDalt', chain: 4, title: "El La de l'orquestra", note: 5,
        text: "Per fer el La només es tapen dos forats amb els dits, i el so surt sobretot pel primer forat obert. A l'inici d'un concert, l'oboè toca aquest La perquè tota l'orquestra afini. Després, el so viatja per l'aire fins a les teves orelles.",
        cam: { pos: [460, 230, 1120], target: [0, 10, 0] }, slow: 0.8, xray: false }
    ],
    soundSource: { group: 'cosBaix', at: [0, -60, 20] },

    play(note) {
      const f = (note && note.f) || 440;
      // timbre d'oboè: tots els harmònics, els més forts del 2n al 4t, amb un formant cap a 1–1,5 kHz
      const BASE = [0.5, 0.85, 1.0, 0.9, 0.62, 0.48, 0.36, 0.27, 0.2, 0.15, 0.11, 0.08, 0.06, 0.045];
      const partials = [];
      for (let k = 1; k <= BASE.length; k++) {
        const fk = f * k; if (fk > 9000) break;
        const lg = Math.log2(fk / 1250);
        const fm = 0.55 + 0.9 * Math.exp(-(lg * lg) / (2 * 0.5 * 0.5));
        partials.push({ k, a: BASE[k - 1] * fm, tau: Math.max(1.5, 6 - 0.3 * k) });
      }
      synth.additive({
        f, partials,
        attack: 0.04, hold: 1.3, release: 0.2,
        vibrato: { rate: 5.2, depth: 9 },
        noise: { amount: 0.035, dur: 1.5, hp: 1200, lp: 6000 },
        gain: 0.85
      });
      return { attack: 0.04, hold: 1.3, release: 0.2 };
    },

    update(dt, s) {
      dt = Math.min(dt || 0, 0.1);
      const ni = (typeof s.noteIndex === 'number' && s.noteIndex >= 0) ? Math.min(s.noteIndex, NOTES.length - 1) : 0;
      const env = clamp01(s.env || 0);
      const ph = TAU * (s.fvis || 1) * (s.t || 0);
      const sp = Math.sin(ph);
      const kk = 1 - Math.exp(-dt * 9);

      /* claus: s'obren o es tanquen suaument i es queden així */
      for (const k of KEYS) {
        const tgt = ni >= k.at ? 1 : 0;
        k.open += (tgt - k.open) * kk;
        if (Math.abs(tgt - k.open) < 1e-4) k.open = tgt;
        k.kg.rotation.y = k.sgn * OPEN_ANG * k.open;
      }

      /* canya doble: les dues làmines s'obren i es tanquen (exagerat) */
      const Ht = H_REST + env * ((0.8 + 0.75 * sp) - H_REST);
      if (env > 0.001) {
        for (const B of blades) setBlade(B, Ht, sp, env);
        bladesAtRest = false;
      } else if (!bladesAtRest) {
        for (const B of blades) setBlade(B, H_REST, 0, 0);
        bladesAtRest = true;
      }
      slit.visible = env > 0.005;
      if (slit.visible) {
        const op = clamp01((Ht - 0.08) / 1.3);
        const b = env * op;
        slit.scale.set(hwOf(1) * 0.9, 1, Math.max(0.02, Ht * 0.92));
        slit.material.color.setRGB(0.35 * b, 0.8 * b, 1.0 * b);
      }

      /* columna d'aire: ona estacionària d'un tub cònic (pressió màxima a la canya, zero al final) */
      yEnd += (endFor(ni) - yEnd) * kk;
      const Lc = Math.max(60, Y_APEX - yEnd);
      const uTop = (Y_APEX - Y_TIP) / Lc, pTop = sinc(PI * uTop) || 1;
      for (let j = 0; j <= NGV; j++) {
        const y = rowY[j];
        let r = 0.008, g = 0.025, b = 0.035;
        const u = (Y_APEX - y) / Lc;
        const inside = 1 - smooth(1, 1 + 12 / Lc, u);
        const p = env > 0.001 ? (sinc(PI * Math.min(u, 1)) / pTop) * sp * env * inside : 0;
        const calm = 1 - 0.85 * Math.abs(p);
        r += 0.01 * inside * calm; g += 0.05 * inside * calm; b += 0.075 * inside * calm;
        if (p !== 0) {
          heat.color(Math.max(-1, Math.min(1, p)), tmp3, 0);
          r += tmp3[0] * 0.85; g += tmp3[1] * 0.85; b += tmp3[2] * 0.85;
        }
        const o = j * NGU * 3;
        for (let i = 0; i < NGU; i++) { gcol[o + i * 3] = r; gcol[o + i * 3 + 1] = g; gcol[o + i * 3 + 2] = b; }
      }
      glowGeo.attributes.color.needsUpdate = true;

      // anelles: quasi quietes a la canya, es mouen més cap al final de la columna
      const A = Math.min(0.12 * Lc / PI, 20) * env;
      for (let j = 0; j < NR; j++) {
        const y0 = ringY0[j];
        let y = y0, r = 0.012, g = 0.03, b = 0.04;
        if (y0 >= yEnd) {
          const u = (Y_APEX - y0) / Lc;
          y = Math.max(Y_BOT + 3, Math.min(305, y0 + A * xiOf(u) * sp));
          const edge = smooth(yEnd - 4, yEnd + 14, y);
          heat.color(Math.max(-1, Math.min(1, (sinc(PI * u) / pTop) * sp * env)), tmp3, 0);
          r = (0.02 + tmp3[0] * 0.5) * edge + 0.01;
          g = (0.08 + tmp3[1] * 0.5) * edge + 0.02;
          b = (0.11 + tmp3[2] * 0.5) * edge + 0.03;
        }
        const rr = bore(y) * 0.95;
        dummy.position.set(0, y, 0); dummy.scale.set(rr, Math.max(rr, 6), rr); dummy.updateMatrix();
        rings.setMatrixAt(j, dummy.matrix);
        rings.setColorAt(j, tc.setRGB(r, g, b));
      }
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      const ye = Math.max(yEnd, Y_BOT + 1);
      endRing.position.y = ye;
      const er = bore(ye) * 1.02;
      endRing.scale.set(er, Math.max(er, 6), er);
      const eb = 0.25 + 0.75 * env * (0.6 + 0.4 * Math.abs(sp));
      endRing.material.color.setRGB(0.55 * eb, 0.9 * eb, 1.0 * eb);

      /* partícules d'aire */
      if (env > 0.02) {
        // l'aire de la boca entra per l'escletxa de la canya, a cops
        const open = clamp01(Ht / 1.2);
        G.canya.localToWorld(vA.set(0, Y_TIP + 7, 0));
        fx.air(vA, vB.set(0, -1, 0), 340 * env * open, 0.15, 60);
        // aire pel primer forat obert
        const fo = firstOpen(ni);
        if (fo) {
          const R = fo.R + 3;
          fo.jg.localToWorld(vA.set(fo.n[0] * R, fo.y, fo.n[1] * R));
          fx.air(vA, vB.set(fo.n[0], -0.25, fo.n[1]), 380 * env * (0.55 + 0.45 * Math.abs(sp)), 0.45, 150);
        }
        // aire per la campana
        G.campana.localToWorld(vA.set(0, Y_BOT + 2, 0));
        fx.air(vA, vB.set(0, -0.7, 1), (ni === 0 ? 320 : 130) * env, 0.6, ni === 0 ? 140 : 90);
      }
    }
  };
}
