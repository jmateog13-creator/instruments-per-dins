// Clarinet en Si bemoll (sistema Boehm simplificat) — mòdul d'instrument (Vent fusta)
// Unitats: mm. Coordenades locals: el tub va al llarg de X (punta del broquet a -X, campana a +X).
// Els forats dels dits i la majoria de claus miren amunt (+Y); la canya, el polze,
// la clau de registre i el portapolze miren avall (-Y). Angle α al voltant del tub:
// α = 0 amunt (+Y), α = π/2 cap a +Z (cap a l'espectador), α = π avall.
// Tot l'instrument està una mica inclinat (TILT): cada grup del motor té un fill amb aquesta rotació.
export default function (ctx) {
  const { THREE, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = PI * 2;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const spow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
  const noRay = () => {};

  /* ---------------- inclinació i ajudes de coordenades ---------------- */
  const TILT = -0.14, cT = Math.cos(TILT), sT = Math.sin(TILT);
  const W = (x, y, z) => [x * cT - y * sT, x * sT + y * cT, z];                 // local → món (muntat)
  const EX = (a, p, z, d) => [a * cT - p * sT, a * sT + p * cT, z, d];         // despiece: a = al llarg del tub, p = perpendicular (amunt)
  const camAt = (l, o) => { const t = W(l[0], l[1], l[2]); return { pos: [t[0] + o[0], t[1] + o[1], t[2] + o[2]], target: t }; };

  const NAMES = ['broquet', 'canya', 'abracadora', 'barrilet', 'cosDalt', 'cosBaix', 'clausDalt', 'clausBaix', 'campana', 'aire'];
  const G0 = groups(NAMES), G = {};
  for (const n of NAMES) { const t = new THREE.Group(); t.rotation.z = TILT; G0[n].add(t); G[n] = t; }

  /* ---------------- mides (mm) ---------------- */
  const X_TIP = -330;      // punta del broquet
  const X_MP_END = -262;   // on acaba el broquet i comença el barrilet
  const X_BAR_END = -197;  // final del barrilet
  const X_MID = 8;         // unió del cos de dalt i el cos de baix
  const X_LOW_END = 212;   // final del cos de baix (comença la campana)
  const X_BELL = 330;      // boca de la campana  → llargada total 660 mm
  const MP_L = X_MP_END - X_TIP;
  const RB = 7.4;          // radi interior (tub de ~14,8 mm, gairebé cilíndric)
  const R_UP = 13.6, R_LOW = 14.0;   // radi exterior dels cossos
  const Y_TBL = -9.5;      // pla de la taula del broquet (cara de la canya)
  const LAY = 26, GAP0 = 2.2;        // tram corbat de la punta i obertura de la punta (exagerada)
  const X_REED = X_TIP + 1.5;        // on comença la columna d'aire (punta de la canya)
  const gapAt = s => (s < LAY ? GAP0 * Math.pow(1 - s / LAY, 2) : 0);

  /* ---------------- materials ---------------- */
  const woodMat = part => {
    const t = tex.ebony(0.3, 1); t.rotation = PI / 2;   // veta al llarg del tub
    return mat(part, { map: t, color: 0xf3e9ee, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.28 }, { xray: true });
  };
  const mBar = woodMat('barrilet'), mUp = woodMat('cos'), mLow = woodMat('cos'), mBell = woodMat('campana');
  const mMP = mat('broquet', { color: 0x101012, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }, { xray: true });
  const mMPdark = mat('broquet', { color: 0x030303, roughness: 0.95, metalness: 0 }, { xray: true });
  const corkO = { color: 0xb88a5a, roughness: 0.95, metalness: 0 };
  const mCorkMP = mat('broquet', corkO), mCorkCos = mat('cos', corkO);
  const mHoleDark = mat('cos', { color: 0x050505, roughness: 0.95, metalness: 0 }, { xray: true });
  const reedT = tex.spruce(0.3, 0.6); reedT.rotation = PI / 2;
  const mReed = mat('canya', { map: reedT, color: 0xfff1cc, roughness: 0.62, sheen: 0.35, sheenColor: new THREE.Color(0xfff4d6) });
  const mLig = M.silver('abracadora'); mLig.side = THREE.DoubleSide;
  const mLigScrew = M.nickel('abracadora');
  const mBarRing = M.silver('barrilet'), mCosMetal = M.silver('cos'), mBellRing = M.silver('campana');
  const mKey = M.silver('claus'), mRod = M.nickel('claus'), mPad = M.felt('claus', 0xe6d9bb);
  const mAirCore = mat('columna', { color: 0x4aa8c8, transparent: true, opacity: 0.1, roughness: 0.6, metalness: 0, depthWrite: false }, { phys: false });
  const glowMat = o => new THREE.MeshBasicMaterial(Object.assign({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }, o));

  /* ---------------- ajudes de geometria ---------------- */
  const latheX = (pts, seg = 64) => { const g = geo.lathe(pts, seg); g.rotateZ(-PI / 2); return g; };   // [[radi, x], ...]
  function gridGeo(nu, nv, fn, closeU) {
    const pos = [], uv = [], idx = [], cols = closeU ? nu : nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); uv.push(i / nu, j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const i1 = closeU ? (i + 1) % nu : i + 1;
      const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const frames = new Map();
  function frame(parent, alpha) {   // grup girat un angle α al voltant de l'eix del tub
    const k = parent.uuid + ':' + alpha.toFixed(4);
    let f = frames.get(k);
    if (!f) { f = new THREE.Group(); f.rotation.x = alpha; parent.add(f); frames.set(k, f); }
    return f;
  }

  /* ================= BROQUET ================= */
  // secció del broquet a la distància s de la punta: superel·lipse amb la part de sota plana (taula)
  function mpSec(s) {
    const a = 6.9 + 7.1 * smooth(0, 44, s);
    const y1 = -4.9 + 18.9 * (1 - Math.pow(1 - clamp01(s / 46), 1.8));   // bec: baixa cap a la punta
    const yT = Y_TBL + gapAt(s);                                           // taula + corba de la punta
    const r = smooth(61, 68, s);                                           // al final es fa rodó
    return { a, y0: yT + (-14 - yT) * r, y1: y1, nb: 7 + (2.1 - 7) * r, nt: 2.1 };
  }
  add(G.broquet, gridGeo(64, 72, (u, v) => {
    const s = MP_L * Math.pow(v, 1.25), q = mpSec(s), th = u * TAU;
    const aE = q.a * (s < 2.5 ? Math.sqrt(s / 2.5) : 1);
    const yc = (q.y0 + q.y1) / 2, b = (q.y1 - q.y0) / 2, e = Math.sin(th) >= 0 ? 2 / q.nt : 2 / q.nb;
    return [X_TIP + s, yc + b * spow(Math.sin(th), e), aE * spow(Math.cos(th), e)];
  }, true), mMP, 'broquet');
  // tapa del final i tenó amb suro
  add(G.broquet, latheX([[14.1, X_MP_END], [0, X_MP_END]], 48), mMP, 'broquet');
  add(G.broquet, latheX([[11.0, X_MP_END], [11.0, X_MP_END + 1.5], [11.35, X_MP_END + 2.2], [11.35, X_MP_END + 16], [10.8, X_MP_END + 17.5],
    [7.4, X_MP_END + 17.5], [7.4, X_MP_END]], 40), mCorkMP, 'broquet');
  // finestra de la taula (es veu quan es treu la canya)
  add(G.broquet, gridGeo(8, 30, (u, v) => {
    const s = 3 + 27 * v, hw = 4.9 * Math.sqrt(Math.max(0, 1 - Math.pow(v, 5))) * Math.min(1, 0.35 + v * 4);
    return [X_TIP + s, Y_TBL + gapAt(s) - 0.06, (u * 2 - 1) * hw];
  }, false), mMPdark, 'broquet', { cast: false, pick: false });

  /* ================= CANYA (llengüeta simple) ================= */
  const REED_L = 62;
  const reedTh = s => (s < 34 ? 0.12 + 2.88 * Math.pow(smooth(0, 34, s), 1.1) : 3.0);
  const reedGeo = gridGeo(28, 64, (u, v) => {
    const s = REED_L * Math.pow(v, 1.3);
    let hw = (6.6 - 0.35 * s / REED_L) * (s < 2.5 ? Math.sqrt(s / 2.5) : 1), th = reedTh(s);
    if (s > REED_L - 2) { const q = Math.sqrt(Math.max(0, 1 - Math.pow((s - (REED_L - 2)) / 2, 2))); hw *= q; th *= q; }
    const a = u * TAU, z = hw * Math.cos(a);
    let y = Y_TBL;   // cara plana, contra el broquet
    if (u > 0.5 && u < 1) y = Y_TBL - th * (0.3 + 0.7 * Math.pow(Math.max(0, -Math.sin(a)), 0.75));   // escorça (arrodonida)
    return [X_TIP + s, y, z];
  }, false);
  const RNV = reedGeo.attributes.position.count;
  const rPos = reedGeo.attributes.position.array;
  const rBaseY = new Float32Array(RNV), rGap = new Float32Array(RNV);
  for (let i = 0; i < RNV; i++) { rBaseY[i] = rPos[i * 3 + 1]; rGap[i] = gapAt(rPos[i * 3] - X_TIP); }
  const rCol = new Float32Array(RNV * 3);
  reedGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3));
  const reedMesh = add(G.canya, reedGeo, mReed, 'canya');
  heat.overlay(reedMesh);
  let reedDirty = false;

  // raig d'aire que entra per la ranura entre la canya i el broquet
  const JNU = 6, JNV = 24, J_S0 = -12, J_S1 = 22;
  const jetGeo = gridGeo(JNU, JNV, (u, v) => [X_TIP + J_S0 + (J_S1 - J_S0) * v, Y_TBL + 1, (u * 2 - 1) * 4.6], false);
  const jetPos = jetGeo.attributes.position.array;
  const jetCol = new Float32Array(jetPos.length);
  jetGeo.setAttribute('color', new THREE.BufferAttribute(jetCol, 3));
  const jet = new THREE.Mesh(jetGeo, glowMat({ vertexColors: true, side: THREE.DoubleSide }));
  jet.raycast = noRay; jet.frustumCulled = false; jet.renderOrder = 5; jet.visible = false; G.broquet.add(jet);

  /* ================= ABRAÇADORA (dos cargols) ================= */
  const LIG_S0 = 40, LIG_S1 = 56;
  function ligContour(s) {
    const q = mpSec(s), a = q.a + 0.9, yc = (q.y0 + q.y1) / 2, b = (q.y1 - q.y0) / 2 + 0.9;
    const L = [[-7.3, -19.6], [-7.3, -12.4], [-8.4, -11.0], [-a + 0.5, -10.1], [-a, -7.6]];
    const arc = [];
    for (let k = 0; k <= 22; k++) { const th = PI - PI * k / 22; arc.push([a * spow(Math.cos(th), 2 / q.nt), yc + b * spow(Math.sin(th), 2 / q.nt)]); }
    return L.concat(arc, L.slice().reverse().map(([z, y]) => [-z, y]));
  }
  const LIG_N = ligContour(LIG_S0).length;
  add(G.abracadora, gridGeo(LIG_N - 1, 8, (u, v) => {
    const s = LIG_S0 + (LIG_S1 - LIG_S0) * v, c = ligContour(s)[Math.round(u * (LIG_N - 1))];
    return [X_TIP + s, c[1], c[0]];
  }, false), mLig, 'abracadora');
  for (const s of [LIG_S0, LIG_S1]) {   // vores enrotllades
    add(G.abracadora, geo.curveTube(ligContour(s).map(([z, y]) => [X_TIP + s, y, z]), 0.7, 96, 6), mLig, 'abracadora', { cast: false });
  }
  for (const s of [LIG_S0 + 4.5, LIG_S1 - 4.5]) {
    const x = X_TIP + s, y = -16.3;
    add(G.abracadora, geo.cyl(1.3, 21.5, 'z', 12), mLigScrew, 'abracadora', { pos: [x, y, 0.3] });
    add(G.abracadora, geo.cyl(2.3, 3.4, 'z', 16), mLig, 'abracadora', { pos: [x, y, -8.9] });
    add(G.abracadora, geo.cyl(2.3, 3.4, 'z', 16), mLig, 'abracadora', { pos: [x, y, 8.9] });
    add(G.abracadora, geo.cyl(3.5, 4.2, 'z', 18), mLigScrew, 'abracadora', { pos: [x, y, 13.0] });
    add(G.abracadora, geo.cyl(2.6, 1.0, 'z', 18), mLigScrew, 'abracadora', { pos: [x, y, 15.6] });
  }

  /* ================= BARRILET ================= */
  add(G.barrilet, latheX([[11.4, X_MP_END], [15.9, X_MP_END], [15.9, -258], [16.2, -256], [16.6, -242], [16.75, -229.5], [16.6, -217],
    [16.2, -203], [15.9, -201], [15.9, X_BAR_END], [11.4, X_BAR_END], [11.4, -217], [7.5, -217], [7.5, -244], [11.4, -244], [11.4, X_MP_END]], 72), mBar, 'barrilet');
  const ringPts = (x0, x1, r) => [[r - 0.6, x0 - 0.15], [r, x0 - 0.15], [r + 0.3, x0 + 0.5], [r + 0.3, x1 - 0.5], [r, x1 + 0.15], [r - 0.6, x1 + 0.15]];
  add(G.barrilet, latheX(ringPts(X_MP_END, X_MP_END + 3.6, 16.3), 64), mBarRing, 'barrilet');
  add(G.barrilet, latheX(ringPts(X_BAR_END - 3.6, X_BAR_END, 16.3), 64), mBarRing, 'barrilet');

  /* ================= COS DE DALT ================= */
  add(G.cosDalt, latheX([[7.4, -217], [10.8, -217], [11.2, -216.4], [11.2, X_BAR_END], [14.2, X_BAR_END], [14.2, -194.5], [13.8, -189], [R_UP, -182],
    [R_UP, -16], [14.3, -13], [15.6, -10.5], [15.9, -8], [15.9, X_MID], [11.6, X_MID], [11.6, -12], [7.4, -12], [7.4, -217]], 72), mUp, 'cos');
  add(G.cosDalt, latheX([[11.15, -214.5], [11.45, -214], [11.45, -200], [11.15, -199.5]], 40), mCorkCos, 'cos');
  add(G.cosDalt, latheX(ringPts(X_MID - 3.6, X_MID, 15.8), 64), mCosMetal, 'cos');

  /* ================= COS DE BAIX ================= */
  add(G.cosBaix, latheX([[7.4, -12], [11.0, -12], [11.4, -11.4], [11.4, X_MID], [15.2, X_MID], [15.0, 10], [14.3, 15], [R_LOW, 22],
    [R_LOW, 194], [14.4, 203], [14.7, X_LOW_END], [11.6, X_LOW_END], [11.6, 231.4], [11.2, 232], [7.6, 232], [7.4, -12]], 72), mLow, 'cos');
  add(G.cosBaix, latheX([[11.35, -9.5], [11.65, -9], [11.65, 5], [11.35, 5.5]], 40), mCorkCos, 'cos');
  add(G.cosBaix, latheX([[11.55, 214.5], [11.85, 215], [11.85, 229], [11.55, 229.5]], 40), mCorkCos, 'cos');

  /* ================= CAMPANA ================= */
  const rInBell = x => 7.9 + 23.4 * Math.pow(clamp01((x - 233) / 97), 2.6);
  const rOutBell = x => 16.6 + 17.6 * Math.pow(clamp01((x - 236) / 94), 2.3);
  {
    const P = [[11.8, X_LOW_END], [17.0, X_LOW_END], [17.0, 228], [16.8, 236]];
    for (let x = 240; x <= X_BELL; x += 3) P.push([rOutBell(x), x]);
    for (let x = X_BELL; x >= 236; x -= 3) P.push([rInBell(x), x]);
    P.push([7.9, 233], [11.8, 233], [11.8, X_LOW_END]);
    add(G.campana, latheX(P, 80), mBell, 'campana');
  }
  add(G.campana, latheX(ringPts(X_LOW_END, X_LOW_END + 3.6, 17.3), 64), mBellRing, 'campana');
  add(G.campana, latheX([[rOutBell(324) - 0.2, 324], [rOutBell(324) + 0.45, 324.3], [rOutBell(X_BELL) + 0.55, X_BELL - 0.4],
    [rOutBell(X_BELL) + 0.1, X_BELL + 0.4], [rInBell(X_BELL) + 1.2, X_BELL + 0.4]], 80), mBellRing, 'campana');

  /* ================= FORATS I CLAUS ================= */
  // at = primera nota (índex) en què el forat queda obert (99 = sempre tapat en aquestes notes).
  // Simplificat: cada nota més aguda destapa un forat més, des de baix cap amunt.
  // type: 'ring' = forat amb anella (el tapa el dit), 'open' = forat obert (el tapa el dit), 'pad' = clau amb coixinet.
  const HOLES = [
    { j: 'D', x: -164, ang: PI + 0.35, type: 'pad', rh: 1.6, at: 99, hingeTo: -102 },   // clau de registre (polze)
    { j: 'D', x: -152, ang: 1.0, type: 'pad', rh: 2.6, at: 7, note: 7 },
    { j: 'D', x: -134, ang: 0.42, type: 'pad', rh: 3.0, at: 6, note: 6 },
    { j: 'D', x: -116, ang: 0, type: 'pad', rh: 3.4, at: 5, note: 5 },
    { j: 'D', x: -104, ang: 1.05, type: 'pad', rh: 2.4, at: 99 },
    { j: 'D', x: -90, ang: PI, type: 'ring', rh: 4.0, at: 4, note: 4 },                  // forat del polze
    { j: 'D', x: -72, ang: 0, type: 'open', rh: 3.7, at: 3, note: 3 },
    { j: 'D', x: -50, ang: 0, type: 'ring', rh: 4.2, at: 2, note: 2 },
    { j: 'D', x: -26, ang: 0, type: 'ring', rh: 4.4, at: 1, note: 1 },
    { j: 'B', x: 46, ang: 0, type: 'ring', rh: 4.6, at: 0, note: 0 },
    { j: 'B', x: 72, ang: 0, type: 'ring', rh: 4.6, at: 0 },
    { j: 'B', x: 98, ang: 0, type: 'ring', rh: 4.8, at: 0 },
    { j: 'B', x: 124, ang: 1.1, type: 'pad', rh: 3.6, at: 99 },
    { j: 'B', x: 144, ang: 0.2, type: 'pad', rh: 5.0, at: 0, hingeTo: 114 },
    { j: 'B', x: 162, ang: 1.2, type: 'pad', rh: 4.0, at: 99 },
    { j: 'B', x: 182, ang: -0.2, type: 'pad', rh: 5.4, at: 0, hingeTo: 124 }
  ];
  const PAD_OFF = -0.6, RING_OFF = -0.75, ROD_GAP = 3.4;
  const OPEN_ANG = -0.26, RING_ANG = -0.075;
  const cupProfile = rc => [[0, 0.3], [rc - 1.0, 0], [rc - 0.45, 0], [rc, 0.45], [rc, 1.8], [rc - 0.25, 2.6], [rc - 1.0, 3.3], [rc * 0.55, 3.75], [0, 3.85]];
  const ringProfile = rh => [[rh + 0.85, -0.45], [rh + 2.3, -0.45], [rh + 2.5, 0], [rh + 2.3, 0.45], [rh + 0.85, 0.45], [rh + 0.7, 0], [rh + 0.85, -0.45]];
  const fingerGeo = new THREE.SphereGeometry(1, 22, 14);
  const ballGeo = new THREE.SphereGeometry(2.25, 16, 12);

  function rod(gK, alpha, R, x0, x1) {
    const f = frame(gK, alpha), D = R + ROD_GAP;
    add(f, geo.cyl(0.95, x1 - x0, 'x', 12), mRod, 'claus', { pos: [(x0 + x1) / 2, D, 0] });
    add(f, geo.cyl(1.6, 1.4, 'x', 14), mRod, 'claus', { pos: [x0 - 0.7, D, 0], cast: false });
    add(f, geo.cyl(1.2, 1.0, 'x', 12), mRod, 'claus', { pos: [x1 + 0.5, D, 0], cast: false });
  }
  function post(gB, alpha, R, x) {
    const f = frame(gB, alpha), D = R + ROD_GAP;
    add(f, geo.tube([x, R - 0.8, 0], [x, D, 0], 1.3, 1, 12), mCosMetal, 'cos');
    add(f, geo.cyl(2.5, 1.2, 'y', 18), mCosMetal, 'cos', { pos: [x, R - 0.05, 0], cast: false });
    add(f, ballGeo, mCosMetal, 'cos', { pos: [x, D, 0] });
  }

  for (const h of HOLES) {
    const up = h.j === 'D', R = up ? R_UP : R_LOW;
    const gB = up ? G.cosDalt : G.cosBaix, gK = up ? G.clausDalt : G.clausBaix;
    const mW = up ? mUp : mLow;
    const fb = frame(gB, h.ang), fk = frame(gK, h.ang);
    const ro = h.rh + 0.75;
    const top = R + (h.type === 'ring' ? 2.0 : h.type === 'open' ? 1.5 : 0.9);
    const yb = Math.sqrt(R * R - ro * ro) - 0.5;
    h.fb = fb; h.top = top; h.open = 0 >= h.at ? 1 : 0;
    // xemeneia de fusta i fons fosc del forat
    const chO = { pos: [h.x, 0, 0] };
    if (h.type === 'open' && h.note !== undefined) chO.note = h.note;
    add(fb, geo.lathe([[h.rh, yb], [ro, yb], [ro, top - 0.35], [ro - 0.25, top], [h.rh + 0.2, top], [h.rh, top - 0.2], [h.rh, yb]], 36), mW, 'cos', chO);
    add(fb, geo.cyl(h.rh, 0.3, 'y', 28), mHoleDark, 'cos', { pos: [h.x, Math.max(R + 0.15, top - 1.0), 0], cast: false });

    if (h.type === 'pad') {
      const rc = h.rh + 2.0, D = R + ROD_GAP, beta = PAD_OFF;
      const kg = new THREE.Group(); kg.position.set(0, D * Math.cos(beta), D * Math.sin(beta)); fk.add(kg);
      const cy = top + 0.6 - kg.position.y, cz = -kg.position.z;
      const o = { pos: [h.x, cy, cz] }; if (h.note !== undefined) o.note = h.note;
      add(kg, geo.lathe(cupProfile(rc), 40), mKey, 'claus', o);
      add(kg, geo.cyl(rc - 0.6, 1.2, 'y', 32), mPad, 'claus', { pos: [h.x, cy, cz] });
      add(kg, geo.curveTube([[h.x, cy + 1.6, cz - rc + 0.8], [h.x, cy * 0.5 + 0.5, (cz - rc) * 0.5], [h.x, 0, 0]], 1.0, 14, 8), mKey, 'claus');
      const hx = h.hingeTo;
      const xa = Math.min(h.x - rc * 0.8, hx ?? Infinity), xb = Math.max(h.x + rc * 0.8, hx ?? -Infinity);
      add(kg, geo.cyl(1.9, xb - xa, 'x', 16), mKey, 'claus', { pos: [(xa + xb) / 2, 0, 0] });
      if (hx !== undefined) {   // palanca llarga amb espàtula per al dit
        const oy = 3.4 * Math.cos(beta), oz = 3.4 * Math.sin(beta);
        add(kg, geo.tube([hx, 0, 0], [hx, oy, oz], 1.1, 1, 8), mKey, 'claus');
        add(kg, fingerGeo, mKey, 'claus', { pos: [hx, oy, oz], rot: [beta, 0, 0], scale: [4.0, 1.1, 3.2] });
      }
      rod(gK, h.ang + beta, R, xa - 2.2, xb + 2.2);
      post(gB, h.ang + beta, R, xa - 3.2);
      post(gB, h.ang + beta, R, xb + 3.2);
      h.kg = kg; h.kAng = OPEN_ANG;
    } else if (h.type === 'ring') {
      const D = R + ROD_GAP, beta = RING_OFF;
      const kg = new THREE.Group(); kg.position.set(0, D * Math.cos(beta), D * Math.sin(beta)); fk.add(kg);
      const cy = top - 0.45 - kg.position.y, cz = -kg.position.z;
      const o = { pos: [h.x, cy, cz] }; if (h.note !== undefined) o.note = h.note;
      add(kg, geo.lathe(ringProfile(h.rh), 40), mKey, 'claus', o);
      add(kg, geo.curveTube([[h.x, cy, cz - (h.rh + 2.2)], [h.x, cy * 0.5 + 0.2, (cz - h.rh - 2.2) * 0.5], [h.x, 0, 0]], 0.95, 14, 8), mKey, 'claus');
      add(kg, geo.cyl(1.8, 8, 'x', 14), mKey, 'claus', { pos: [h.x, 0, 0] });
      h.kg = kg; h.kAng = RING_ANG;
    }
    if (h.type === 'ring' || h.type === 'open') {   // dit (transparent) que tapa el forat
      const fm = new THREE.MeshStandardMaterial({ color: 0xeab89a, roughness: 0.6, metalness: 0, transparent: true, opacity: 0, depthWrite: false });
      const fg = new THREE.Mesh(fingerGeo, fm);
      fg.scale.set(7.6, 3.2, 7.0); fg.position.set(h.x, top + 2.8, 0);
      fg.raycast = noRay; fg.renderOrder = 2; fg.castShadow = false; fk.add(fg);
      h.finger = fg; h.fy = top + 2.8;
    }
    if (h.kg) h.kg.rotation.x = h.kAng * h.open;
  }
  // barres comunes de les anelles i els seus pilars
  const RRODS = [
    { j: 'D', a: RING_OFF, x0: -56, x1: -20, posts: [-57.5, -38, -18.5] },
    { j: 'D', a: PI + RING_OFF, x0: -96, x1: -84, posts: [-97.5, -82.5] },
    { j: 'B', a: RING_OFF, x0: 40, x1: 103, posts: [38.5, 59, 85, 104.5] }
  ];
  for (const r of RRODS) {
    const up = r.j === 'D', R = up ? R_UP : R_LOW;
    rod(up ? G.clausDalt : G.clausBaix, r.a, R, r.x0, r.x1);
    for (const x of r.posts) post(up ? G.cosDalt : G.cosBaix, r.a, R, x);
  }

  // portapolze (al darrere del cos de baix)
  {
    const f = frame(G.cosBaix, PI);
    const sh = geo.shape([[-10, 0], [8, 0], [8, 1.5], [0.5, 1.5], [6, 9.5], [9, 10.6], [8.2, 12.1], [4.4, 11.1], [-3, 3.2], [-10, 1.7]]);
    add(f, geo.ext(sh, 8, { bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 }), mCosMetal, 'cos', { pos: [59, R_LOW - 0.6, -4] });
    for (const x of [52, 63]) add(f, new THREE.SphereGeometry(1.4, 12, 8), mCosMetal, 'cos', { pos: [x, R_LOW + 1.4, 0], cast: false });
  }

  /* ================= COLUMNA D'AIRE (interior) ================= */
  // secció interior: [centre y, radi y, radi z] (al broquet es fa estreta i baixa fins a la ranura)
  function bore(x) {
    const s = x - X_TIP, m = smooth(1, 42, s);
    const rb = x > 233 ? Math.max(RB, rInBell(x)) : RB;
    return [(Y_TBL + GAP0 * 0.45) * (1 - m), 0.85 + (rb - 0.85) * m, 5.2 + (rb - 5.2) * m];
  }
  const X_A1 = X_BELL - 0.8;
  add(G.aire, gridGeo(20, 140, (u, v) => {
    const x = X_REED + 1 + (X_A1 - X_REED - 1) * v, b = bore(x), a = u * TAU;
    return [x, b[0] + 0.72 * b[1] * Math.sin(a), 0.72 * b[2] * Math.cos(a)];
  }, true), mAirCore, 'columna', { cast: false });
  // capa brillant amb colors per vèrtex: taronja = aire comprimit, blau = aire expandit
  const glowGeo = gridGeo(24, 200, (u, v) => {
    const x = X_REED + (X_A1 - X_REED) * v, b = bore(x), a = u * TAU;
    return [x, b[0] + 0.93 * b[1] * Math.sin(a), 0.93 * b[2] * Math.cos(a)];
  }, true);
  const NV = glowGeo.attributes.position.count;
  const gx = new Float32Array(NV); for (let i = 0; i < NV; i++) gx[i] = glowGeo.attributes.position.getX(i);
  const gcol = new Float32Array(NV * 3);
  glowGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  const glow = new THREE.Mesh(glowGeo, glowMat({ vertexColors: true, side: THREE.DoubleSide }));
  glow.raycast = noRay; glow.renderOrder = 3; G.aire.add(glow);
  // anelles d'aire que s'apropen (comprimit) i se separen (expandit)
  const NR = 52;
  const ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 36); ringGeo.rotateY(PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, glowMat({ color: 0xffffff }), NR);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false; rings.raycast = noRay; rings.renderOrder = 4; G.aire.add(rings);
  const ringX0 = new Float32Array(NR);
  for (let j = 0; j < NR; j++) ringX0[j] = X_REED + 5 + (X_BELL - 4 - X_REED - 5) * j / (NR - 1);
  const dummy = new THREE.Object3D(), tc = new THREE.Color();
  const placeRing = (j, x) => { const b = bore(x); dummy.position.set(x, b[0], 0); dummy.scale.set(7, b[1] * 0.9, b[2] * 0.9); dummy.updateMatrix(); rings.setMatrixAt(j, dummy.matrix); };
  for (let j = 0; j < NR; j++) { placeRing(j, ringX0[j]); rings.setColorAt(j, tc.setRGB(0.05, 0.12, 0.15)); }
  // anella que marca on s'acaba la columna (primer forat obert)
  const endRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40).rotateY(PI / 2), glowMat({ color: 0xffffff }));
  endRing.scale.set(7, RB * 1.12, RB * 1.12);
  endRing.raycast = noRay; endRing.renderOrder = 4; G.aire.add(endRing);

  /* ================= lògica de notes ================= */
  const NOTES = [
    { label: 'Do', f: 233.08 }, { label: 'Re', f: 261.63 }, { label: 'Mi', f: 293.66 }, { label: 'Fa', f: 311.13 },
    { label: 'Sol', f: 349.23 }, { label: 'La', f: 392.0 }, { label: 'Si', f: 440.0 }, { label: 'Do agut', f: 466.16 }
  ];
  const firstOpen = ni => { let best = null; for (const h of HOLES) if (ni >= h.at && (!best || h.x < best.x)) best = h; return best; };
  const endFor = ni => { const fo = firstOpen(ni); return fo ? fo.x + 5 : X_BELL; };
  let xEnd = endFor(0);
  const tmp3 = new Float32Array(3);
  const vA = new THREE.Vector3(), vB = new THREE.Vector3();

  return {
    id: 'clarinet',
    family: 'Vent fusta',
    name: 'Clarinet',
    intro: "El clarinet té una sola canya, que vibra contra el broquet i deixa entrar l'aire a cops. Amb els dits i les claus allargues o escurces el tub d'aire per canviar de nota.",
    floorY: -128,
    camera: {
      explore: { pos: [-170, 340, 930], target: [10, -12, 0] },
      exploded: { pos: [-190, 560, 1380], target: [-40, -40, 0] }
    },
    parts: {
      broquet: { name: 'Broquet', text: "És la peça on es posen els llavis per bufar. Té la punta aplanada per sota, on es recolza la canya.", dato: "Molts broquets són d'ebonita, un cautxú endurit de color negre." },
      canya: { name: 'Canya', text: "És una làmina prima que vibra contra el broquet. El clarinet en té només una: és un instrument de llengüeta simple.", dato: "Es fa amb la tija seca d'una planta, la canya, i es gasta amb l'ús: els clarinetistes la canvien sovint." },
      abracadora: { name: 'Abraçadora', text: "És la peça de metall que aguanta la canya contra el broquet. Amb els dos cargols s'estreny o s'afluixa.", dato: "Molts clarinetistes alemanys no fan servir abraçadora de metall: lliguen la canya amb un cordill." },
      barrilet: { name: 'Barrilet', text: "És la peça curta, amb forma de barril, entre el broquet i el cos. Si s'estira una mica, el tub s'allarga i el clarinet sona una mica més greu.", dato: 'Molts clarinetistes tenen barrilets de llargades diferents per afinar millor.' },
      cos: { name: 'Cos', text: "És el tub llarg dels forats, fet de dues peces: el cos de dalt i el cos de baix. Per dins és gairebé cilíndric, i al darrere té el portapolze, on es recolza el polze dret.", dato: 'Sol ser de fusta negra africana, una fusta molt dura i densa, gairebé negra.' },
      claus: { name: 'Claus', text: "Els forats es tapen amb els dits, que premen les anelles, o amb claus de metall amb coixinets. Com més forats tapats, més llarg és el tub d'aire i més greu és la nota.", dato: 'Amb la clau de registre, que es prem amb el polze, la nota salta una dotzena (una octava i una quinta), no una octava com a la flauta.' },
      campana: { name: 'Campana', text: "És el final del tub, que s'obre com una trompeta. Ajuda que les notes més greus sonin fortes i ben afinades.", dato: "Quan es tapa tot, l'aire vibra fins a la campana i sona la nota més greu del clarinet: un Mi escrit." },
      columna: { name: "Columna d'aire", text: "És l'aire de dins del tub: és el que vibra i fa el so. Va de la canya fins al primer forat obert.", dato: 'El clarinet i la flauta fan gairebé la mateixa llargada, però el clarinet arriba a notes gairebé una octava més greus.' }
    },
    labels: [
      { part: 'broquet', group: 'broquet', at: W(-300, 10.5, 6), internal: false },
      { part: 'canya', group: 'canya', at: W(-318, -9.9, 6.2), internal: false },
      { part: 'abracadora', group: 'abracadora', at: W(-282, 13.5, 8), internal: false },
      { part: 'barrilet', group: 'barrilet', at: W(-230, 11.8, 11.8), internal: false },
      { part: 'cos', group: 'cosDalt', at: W(-176, 9.6, 9.6), internal: false },
      { part: 'claus', group: 'clausDalt', at: W(-116, 19.3, 0), internal: false },
      { part: 'campana', group: 'campana', at: W(300, 16.9, 16.9), internal: false },
      { part: 'columna', group: 'aire', at: W(-100, 0, 6.9), internal: true }
    ],
    explode: {
      broquet: EX(-170, 0, 0, 0),
      canya: EX(-170, -42, 0, 0.04),
      abracadora: EX(-245, 18, 0, 0.02),
      barrilet: EX(-95, 0, 0, 0.08),
      cosDalt: EX(-35, 0, 0, 0.13),
      cosBaix: EX(45, 0, 0, 0.18),
      campana: EX(115, 0, 0, 0.23),
      clausDalt: EX(-35, 55, 0, 0.27),
      clausBaix: EX(45, 55, 0, 0.3),
      aire: EX(0, -50, 40, 0.35)
    },
    notes: NOTES,
    options: null,
    chain: ['Bufada', 'Canya', "Columna d'aire", 'Forats oberts', 'Aire'],
    tour: [
      { part: 'canya', chain: 0, title: 'La canya', note: 0,
        text: "Quan bufes, l'aire passa per una ranura molt estreta entre la canya i el broquet. La canya és flexible i comença a vibrar: tanca i obre la ranura una vegada i una altra.",
        cam: camAt([-320, -8.5, 0], [22, 14, 105]), slow: 0.3, xray: false },
      { part: 'broquet', chain: 1, title: 'El broquet', note: 0,
        text: "Cada vegada que la canya toca la punta del broquet, el pas de l'aire es tanca. Així l'aire entra al tub a cops, centenars de vegades per segon. L'abraçadora subjecta la part de darrere de la canya, i només en vibra la punta.",
        cam: camAt([-298, -5, 0], [60, 8, 170]), slow: 0.35, xray: false },
      { part: 'columna', chain: 2, title: 'Dins del tub', note: 0,
        text: "El que vibra és l'aire de dins del tub, no la fusta. Al costat de la canya l'aire es comprimeix (taronja) i s'expandeix (blau) amb molta força, i al primer forat obert gairebé gens. Com més llarga és aquesta columna d'aire, més greu és la nota.",
        cam: camAt([-20, 0, 0], [0, 290, 860]), slow: 0.5, xray: true },
      { part: 'claus', chain: 3, title: 'Les claus', note: 2,
        text: "Els dits i les claus tapen forats: com més forats tapats, més llarg és el tub d'aire i més greu és la nota. Aquí, per a cada nota més aguda s'obre un forat més des de baix (les posicions dels dits estan simplificades). Els botons diuen les notes escrites: el clarinet en Si bemoll sona un to més greu.",
        cam: camAt([-80, 10, 0], [40, 200, 270]), slow: 0.6, xray: false },
      { part: 'campana', chain: 4, title: 'El so surt', note: 5,
        text: "El so surt pel primer forat obert i pels forats oberts de sota. Quan tot està tapat, surt per la campana. Després viatja per l'aire fins a les teves orelles.",
        cam: camAt([130, 0, 0], [130, 300, 720]), slow: 0.8, xray: false }
    ],
    soundSource: { group: 'cosBaix', at: W(60, 16, 0) },

    play(note) {
      const f = (note && note.f) || 233.08;
      synth.additive({
        f,
        partials: [
          { k: 1, a: 1, tau: 10 }, { k: 2, a: 0.05, tau: 8 }, { k: 3, a: 0.45, tau: 8 }, { k: 4, a: 0.05, tau: 6 },
          { k: 5, a: 0.25, tau: 6 }, { k: 6, a: 0.04, tau: 5 }, { k: 7, a: 0.12, tau: 5 }, { k: 8, a: 0.03, tau: 4 }, { k: 9, a: 0.05, tau: 4 }
        ],
        attack: 0.05, hold: 1.3, release: 0.2,
        vibrato: { rate: 5, depth: 6 },
        noise: { amount: 0.03, dur: 1.55, hp: 1200, lp: 6000 },
        gain: 0.8
      });
      return { attack: 0.05, hold: 1.3, release: 0.2 };
    },

    update(dt, s) {
      dt = Math.min(dt || 0, 0.1);
      const ni = (typeof s.noteIndex === 'number' && s.noteIndex >= 0) ? Math.min(s.noteIndex, NOTES.length - 1) : 0;
      const env = clamp01(s.env || 0);
      const ph = TAU * (s.fvis || 1) * (s.t || 0);
      const sp = Math.sin(ph);
      const kk = 1 - Math.exp(-dt * 9);

      /* forats: claus i anelles s'obren o es tanquen suaument; el dit apareix quan tapa */
      for (const h of HOLES) {
        const tgt = ni >= h.at ? 1 : 0;
        h.open += (tgt - h.open) * kk;
        if (Math.abs(tgt - h.open) < 1e-4) h.open = tgt;
        if (h.kg) h.kg.rotation.x = h.kAng * h.open;
        if (h.finger) {
          h.finger.material.opacity = 0.5 * (1 - h.open);
          h.finger.visible = h.open < 0.985;
          h.finger.position.y = h.fy + 9 * h.open;
        }
      }

      /* canya: bat contra el broquet. c = 1 tancada, c < 0 més oberta que en repòs */
      const c = env > 0.001 ? env * Math.max(-0.55, Math.min(1, 0.25 + 1.05 * sp)) : 0;
      const openF = clamp01((1 - c) / 1.55);
      if (env > 0.001 || reedDirty) {
        for (let i = 0; i < RNV; i++) {
          const g = rGap[i];
          rPos[i * 3 + 1] = rBaseY[i] + c * g;
          heat.color(c * g / GAP0, rCol, i);
        }
        reedGeo.attributes.position.needsUpdate = true;
        reedGeo.attributes.color.needsUpdate = true;
        reedGeo.computeVertexNormals();
        reedDirty = env > 0.001;
      }

      /* raig d'aire dins la ranura */
      jet.visible = env > 0.005;
      if (jet.visible) {
        const cols = JNU + 1;
        for (let j = 0; j <= JNV; j++) {
          const sj = J_S0 + (J_S1 - J_S0) * j / JNV, g = sj < 0 ? GAP0 : gapAt(sj);
          const y = Y_TBL + (sj < 0 ? GAP0 * (1 + c) * 0.5 + sj * 0.04 : g * (1 + c) * 0.5);
          const along = smooth(J_S0, J_S0 + 8, sj) * (1 - smooth(8, J_S1, sj));
          for (let i = 0; i < cols; i++) {
            const k = (j * cols + i) * 3, zn = i / JNU * 2 - 1;
            jetPos[k + 1] = y;
            const b = env * openF * along * (1 - zn * zn);
            jetCol[k] = 0.3 * b; jetCol[k + 1] = 0.65 * b; jetCol[k + 2] = 0.8 * b;
          }
        }
        jetGeo.attributes.position.needsUpdate = true;
        jetGeo.attributes.color.needsUpdate = true;
      }

      /* columna d'aire: quart d'ona. Pressió màxima a la canya (tub tancat), mínima al primer forat obert */
      xEnd += (endFor(ni) - xEnd) * kk;
      const L = Math.max(40, xEnd - X_REED);
      for (let i = 0; i < NV; i++) {
        const x = gx[i];
        let r = 0.008, g = 0.025, b = 0.035;
        const u = (x - X_REED) / L;
        const inside = 1 - smooth(1, 1 + 12 / L, u);
        const p = env > 0.001 ? -Math.cos(0.5 * PI * Math.min(Math.max(u, 0), 1)) * sp * env * inside : 0;
        const calm = 1 - 0.85 * Math.abs(p);
        r += 0.01 * inside * calm; g += 0.05 * inside * calm; b += 0.075 * inside * calm;
        if (p !== 0) {
          heat.color(p, tmp3, 0);
          r += tmp3[0] * 0.85; g += tmp3[1] * 0.85; b += tmp3[2] * 0.85;
        }
        gcol[i * 3] = r; gcol[i * 3 + 1] = g; gcol[i * 3 + 2] = b;
      }
      glowGeo.attributes.color.needsUpdate = true;

      // anelles: no es mouen a la canya i es mouen molt al forat obert
      const A = Math.min(0.06 * L, 22) * env;
      for (let j = 0; j < NR; j++) {
        const x0 = ringX0[j];
        let x = x0, r = 0.012, g = 0.03, b = 0.04;
        if (x0 <= xEnd) {
          const u = (x0 - X_REED) / L;
          x = Math.min(X_BELL - 2, x0 + A * Math.sin(0.5 * PI * Math.min(u, 1)) * sp);
          const ud = (x - X_REED) / L;
          const edge = 1 - smooth(0.94, 1.03, ud);
          heat.color(-Math.cos(0.5 * PI * Math.min(Math.max(u, 0), 1)) * sp * env, tmp3, 0);
          r = (0.02 + tmp3[0] * 0.5) * edge + 0.01;
          g = (0.08 + tmp3[1] * 0.5) * edge + 0.02;
          b = (0.11 + tmp3[2] * 0.5) * edge + 0.03;
        }
        placeRing(j, x);
        rings.setColorAt(j, tc.setRGB(r, g, b));
      }
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      endRing.position.x = Math.min(xEnd, X_BELL - 0.8);
      const eb = 0.25 + 0.75 * env * (0.6 + 0.4 * Math.abs(sp));
      endRing.material.color.setRGB(0.55 * eb, 0.9 * eb, 1.0 * eb);

      /* partícules d'aire */
      if (env > 0.02) {
        // l'aire de la boca entra per la ranura, a cops (quan la canya s'obre)
        G.broquet.localToWorld(vA.set(X_TIP - 14, Y_TBL + 1.1, 0));
        vB.set(1, 0.05, 0).transformDirection(G.broquet.matrixWorld);
        fx.air(vA, vB, 340 * env * openF, 0.18, 80);
        // surt pel primer forat obert
        const fo = firstOpen(ni);
        if (fo) {
          fo.fb.localToWorld(vA.set(fo.x, fo.top + 1.5, 0));
          vB.set(0, 1, 0.25).transformDirection(fo.fb.matrixWorld);
          fx.air(vA, vB, 380 * env * (0.55 + 0.45 * Math.abs(sp)), 0.45, 150);
        }
        // i una mica per la campana
        G.campana.localToWorld(vA.set(X_BELL + 1, 0, 0));
        vB.set(1, 0, 0).transformDirection(G.campana.matrixWorld);
        fx.air(vA, vB, 110 * env, 0.5, 90);
      }
    }
  };
}
