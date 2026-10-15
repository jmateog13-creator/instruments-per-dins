// Trombó de vares tenor en Si bemoll — mòdul d'instrument (Vent metall)
// Unitats: mm. Y amunt. El trombó és horitzontal al llarg de l'eix X:
// el músic és a +X (broquet i bomba d'afinació) i la vara i el pavelló miren cap a -X.
// La vara és al pla z = 0: tub de dalt (A, el del broquet) a y = 0 i tub de baix (B) a y = -150.
// La secció del pavelló és al costat -Z i més amunt: coll (y 40, z -35) i tub del pavelló (y 70, z -110).
// Camí real de l'aire: broquet → tub fix A → tub de la vara (anada) → corba final → tub de la vara (tornada)
//   → tub fix B → coll (gooseneck) → bomba d'afinació → tub del pavelló → pavelló.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, geo, fx, synth } = ctx;
  const add = (g, ge, m, part, o) => ctx.add(g, ge, m, part, o || {});
  const PI = Math.PI;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

  const G = groups(['broquet', 'varaInt', 'varaExt', 'pavello', 'bomba']);
  // La vara exterior es mou dins del seu grup (el motor mou el grup quan es desmunta)
  const slideMov = new THREE.Group(); G.varaExt.add(slideMov);

  // ---------------------------------------------------------------- materials
  const pick = (ref, extra) => {
    const o = { color: ref.color.clone(), metalness: ref.metalness, roughness: ref.roughness, side: THREE.DoubleSide };
    if (ref.clearcoat !== undefined) { o.clearcoat = ref.clearcoat; o.clearcoatRoughness = ref.clearcoatRoughness; }
    return Object.assign(o, extra || {});
  };
  const brassRef = M.brass('pavello'), silverRef = M.silver('broquet'), nickelRef = M.nickel('tubs');
  const brass = part => mat(part, pick(brassRef, { clearcoat: 0.75, clearcoatRoughness: 0.1 }), { xray: true });
  const mBroquet = mat('broquet', pick(silverRef), { phys: false, xray: true });
  const mInner = mat('tubs', pick(nickelRef, { roughness: 0.14 }), { phys: false, xray: true });   // tubs fixos niquelats
  const mInBr = brass('tubs');
  const mOut = brass('vara');
  const mBell = brass('pavello');
  const mTune = brass('bomba');
  const mClau = brass('clau');
  const mSpring = M.nickel('clau');
  const mCork = mat('tubs', { color: 0xA87A4E, roughness: 0.95 });
  const mCorkKey = mat('clau', { color: 0xA87A4E, roughness: 0.95 });
  const mBumper = M.plastic('vara', 0x1B1B1D);

  // Brillantors (no són peces: no es poden seleccionar)
  const GLOW = new THREE.Color(0x66E0FF), BEAD = new THREE.Color(0xC8F6FF);
  const glowMat = (op, side) => new THREE.MeshBasicMaterial({
    color: GLOW, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
    depthWrite: false, side: side || THREE.FrontSide, toneMapped: false
  });
  const noPick = o => { o.raycast = () => {}; o.castShadow = false; o.receiveShadow = false; return o; };

  // ---------------------------------------------------------------- ajudes de corbes (com a la trompeta)
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
  function rounded(pts, rDef = 8) {
    const P = pts.map(p => V3(p[0], p[1], p[2]));
    const R = pts.map(p => (p.length > 3 ? p[3] : rDef));
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
      const m = Math.max(4, Math.ceil(12 * th / (PI / 2)));
      for (let k = 0; k <= m; k++) {
        const u = k / m;
        out.push(p1.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(p2, u * u));
      }
    }
    out.push(P[P.length - 1].clone());
    return densify(out, 5);
  }
  const plen = P => { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; };
  function tubeAlong(group, P, r, m, part, radial = 16) {
    const seg = Math.max(12, Math.round(plen(P) / 2.5));
    return add(group, geo.curveTube(P.map(p => [p.x, p.y, p.z]), r, seg, radial), m, part);
  }
  // Lathe orientat al llarg de -X: la y del perfil creix cap a -X a partir de x0
  const xLathe = (group, prof, m, part, x0, y, z, seg = 56) =>
    add(group, geo.lathe(prof, seg), m, part, { pos: [x0, y, z], rot: [0, 0, PI / 2] });
  function cylAlong(group, center, dir, r, len, m, part, seg = 24) {
    const me = add(group, geo.cyl(r, len, 'y', seg), m, part, { pos: [center.x, center.y, center.z] });
    me.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
    return me;
  }
  // anelles moletejades (femelles)
  function knurled(r0, r1, len, ribs) {
    const p = [[r0, 0], [r1 - 0.4, 0], [r1, 0.8]];
    for (let k = 0; k < ribs; k++) { const y = 1.6 + k * (len - 3.2) / ribs; p.push([r1 + 0.45, y], [r1, y + (len - 3.2) / ribs * 0.5]); }
    p.push([r1, len - 0.8], [r1 - 0.4, len], [r0, len]);
    return p;
  }

  // ---------------------------------------------------------------- mides principals
  const YA = 0, YB = -150;                       // tubs de la vara (dalt i baix)
  const X_IN_END = -730;                         // final dels tubs fixos = inici de la corba (vara tancada)
  const X_OUT_OPEN = -45;                        // boca de la vara exterior (vara tancada)
  const X_BRACE = -110;                          // travessa de la vara exterior (on va la mà dreta)
  const CR = 75;                                 // radi de la corba final
  const NECK = { y: 40, z: -35 }, BELLAX = { y: 70, z: -110 };
  const BELL_X0 = 285, BELL_L = 755, BELL_R = 107.5;   // el pavelló va de x=285 a x=-470 (vora)
  const BELL_RIM_X = BELL_X0 - BELL_L;
  const q0 = Math.pow(31.8 / (BELL_L + 31.8), 0.9);
  const bellR = d => 7.0 + (BELL_R - 7.0) * (Math.pow(31.8 / (d + 31.8), 0.9) - q0) / (1 - q0);  // d = distància a la vora
  // Posicions de la vara: cada una baixa un semitò; el tub (≈2,75 m) s'allarga el doble del que surt la vara.
  const EXT = [0, 0]; for (let p = 2; p <= 7; p++) EXT.push(1375 * (Math.pow(2, (p - 1) / 12) - 1));

  // ================================================================ BROQUET
  {
    const prof = [
      [12.6, 0.5], [12.2, 2], [11.3, 4.5], [9.6, 7.5], [7.4, 10.5], [5.2, 13], [3.7, 15.5], [3.5, 18], [3.55, 24],
      [3.9, 36], [4.4, 52], [5.0, 70], [5.5, 86], [6.0, 88], [6.75, 87.6], [6.9, 72], [7.2, 62], [7.9, 58], [9.0, 54],
      [9.6, 46], [10.4, 36], [12.0, 27], [14.5, 19], [16.6, 12], [18.3, 6], [19.2, 2.6], [19.4, 0.8], [19.0, -0.4],
      [17.8, -1.1], [16.2, -1.3], [14.6, -1.0], [13.4, -0.4], [12.6, 0.5]
    ];
    xLathe(G.broquet, prof, mBroquet, 'broquet', 92, YA, 0, 64);
    // anella decorativa
    xLathe(G.broquet, [[9.1, 0], [9.8, 0.4], [9.8, 2.2], [9.1, 2.6]], mBroquet, 'broquet', 92 - 47, YA, 0, 48);
  }
  const lipMat = new THREE.MeshBasicMaterial({ color: 0xFF8A66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const lipRingMat = lipMat.clone();
  const lipDisc = noPick(new THREE.Mesh(new THREE.CircleGeometry(12, 40), lipMat));
  const lipRing = noPick(new THREE.Mesh(new THREE.TorusGeometry(14.2, 2.1, 10, 48), lipRingMat));
  for (const o of [lipDisc, lipRing]) { o.position.set(94.5, YA, 0); o.rotation.y = PI / 2; o.renderOrder = 6; o.visible = false; G.broquet.add(o); }

  // ================================================================ TUBS FIXOS (vara interior)
  {
    add(G.varaInt, geo.cyl(7.0, 734, 'x', 28), mInner, 'tubs', { pos: [(4 + X_IN_END) / 2, YA, 0] });   // tub A (x 4 → -730)
    add(G.varaInt, geo.cyl(7.0, 734, 'x', 28), mInner, 'tubs', { pos: [(4 + X_IN_END) / 2, YB, 0] });   // tub B
    // "mitges": el final dels tubs és una mica més gruixut (només toca aquí la vara)
    for (const y of [YA, YB]) add(G.varaInt, geo.cyl(7.35, 44, 'x', 28), mInner, 'tubs', { pos: [X_IN_END + 22, y, 0] });
    // receptor del broquet (x 18 → -4)
    xLathe(G.varaInt, [[6.5, 0], [8.7, 0], [9.3, 0.8], [9.3, 4.4], [8.5, 5.4], [8.2, 16], [7.5, 20], [7.05, 22]], mInBr, 'tubs', 18, YA, 0);
    // rosca del tub B (on es cargola la femella del coll)
    add(G.varaInt, geo.cyl(7.8, 10, 'x', 28), mInBr, 'tubs', { pos: [-9, YB, 0] });
    // travessa interior (la mà esquerra l'aguanta)
    for (const y of [YA, YB]) add(G.varaInt, geo.cyl(9.0, 22, 'x', 32), mInBr, 'tubs', { pos: [-28, y, 0] });
    add(G.varaInt, geo.tube([-28, YA - 8.5, 0], [-28, YB + 8.5, 0], 4.4, 1, 16), mInBr, 'tubs');
    add(G.varaInt, geo.lathe([[4.4, -24], [5.6, -21], [6.0, -14], [6.0, 14], [5.6, 21], [4.4, 24]], 28), mInBr, 'tubs', { pos: [-28, (YA + YB) / 2, 0] });
    for (const y of [YA - 15, YB + 15]) add(G.varaInt, geo.cyl(5.7, 3, 'y', 20), mInBr, 'tubs', { pos: [-28, y, 0] });
    // suros on topa la vara quan està tancada
    for (const y of [YA, YB]) add(G.varaInt, geo.cyl(7.7, 6, 'x', 24), mCork, 'tubs', { pos: [-42, y, 0] });
    // tancament de la vara (anella que gira i palanqueta)
    add(G.varaInt, geo.cyl(9.4, 9, 'x', 32), mInBr, 'tubs', { pos: [-10.5, YA, 0] });
    add(G.varaInt, geo.box(-14, -7, 8.6, 15.5, -1.6, 1.6), mInBr, 'tubs');
    add(G.varaInt, new THREE.SphereGeometry(2.6, 14, 10), mInBr, 'tubs', { pos: [-10.5, 16.5, 0] });
  }

  // ================================================================ VARA (exterior, mòbil)
  {
    const len = X_OUT_OPEN - X_IN_END;          // 685
    for (const y of [YA, YB]) {
      add(slideMov, geo.cyl(8.0, len, 'x', 32), mOut, 'vara', { pos: [(X_OUT_OPEN + X_IN_END) / 2, y, 0] });
      add(slideMov, geo.cyl(8.9, 13, 'x', 32), mOut, 'vara', { pos: [X_OUT_OPEN - 6.5, y, 0] });            // virolla de la boca
      add(slideMov, new THREE.TorusGeometry(8.4, 0.9, 8, 32), mOut, 'vara', { pos: [X_OUT_OPEN, y, 0], rot: [0, PI / 2, 0] });
      add(slideMov, geo.cyl(8.9, 14, 'x', 32), mOut, 'vara', { pos: [X_IN_END + 7, y, 0] });               // virolla de la corba
      add(slideMov, geo.cyl(9.0, 26, 'x', 32), mOut, 'vara', { pos: [X_BRACE, y, 0] });                    // virolles de la travessa
    }
    // travessa (la mà dreta l'agafa per moure la vara)
    add(slideMov, geo.tube([X_BRACE, YA - 8.5, 0], [X_BRACE, YB + 8.5, 0], 4.2, 1, 16), mOut, 'vara');
    add(slideMov, geo.lathe([[4.2, -30], [5.4, -26], [5.9, -18], [5.9, 18], [5.4, 26], [4.2, 30]], 28), mOut, 'vara', { pos: [X_BRACE, (YA + YB) / 2, 0] });
    for (const y of [YA - 16, YB + 16]) add(slideMov, new THREE.SphereGeometry(5.6, 18, 12), mOut, 'vara', { pos: [X_BRACE, y, 0] });
    // tetó per al tancament
    add(slideMov, geo.cyl(1.7, 4, 'y', 12), mOut, 'vara', { pos: [X_OUT_OPEN - 9, YA + 10.5, 0] });
    // corba final
    add(slideMov, new THREE.TorusGeometry(CR, 8.0, 18, 64, PI), mOut, 'vara', { pos: [X_IN_END, (YA + YB) / 2, 0], rot: [0, 0, PI / 2] });
    // protector de goma a la punta
    add(slideMov, geo.lathe([[0, -13], [5, -12.8], [8.6, -11.6], [10.6, -9], [11.2, -5], [11.2, 5], [10.6, 9], [8.6, 11.6], [5, 12.8], [0, 13]], 32),
      mBumper, 'vara', { pos: [X_IN_END - CR, (YA + YB) / 2, 0] });
  }

  // ================================================================ CLAU DE L'AIGUA (a la corba de la vara)
  {
    const th = 250 * PI / 180;
    const n = V3(Math.cos(th), Math.sin(th), 0);
    const H = V3(X_IN_END + CR * Math.cos(th), (YA + YB) / 2 + CR * Math.sin(th), 0);    // forat
    cylAlong(slideMov, H.clone().addScaledVector(n, 9.5), n, 2.9, 5, mClau, 'clau', 20);   // brocal
    cylAlong(slideMov, H.clone().addScaledVector(n, 13.4), n, 4.1, 2.4, mClau, 'clau', 24); // cassoleta
    cylAlong(slideMov, H.clone().addScaledVector(n, 12.0), n, 3.3, 1.2, mCorkKey, 'clau', 20); // suro
    const P0 = H.clone().addScaledVector(n, 14.6), P1 = V3(-688, YB - 14.4, 0);
    add(slideMov, geo.tube([P0.x, P0.y, 0], [P1.x, P1.y, 0], 1.25, 1, 8), mClau, 'clau');      // palanca
    add(slideMov, geo.box(-694, -680, YB - 17.2, YB - 15.4, -3, 3), mClau, 'clau');           // paleta del dit
    for (const z of [-2.9, 2.9]) add(slideMov, geo.box(-718, -712, YB - 15, YB - 7.2, z - 0.5, z + 0.5), mClau, 'clau'); // suports
    add(slideMov, geo.cyl(0.9, 7.2, 'z', 12), mSpring, 'clau', { pos: [-715, YB - 12.6, 0] });          // pern
    add(slideMov, new THREE.TorusGeometry(1.8, 0.45, 6, 18), mSpring, 'clau', { pos: [-715, YB - 12.6, 0] }); // molla
  }

  // ================================================================ SECCIÓ DEL PAVELLÓ (coll, tub, campana)
  const GOOSE = [[10, YB, 0], [48, YB, 0, 34], [92, -55, -20, 48], [128, NECK.y, NECK.z, 40], [290, NECK.y, NECK.z]];
  {
    // femella que uneix el coll amb la vara
    xLathe(G.pavello, knurled(7.4, 10.8, 20, 7), mBell, 'pavello', 16, YB, 0, 48);
    // coll (gooseneck) i tub que va cap a la bomba d'afinació
    tubeAlong(G.pavello, rounded(GOOSE), 7.2, mBell, 'pavello', 18);
    add(G.pavello, geo.cyl(8.1, 5, 'x', 28), mBell, 'pavello', { pos: [200, NECK.y, NECK.z] });
    // pavelló: tub cònic + campana (una sola peça)
    const prof = [], N = 110;
    for (let i = 0; i <= N; i++) { const y = BELL_L * (1 - Math.pow(1 - i / N, 2.2)); prof.push([bellR(BELL_L - y), y]); }
    xLathe(G.pavello, prof, mBell, 'pavello', BELL_X0, BELLAX.y, BELLAX.z, 96);
    // vora enrotllada
    add(G.pavello, new THREE.TorusGeometry(BELL_R + 1.3, 2.3, 14, 128), mBell, 'pavello', { pos: [BELL_RIM_X - 0.4, BELLAX.y, BELLAX.z], rot: [0, PI / 2, 0] });
    // garlanda (anella decorativa) i virolla de l'entrada
    { const d0 = 300, gp = []; for (let k = 0; k <= 8; k++) { const d = d0 - k * 3; gp.push([bellR(d) + (k === 0 || k === 8 ? 0.2 : 1.1), d0 - d]); }
      xLathe(G.pavello, gp, mBell, 'pavello', BELL_RIM_X + d0, BELLAX.y, BELLAX.z, 64); }
    add(G.pavello, geo.cyl(8.3, 10, 'x', 28), mBell, 'pavello', { pos: [270, BELLAX.y, BELLAX.z] });
    // travessa del pavelló (entre el coll i el tub del pavelló)
    const d = V3(0, BELLAX.y - NECK.y, BELLAX.z - NECK.z).normalize();
    const a = V3(160, NECK.y, NECK.z).addScaledVector(d, 7.2), b = V3(160, BELLAX.y, BELLAX.z).addScaledVector(d, -7.4);
    add(G.pavello, geo.tube([a.x, a.y, a.z], [b.x, b.y, b.z], 2.7, 1, 12), mBell, 'pavello');
    cylAlong(G.pavello, a.clone().addScaledVector(d, 0.6), d, 4.0, 1.4, mBell, 'pavello', 18);
    cylAlong(G.pavello, b.clone().addScaledVector(d, -0.6), d, 4.0, 1.4, mBell, 'pavello', 18);
    for (const ax of [NECK, BELLAX]) add(G.pavello, geo.cyl(8.4, 12, 'x', 28), mBell, 'pavello', { pos: [160, ax.y, ax.z] });
  }

  // ================================================================ BOMBA D'AFINACIÓ (darrere)
  {
    for (const ax of [NECK, BELLAX]) {
      add(G.bomba, geo.cyl(8.0, 55, 'x', 28), mTune, 'bomba', { pos: [302.5, ax.y, ax.z] });
      add(G.bomba, geo.cyl(8.8, 9, 'x', 28), mTune, 'bomba', { pos: [279.5, ax.y, ax.z] });
      add(G.bomba, new THREE.TorusGeometry(8.4, 0.8, 8, 28), mTune, 'bomba', { pos: [275, ax.y, ax.z], rot: [0, PI / 2, 0] });
    }
    tubeAlong(G.bomba, rounded([[328, NECK.y, NECK.z], [352, NECK.y, NECK.z, 38], [352, BELLAX.y, BELLAX.z, 38], [328, BELLAX.y, BELLAX.z]]), 7.6, mTune, 'bomba', 18);
    // travessa de la bomba
    const d = V3(0, BELLAX.y - NECK.y, BELLAX.z - NECK.z).normalize();
    const a = V3(318, NECK.y, NECK.z).addScaledVector(d, 7.8), b = V3(318, BELLAX.y, BELLAX.z).addScaledVector(d, -7.8);
    add(G.bomba, geo.tube([a.x, a.y, a.z], [b.x, b.y, b.z], 2.3, 1, 12), mTune, 'bomba');
    add(G.bomba, new THREE.SphereGeometry(4.2, 16, 12), mTune, 'bomba', { pos: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2] });
  }

  // ================================================================ NÚMEROS DE LES POSICIONS
  // Cada número queda just a sobre d'on arriba la travessa de la vara en aquella posició.
  const SEG7 = { 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc' };
  const markers = [];
  {
    const w = 14, h = 26, t = 3, dz = 1.6;
    const box = (x0, x1, y0, y1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, dz).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const S = {
      a: () => box(-w / 2, w / 2, h - t, h), d: () => box(-w / 2, w / 2, 0, t), g: () => box(-w / 2, w / 2, h / 2 - t / 2, h / 2 + t / 2),
      f: () => box(-w / 2, -w / 2 + t, h / 2, h), b: () => box(w / 2 - t, w / 2, h / 2, h),
      e: () => box(-w / 2, -w / 2 + t, 0, h / 2), c: () => box(w / 2 - t, w / 2, 0, h / 2)
    };
    for (let p = 1; p <= 7; p++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x8A96A3, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const g = new THREE.Group(); g.position.set(X_BRACE - EXT[p], 26, 12);
      for (const ch of SEG7[p]) { const me = noPick(new THREE.Mesh(S[ch](), m)); me.renderOrder = 7; g.add(me); }
      const tick = noPick(new THREE.Mesh(box(-0.8, 0.8, -14, -4), m)); tick.renderOrder = 7; g.add(tick);
      G.varaInt.add(g); markers.push({ g, m, p });
    }
  }

  // ================================================================ CAMÍ DE L'AIRE (brillantor)
  const route = [];
  let ext = 0;                                       // quant ha sortit la vara (mm)
  function polyPiece(id, parent, gname, P, rIn, rOut) {
    const L = plen(P), segs = Math.max(6, Math.round(L / 3));
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    curve.arcLengthDivisions = Math.max(200, P.length * 4);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const p = { id, kind: 'poly', gname, mov: parent === slideMov, P, cum, L, segs, inner: null, outer: null };
    p.inner = noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, rIn, 8, false), glowMat(0)));
    p.inner.renderOrder = 5; p.inner.visible = false; parent.add(p.inner);
    if (rOut) {
      p.outer = noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, rOut, 12, false), glowMat(0)));
      p.outer.renderOrder = 6; p.outer.visible = false; parent.add(p.outer);
    }
    route.push(p); return p;
  }
  // Tros recte de la vara que s'allarga amb la vara (cilindre d'1 mm escalat)
  function legPiece(id, y, sign, rIn, rOut) {
    const mk = (r, rad) => new THREE.CylinderGeometry(r, r, 1, rad, 1, true).rotateZ(-PI / 2).translate(0.5 * sign, 0, 0);
    const p = { id, kind: 'leg', gname: 'varaInt', y, sign, L: 0 };
    p.inner = noPick(new THREE.Mesh(mk(rIn, 8), glowMat(0)));
    p.outer = noPick(new THREE.Mesh(mk(rOut, 14), glowMat(0)));
    p.inner.renderOrder = 5; p.outer.renderOrder = 6;
    for (const o of [p.inner, p.outer]) { o.visible = false; G.varaInt.add(o); }
    route.push(p); return p;
  }
  polyPiece('mp', G.broquet, 'broquet', densify([V3(93, YA, 0), V3(-6, YA, 0)], 5), 2.6, 0);
  const legA = legPiece('legA', YA, -1, 4.6, 9.6);
  const crookPts = []; for (let i = 0; i <= 36; i++) { const u = PI / 2 + PI * i / 36; crookPts.push(V3(X_IN_END + CR * Math.cos(u), (YA + YB) / 2 + CR * Math.sin(u), 0)); }
  polyPiece('crook', slideMov, 'varaExt', densify(crookPts, 5), 4.6, 9.4);
  const legB = legPiece('legB', YB, 1, 4.6, 9.6);
  polyPiece('neck', G.pavello, 'pavello', rounded([[-6, YB, 0], ...GOOSE.slice(1)]), 4.4, 8.6);
  polyPiece('tune', G.bomba, 'bomba', rounded([[290, NECK.y, NECK.z], [352, NECK.y, NECK.z, 38], [352, BELLAX.y, BELLAX.z, 38], [285, BELLAX.y, BELLAX.z]]), 4.6, 9.4);
  const X_FLARE = -170;
  polyPiece('tail', G.pavello, 'pavello', densify([V3(285, BELLAX.y, BELLAX.z), V3(X_FLARE, BELLAX.y, BELLAX.z)], 5), 4.6, 8.8);
  const bellPiece = { id: 'bell', kind: 'bell', gname: 'pavello', L: X_FLARE - BELL_RIM_X + 2 };
  route.push(bellPiece);
  const bellGlowProf = [];
  for (let i = 0; i <= 48; i++) { const y = (X_FLARE - BELL_RIM_X) * Math.pow(i / 48, 0.8); bellGlowProf.push([bellR(X_FLARE - BELL_RIM_X - y) * 0.8, y]); }
  const bellGlow = noPick(new THREE.Mesh(geo.lathe(bellGlowProf, 72), glowMat(0, THREE.DoubleSide)));
  bellGlow.position.set(X_FLARE, BELLAX.y, BELLAX.z); bellGlow.rotation.z = PI / 2;
  bellGlow.renderOrder = 6; bellGlow.visible = false; G.pavello.add(bellGlow);

  function updateLengths() {
    legA.L = (-6 - X_IN_END) + ext;
    legB.L = (-6 - X_IN_END) + ext;
    let tot = 0; for (const p of route) tot += p.L; return tot;
  }

  // polsos de llum que viatgen pel camí
  const NB = 110, SPEED = 3000, RATE = 18;   // mm per segon visual, polsos per segon
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
    size: 38, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
  });
  const beadPts = noPick(new THREE.Points(bGeo, bMat));
  beadPts.frustumCulled = false; beadPts.renderOrder = 8; G.varaInt.add(beadPts);

  const _p = V3(0, 0, 0), _o = V3(0, 0, 0), _air = V3(0, 0, 0), _dir = V3(-1, 0, 0);
  function samplePiece(p, ls, out) {
    if (p.kind === 'leg') {
      if (p.sign < 0) out.set(-6 - ls, p.y, 0);
      else out.set(X_IN_END - ext + ls, p.y, 0);
    } else if (p.kind === 'bell') {
      out.set(X_FLARE - ls, BELLAX.y, BELLAX.z);
    } else {
      let lo = 0, hi = p.cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] <= ls) lo = mid; else hi = mid; }
      const seg = p.cum[hi] - p.cum[lo], u = seg > 0 ? (ls - p.cum[lo]) / seg : 0;
      out.lerpVectors(p.P[lo], p.P[hi], u);
      if (p.mov) out.add(slideMov.position);
    }
    // els grups es desplacen quan es desmunta: corregim respecte del grup dels tubs fixos
    _o.copy(G[p.gname].position).sub(G.varaInt.position);
    return out.add(_o);
  }
  function sampleRoute(s, out) {
    let off = 0;
    for (let i = 0; i < route.length; i++) {
      const p = route[i];
      if (s <= off + p.L || i === route.length - 1) return samplePiece(p, Math.min(p.L, Math.max(0, s - off)), out);
      off += p.L;
    }
    return out;
  }

  // ---------------------------------------------------------------- notes i so
  // El trombó de vares no transposa: aquestes són les notes que sonen. pos = posició de la vara.
  const notes = [
    { label: 'Do', f: 130.81, pos: 6 },
    { label: 'Re', f: 146.83, pos: 4 },
    { label: 'Mi', f: 164.81, pos: 2 },
    { label: 'Fa', f: 174.61, pos: 1 },
    { label: 'Sol', f: 196.00, pos: 4 },
    { label: 'La', f: 220.00, pos: 2 },
    { label: 'Si', f: 246.94, pos: 4 },
    { label: 'Do agut', f: 261.63, pos: 3 }
  ];
  const partials = [];
  for (let k = 1; k <= 14; k++) partials.push({ k, a: Math.pow(k, 0.8) * Math.exp(-k / 3.4), tau: 1.2 / (1 + 0.05 * k) });
  function sound(n) {
    synth.additive({
      f: n.f, partials, attack: 0.06, hold: 1.1, release: 0.25,
      vibrato: { rate: 5, depth: 3 },
      noise: { amount: 0.03, dur: 0.07, lp: 2400, hp: 300 },
      gain: 0.9
    });
  }

  // ---------------------------------------------------------------- estat d'animació
  const POS_STEP = 2, SEQ = [3, 2, 1, 0], SEQ_DT = 1.55;     // visita "Les posicions": Fa (1), Mi (2), Re (4), Do (6)
  const slide = { from: 0, to: 0, t: 0, dur: 0, pos: 1 };
  function moveTo(pos, slowK = 1) {
    const to = EXT[pos] || 0, d = Math.abs(to - ext);
    slide.from = ext; slide.to = to; slide.t = 0; slide.pos = pos;
    slide.dur = d < 1 ? 0 : (0.16 + 0.3 * Math.sqrt(d / EXT[7])) * slowK;
    return slide.dur;
  }
  let pending = null, cur = notes[3], soundOn = false, tSound = 0, legato = false, fresh = false;
  let seq = null, prevEnv = 0, idle = 0, lastView = 'explore', lastTour = -1;
  let lastT = 0, spawnAcc = 0, beadsDirty = false;

  return {
    id: 'trombo',
    family: 'Vent metall',
    name: 'Trombó de vares',
    intro: 'Els llavis del músic vibren dins del broquet i fan vibrar l\'aire d\'un tub de llautó molt llarg. El trombó no té pistons: el músic allarga o escurça el tub movent la vara, i així canvia la nota.',
    floorY: -180,
    camera: {
      explore: { pos: [-380, 820, 1750], target: [-420, -30, -60] },
      exploded: { pos: [-260, 1250, 2350], target: [-300, 20, -20] }
    },
    parts: {
      broquet: { name: 'Broquet', text: 'És la peça on el músic recolza els llavis i bufa. És més gran que el de la trompeta, perquè el trombó fa notes més greus.', dato: 'Es pot treure, i cada trombonista sol tenir el seu broquet preferit.' },
      vara: { name: 'Vara', text: 'És el tub en forma d\'U que el músic mou endavant i enrere amb la mà dreta. Quan la vara surt, el tub és més llarg i la nota és més greu.', dato: 'Com que la vara llisca sense salts, el trombó pot fer glissandos: lliscar d\'una nota a una altra.' },
      tubs: { name: 'Tubs fixos', text: 'Són dos tubs rectes i prims units al cos del trombó. La vara llisca per fora d\'aquests tubs, com una funda.', dato: 'Són molt llisos i els músics hi posen una crema o un líquid especial perquè la vara corri bé.' },
      clau: { name: 'Clau de l\'aigua', text: 'És una palanqueta a la punta de la vara per buidar l\'aigua que es forma a dins. Aquesta aigua ve del vapor de l\'alè, que es refreda.', dato: 'Un tap de suro o de goma tanca el forat quan no la prems.' },
      bomba: { name: 'Bomba d\'afinació', text: 'És un tub en forma d\'U, a la part de darrere, que es pot estirar o empènyer. Serveix per afinar el trombó abans de tocar.', dato: 'Quan el músic toca, aquesta bomba queda per sobre de la seva espatlla, darrere del cap.' },
      pavello: { name: 'Pavelló', text: 'És la campana del final del tub. Ajuda que el so surti amb força cap endavant.', dato: 'Fa uns 21 centímetres d\'amplada i sovint es fa amb una sola planxa de llautó.' }
    },
    labels: [
      { part: 'broquet', group: 'broquet', at: [62, 20, 0], internal: false },
      { part: 'vara', group: 'varaExt', at: [-640, 9, 0], internal: false },
      { part: 'tubs', group: 'varaInt', at: [-28, -75, 0], internal: false },
      { part: 'clau', group: 'varaExt', at: [-762, -162, 0], internal: false },
      { part: 'bomba', group: 'bomba', at: [358, 60, -72], internal: false },
      { part: 'pavello', group: 'pavello', at: [-470, 180, -110], internal: false }
    ],
    explode: {
      broquet: [170, 40, 0, 0],
      varaExt: [-60, 0, 230, 0.1],
      varaInt: [-20, 0, 50, 0.18],
      pavello: [80, 110, -200, 0.26],
      bomba: [230, 110, -200, 0.33]
    },
    notes,
    options: null,
    chain: ['Llavis', 'Broquet', 'Vara', 'Pavelló', 'Aire'],
    tour: [
      { part: 'broquet', chain: 0, title: 'Els llavis', text: 'El músic recolza els llavis al broquet i bufa. Els llavis vibren molt de pressa, com quan fas una pedorreta. Aquesta vibració fa vibrar l\'aire de dins del tub.', cam: { pos: [250, 130, 330], target: [55, -20, -10] }, slow: 0.4, xray: false, note: 3 },
      { part: 'vara', chain: 2, title: 'La vara', text: 'El trombó no té pistons: el músic mou la vara amb la mà dreta. Si la vara surt, el tub s\'allarga i la nota baixa. Amb els raigs X veus com l\'aire va i torna per dins de la vara.', cam: { pos: [-520, 560, 1620], target: [-580, -75, 0] }, slow: 0.7, xray: true, note: 0 },
      { part: 'vara', chain: 2, title: 'Les posicions', text: 'La vara té 7 posicions: la primera és la més curta i la setena, la més llarga. Escolta el Fa (posició 1), el Mi (2), el Re (4) i el Do (6). Amb una mateixa posició es fan diverses notes canviant la pressió dels llavis.', cam: { pos: [-520, 520, 1600], target: [-580, -40, 0] }, slow: 0.8, xray: false, note: 3 },
      { part: 'pavello', chain: 3, title: 'El pavelló', text: 'Després de la vara, l\'aire puja pel coll, fa la volta per la bomba d\'afinació i torna endavant. Al final, el tub s\'eixampla i forma el pavelló, d\'uns 21 centímetres d\'amplada. El pavelló ajuda que el so surti amb força.', cam: { pos: [-150, 650, -1050], target: [-60, 30, -80] }, slow: 0.8, xray: true, note: 4 },
      { part: 'pavello', chain: 4, title: 'El so surt', text: 'Les ones de so surten pel pavelló i viatgen per l\'aire fins a les nostres orelles. El trombó té un so potent i rodó, i pot fer notes molt greus. És de la família del vent metall, com la trompeta i la tuba.', cam: { pos: [-1300, 300, -400], target: [-420, 60, -110] }, slow: 0.8, xray: false, note: 7 }
    ],
    soundSource: { group: 'pavello', at: [-480, BELLAX.y, BELLAX.z] },

    play(note) {
      const n = (typeof note === 'number' ? notes[note] : note) || notes[0];
      const isSeq = lastView === 'tour' && lastTour === POS_STEP && n === notes[SEQ[0]];
      // primer es mou la vara; la nota sona quan la vara ha arribat (es fa a update)
      const mt = moveTo(n.pos || 1);
      pending = n; fresh = true; seq = null;
      const hold = mt + (isSeq ? SEQ_DT * (SEQ.length - 1) + 2.4 : 2.4);
      return { attack: 0.06, hold, release: 0.4 };
    },

    update(dt, s) {
      const env = s.env || 0, t = s.t || 0, time = s.time || 0;
      const dtR = Math.min(0.1, Math.max(0, dt || 0));
      lastView = s.view; lastTour = s.tourStep;

      // --- nota nova
      if (fresh) {
        fresh = false;
        legato = prevEnv > 0.15 && soundOn;          // si encara sonava, el camí es queda encès i s'estira
        soundOn = false; spawnAcc = 0; lastT = t; idle = 0;
        if (!legato) { for (const b of beads) b.alive = false; beadsDirty = true; }
        seq = (s.view === 'tour' && s.tourStep === POS_STEP && pending === notes[SEQ[0]]) ? { t0: time, k: 0 } : null;
      }
      prevEnv = env;
      const dT = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;

      // --- visita "Les posicions": diverses notes seguides, cada una amb la seva posició
      if (seq) {
        if (s.view !== 'tour' || s.tourStep !== POS_STEP) seq = null;
        else {
          const k = Math.floor((time - seq.t0) / SEQ_DT);
          if (k >= SEQ.length) seq = null;
          else if (k > seq.k) { seq.k = k; pending = notes[SEQ[k]]; moveTo(pending.pos); }
        }
      }

      // --- la vara llisca cap a la posició (temps real, suau)
      if (slide.t < slide.dur) {
        slide.t = Math.min(slide.dur, slide.t + dtR);
        const u = slide.t / slide.dur, e = u * u * (3 - 2 * u);
        ext = slide.from + (slide.to - slide.from) * e;
      } else ext = slide.to;
      slideMov.position.x = -ext;

      // --- quan la vara ha arribat, sona la nota
      if (pending && slide.t >= slide.dur) {
        sound(pending); cur = pending; pending = null;
        if (!soundOn) { soundOn = true; tSound = t; }
      }

      // --- en silenci, la vara torna a poc a poc a la 1a posició
      if (env <= 0 && !pending) {
        idle += dtR;
        if (idle > 0.9 && slide.to !== 0 && slide.t >= slide.dur) moveTo(1, 2.2);
      } else idle = 0;

      // --- números de les posicions
      const showMk = (s.explode || 0) < 0.25;
      const arrived = slide.t >= slide.dur;
      for (const mk of markers) {
        mk.g.visible = showMk;
        if (!showMk) continue;
        const on = mk.p === slide.pos && (env > 0 || !arrived || mk.p !== 1);
        mk.m.color.setHex(on ? 0xF08A3C : 0x8A96A3);
        mk.m.opacity = on ? (arrived ? 0.95 : 0.6) : 0.32;
      }

      // --- llavis que vibren
      const lipOn = soundOn && env > 0.01;
      lipDisc.visible = lipRing.visible = lipOn;
      if (lipOn) {
        const fv = 0.45 + 0.0018 * Math.min(cur.f || 175, 1000);
        const w = Math.sin(2 * PI * fv * 5 * t);
        lipDisc.scale.set(1, 0.25 + 0.75 * (0.5 + 0.5 * w), 1);
        lipMat.opacity = 0.75 * env;
        lipRing.scale.setScalar(1 + 0.06 * w * env);
        lipRingMat.opacity = 0.45 * env * (0.7 + 0.3 * w);
      }

      // --- el camí de l'aire s'omple a velocitat visible (i s'estira amb la vara)
      const total = updateLengths();
      for (const p of route) { if (p.inner) p.inner.visible = false; if (p.outer) p.outer.visible = false; }
      bellGlow.visible = false;
      let bellFrac = 0;
      if (env > 0 && soundOn) {
        const front = legato ? 1e9 : SPEED * (t - tSound), sh = Math.sin(time * 6);
        const opIn = (s.xray ? 0.42 : 0.6) * env, opOut = env * (s.xray ? 0.05 : 0.34 + 0.07 * sh);
        let off = 0;
        for (const p of route) {
          const frac = clamp01((front - off) / p.L); off += p.L;
          if (frac <= 0) continue;
          if (p.kind === 'bell') {
            bellFrac = frac; bellGlow.visible = true; bellGlow.material.opacity = 0.22 * env * frac;
            continue;
          }
          if (p.kind === 'leg') {
            const len = Math.max(0.5, frac * p.L), x0 = p.sign < 0 ? -6 : X_IN_END - ext;
            for (const o of [p.inner, p.outer]) { o.visible = true; o.position.set(x0, p.y, 0); o.scale.set(len, 1, 1); }
          } else {
            const k = Math.max(1, Math.ceil(frac * p.segs));
            p.inner.visible = true; p.inner.geometry.setDrawRange(0, k * 8 * 6);
            if (p.outer) { p.outer.visible = true; p.outer.geometry.setDrawRange(0, k * 12 * 6); }
          }
          p.inner.material.opacity = opIn;
          if (p.outer) p.outer.material.opacity = opOut;
        }
      }

      // --- aire que surt pel pavelló
      if (bellFrac > 0.02 && env > 0.02) {
        _air.set(BELL_RIM_X - 6, BELLAX.y, BELLAX.z).add(G.pavello.position);
        fx.air(_air, _dir, 520 * env * Math.min(1, bellFrac * 3), 0.5, 230);
      }

      // --- polsos que viatgen pel tub
      if (env > 0.2 && soundOn) {
        spawnAcc += dT * RATE;
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const b = beads.find(q => !q.alive);
          if (b) { b.alive = true; b.s = spawnAcc * SPEED / RATE; b.w = Math.random() * PI * 2; }
        }
      }
      let any = false;
      for (let i = 0; i < NB; i++) {
        const b = beads[i];
        if (b.alive) { b.s += SPEED * dT; if (b.s >= total || env <= 0) b.alive = false; }
        if (b.alive) {
          any = true;
          sampleRoute(b.s, _p);
          bPos[i * 3] = _p.x; bPos[i * 3 + 1] = _p.y; bPos[i * 3 + 2] = _p.z;
          const fade = Math.min(1, (total - b.s) / 150);
          const br = Math.min(1, env * 1.6) * (0.8 + 0.2 * Math.sin(time * 9 + b.w)) * fade;
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
