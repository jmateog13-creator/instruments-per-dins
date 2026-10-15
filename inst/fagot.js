// Fagot (sistema alemany) — mòdul d'instrument (Vent fusta)
// Unitats: mm. Y amunt. Es construeix dret en un marc local i després s'inclina una mica
// (cada grup del motor té un fill "T" amb la inclinació; les etiquetes es calculen amb tw()).
// Marc local: el conducte petit (ala + baixada de la culata) és a x = +20 i el conducte gran
// (pujada de la culata + cos llarg + campana) a x = -20. Els forats i les claus miren a +Z.
// Camí real de l'aire: canya → tudel → ala (baixa) → culata (mitja volta) → cos llarg (puja) → campana.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = PI * 2;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

  const G = groups(['tudel', 'ala', 'culata', 'llarg', 'campana', 'claus']);

  // ---------------------------------------------------------------- inclinació
  const TILT = 0.2;   // ~11°: la campana s'inclina cap a -X, com quan es toca
  const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, TILT));
  const T = {};
  for (const k in G) { const t = new THREE.Group(); t.quaternion.copy(Q); G[k].add(t); T[k] = t; }
  const add = (g, ge, m, part, o) => ctx.add(typeof g === 'string' ? T[g] : g, ge, m, part, o || {});
  const r1 = v => Math.round(v * 10) / 10;
  const tw = p => { const v = V3(p[0], p[1], p[2]).applyQuaternion(Q); return [r1(v.x), r1(v.y), r1(v.z)]; };
  const plus = (a, b) => [r1(a[0] + b[0]), r1(a[1] + b[1]), r1(a[2] + b[2])];

  // ---------------------------------------------------------------- materials
  const WOOD_COL = 0x9A5446;                      // auró amb vernís marró vermellós
  const maple = tex.maple(1, 1);
  const wood = part => M.wood(part, maple, { color: WOOD_COL, xray: true });
  const mAla = wood('ala'), mCulata = wood('culata'), mLlarg = wood('llarg'), mCampana = wood('campana');
  const dark = part => mat(part, { color: 0x140a07, roughness: 0.95, metalness: 0 }, { xray: true });
  const mHole = { ala: dark('ala'), culata: dark('culata'), llarg: dark('llarg') };
  const mSilAla = M.silver('ala'), mSilCul = M.silver('culata'), mSilLl = M.silver('llarg'), mSilCamp = M.silver('campana');
  const mUtube = M.silver('culata', { xray: true });
  const mTudel = M.silver('tudel', { xray: true });
  const mCork = mat('tudel', { color: 0xB48A5A, roughness: 0.92 });
  const mKey = M.silver('claus'), mRod = M.nickel('claus'), mPad = M.felt('claus', 0xB98E62);
  const mBlack = mat('campana', { color: 0x161412, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const mRest = M.plastic('culata', 0x1b1a19);
  const mCane = mat('canya', { color: 0xE3C274, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  const mThread = mat('canya', { color: 0x8C1D24, roughness: 0.75, sheen: 0.6, sheenColor: new THREE.Color(0xff8a8a) });
  const mWire = M.brass('canya');
  const mCore = mat('columna', { color: 0x4aa8c8, transparent: true, opacity: 0.1, roughness: 0.6, metalness: 0, depthWrite: false }, { phys: false });
  const glowMat = o => new THREE.MeshBasicMaterial(Object.assign({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }, o));
  const noPick = o => { o.raycast = () => {}; o.castShadow = false; o.receiveShadow = false; return o; };

  // ---------------------------------------------------------------- ajudes de geometria
  // Lathe de fusta: UV refetes perquè la veta vagi al llarg del tub
  function latheW(prof, R, seg = 64) {
    const g = geo.lathe(prof, seg), uv = g.attributes.uv, p = g.attributes.position, C = TAU * R / 240;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, p.getY(i) / 560, u * C); }
    return g;
  }
  function uvAlongY(g) {
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getY(i) / 560, (p.getX(i) * 0.8 + p.getZ(i)) / 240);
    return g;
  }
  // forma d'estadi (dos semicercles) al pla XY, centres a x = ±(hw-hr)
  function stadium(hw, hr) {
    const s = new THREE.Shape(), c = hw - hr;
    s.moveTo(-c, -hr); s.lineTo(c, -hr); s.absarc(c, 0, hr, -PI / 2, PI / 2, false);
    s.lineTo(-c, hr); s.absarc(-c, 0, hr, PI / 2, 3 * PI / 2, false);
    return s;
  }
  function stadiumPath(hw, hr) {
    const s = new THREE.Path(), c = hw - hr;
    s.moveTo(-c, -hr); s.lineTo(c, -hr); s.absarc(c, 0, hr, -PI / 2, PI / 2, false);
    s.lineTo(-c, hr); s.absarc(-c, 0, hr, PI / 2, 3 * PI / 2, false);
    return s;
  }
  // extrusió cap amunt (+Y): la profunditat de l'extrusió passa a ser l'alçada
  const extUp = (shape, depth, bevel, y0) => { const g = geo.ext(shape, depth, bevel); g.rotateX(-PI / 2); g.translate(0, y0, 0); return g; };
  // Malla de quadrícula (u tancat) amb normals suaus
  function gridGeo(nu, nv, fn) {
    const pos = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) { const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const i1 = (i + 1) % nu, a = j * nu + i, b = j * nu + i1, c = (j + 1) * nu + i, d = (j + 1) * nu + i1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function densify(arr, step) {
    const out = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      const a = out[out.length - 1], b = arr[i], L = a.distanceTo(b);
      if (L < 0.05) continue;
      const k = Math.max(1, Math.ceil(L / step));
      for (let j = 1; j <= k; j++) out.push(a.clone().lerp(b, j / k));
    }
    return out;
  }
  // polilínia amb cantonades arrodonides (punts [x,y,z,radi])
  function rounded(pts, rDef = 8) {
    const P = pts.map(p => V3(p[0], p[1], p[2])), R = pts.map(p => (p.length > 3 ? p[3] : rDef));
    const out = [P[0].clone()];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const d1 = b.clone().sub(a), d2 = c.clone().sub(b), l1 = d1.length(), l2 = d2.length();
      if (l1 < 1e-6 || l2 < 1e-6) continue;
      d1.multiplyScalar(1 / l1); d2.multiplyScalar(1 / l2);
      const th = Math.acos(Math.max(-1, Math.min(1, d1.dot(d2))));
      if (th < 1e-3 || R[i] <= 0) { out.push(b.clone()); continue; }
      let t = R[i] * Math.tan(th / 2);
      t = Math.min(t, l1 * (i - 1 === 0 ? 0.95 : 0.5), l2 * (i + 1 === P.length - 1 ? 0.95 : 0.5));
      const p1 = b.clone().addScaledVector(d1, -t), p2 = b.clone().addScaledVector(d2, t);
      const m = Math.max(6, Math.ceil(14 * th / (PI / 2)));
      for (let k = 0; k <= m; k++) {
        const u = k / m;
        out.push(p1.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(p2, u * u));
      }
    }
    out.push(P[P.length - 1].clone());
    return densify(out, 5);
  }
  const plen = P => { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; };
  const arr = v => [v.x, v.y, v.z];

  // ---------------------------------------------------------------- claus: peces comunes
  const cupProfile = rc => [[0, 0.3], [rc - 1.0, 0], [rc - 0.45, 0], [rc, 0.45], [rc, 2.0], [rc - 0.25, 3.0],
    [rc - 1.1, 3.85], [rc * 0.55, 4.35], [0, 4.5]];
  const _up = V3(0, 1, 0);
  // tassa amb coixinet: c = centre sobre la superfície, n = normal cap enfora
  function cupAt(parent, c, n, rc, o) {
    const q = new THREE.Quaternion().setFromUnitVectors(_up, n);
    const cup = add(parent, geo.lathe(cupProfile(rc), 40), mKey, 'claus', Object.assign({ pos: arr(c.clone().addScaledVector(n, 0.9)) }, o || {}));
    cup.quaternion.copy(q);
    const pad = add(parent, geo.cyl(rc - 0.7, 1.2, 'y', 32), mPad, 'claus', { pos: arr(c.clone().addScaledVector(n, 0.6)) });
    pad.quaternion.copy(q);
    return cup;
  }
  // pilar soldat a la fusta que aguanta una barra
  function post(parent, a, b) {
    const A = V3(...a), B = V3(...b), d = B.clone().sub(A).normalize();
    add(parent, geo.tube(a, b, 1.45, 1, 10), mKey, 'claus');
    add(parent, geo.tube(a, arr(A.clone().addScaledVector(d, 0.9)), 2.9, 1, 16), mKey, 'claus', { cast: false });
    add(parent, new THREE.SphereGeometry(2.3, 14, 10), mKey, 'claus', { pos: b });
  }
  function rodY(parent, x, z, y0, y1) {
    add(parent, geo.cyl(1.0, y1 - y0, 'y', 10), mRod, 'claus', { pos: [x, (y0 + y1) / 2, z] });
    add(parent, geo.cyl(1.6, 1.4, 'y', 12), mRod, 'claus', { pos: [x, y0 - 0.5, z] });
    add(parent, geo.cyl(1.6, 1.4, 'y', 12), mRod, 'claus', { pos: [x, y1 + 0.5, z] });
  }
  function spatula(parent, c, n, w, h) {
    const g = new THREE.ExtrudeGeometry(geo.rrect(-w / 2, w / 2, -h / 2, h / 2, Math.min(w, h) / 2.2),
      { depth: 1.2, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 });
    const me = add(parent, g, mKey, 'claus', { pos: arr(c) });
    me.quaternion.setFromUnitVectors(V3(0, 0, 1), n);
    return me;
  }
  // Clau llarga fixa (decorativa): barra paral·lela al tub, tocador a baix i tassa tancada a dalt
  function keyLine(base, n2, y0, y1, posts, opt = {}) {
    const n = V3(n2[0], 0, n2[1]).normalize();
    const rx = base[0] + n.x * 5.5, rz = base[1] + n.z * 5.5;
    rodY('claus', rx, rz, y0, y1);
    for (const y of posts) post('claus', [base[0] - n.x * 0.5, y, base[1] - n.z * 0.5], [rx, y, rz]);
    if (opt.pad !== false) {
      const c = V3(base[0], y1 + 10, base[1]);
      cupAt('claus', c, n, opt.rc || 5.0);
      add('claus', geo.curveTube([[rx, y1, rz], [rx, y1 + 4, rz], [base[0] + n.x * 5.2, y1 + 8, base[1] + n.z * 5.2]], 1.1, 10, 8), mKey, 'claus');
    }
    if (opt.touch !== false) {
      const c = V3(base[0] + n.x * 8.5, y0 - 8, base[1] + n.z * 8.5);
      spatula('claus', c, n, opt.tw || 8, opt.th || 15);
      add('claus', geo.curveTube([[rx, y0, rz], [rx + n.x * 1.5, y0 - 3, rz + n.z * 1.5], [c.x - n.x * 0.6, c.y + 2, c.z - n.z * 0.6]], 1.1, 10, 8), mKey, 'claus');
    }
    return { rx, rz };
  }

  // ================================================================ CULATA (boot)
  // Estadi de 88 × 48 mm: dos conductes a x = ±20. Fusta de y -620 a -200.
  {
    const g = extUp(stadium(39, 19), 408, { bevelThickness: 6, bevelSize: 5, bevelSegments: 4 }, -614);
    add('culata', uvAlongY(g), mCulata, 'culata');
    // virolla de dalt (anell de plata)
    const ring = stadium(44.9, 24.9); ring.holes.push(stadiumPath(43.4, 23.4));
    add('culata', extUp(ring, 12.4, { bevelThickness: 0.6, bevelSize: 0.4, bevelSegments: 2 }, -213), mSilCul, 'culata');
    // tapa de baix (protegeix el tub en U)
    add('culata', extUp(stadium(40.5, 20.5), 31, { bevelThickness: 3, bevelSize: 4.5, bevelSegments: 3 }, -647), mSilCul, 'culata');
    add('culata', extUp(stadium(45.4, 25.4), 3, null, -616), mSilCul, 'culata');
    // descans de la mà dreta (al costat +X)
    add('culata', geo.box(43, 52, -318, -306, -4, 4), mSilCul, 'culata');
    add('culata', geo.cyl(3.2, 8, 'x', 16), mSilCul, 'culata', { pos: [55, -312, 0] });
    const rest = geo.ext(geo.shape([[-14, -10], [8, -16], [20, -10], [24, 2], [18, 14], [4, 18], [-10, 12], [-16, 2]]), 6,
      { bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 3 });
    add('culata', rest, mRest, 'culata', { pos: [61, -312, 0], rot: [0, PI / 2, 0] });
    // anella per a la cinta (darrere, a dalt)
    add('culata', geo.cyl(3.4, 6, 'z', 16), mSilCul, 'culata', { pos: [26, -232, -26] });
    add('culata', new THREE.TorusGeometry(9, 1.6, 10, 32), mSilCul, 'culata', { pos: [26, -243, -30.5], rot: [0, 0, 0] });
  }

  // ================================================================ ALA (wing joint) — conducte petit, x = +20
  {
    const prof = [[6.8, -238], [13.2, -238], [13.6, -235], [13.6, -203], [16.2, -202], [16.9, -199], [16.6, 0], [16.2, 120],
      [15.7, 240], [15.6, 268], [14.8, 270], [5.9, 270], [5.6, 266], [5.6, 240], [4.6, 236], [6.8, -238]];
    add('ala', latheW(prof, 16.5, 64), mAla, 'ala', { pos: [20, 0, 0] });
    // l'ala: la part gruixuda on hi ha els forats de la mà esquerra
    const side = geo.shape([[0, -186], [24, -186], [27, -180], [27, 40], [24, 92], [16, 128], [6, 150], [0, 154]]);
    const g = geo.ext(side, 20, { bevelThickness: 3, bevelSize: 3, bevelSegments: 3 });
    g.rotateY(-PI / 2); g.translate(30, 0, 0);
    add('ala', uvAlongY(g), mAla, 'ala');
    // virolles de plata
    add('ala', geo.lathe([[16.6, -200], [17.7, -199.4], [17.9, -197], [17.9, -191], [17.4, -190], [16.6, -190]], 56), mSilAla, 'ala', { pos: [20, 0, 0] });
    add('ala', geo.lathe([[15.6, 251], [16.5, 251.5], [16.7, 253], [16.7, 268], [16.2, 270.5], [14.6, 271], [6.2, 271]], 56), mSilAla, 'ala', { pos: [20, 0, 0] });
  }

  // ================================================================ COS LLARG (long joint) — conducte gran, x = -20
  {
    const prof = [[9.0, -238], [15.6, -238], [16, -235], [16, -203], [18.8, -202], [19.6, -199], [19.6, 396], [16.0, 398],
      [16.0, 440], [15.4, 442], [11.4, 442], [11.4, 400], [9.0, -238]];
    add('llarg', latheW(prof, 19.6, 64), mLlarg, 'llarg', { pos: [-20, 0, 0] });
    add('llarg', geo.lathe([[19.6, -200], [20.7, -199.4], [20.9, -197], [20.9, -191], [20.4, -190], [19.6, -190]], 56), mSilLl, 'llarg', { pos: [-20, 0, 0] });
    add('llarg', geo.lathe([[19.6, 386], [20.4, 386.5], [20.7, 388.5], [20.7, 396], [20.0, 397.5], [16.4, 398]], 56), mSilLl, 'llarg', { pos: [-20, 0, 0] });
    // pont entre l'ala i el cos llarg (tanca les dues peces)
    add('llarg', geo.box(-2, 6, 214, 224, -3.5, 3.5), mSilLl, 'llarg');
  }

  // ================================================================ CAMPANA (bell joint)
  {
    const prof = [[16.3, 398], [22.6, 398], [22.6, 430], [21.8, 440], [21.4, 560], [21.8, 620], [22.8, 655], [24.2, 676],
      [24.2, 684], [18.6, 686], [18.0, 680], [15.5, 600], [12.6, 470], [12.2, 444], [16.3, 442], [16.3, 398]];
    add('campana', latheW(prof, 22, 72), mCampana, 'campana', { pos: [-20, 0, 0] });
    add('campana', geo.lathe([[22.6, 398], [23.6, 398.6], [23.8, 401], [23.8, 416], [23.2, 417.5], [22.4, 418]], 64), mSilCamp, 'campana', { pos: [-20, 0, 0] });
    // anell negre de la vora (es pot clicar: toca el Do, amb tots els forats tapats)
    add('campana', geo.lathe([[23.8, 668], [25.6, 668.5], [26.2, 671], [26.2, 688], [25.4, 690.5], [20.5, 691], [18.2, 689], [18.2, 686]], 72),
      mBlack, 'campana', { pos: [-20, 0, 0], note: 0 });
    add('campana', geo.lathe([[23.4, 662], [24.4, 662.4], [24.6, 664], [24.6, 667], [24.0, 668]], 72), mSilCamp, 'campana', { pos: [-20, 0, 0] });
  }

  // ================================================================ TUDEL (crook) i CANYA DOBLE
  const CROOK = [[20, 236, 0], [20, 268, 0], [20, 300, 0], [19.5, 330, 6], [18, 355, 30], [16, 368, 68], [14, 368, 110],
    [12, 358, 150], [10, 344, 190], [8.5, 332, 226]];
  const crookCurve = new THREE.CatmullRomCurve3(CROOK.map(p => V3(p[0], p[1], p[2])), false, 'centripetal');
  crookCurve.arcLengthDivisions = 400;
  const crookR = u => 5.0 - 2.45 * clamp01((u - 0.1) / 0.9);   // es fa prim cap a la canya
  {
    const SEG = 140, RAD = 16;
    const cg = new THREE.TubeGeometry(crookCurve, SEG, 1, RAD, false);
    const p = cg.attributes.position, c = V3(0, 0, 0), v = V3(0, 0, 0);
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG; crookCurve.getPointAt(u, c); const r = crookR(u);
      for (let j = 0; j <= RAD; j++) { const k = i * (RAD + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
    }
    add('tudel', cg, mTudel, 'tudel');
    // suro (entra dins de l'ala) i anell
    add('tudel', geo.lathe([[5.0, 238], [5.9, 239], [6.0, 241], [6.0, 272], [5.4, 273]], 40), mCork, 'tudel', { pos: [20, 0, 0] });
    add('tudel', geo.lathe([[5.0, 273], [6.3, 273.3], [6.5, 274.5], [6.5, 276.5], [5.9, 277.5], [4.9, 278]], 40), mTudel, 'tudel', { pos: [20, 0, 0] });
    // forat petit (pipa) que tapa la clau de piano
    add('tudel', geo.cyl(1.3, 3.8, 'z', 14), mTudel, 'tudel', { pos: [20, 300, -6.1] });
  }
  const E = crookCurve.getPointAt(1), D = crookCurve.getTangentAt(1).normalize();
  const REED_IN = 7, REED_TIP = 57, BL0 = 20, BL = REED_TIP - BL0;
  const reedG = new THREE.Group();
  reedG.position.copy(E).addScaledVector(D, -REED_IN);
  reedG.quaternion.setFromUnitVectors(V3(0, 0, 1), D);
  T.tudel.add(reedG);
  const rA = s => 4.5 + 2.7 * Math.pow(s, 0.75);                    // mitja amplada
  const rB = s => 4.3 * Math.pow(1 - s, 1.4) + 1.05 * s;            // mitja obertura
  const kV = s => 0.82 * Math.pow(s, 1.7);                          // quant vibra cada punt
  // fil enrotllat (lligadura)
  {
    const g = geo.lathe([[3.0, 0], [4.6, 0], [5.0, 1], [5.2, 4], [5.45, 10], [5.6, 16], [5.3, 20], [4.8, 22], [3.0, 22]], 40);
    g.rotateX(PI / 2);
    add(reedG, g, mThread, 'canya');
    for (const z of [23.5, 28.5]) {
      const s = (z - BL0) / BL, pts = [];
      for (let i = 0; i < 48; i++) { const th = i / 48 * TAU; pts.push([(rA(s) + 0.35) * Math.cos(th), (rB(s) + 0.35) * Math.sin(th), z]); }
      add(reedG, geo.curveTube(pts, 0.42, 48, 6, true), mWire, 'canya');
    }
  }
  // les dues làmines (un tub el·líptic que s'aplana fins a la punta)
  const NU = 40, NVB = 22;
  const bladeGeo = gridGeo(NU, NVB, (u, v) => { const th = u * TAU; return [rA(v) * Math.cos(th), rB(v) * Math.sin(th), BL0 + BL * v]; });
  const bladeCount = bladeGeo.attributes.position.count;
  const bladeBase = Float32Array.from(bladeGeo.attributes.position.array);
  const bSin = new Float32Array(bladeCount), bS = new Float32Array(bladeCount);
  for (let j = 0; j <= NVB; j++) for (let i = 0; i < NU; i++) { const k = j * NU + i; bSin[k] = Math.sin(i / NU * TAU); bS[k] = j / NVB; }
  const blade = add(reedG, bladeGeo, mCane, 'canya');
  heat.overlay(blade);
  const bladeCol = bladeGeo.attributes.color;
  let reedDirty = false;
  // brillantor a la punta: l'escletxa per on entra l'aire
  const tipMat = glowMat({ color: 0x9fe8ff, opacity: 0, side: THREE.DoubleSide });
  const tipGlow = noPick(new THREE.Mesh(new THREE.CircleGeometry(1, 36), tipMat));
  tipGlow.position.set(0, 0, REED_TIP + 0.3); tipGlow.renderOrder = 7; tipGlow.visible = false; reedG.add(tipGlow);

  // ================================================================ CAMÍ DE L'AIRE (peces en el sentit de l'aire)
  const reedTip = E.clone().addScaledVector(D, REED_TIP - REED_IN);
  const pieces = [];
  function piece(id, group, P, rIn, rOut, rCore) {
    const L = plen(P), segs = Math.max(8, Math.round(L / 4));
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    curve.arcLengthDivisions = Math.max(200, P.length * 4);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const p = { id, group, P, PW: P.map(v => v.clone().applyQuaternion(Q)), cum, L, segs };
    const ig = new THREE.TubeGeometry(curve, segs, rIn, 8, false);
    p.col = new Float32Array(ig.attributes.position.count * 3);
    ig.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
    p.inner = noPick(new THREE.Mesh(ig, glowMat({ vertexColors: true, opacity: 1 })));
    p.inner.renderOrder = 5; p.inner.visible = false; T[group].add(p.inner);
    if (rOut) {
      p.outer = noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, rOut, 12, false), glowMat({ color: 0x3fb8e8, opacity: 0 })));
      p.outer.renderOrder = 4; p.outer.visible = false; T[group].add(p.outer);
    }
    if (rCore) add(group, geo.curveTube(P.filter((_, i) => i % 2 === 0 || i === P.length - 1).map(arr), rCore, Math.max(16, Math.round(L / 8)), 12), mCore, 'columna', { cast: false });
    pieces.push(p);
    return p;
  }
  const crookPts = []; for (let i = 0; i <= 90; i++) crookPts.push(crookCurve.getPointAt(1 - i / 90));
  piece('canya', 'tudel', densify([reedTip, E.clone()], 4), 1.0, 0, 0);
  piece('tudel', 'tudel', crookPts, 1.6, 2.8, 2.2);
  piece('ala', 'ala', densify([V3(20, 236, 0), V3(20, -200, 0)], 5), 2.8, 5.0, 4.6);
  const BOOT_P = rounded([[20, -200, 0], [20, -610, 0, 20], [-20, -610, 0, 20], [-20, -200, 0]]);
  piece('culata', 'culata', BOOT_P, 3.6, 6.5, 5.8);
  piece('llarg', 'llarg', densify([V3(-20, -200, 0), V3(-20, 442, 0)], 5), 4.4, 8.5, 8.6);
  piece('campana', 'campana', densify([V3(-20, 442, 0), V3(-20, 694, 0)], 5), 5.5, 11, 12);
  const offs = []; let TOTAL = 0; for (const p of pieces) { offs.push(TOTAL); TOTAL += p.L; }
  const S_FINE = offs[2];   // fins aquí, polsos petits (canya i tudel són molt prims)
  // tub de metall en forma d'U dins de la culata (es veu amb raigs X)
  add('culata', geo.curveTube(BOOT_P.filter(v => v.y < -552).map(arr), 7.6, 48, 16), mUtube, 'culata');

  // ================================================================ FORATS I CLAUS QUE S'OBREN
  // at = primera nota (índex) en què el forat queda obert. 99 = tapat en aquestes notes.
  // Simplificat: cada nota més aguda destapa un forat més, cada vegada més a prop de la canya.
  const HOLES = [
    { g: 'llarg', part: 'llarg', x: -20, y: 100, zf: 19.6, rh: 5.4, rdx: 13, at: 1 },
    { g: 'culata', part: 'culata', x: -20, y: -430, zf: 24, rh: 5.0, rdx: -15, at: 2 },
    { g: 'culata', part: 'culata', x: 20, y: -480, zf: 24, rh: 4.4, rdx: 15, at: 3 },
    { g: 'culata', part: 'culata', x: 20, y: -390, zf: 24, rh: 4.2, rdx: 15, at: 4 },
    { g: 'culata', part: 'culata', x: 20, y: -300, zf: 24, rh: 4.2, rdx: 15, at: 5 },
    { g: 'ala', part: 'ala', x: 20, y: -140, zf: 30, rh: 3.8, rdx: -10, at: 6 },
    { g: 'ala', part: 'ala', x: 20, y: -50, zf: 30, rh: 3.6, rdx: -10, at: 7 },
    { g: 'ala', part: 'ala', x: 20, y: 25, zf: 30, rh: 3.4, rdx: -10, at: 99 }
  ];
  const surfZ = (h, x) => (h.g === 'llarg' ? Math.sqrt(19.6 * 19.6 - (x - h.x) * (x - h.x)) : h.g === 'culata' ? (Math.abs(x) <= 20 ? 24 : Math.sqrt(Math.max(0, 576 - (Math.abs(x) - 20) ** 2))) : 30);
  for (const h of HOLES) {
    // forat a la fusta
    add(h.g, geo.cyl(h.rh, 1.4, 'z', 28), mHole[h.part], h.part, { pos: [h.x, h.y, h.zf - 0.55], cast: false });
    // barra fixa i pilars
    const rx = h.x + h.rdx, rz = h.zf + 4.2, bz = surfZ(h, rx);
    rodY('claus', rx, rz, h.y - 19, h.y + 19);
    for (const dy of [-15, 15]) post('claus', [rx, h.y + dy, bz - 0.8], [rx, h.y + dy, rz]);
    // clau que gira sobre la barra
    const kg = new THREE.Group(); kg.position.set(rx, h.y, rz); T.claus.add(kg);
    const rc = h.rh + 2.2, sg = Math.sign(h.rdx);
    const o = h.at < 99 ? { note: h.at } : {};
    cupAt(kg, V3(-h.rdx, 0, h.zf - rz), V3(0, 0, 1), rc, o);
    add(kg, geo.curveTube([[-h.rdx + sg * (rc - 1.2), 0, 0.7], [-h.rdx * 0.45, 0, 1.4], [0, 0, 0]], 1.15, 12, 8), mKey, 'claus');
    add(kg, geo.cyl(2.0, 20, 'y', 16), mKey, 'claus');
    for (const dy of [-10, 10]) add(kg, geo.cyl(2.4, 1.0, 'y', 16), mKey, 'claus', { pos: [0, dy, 0], cast: false });
    h.kg = kg; h.ang = 0.4 * sg; h.open = 0;
    // posició sobre el camí de l'aire
    const bp = V3(h.x, h.y, 0); let best = 1e9;
    pieces.forEach((p, i) => { if (p.group !== h.g) return; p.P.forEach((q, j) => { const d = q.distanceTo(bp); if (d < best) { best = d; h.s = offs[i] + p.cum[j]; } }); });
    h.wl = V3(h.x, h.y, h.zf + 3).applyQuaternion(Q);   // sortida de l'aire (local inclinat)
  }

  // ================================================================ CLAUS FIXES (decoració realista)
  {
    // cos llarg: claus del polze esquerre (notes greus), barres llargues pel costat de darrere
    const L0 = [-20, 0], R = 19.6;
    [[200, 300], [222, 336], [244, 368]].forEach(([deg, y1], i) => {
      const a = deg * PI / 180, n = [Math.cos(a), Math.sin(a)];
      keyLine([L0[0] + R * n[0], L0[1] + R * n[1]], n, -150 + i * 14, y1, [-110 + i * 10, 110, y1 - 30], { rc: 6.2 - i * 0.4, th: 16 - i * 2 });
    });
    // campana: clau del Si bemoll greu (tancada)
    cupAt('claus', V3(-20 - 21.6, 482, 0), V3(-1, 0, 0), 6.6);
    rodY('claus', -20 - 26.5, -9, 452, 476);
    post('claus', [-20 - 20.6, 456, -7], [-20 - 26.5, 456, -9]);
    add('claus', geo.curveTube([[-46.5, 476, -9], [-46.5, 480, -6], [-44, 482, -2]], 1.1, 10, 8), mKey, 'claus');
    // ala: claus del polze esquerre, al darrere
    [[245, 60, 186], [270, 80, 200], [292, 100, 214]].forEach(([deg, y0, y1]) => {
      const a = deg * PI / 180, n = [Math.cos(a), Math.sin(a)];
      keyLine([20 + 16.3 * n[0], 16.3 * n[1]], n, y0, y1, [y0 + 22, y1 - 22], { rc: 4.4, tw: 7, th: 12 });
    });
    // culata: claus del polze dret, a la cara de darrere
    for (const [x, y0, y1] of [[-12, -350, -236], [1, -335, -250], [14, -320, -236]])
      keyLine([x, -24], [0, -1], y0, y1, [y0 + 22, y1 - 20], { rc: 5.0, tw: 9, th: 14 });
    // clau de piano: barra pel darrere de l'ala i tassa sobre la pipa del tudel
    const a = 300 * PI / 180, n = [Math.cos(a), Math.sin(a)];
    const k = keyLine([20 + 16.2 * n[0], 16.2 * n[1]], n, 116, 240, [146, 222], { pad: false, tw: 9, th: 13 });
    add('claus', geo.curveTube([[k.rx, 240, k.rz], [k.rx - 1, 262, k.rz - 2], [24, 288, -15], [20, 298, -13.6]], 1.2, 24, 8), mKey, 'claus');
    cupAt('claus', V3(20, 300, -8.1), V3(0, 0, -1), 3.4);
  }

  // ================================================================ POLSOS DE LLUM (es veuen a través de la fusta)
  const TN = 32, tdata = new Uint8Array(TN * TN * 4);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const dx = (i + 0.5) / TN * 2 - 1, dy = (j + 0.5) / TN * 2 - 1, r = Math.sqrt(dx * dx + dy * dy);
    const k = (j * TN + i) * 4; tdata[k] = tdata[k + 1] = tdata[k + 2] = 255;
    tdata[k + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - r), 1.7));
  }
  const dotTex = new THREE.DataTexture(tdata, TN, TN);
  dotTex.magFilter = THREE.LinearFilter; dotTex.minFilter = THREE.LinearFilter; dotTex.needsUpdate = true;
  const NB = 90;
  function beadLayer(size) {
    const pos = new Float32Array(NB * 3), col = new Float32Array(NB * 3), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = noPick(new THREE.Points(g, new THREE.PointsMaterial({
      size, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
    })));
    pts.frustumCulled = false; pts.renderOrder = 8; G.culata.add(pts);
    return { pos, col, g };
  }
  const LAY = [beadLayer(14), beadLayer(42)];
  const beads = []; for (let i = 0; i < NB; i++) beads.push({ alive: false, s: 0, w: 0, thru: false });
  const BEAD = new THREE.Color(0xC8F6FF);
  const SPEED = 1700, RATE = 14;   // mm per segon visual, polsos per segon

  const _p = V3(0, 0, 0), _a = V3(0, 0, 0), _d = V3(0, 0, 0);
  function sampleRoute(s, out) {
    let i = 0; while (i < pieces.length - 1 && s > offs[i] + pieces[i].L) i++;
    const p = pieces[i], ls = Math.min(p.L, Math.max(0, s - offs[i]));
    let lo = 0, hi = p.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] <= ls) lo = mid; else hi = mid; }
    const seg = p.cum[hi] - p.cum[lo], u = seg > 0 ? (ls - p.cum[lo]) / seg : 0;
    out.lerpVectors(p.PW[lo], p.PW[hi], u);
    return out.add(G[p.group].position).sub(G.culata.position);
  }

  // ---------------------------------------------------------------- notes i so
  const NOTES = [
    { label: 'Do', f: 130.81 }, { label: 'Re', f: 146.83 }, { label: 'Mi', f: 164.81 }, { label: 'Fa', f: 174.61 },
    { label: 'Sol', f: 196.00 }, { label: 'La', f: 220.00 }, { label: 'Si', f: 246.94 }, { label: 'Do agut', f: 261.63 }
  ];
  const SHAPE = [0.55, 1.0, 0.95, 0.85, 0.5, 0.42, 0.33, 0.26, 0.19, 0.14, 0.1, 0.07];   // 2–4 forts (s'escolten als portàtils)
  const formant = hz => 0.7 + 0.55 * Math.exp(-Math.pow((hz - 480) / 260, 2)) + 0.3 * Math.exp(-Math.pow((hz - 1150) / 330, 2));
  const holeFor = ni => { let best = null; for (const h of HOLES) if (ni >= h.at && (!best || h.s < best.s)) best = h; return best; };
  const sEndFor = ni => { const h = holeFor(ni); return h ? h.s : TOTAL; };
  // estat inicial: Do (tot tapat)
  let sEnd = TOTAL, lastT = 0, lastIdx = -1, spawnAcc = 0, beadsDirty = false;

  // ---------------------------------------------------------------- terra i càmeres
  const bb = new THREE.Box3();
  for (const k in G) { G[k].updateMatrixWorld(true); bb.expandByObject(G[k]); }
  const floorY = Math.floor(bb.min.y) - 4;
  const reedMid = E.clone().addScaledVector(D, 26);
  const camReed = tw(arr(reedMid));
  const camCrook = tw([16, 330, 110]);
  const camKeys = tw([8, -230, 30]);
  const camBell = tw([-20, 560, 0]);

  return {
    id: 'fagot',
    family: 'Vent fusta',
    name: 'Fagot',
    intro: "El fagot és un dels instruments més greus de la família de la fusta. Té una canya doble, com l'oboè, i un tub d'uns 2,5 metres plegat per la meitat.",
    floorY,
    camera: {
      explore: { pos: [1350, 480, 2700], target: [0, 30, 60] },
      exploded: { pos: [1650, 760, 3350], target: [-30, 190, 90] }
    },
    parts: {
      canya: { name: 'Canya doble', text: "Són dues làmines primes de canya lligades amb fil. Quan hi bufes, vibren l'una contra l'altra i fan vibrar l'aire.", dato: "Molts fagotistes es fan les canyes ells mateixos, a mà, amb una planta que s'assembla al bambú." },
      tudel: { name: 'Tudel', text: "És el tub de metall prim i corbat on es posa la canya. Té forma d'essa i porta l'aire fins a l'ala.", dato: "N'hi ha de llargades una mica diferents: amb un tudel més llarg, el fagot sona una mica més greu." },
      ala: { name: 'Ala', text: "És la primera peça de fusta, per on baixa l'aire després del tudel. Té una part gruixuda, com una ala, amb els forats de la mà esquerra.", dato: "Els forats de l'ala són llargs i inclinats: així els dits hi arriben i, per dins, el forat queda al lloc que toca." },
      culata: { name: 'Culata', text: "És la peça de baix i té dos conductes per dins, l'un al costat de l'altre. A baix de tot, un tub de metall en forma d'U fa girar l'aire cap amunt.", dato: "Té una anella on s'enganxa la cinta que el músic es penja al coll, perquè el fagot és gran i pesa força." },
      llarg: { name: 'Cos llarg', text: "És el tub llarg per on l'aire torna a pujar cap a la campana. Té les claus de les notes més greus, que es toquen amb el polze esquerre.", dato: 'És la peça més llarga del fagot: fa uns 60 centímetres.' },
      campana: { name: 'Campana', text: "És la peça de dalt de tot, on s'acaba el tub. Quan tots els forats estan tapats, el so surt per aquí.", dato: "Amb la campana posada, el fagot fa uns 1,34 metres d'alçada." },
      claus: { name: 'Claus i forats', text: "Alguns forats es tapen amb els dits i d'altres amb claus de metall. Quan s'obre un forat, l'aire que vibra s'acaba allà i la nota és més aguda.", dato: 'Un fagot pot tenir més de 20 claus, i el músic en mou moltes només amb els polzes.' },
      columna: { name: "Camí de l'aire", text: "Per dins hi ha un tub d'aire d'uns 2,5 metres, plegat per la meitat. L'aire baixa per l'ala, gira a la culata i puja fins a la campana.", dato: 'El contrafagot té un tub encara més llarg, de més de 5 metres, i sona una octava més greu que el fagot.' }
    },
    labels: [
      { part: 'canya', group: 'tudel', at: camReed, internal: false },
      { part: 'tudel', group: 'tudel', at: tw([15, 371, 80]), internal: false },
      { part: 'ala', group: 'ala', at: tw([36, 150, 4]), internal: false },
      { part: 'culata', group: 'culata', at: tw([44, -540, 6]), internal: false },
      { part: 'llarg', group: 'llarg', at: tw([-39.4, 240, 3]), internal: false },
      { part: 'campana', group: 'campana', at: tw([-46, 680, 0]), internal: false },
      { part: 'claus', group: 'claus', at: tw([20, -300, 30]), internal: false },
      { part: 'columna', group: 'culata', at: tw([0, -612, 0]), internal: true }
    ],
    explode: {
      tudel: [170, 300, 150, 0],
      ala: [170, 120, 30, 0.07],
      culata: [40, 0, -90, 0.14],
      llarg: [-150, 60, 0, 0.2],
      campana: [-200, 330, -20, 0.26],
      claus: [40, 30, 190, 0.33]
    },
    notes: NOTES,
    options: null,
    chain: ['Bufada', 'Canya doble', 'Tub plegat', 'Forats oberts', 'Aire'],
    tour: [
      { part: 'canya', chain: 1, title: 'La canya doble', note: 4,
        text: "El fagot es toca bufant entre dues làmines de canya lligades: és una canya doble, com la de l'oboè. Quan el músic bufa, les làmines s'obren i es tanquen molt de pressa. Aquesta vibració fa vibrar l'aire de dins del tub.",
        cam: { pos: plus(camReed, [150, 70, 150]), target: camReed }, slow: 0.35, xray: false },
      { part: 'tudel', chain: 2, title: 'El tudel', note: 0,
        text: "La canya va posada al tudel, un tub de metall prim i corbat en forma d'essa. Porta l'aire que vibra fins a l'ala, la primera peça de fusta. Per dins es va fent més ample a poc a poc.",
        cam: { pos: plus(camCrook, [330, 120, 330]), target: camCrook }, slow: 0.8, xray: true },
      { part: 'columna', chain: 2, title: 'Un tub plegat', note: 0,
        text: "El tub del fagot fa uns 2,5 metres, però està plegat per la meitat. L'aire baixa per l'ala, fa mitja volta a la culata i torna a pujar pel cos llarg fins a la campana. Com que el tub és tan llarg, el fagot sona molt greu.",
        cam: { pos: [1050, 330, 2550], target: [0, 20, 30] }, slow: 1, xray: true },
      { part: 'claus', chain: 3, title: 'Forats i claus', note: 6,
        text: "Quan s'obre un forat, l'aire que vibra s'acaba en aquell punt: el tub fa com si fos més curt i la nota és més aguda. Per a cada nota més aguda s'obre un forat més, cada vegada més a prop de la canya. Aquí les posicions dels dits estan simplificades.",
        cam: { pos: plus(camKeys, [480, 140, 920]), target: camKeys }, slow: 0.8, xray: false },
      { part: 'campana', chain: 4, title: 'El so surt', note: 0,
        text: "Amb tots els forats tapats, l'aire fa tot el camí i el so surt per la campana, a dalt de tot. Si hi ha forats oberts, el so surt sobretot pel primer forat obert. Després viatja per l'aire fins a les teves orelles.",
        cam: { pos: plus(camBell, [470, 300, 700]), target: camBell }, slow: 1, xray: false }
    ],
    soundSource: { group: 'campana', at: tw([-20, 700, 0]) },

    play(note) {
      const n = typeof note === 'number' ? NOTES[note] : note;
      const f = (n && n.f) || 130.81;
      const partials = SHAPE.map((a, i) => ({ k: i + 1, a: a * formant(f * (i + 1)), tau: 8 / (1 + 0.1 * (i + 1)) }));
      synth.additive({
        f, partials, attack: 0.06, hold: 1.3, release: 0.25,
        vibrato: { rate: 5, depth: 6 },
        noise: { amount: 0.025, dur: 1.6, lp: 2800, hp: 500 },
        gain: 0.9
      });
      // L'envolupant visual dura més perquè es vegi l'aire recórrer els 2,5 metres de tub.
      return { attack: 0.06, hold: 2.0, release: 0.35 };
    },

    update(dt, s) {
      dt = Math.min(dt || 0, 0.1);
      const env = clamp01(s.env || 0), t = s.t || 0;
      const ni = (typeof s.noteIndex === 'number' && s.noteIndex >= 0) ? Math.min(s.noteIndex, NOTES.length - 1) : 0;
      const ph = TAU * (s.fvis || 1) * t, sp = Math.sin(ph);
      const kk = 1 - Math.exp(-dt * 9);

      // --- claus: s'obren o es tanquen suaument i es queden així
      for (const h of HOLES) {
        const tgt = ni >= h.at ? 1 : 0;
        h.open += (tgt - h.open) * kk;
        if (Math.abs(tgt - h.open) < 1e-4) h.open = tgt;
        h.kg.rotation.y = h.ang * h.open;
      }
      // --- on s'acaba l'aire que vibra (primer forat obert, o la campana)
      const sTarget = sEndFor(ni);
      sEnd += (sTarget - sEnd) * kk;

      // --- nota nova?
      const reset = t < lastT - 1e-4 || s.noteIndex !== lastIdx;
      const dT = reset ? 0 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t; lastIdx = s.noteIndex;
      if (reset) { for (const b of beads) b.alive = false; spawnAcc = 0; beadsDirty = true; }

      // --- canya doble: les dues làmines s'obren i es tanquen
      const w = sp * env;
      if (env > 0.001) {
        const pa = bladeGeo.attributes.position, A = pa.array, C = bladeCol.array;
        for (let i = 0; i < bladeCount; i++) {
          const k = kV(bS[i]);
          A[i * 3 + 1] = bladeBase[i * 3 + 1] * (1 - k * w);
          heat.color(-bSin[i] * (k / 0.82) * w, C, i);
        }
        pa.needsUpdate = true; bladeCol.needsUpdate = true; bladeGeo.computeVertexNormals();
        reedDirty = true;
        tipGlow.visible = true;
        tipGlow.scale.set(rA(1) * 0.92, Math.max(0.05, rB(1) * (1 - kV(1) * w)), 1);
        tipMat.opacity = 0.55 * env;
      } else {
        tipGlow.visible = false;
        if (reedDirty) {
          bladeGeo.attributes.position.array.set(bladeBase); bladeGeo.attributes.position.needsUpdate = true;
          bladeCol.array.fill(0); bladeCol.needsUpdate = true; bladeGeo.computeVertexNormals();
          reedDirty = false;
        }
      }

      // --- el camí de l'aire s'il·lumina a poc a poc (de la canya a la campana)
      const front = SPEED * t, hum = 0.85 + 0.15 * Math.sin((s.time || 0) * 6);
      const tmp = [0, 0, 0];
      pieces.forEach((p, i) => {
        p.inner.visible = false; if (p.outer) p.outer.visible = false;
        if (env <= 0) return;
        const frac = clamp01((front - offs[i]) / p.L);
        if (frac <= 0) return;
        const k = Math.max(1, Math.ceil(frac * p.segs));
        p.inner.visible = true;
        p.inner.geometry.setDrawRange(0, k * 8 * 6);
        p.inner.material.opacity = env;
        // colors: dins de la columna que vibra, ona (taronja = aire comprimit, blau = expandit); després, més fluix
        for (let r = 0; r <= k; r++) {
          const sr = offs[i] + p.L * r / p.segs;
          let cr, cg, cb;
          if (sr <= sEnd) {
            const pr = Math.cos(0.5 * PI * sr / sEnd) * sp * env;
            heat.color(pr, tmp, 0);
            const calm = 1 - 0.7 * Math.abs(pr);
            cr = 0.18 * calm + tmp[0]; cg = 0.62 * calm + tmp[1]; cb = 0.8 * calm + tmp[2];
          } else { cr = 0.05; cg = 0.18; cb = 0.24; }
          for (let j = 0; j < 9; j++) { const q = (r * 9 + j) * 3; p.col[q] = cr; p.col[q + 1] = cg; p.col[q + 2] = cb; }
        }
        p.inner.geometry.attributes.color.needsUpdate = true;
        if (p.outer) {
          p.outer.visible = true;
          p.outer.geometry.setDrawRange(0, k * 12 * 6);
          p.outer.material.opacity = env * (s.xray ? 0.22 : 0.1) * hum;
        }
      });

      // --- aire que surt pel primer forat obert i per la campana
      if (env > 0.02) {
        const ho = holeFor(ni);
        if (ho && front >= ho.s && ho.open > 0.5) {
          _a.copy(ho.wl).add(G[ho.g].position);
          fx.air(_a, _d.set(0, 0.25, 1).applyQuaternion(Q), 400 * env * (0.6 + 0.4 * Math.abs(sp)), 0.45, 150);
        }
        if (front >= TOTAL) {
          _a.set(-20, 694, 0).applyQuaternion(Q).add(G.campana.position);
          fx.air(_a, _d.set(0, 1, 0).applyQuaternion(Q), (ho ? 120 : 480) * env, 0.45, ho ? 110 : 200);
        }
      }

      // --- polsos que viatgen pel tub (la majoria surten pel primer forat obert)
      if (env > 0.2) {
        spawnAcc += dT * RATE;
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const b = beads.find(q => !q.alive);
          if (b) { b.alive = true; b.s = spawnAcc * SPEED / RATE; b.w = Math.random() * TAU; b.thru = sTarget >= TOTAL - 1 || Math.random() < 0.3; }
        }
      }
      let any = false;
      for (let i = 0; i < NB; i++) {
        const b = beads[i];
        if (b.alive) { b.s += SPEED * dT; if (b.s >= TOTAL || env <= 0 || (!b.thru && b.s >= sEnd)) b.alive = false; }
        const L0 = LAY[0], L1 = LAY[1];
        if (b.alive) {
          any = true;
          sampleRoute(b.s, _p);
          const lay = b.s < S_FINE ? L0 : L1, oth = lay === L0 ? L1 : L0;
          lay.pos[i * 3] = _p.x; lay.pos[i * 3 + 1] = _p.y; lay.pos[i * 3 + 2] = _p.z;
          const fade = Math.min(1, (TOTAL - b.s) / 120) * (b.s > sEnd ? 0.4 : 1);
          const br = Math.min(1, env * 1.6) * (0.8 + 0.2 * Math.sin((s.time || 0) * 9 + b.w)) * fade;
          lay.col[i * 3] = BEAD.r * br; lay.col[i * 3 + 1] = BEAD.g * br; lay.col[i * 3 + 2] = BEAD.b * br;
          oth.col[i * 3] = oth.col[i * 3 + 1] = oth.col[i * 3 + 2] = 0;
        } else {
          for (const l of LAY) l.col[i * 3] = l.col[i * 3 + 1] = l.col[i * 3 + 2] = 0;
        }
      }
      if (any || beadsDirty) {
        for (const l of LAY) { l.g.attributes.position.needsUpdate = true; l.g.attributes.color.needsUpdate = true; }
        beadsDirty = any;
      }
    }
  };
}
