// Trompa en Fa — mòdul d'instrument (Vent metall)
// Unitats: mm. Y amunt. Els cercles del tub són al pla XY (la càmera els mira de cara des de +Z).
// El broquet és a dalt a l'esquerra, el pavelló a baix a la dreta (mira cap enrere i avall).
// Els tres cilindres rotatoris formen una columna (x = -30) amb l'eix del rotor al llarg de Z.
// Cada cilindre té 4 forats: A (225°, entrada), B (135°, sortida), C (45°) i D (-45°) cap a la bomba.
//   Sense prémer: el rotor uneix A-B i C-D.  Prement: el rotor gira 90° (sentit horari) i uneix A-D i C-B.
// Camí de l'aire: broquet → tudel → bomba d'afinació → cilindre 1 → 2 → 3 → cercles → pavelló.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, geo, fx, synth } = ctx;
  const add = (g, ge, m, part, o) => ctx.add(g, ge, m, part, o || {});
  const PI = Math.PI, DEG = PI / 180;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = u => { u = clamp01(u); return u * u * (3 - 2 * u); };

  const G = groups(['broquet', 'tudel', 'bombaAfin', 'cilindres', 'bomba1', 'bomba2', 'bomba3', 'tubs', 'pavello']);

  // ---------------------------------------------------------------- materials
  const pick = (ref, extra) => {
    const o = { color: ref.color.clone(), metalness: ref.metalness, roughness: ref.roughness, side: THREE.DoubleSide };
    if (ref.clearcoat !== undefined) { o.clearcoat = ref.clearcoat; o.clearcoatRoughness = ref.clearcoatRoughness; }
    return Object.assign(o, extra || {});
  };
  const brassRef = M.brass('tudel'), silverRef = M.silver('broquet'), nickelRef = M.nickel('cilindres');
  // llautó lacat (una mica més daurat que la trompeta) que es torna transparent amb els raigs X
  const brass = part => mat(part, pick(brassRef, { color: brassRef.color.clone().multiply(new THREE.Color(1.0, 0.97, 0.88)), clearcoat: 0.85, clearcoatRoughness: 0.1 }), { xray: true });
  const mBroquet = mat('broquet', pick(silverRef), { phys: false, xray: true });
  const mTudel = brass('tudel');
  const mMain = brass('bombes');
  const mValve = brass('cilindres');
  const mLever = brass('cilindres');
  const mSlide = brass('bombes');
  const mCoil = brass('tubs');
  const mBell = brass('pavello');
  const mRotor = mat('cilindres', pick(nickelRef), { phys: false, xray: true });
  const mSteel = M.nickel('cilindres');
  const mPass = mat('cilindres', { color: 0x3A2810, roughness: 0.6, metalness: 0.4 });
  const mCork = mat('cilindres', { color: 0xA87A4E, roughness: 0.95 });

  // brillantors (no són peces: no es poden seleccionar)
  const GLOW = new THREE.Color(0x66E0FF), BEAD = new THREE.Color(0xC8F6FF);
  const glowMat = op => new THREE.MeshBasicMaterial({
    color: GLOW, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide, toneMapped: false
  });
  const noPick = o => { o.raycast = () => {}; o.castShadow = false; o.receiveShadow = false; return o; };

  // ---------------------------------------------------------------- ajudes de corbes
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
  // Polilínia amb cantonades arrodonides. Cada punt: [x,y,z] o [x,y,z,radi] (radi 0 = sense arrodonir)
  function rounded(pts, rDef = 8) {
    const P = pts.map(p => (p.isVector3 ? p.clone() : V3(p[0], p[1], p[2])));
    const R = pts.map(p => (p.isVector3 ? rDef : p.length > 3 ? p[3] : rDef));
    const out = [P[0].clone()];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
      const l1 = d1.length(), l2 = d2.length();
      if (l1 < 1e-6 || l2 < 1e-6) continue;
      d1.multiplyScalar(1 / l1); d2.multiplyScalar(1 / l2);
      const th = Math.acos(Math.max(-1, Math.min(1, d1.dot(d2))));
      if (th < 1e-3 || R[i] <= 0) { out.push(b.clone()); continue; }
      let t = R[i] * Math.tan(th / 2);
      t = Math.min(t, l1 * (i - 1 === 0 ? 0.95 : 0.5), l2 * (i + 1 === P.length - 1 ? 0.95 : 0.5));
      const p1 = b.clone().addScaledVector(d1, -t), p2 = b.clone().addScaledVector(d2, t);
      const m = Math.max(4, Math.ceil(10 * th / (PI / 2)));
      for (let k = 0; k <= m; k++) {
        const u = k / m;
        out.push(p1.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(p2, u * u));
      }
    }
    out.push(P[P.length - 1].clone());
    return densify(out, 5);
  }
  const plen = P => { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; };
  function splitRuns(P, keyOf) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const k = keyOf(P[i].clone().add(P[i + 1]).multiplyScalar(0.5));
      const last = out[out.length - 1];
      if (last && last.key === k) last.P.push(P[i + 1]);
      else out.push({ key: k, P: [P[i], P[i + 1]] });
    }
    return out;
  }
  // Tub al llarg d'una polilínia; el radi pot ser un número o una funció r(u), u = 0..1 (tub cònic)
  function tubeGeo(P, rFn, radial, step) {
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    curve.arcLengthDivisions = Math.max(200, P.length * 4);
    const segs = Math.max(8, Math.round(plen(P) / step));
    const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    const pos = g.attributes.position, c = V3(0, 0, 0), v = V3(0, 0, 0);
    for (let i = 0; i <= segs; i++) {
      curve.getPointAt(i / segs, c);
      const r = typeof rFn === 'number' ? rFn : rFn(i / segs);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    g.userData.segs = segs;
    return g;
  }
  const tubeAlong = (group, P, r, m, part, radial = 16) => add(group, tubeGeo(P, r, radial, 2.2), m, part);
  // Gira la geometria (no la malla) perquè la caixa que l'envolta sigui ajustada
  function aimed(g, from, dir, origin) {
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize()));
    return g.translate(origin.x, origin.y, origin.z);
  }
  const cylAlong = (group, center, dir, r, len, m, part, seg = 28) =>
    add(group, aimed(geo.cyl(r, len, 'y', seg), V3(0, 1, 0), dir, center), m, part);
  // Lathe amb l'eix Y girat cap a dir (la y del perfil avança en el sentit de dir)
  const dirLathe = (group, prof, m, part, origin, dir, seg = 56) =>
    add(group, aimed(geo.lathe(prof, seg), V3(0, 1, 0), dir, origin), m, part);
  const pol = (cx, cy, r, deg, z = 0) => V3(cx + r * Math.cos(deg * DEG), cy + r * Math.sin(deg * DEG), z);
  const arr = v => [v.x, v.y, v.z];

  // ---------------------------------------------------------------- mides principals
  const DMP = V3(-0.722, 0.692, 0).normalize();      // el broquet mira amunt a l'esquerra
  const DIN = DMP.clone().negate();                   // sentit de l'aire al tudel
  const P_REC = V3(-165, 128, 20);                    // boca del receptor del broquet
  const R_MP = P_REC.clone().addScaledVector(DMP, 80); // vora del broquet (on van els llavis)
  const LP0 = P_REC.clone().addScaledVector(DIN, 33);
  const LP_X = -112;                                  // tram vertical del tudel
  const LP_C = LP0.clone().addScaledVector(DIN, (LP_X - LP0.x) / DIN.x);
  const VX = -30, VYS = [-20, 20, 60], RC = 14.5;    // cilindres: columna, radi de la caixa
  const SLIDE_END = [50, 22, 72];                     // x on gira cada bomba (la 2 és la més curta, la 3 la més llarga)
  const SL_X = -8;                                    // a partir d'aquí la bomba es pot treure
  const BELL_L = 270;
  const bellR = d => 152.5 * Math.pow(9.24 / (d + 9.24), 0.8);   // d = distància a la vora del pavelló

  // Els cercles del tub (angle en graus, decreix: sentit horari vist de cara)
  function coilAt(th) {
    let r, z;
    if (th >= -195) { r = 118; z = -24; }                                                         // 1a volta (interior, al fons)
    else if (th >= -235) { const u = smooth((-195 - th) / 40); r = 118 + 10 * u; z = -24 + 16 * u; } // canvi de volta
    else if (th >= -495) { r = 128; z = -8; }                                                     // 2a volta
    else if (th >= -580) { const u = smooth((-495 - th) / 85); r = 128 + 18 * u; z = -8 + 8 * u; }  // la cua del pavelló surt per fora
    else if (th >= -660) { r = 146; z = 0; }
    else { r = 146; z = 0.62 * (-660 - th); }
    return [r * Math.cos(th * DEG), r * Math.sin(th * DEG), z];
  }
  const TH_END = -680;
  const F0 = V3(...coilAt(TH_END));                                       // on comença el pavelló
  const BDIR = V3(Math.sin(40 * DEG), -Math.cos(40 * DEG), 0.243).normalize(); // eix del pavelló
  const RIM = F0.clone().addScaledVector(BDIR, BELL_L);

  // ================================================================ BROQUET
  {
    // perfil tancat: cara interior (copa en forma d'embut i tub) i cara exterior
    const prof = [
      [8.9, 0.4], [8.6, 1.8], [8.0, 4], [7.0, 8], [5.6, 13], [4.1, 18], [2.9, 22], [2.3, 26], [2.3, 32],
      [2.6, 44], [3.1, 58], [3.6, 72], [4.0, 86], [4.7, 87], [4.9, 80], [5.0, 70], [5.3, 60], [5.9, 52],
      [6.8, 42], [7.9, 30], [9.2, 20], [10.4, 12], [11.3, 6], [12.0, 2.8], [12.3, 1.0],
      [12.0, -0.4], [11.2, -1.1], [10.2, -1.3], [9.4, -0.9], [8.9, 0.4]
    ];
    dirLathe(G.broquet, prof, mBroquet, 'broquet', R_MP, DIN, 64);
  }
  // llavis que vibren (brillantor)
  const lipMat = new THREE.MeshBasicMaterial({ color: 0xFF8A66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const lipRingMat = lipMat.clone();
  const lipDisc = noPick(new THREE.Mesh(new THREE.CircleGeometry(8.4, 36), lipMat));
  const lipRing = noPick(new THREE.Mesh(new THREE.TorusGeometry(10.2, 1.6, 10, 44), lipRingMat));
  for (const o of [lipDisc, lipRing]) {
    o.position.copy(R_MP).addScaledVector(DMP, 2.5);
    o.quaternion.setFromUnitVectors(V3(0, 0, 1), DMP);
    o.renderOrder = 6; o.visible = false; G.broquet.add(o);
  }

  // ================================================================ TUDEL (+ tub de tornada cap als cilindres)
  const LEAD_PTS = [arr(LP0), [LP_C.x, LP_C.y, LP_C.z, 34], [LP_X, -62, 20]];
  const RET_PTS = [[-86, -62, 20], [-86, -38, 20, 10], [-62, -48, 6, 10], [-44.5, -34.5, 0, 4], [-40.25, -30.25, 0]];
  {
    // receptor del broquet
    dirLathe(G.tudel, [[4.9, 0], [7.3, 0], [8.0, 0.8], [8.0, 3.4], [7.1, 4.4], [6.9, 6.5], [6.8, 30], [6.3, 34], [5.4, 37]], mTudel, 'tudel', P_REC, DIN);
    // tub cònic
    const P = rounded(LEAD_PTS);
    add(G.tudel, tubeGeo(P, u => 5.0 + 1.3 * u, 18, 2.2), mTudel, 'tudel');
    // anelles decoratives
    for (const d of [55, 75]) dirLathe(G.tudel, [[5.4, 0], [6.6, 0.5], [6.6, 2.5], [5.4, 3]], mTudel, 'tudel', P_REC.clone().addScaledVector(DIN, d), DIN, 32);
    // tub de tornada (de la bomba d'afinació al cilindre 1)
    tubeAlong(G.tudel, rounded(RET_PTS), 6.2, mTudel, 'tudel');
    // fundes on entra la bomba d'afinació
    for (const x of [LP_X, -86]) {
      add(G.tudel, geo.cyl(7.3, 22, 'y', 32), mTudel, 'tudel', { pos: [x, -51, 20] });
      add(G.tudel, geo.cyl(7.9, 2.2, 'y', 32), mTudel, 'tudel', { pos: [x, -61, 20] });
      add(G.tudel, geo.cyl(7.9, 2.2, 'y', 32), mTudel, 'tudel', { pos: [x, -41, 20] });
    }
    add(G.tudel, geo.tube([LP_X + 6, -46, 20], [-92, -46, 20], 1.7, 1, 10), mTudel, 'tudel');
    // travessa del tudel als cercles
    const cb = V3(...coilAt(-560));
    add(G.tudel, geo.tube([LP_X - 2, 46, 14], [cb.x + 4, cb.y, cb.z + 3], 1.8, 1, 10), mTudel, 'tudel');
    add(G.tudel, geo.cyl(3.2, 1.4, 'x', 18), mTudel, 'tudel', { pos: [LP_X - 5.6, 46, 18] });
  }

  // ================================================================ BOMBA D'AFINACIÓ
  const MAIN_PTS = [[LP_X, -46, 20], [LP_X, -170, 20, 13], [-86, -170, 20, 13], [-86, -46, 20]];
  {
    tubeAlong(G.bombaAfin, rounded(MAIN_PTS), 6.1, mMain, 'bombes');
    add(G.bombaAfin, geo.tube([LP_X + 5, -128, 20], [-91, -128, 20], 1.8, 1, 10), mMain, 'bombes');
    for (const x of [LP_X, -86]) add(G.bombaAfin, geo.cyl(6.8, 3, 'y', 28), mMain, 'bombes', { pos: [x, -75, 20] });
    // pom per estirar-la
    add(G.bombaAfin, geo.cyl(2, 7, 'y', 14), mMain, 'bombes', { pos: [-99, -185, 20] });
    add(G.bombaAfin, new THREE.SphereGeometry(3.6, 18, 12), mMain, 'bombes', { pos: [-99, -190, 20] });
  }

  // ================================================================ CILINDRES (caixes, rotors, palanques)
  const rotors = [], levers = [], rods = [];
  const CRANK = 7, LT = 34, LS = 40, LZ = 34, PIV_X = VX - CRANK * Math.SQRT1_2 - LT;
  const PHI = Math.asin(2 * CRANK * Math.SQRT1_2 / LT);   // gir de la palanca perquè el rotor faci 90°
  {
    const casing = [[14.5, -16], [15.2, -15.4], [15.2, -12.6], [14.5, -12], [14.5, 12], [15.2, 12.6], [15.2, 15.4], [14.5, 16]];
    const cap = [[2.4, 0], [13.6, 0], [15.3, 0.4], [15.6, 1.2]];
    for (let k = 0; k < 6; k++) { const y = 1.4 + k * 0.42; cap.push([15.95, y], [15.55, y + 0.21]); }
    cap.push([15.4, 4.0], [14.2, 4.4], [6, 4.8], [2.4, 4.8]);
    const passage = (a1, am, a2) => [pol(0, 0, 11.2, a1), pol(0, 0, 8.2, a1), pol(0, 0, 3.8, am), pol(0, 0, 8.2, a2), pol(0, 0, 11.2, a2)].map(arr);
    VYS.forEach((y, i) => {
      const x = VX;
      add(G.cilindres, geo.lathe(casing, 56), mValve, 'cilindres', { pos: [x, y, 0], rot: [PI / 2, 0, 0] });
      add(G.cilindres, geo.lathe(cap, 56), mValve, 'cilindres', { pos: [x, y, 16], rot: [PI / 2, 0, 0] });
      add(G.cilindres, geo.lathe(cap, 56), mValve, 'cilindres', { pos: [x, y, -16], rot: [-PI / 2, 0, 0] });
      // virolles als 4 forats
      for (const a of [225, 135, 45, -45]) {
        const d = pol(0, 0, 1, a);
        cylAlong(G.cilindres, pol(x, y, 15.8, a), d, 6.5, 3.2, mValve, 'cilindres');
      }
      // topalls de suro (darrere)
      for (const a of [252, 108]) {
        const p = pol(x, y, 10, a);
        add(G.cilindres, geo.cyl(2.3, 3, 'z', 16), mCork, 'cilindres', { pos: [p.x, p.y, -22.4] });
      }
      // rotor (gira 90° quan prems la palanca)
      const rg = new THREE.Group(); rg.position.set(x, y, 0); G.cilindres.add(rg); rotors.push(rg);
      add(rg, geo.cyl(12.2, 31, 'z', 40), mRotor, 'cilindres');
      add(rg, geo.curveTube(passage(225, 180, 135), 3.6, 24, 10), mPass, 'cilindres');
      add(rg, geo.curveTube(passage(45, 0, -45), 3.6, 24, 10), mPass, 'cilindres');
      add(rg, geo.cyl(2.3, 12, 'z', 16), mSteel, 'cilindres', { pos: [0, 0, 22] });             // eix davant
      add(rg, geo.cyl(4.2, 2.6, 'z', 24), mLever, 'cilindres', { pos: [0, 0, 25.5] });           // botó de la maneta
      add(rg, geo.box(0, CRANK, -1.6, 1.6, 24.3, 26.7), mLever, 'cilindres', { rot: [0, 0, 225 * DEG] }); // maneta
      add(rg, new THREE.SphereGeometry(2.0, 14, 10), mSteel, 'cilindres', { pos: arr(pol(0, 0, CRANK, 225, 25.5)) });
      add(rg, geo.cyl(2.3, 6, 'z', 16), mSteel, 'cilindres', { pos: [0, 0, -22] });             // eix darrere
      add(rg, geo.box(0, 12, -2, 2, -23.6, -21.4), mLever, 'cilindres', { rot: [0, 0, 225 * DEG] }); // braç de tope
      add(rg, geo.cyl(3.6, 1.6, 'z', 20), mValve, 'cilindres', { pos: [0, 0, -24.6] });
      // palanca (la mà esquerra la prem cap avall)
      const py = y - CRANK * Math.SQRT1_2 - 14;
      const lg = new THREE.Group(); lg.position.set(PIV_X, py, LZ); G.cilindres.add(lg); levers.push(lg);
      add(lg, geo.ext(geo.rrect(-LS - 5, LT + 2.5, -2, 2, 1.6), 2.2, { bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 }), mLever, 'cilindres', { pos: [0, 0, -1.1] });
      add(lg, geo.ext(geo.rrect(-8, 8, -4.5, 4.5, 3), 1.4, { bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }), mLever, 'cilindres', { pos: [-LS - 1, 2.4, 0], rot: [-PI / 2, 0, 0] });
      add(lg, new THREE.SphereGeometry(2.0, 14, 10), mSteel, 'cilindres', { pos: [LT, 0, 0] });
      add(lg, geo.cyl(3.6, 4, 'z', 20), mLever, 'cilindres');
      add(G.cilindres, geo.cyl(1.5, 6, 'z', 12), mSteel, 'cilindres', { pos: [PIV_X, py, 31] });   // pern
      add(G.cilindres, new THREE.TorusGeometry(2.8, 0.55, 6, 20), mSteel, 'cilindres', { pos: [PIV_X, py, 30.2] }); // molla
      // biela (es recol·loca a cada fotograma)
      rods.push(add(G.cilindres, geo.cyl(0.95, 1, 'y', 10), mSteel, 'cilindres'));
    });
    // barra de les palanques i suports
    add(G.cilindres, geo.tube([PIV_X, -48, 29], [PIV_X, 50, 29], 2.2, 1, 12), mValve, 'cilindres');
    for (const yy of [-48, 50]) add(G.cilindres, new THREE.SphereGeometry(2.6, 14, 10), mValve, 'cilindres', { pos: [PIV_X, yy, 29] });
    add(G.cilindres, geo.tube([PIV_X, 50, 29], [LP_X + 5, 50, 21], 1.7, 1, 10), mValve, 'cilindres');
    add(G.cilindres, geo.tube([PIV_X, -48, 29], arr(pol(VX, VYS[0], 14.6, 230, 10)), 1.7, 1, 10), mValve, 'cilindres');
    // travesses dels cilindres als cercles
    const s1 = pol(VX, VYS[0], 14.5, 270, -8), s3 = pol(VX, VYS[2], 14.5, 60, -8);
    add(G.cilindres, geo.tube(arr(s1), coilAt(-110), 1.7, 1, 10), mValve, 'cilindres');
    add(G.cilindres, geo.tube(arr(s3), coilAt(95), 1.7, 1, 10), mValve, 'cilindres');
  }
  const KNUCK = [0, 1].map(i => {
    const y = VYS[i];
    return [[VX - 10.25, y + 10.25, 0], [VX - 20, y + 20, 0, 8], [VX - 10.25, y + 29.75, 0]];
  });
  for (const k of KNUCK) tubeAlong(G.cilindres, rounded(k), 5.5, mValve, 'cilindres');

  function placeRods(press) {
    VYS.forEach((y, i) => {
      const lg = levers[i], phi = PHI * press[i + 1];
      const a = V3(PIV_X + LT * Math.cos(phi), lg.position.y + LT * Math.sin(phi), LZ);
      const b = pol(VX, y, CRANK, 225 - 90 * press[i + 1], 25.5);
      const d = b.clone().sub(a), L = d.length();
      const r = rods[i];
      r.position.copy(a).addScaledVector(d, 0.5);
      r.quaternion.setFromUnitVectors(V3(0, 1, 0), d.multiplyScalar(1 / L));
      r.scale.set(1, L, 1);
    });
  }

  // ================================================================ BOMBES DELS CILINDRES
  const SLIDE = VYS.map((y, i) => {
    const xe = SLIDE_END[i], x = VX;
    return [[x + 10.25, y - 10.25, 0], [x + 13, y - 13, 0, 4], [xe, y - 13, 0, 13], [xe, y + 13, 0, 13], [x + 13, y + 13, 0, 4], [x + 10.25, y + 10.25, 0]];
  });
  SLIDE.forEach((pts, i) => {
    const g = G['bomba' + (i + 1)], y = VYS[i], xe = SLIDE_END[i];
    const runs = splitRuns(rounded(pts), m => (m.x > SL_X ? 'slide' : 'stub'));
    for (const r of runs) {
      if (r.key === 'stub') tubeAlong(G.cilindres, r.P, 5.6, mValve, 'cilindres');
      else tubeAlong(g, r.P, 5.4, mSlide, 'bombes');
    }
    // fundes fixes (on entra la bomba)
    for (const yy of [y - 13, y + 13]) {
      add(G.cilindres, geo.cyl(6.5, 10, 'x', 28), mValve, 'cilindres', { pos: [SL_X + 5, yy, 0] });
      add(G.cilindres, geo.cyl(7.1, 1.8, 'x', 28), mValve, 'cilindres', { pos: [SL_X + 10, yy, 0] });
    }
    // travessa i pom de la bomba
    const bx = (SL_X + 10 + xe - 13) / 2;
    add(g, geo.tube([bx, y - 8, 0], [bx, y + 8, 0], 1.5, 1, 10), mSlide, 'bombes');
    add(g, geo.cyl(1.8, 6, 'x', 12), mSlide, 'bombes', { pos: [xe + 13 + 7, y, 0] });
    add(g, new THREE.SphereGeometry(3, 16, 10), mSlide, 'bombes', { pos: [xe + 13 + 11, y, 0] });
  });

  // ================================================================ TUBS ENROTLLATS (cercles)
  const coilRaw = [[-40.25, 70.25, 0, 0], [-50, 80, -6, 8], [-50, 100, -18, 12]];
  {
    const N = 262;
    for (let i = 0; i <= N; i++) { const th = 105 + (TH_END - 105) * i / N; coilRaw.push([...coilAt(th), 0]); }
  }
  const COIL_P = rounded(coilRaw);
  const coilR = u => 5.8 + 4.4 * Math.pow(u, 2.2);
  add(G.tubs, tubeGeo(COIL_P, coilR, 18, 2.2), mCoil, 'tubs');
  {
    // travesses entre les dues voltes
    for (const th of [60, -30, -110]) {
      const a = V3(118 * Math.cos(th * DEG), 118 * Math.sin(th * DEG), -24), b = V3(128 * Math.cos(th * DEG), 128 * Math.sin(th * DEG), -8);
      add(G.tubs, geo.tube(arr(a), arr(b), 1.8, 1, 10), mCoil, 'tubs');
    }
    // virolles
    for (const th of [-200, -470, -620]) {
      const p = V3(...coilAt(th)), q = V3(...coilAt(th - 1));
      const u = (105 - th) / (105 - TH_END);
      cylAlong(G.tubs, p, q.sub(p), coilR(u) + 0.7, 4, mCoil, 'tubs', 32);
    }
  }

  // ================================================================ PAVELLÓ
  {
    const prof = [];
    for (let i = 0; i <= 90; i++) { const y = BELL_L * (1 - Math.pow(1 - i / 90, 1.8)); prof.push([bellR(BELL_L - y), y]); }
    dirLathe(G.pavello, prof, mBell, 'pavello', F0, BDIR, 96);
    // vora enrotllada
    add(G.pavello, aimed(new THREE.TorusGeometry(bellR(0) + 1.2, 2.4, 14, 160), V3(0, 0, 1), BDIR, RIM), mBell, 'pavello');
    // garlanda (unió amb el tub)
    dirLathe(G.pavello, [[10.0, 0], [11.6, 0.8], [12.2, 3], [12.2, 14], [11.8, 18], [11.0, 22]], mBell, 'pavello', F0.clone().addScaledVector(BDIR, -6), BDIR, 40);
    // travessa del pavelló als cercles
    const A = F0.clone().addScaledVector(BDIR, 120), T = V3(...coilAt(-372));
    const dperp = T.clone().sub(A); dperp.addScaledVector(BDIR, -dperp.dot(BDIR)).normalize();
    const S = A.clone().addScaledVector(dperp, bellR(BELL_L - 120) * 0.92);
    add(G.pavello, geo.tube(arr(S), arr(T), 1.8, 1, 10), mBell, 'pavello');
    cylAlong(G.pavello, S, dperp, 3.4, 1.4, mBell, 'pavello', 18);
  }

  // ================================================================ CAMÍ DE L'AIRE (brillantor)
  const pieces = {}, allPieces = [];
  function piece(id, group, P, rIn, rOut) {
    const L = plen(P);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const p = { id, group, P, cum, L, segs: 0, inner: null, outer: null };
    const gi = tubeGeo(P, rIn, 8, 3);
    p.segs = gi.userData.segs;
    p.inner = noPick(new THREE.Mesh(gi, glowMat(0)));
    p.inner.renderOrder = 5; p.inner.visible = false; G[group].add(p.inner);
    if (rOut) {
      p.outer = noPick(new THREE.Mesh(tubeGeo(P, rOut, 12, 3), glowMat(0)));
      p.outer.renderOrder = 6; p.outer.visible = false; G[group].add(p.outer);
    }
    pieces[id] = p; allPieces.push(p);
    return id;
  }
  piece('mp', 'broquet', densify([R_MP.clone(), P_REC.clone().addScaledVector(DIN, 4)], 5), 1.8, 0);
  piece('lead', 'tudel', rounded([arr(P_REC.clone().addScaledVector(DIN, 4)), LEAD_PTS[1], LEAD_PTS[2]]), 3.6, 7.0);
  piece('main', 'bombaAfin', rounded(MAIN_PTS.map((p, i) => (i === 0 ? [p[0], -62, p[2]] : i === 3 ? [p[0], -62, p[2]] : p))), 4.0, 7.1);
  piece('ret', 'tudel', rounded(RET_PTS), 4.0, 7.2);
  piece('k12', 'cilindres', rounded(KNUCK[0]), 3.6, 6.6);
  piece('k23', 'cilindres', rounded(KNUCK[1]), 3.6, 6.6);
  piece('coil', 'tubs', COIL_P, 4.4, u => coilR(u) + 1.1);
  {
    const P = densify([F0.clone(), F0.clone().addScaledVector(BDIR, BELL_L + 2)], 5);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    pieces.bell = { id: 'bell', group: 'pavello', P, cum, L: plen(P), bell: true };
  }
  const bellGlowProf = [];
  for (let i = 0; i <= 48; i++) { const y = BELL_L * (1 - Math.pow(1 - i / 48, 1.6)); bellGlowProf.push([bellR(BELL_L - y) * 0.8, y]); }
  const bellGlow = noPick(new THREE.Mesh(aimed(geo.lathe(bellGlowProf, 64), V3(0, 1, 0), BDIR, F0), glowMat(0)));
  bellGlow.material.side = THREE.DoubleSide;
  bellGlow.renderOrder = 6; bellGlow.visible = false; G.pavello.add(bellGlow);

  // dins de cada cilindre: camí obert (A→B) o desviat per la bomba (A→D … C→B)
  const passGlow = (y, a1, am, a2) => new THREE.CatmullRomCurve3([pol(VX, y, RC, a1), pol(VX, y, 9, a1), pol(VX, y, 3.8, am), pol(VX, y, 9, a2), pol(VX, y, RC, a2)], false, 'centripetal').getPoints(24);
  const VALVE = {};
  VYS.forEach((y, i) => {
    const n = i + 1;
    const open = piece('v' + n + 'o', 'cilindres', densify(passGlow(y, 225, 180, 135), 3), 3.4, 0);
    const P = [...passGlow(y, 225, 270, 315), ...rounded(SLIDE[i]).slice(1), ...passGlow(y, 45, 90, 135).slice(1)];
    const runs = splitRuns(densify(P, 4), m => (m.x > SL_X ? 'bomba' + n : 'cilindres'));
    const pressed = runs.map((r, k) => piece('v' + n + 'p' + k, r.key, r.P, 3.4, r.key === 'cilindres' ? 6.6 : 6.5));
    VALVE[n] = { open: [open], pressed };
  });
  const routes = {};
  function routeFor(vs) {
    const key = vs.slice().sort().join('');
    if (routes[key]) return routes[key];
    const v = n => (vs.includes(n) ? VALVE[n].pressed : VALVE[n].open);
    const ids = ['mp', 'lead', 'main', 'ret', ...v(1), 'k12', ...v(2), 'k23', ...v(3), 'coil', 'bell'];
    const list = ids.map(id => pieces[id]), offs = [];
    let tot = 0; for (const p of list) { offs.push(tot); tot += p.L; }
    return (routes[key] = { list, offs, total: tot });
  }

  // polsos de llum que viatgen pel camí
  const NB = 120, RATE = 14;
  const SPEED = routeFor([]).total / 1.1;   // mm per segon visual: el tub sencer s'omple en ~1 s
  const beads = []; for (let i = 0; i < NB; i++) beads.push({ alive: false, s: 0, w: 0 });
  const bPos = new Float32Array(NB * 3), bCol = new Float32Array(NB * 3);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const TN = 32, tdata = new Uint8Array(TN * TN * 4);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const dx = (i + 0.5) / TN * 2 - 1, dy = (j + 0.5) / TN * 2 - 1, r = Math.sqrt(dx * dx + dy * dy);
    const k = (j * TN + i) * 4; tdata[k] = tdata[k + 1] = tdata[k + 2] = 255;
    tdata[k + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - r), 1.7));
  }
  const dotTex = new THREE.DataTexture(tdata, TN, TN);
  dotTex.magFilter = THREE.LinearFilter; dotTex.minFilter = THREE.LinearFilter; dotTex.needsUpdate = true;
  const bMat = new THREE.PointsMaterial({
    size: 34, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
  });
  const beadPts = noPick(new THREE.Points(bGeo, bMat));
  beadPts.frustumCulled = false; beadPts.renderOrder = 8; G.tudel.add(beadPts);

  const _p = V3(0, 0, 0), _o = V3(0, 0, 0), _air = V3(0, 0, 0);
  function sampleRoute(R, s, out) {
    let i = 0; while (i < R.list.length - 1 && s > R.offs[i] + R.list[i].L) i++;
    const p = R.list[i], ls = Math.min(p.L, Math.max(0, s - R.offs[i]));
    let lo = 0, hi = p.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] <= ls) lo = mid; else hi = mid; }
    const seg = p.cum[hi] - p.cum[lo], u = seg > 0 ? (ls - p.cum[lo]) / seg : 0;
    out.lerpVectors(p.P[lo], p.P[hi], u);
    _o.copy(G[p.group].position).sub(G.tudel.position);
    return out.add(_o);
  }

  // ---------------------------------------------------------------- notes i so
  // Noms escrits (com llegeix el músic); freqüències reals que sonen (trompa en Fa: una quinta més greu).
  const notes = [
    { label: 'Do', f: 174.61, valves: [] },
    { label: 'Re', f: 196.00, valves: [1] },
    { label: 'Mi', f: 220.00, valves: [1, 2] },
    { label: 'Fa', f: 233.08, valves: [1] },
    { label: 'Sol', f: 261.63, valves: [] },
    { label: 'La', f: 293.66, valves: [1, 2] },
    { label: 'Si', f: 329.63, valves: [2] },
    { label: 'Do agut', f: 349.23, valves: [] }
  ];
  // so rodó: pocs harmònics aguts
  const partials = [];
  for (let k = 1; k <= 12; k++) partials.push({ k, a: Math.pow(k, 0.7) * Math.exp(-k / 2.2), tau: 1.2 / (1 + 0.07 * k) });

  // ---------------------------------------------------------------- estat d'animació
  const press = { 1: 0, 2: 0, 3: 0 };
  let lastT = 0, lastIdx = -1, spawnAcc = 0, beadsDirty = false;
  placeRods(press);

  const rimUp = V3(0, 1, 0).addScaledVector(BDIR, -BDIR.y).normalize();
  const bellLabel = RIM.clone().addScaledVector(rimUp, 150);
  const mpLabel = R_MP.clone().addScaledVector(DIN, 26).add(V3(0, 14, 0));
  const coilLabel = coilAt(-520);

  return {
    id: 'trompa',
    family: 'Vent metall',
    name: 'Trompa',
    intro: "Els llavis del músic vibren dins del broquet i fan vibrar l'aire d'un tub de llautó molt llarg, enrotllat en cercles. Té un so suau i rodó, i els cilindres canvien el camí de l'aire per fer notes diferents.",
    floorY: -215,
    camera: {
      explore: { pos: [130, 250, 1100], target: [80, -10, 30] },
      exploded: { pos: [130, 400, 1620], target: [50, 0, 60] }
    },
    parts: {
      broquet: { name: 'Broquet', text: 'És la peça on el músic posa els llavis i bufa. Els llavis vibren dins del broquet, com quan fas una pedorreta.', dato: "La copa té forma d'embut, més profunda que la de la trompeta, i això ajuda a fer un so més suau." },
      tudel: { name: 'Tudel', text: "És el primer tub, on encaixa el broquet. Porta l'aire que vibra cap a la bomba d'afinació i els cilindres.", dato: "És un tub cònic: es va eixamplant a poc a poc." },
      cilindres: { name: 'Cilindres', text: "Són vàlvules que giren. Quan prems una palanca, la peça de dins (el rotor) fa un quart de volta i l'aire passa per un tros de tub extra.", dato: 'La trompa fa servir cilindres rotatoris en lloc de pistons, i es toquen amb la mà esquerra.' },
      bombes: { name: 'Bombes', text: "Són els tubs en forma d'U que es poden estirar. Cada cilindre en té una, i la bomba d'afinació, més gran, afina tota la trompa.", dato: "Si estires una bomba, el tub s'allarga i la nota baixa una mica." },
      tubs: { name: 'Tubs enrotllats', text: "El tub de la trompa està enrotllat en cercles perquè sigui fàcil d'aguantar. Si es desenrotllés, el tub d'una trompa en Fa faria uns 3,7 metres.", dato: 'Les primeres trompes eren trompes de caça, sense cilindres, amb el tub enrotllat en un gran cercle.' },
      pavello: { name: 'Pavelló', text: "És la campana del final del tub, d'uns 30 centímetres d'amplada. Mira cap enrere, i el músic hi posa la mà dreta a dins per afinar i canviar el so.", dato: 'Hi ha trompes amb el pavelló desmuntable, que es desenrosca per guardar-la en un estoig més petit.' }
    },
    labels: [
      { part: 'broquet', group: 'broquet', at: arr(mpLabel), internal: false },
      { part: 'tudel', group: 'tudel', at: [-128, 96, 27], internal: false },
      { part: 'cilindres', group: 'cilindres', at: [VX, VYS[1], 30], internal: false },
      { part: 'bombes', group: 'bomba3', at: [SLIDE_END[2] + 13, VYS[2] + 8, 6], internal: false },
      { part: 'tubs', group: 'tubs', at: [coilLabel[0] * 1.05, coilLabel[1] * 1.05, coilLabel[2] + 4], internal: false },
      { part: 'pavello', group: 'pavello', at: arr(bellLabel), internal: false }
    ],
    explode: {
      broquet: [-110, 105, 10, 0],
      tudel: [-70, 20, 90, 0.06],
      bombaAfin: [-110, -10, 90, 0.12],
      cilindres: [0, 30, 160, 0.18],
      bomba1: [70, 15, 165, 0.3],
      bomba2: [55, 30, 170, 0.3],
      bomba3: [70, 45, 165, 0.33],
      tubs: [0, 0, -140, 0.1],
      pavello: [170, 30, 40, 0.22]
    },
    notes,
    options: null,
    chain: ['Llavis', 'Broquet', 'Tubs enrotllats', 'Pavelló', 'Aire'],
    tour: [
      { part: 'broquet', chain: 0, title: 'Els llavis i el broquet', text: "El músic posa els llavis contra el broquet i bufa. Els llavis vibren molt de pressa, com quan fas una pedorreta. Aquesta vibració fa vibrar l'aire de dins del tub.", cam: { pos: [-330, 270, 210], target: [-205, 166, 20] }, slow: 0.4, xray: false, note: 0 },
      { part: 'tubs', chain: 2, title: 'Els tubs enrotllats', text: "La trompa és un tub de llautó molt llarg, enrotllat en cercles. Si es desenrotllés, faria uns 3,7 metres! Amb els raigs X veus el camí que fa l'aire per dins.", cam: { pos: [40, 150, 820], target: [30, -10, 0] }, slow: 0.6, xray: true, note: 0 },
      { part: 'cilindres', chain: 2, title: 'Els cilindres', text: "El músic prem les palanques amb la mà esquerra. Cada palanca fa girar un cilindre un quart de volta, i l'aire entra en un tros de tub extra. El camí es fa més llarg i la nota baixa.", cam: { pos: [-150, 70, 330], target: [-45, 20, 15] }, slow: 0.5, xray: true, note: 2 },
      { part: 'bombes', chain: 2, title: 'Les bombes', text: "Cada cilindre té la seva bomba, un tub en forma d'U. Mira el Re: el cilindre 1 gira i l'aire fa la volta per la seva bomba. La bomba d'afinació, més gran, serveix per afinar tota la trompa.", cam: { pos: [150, 70, 380], target: [10, 15, 0] }, slow: 0.5, xray: false, note: 1 },
      { part: 'pavello', chain: 3, title: 'El pavelló', text: "Al final, el tub s'eixampla i forma el pavelló, que mira cap enrere. El músic hi posa la mà dreta a dins per afinar i canviar el so. Les ones de so viatgen per l'aire fins a les nostres orelles.", cam: { pos: [620, 90, 600], target: [240, -90, 70] }, slow: 0.6, xray: false, note: 4 }
    ],
    soundSource: { group: 'pavello', at: arr(RIM.clone().addScaledVector(BDIR, 10)) },

    play(note) {
      const n = typeof note === 'number' ? notes[note] : note;
      const f = (n && n.f) || 174.61;
      synth.additive({
        f, partials, attack: 0.07, hold: 1.1, release: 0.25,
        vibrato: { rate: 4.6, depth: 4 },
        noise: { amount: 0.02, dur: 0.1, lp: 1600, hp: 250 },
        gain: 0.9
      });
      // L'envolupant visual dura més perquè es vegi l'aire recórrer tot el tub.
      return { attack: 0.07, hold: 1.9, release: 0.4 };
    },

    update(dt, s) {
      const env = s.env || 0, t = s.t || 0;
      const nt = notes[s.noteIndex] || s.note || {};
      const vs = (nt && nt.valves) || [];

      // --- palanques i rotors: el rotor gira un quart de volta
      for (let n = 1; n <= 3; n++) {
        const want = env > 0.3 && vs.includes(n) ? 1 : 0;
        press[n] += (want - press[n]) * Math.min(1, dt * 12);
        rotors[n - 1].rotation.z = -press[n] * PI / 2;
        levers[n - 1].rotation.z = PHI * press[n];
      }
      placeRods(press);

      // --- nota nova?
      const reset = t < lastT - 1e-4 || s.noteIndex !== lastIdx;
      const dT = reset ? 0 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t; lastIdx = s.noteIndex;
      if (reset) { for (const b of beads) b.alive = false; spawnAcc = 0; beadsDirty = true; }

      // --- llavis que vibren
      const lipOn = env > 0.01;
      lipDisc.visible = lipRing.visible = lipOn;
      if (lipOn) {
        const w = Math.sin(2 * PI * (s.fvis || 1) * 5 * t);
        lipDisc.scale.set(1, 0.25 + 0.75 * (0.5 + 0.5 * w), 1);
        lipMat.opacity = 0.75 * env;
        lipRing.scale.setScalar(1 + 0.06 * w * env);
        lipRingMat.opacity = 0.45 * env * (0.7 + 0.3 * w);
      }

      // --- el camí de l'aire s'omple a velocitat visible
      for (const p of allPieces) { p.inner.visible = false; if (p.outer) p.outer.visible = false; }
      bellGlow.visible = false;
      let bellFrac = 0;
      const R = routeFor(vs);
      if (env > 0) {
        const front = SPEED * t, sh = Math.sin((s.time || 0) * 6);
        R.list.forEach((p, i) => {
          const frac = clamp01((front - R.offs[i]) / p.L);
          if (frac <= 0) return;
          if (p.bell) {
            bellFrac = frac;
            bellGlow.visible = true; bellGlow.material.opacity = 0.2 * env * frac;
            return;
          }
          const k = Math.max(1, Math.ceil(frac * p.segs));
          p.inner.visible = true;
          p.inner.geometry.setDrawRange(0, k * 8 * 6);
          p.inner.material.opacity = (s.xray ? 0.42 : 0.6) * env;
          if (p.outer) {
            p.outer.visible = true;
            p.outer.geometry.setDrawRange(0, k * 12 * 6);
            p.outer.material.opacity = env * (s.xray ? 0.05 : 0.32 + 0.07 * sh);
          }
        });
      }

      // --- aire que surt pel pavelló
      if (bellFrac > 0.02 && env > 0.02) {
        _air.copy(RIM).addScaledVector(BDIR, 6).add(G.pavello.position);
        fx.air(_air, BDIR, 420 * env * Math.min(1, bellFrac * 3), 0.55, 190);
      }

      // --- polsos que viatgen pel tub
      if (env > 0.2) {
        spawnAcc += dT * RATE;
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const b = beads.find(q => !q.alive);
          if (b) { b.alive = true; b.s = spawnAcc * SPEED * (1 / RATE); b.w = Math.random() * PI * 2; }
        }
      }
      let any = false;
      for (let i = 0; i < NB; i++) {
        const b = beads[i];
        if (b.alive) { b.s += SPEED * dT; if (b.s >= R.total || env <= 0) b.alive = false; }
        if (b.alive) {
          any = true;
          sampleRoute(R, b.s, _p);
          bPos[i * 3] = _p.x; bPos[i * 3 + 1] = _p.y; bPos[i * 3 + 2] = _p.z;
          const fade = Math.min(1, (R.total - b.s) / 150);
          const br = Math.min(1, env * 1.6) * (0.8 + 0.2 * Math.sin((s.time || 0) * 9 + b.w)) * fade;
          bCol[i * 3] = BEAD.r * br; bCol[i * 3 + 1] = BEAD.g * br; bCol[i * 3 + 2] = BEAD.b * br;
        } else {
          bCol[i * 3] = bCol[i * 3 + 1] = bCol[i * 3 + 2] = 0;
        }
      }
      if (any || beadsDirty) {
        bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
        beadsDirty = any;
      }
    }
  };
}
