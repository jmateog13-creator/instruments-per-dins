// Trompeta en Si bemoll — mòdul d'instrument (Vent metall)
// Unitats: mm. Y amunt. La trompeta és horitzontal al llarg de l'eix X:
// el broquet és a +X (el músic) i el pavelló a -X. Els pistons miren amunt.
// Vista de dalt: el tudel passa pel costat +Z dels pistons i el tub del pavelló pel costat -Z.
// Camí real de l'aire: broquet → tudel → bomba d'afinació → pistó 3 → pistó 2 → pistó 1 → colze → pavelló.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, geo, fx, synth } = ctx;
  const add = (g, ge, m, part, o) => ctx.add(g, ge, m, part, o || {});
  const PI = Math.PI;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

  const G = groups(['broquet', 'tudel', 'bombaAfin', 'pistons', 'bomba1', 'bomba2', 'bomba3', 'pavello']);

  // ---------------------------------------------------------------- materials
  // Còpies dels materials del motor, però amb raigs X (per veure l'aire per dins).
  const pick = (ref, extra) => {
    const o = { color: ref.color.clone(), metalness: ref.metalness, roughness: ref.roughness, side: THREE.DoubleSide };
    if (ref.clearcoat !== undefined) { o.clearcoat = ref.clearcoat; o.clearcoatRoughness = ref.clearcoatRoughness; }
    return Object.assign(o, extra || {});
  };
  const brassRef = M.brass('tudel'), silverRef = M.silver('broquet'), nickelRef = M.nickel('pistons');
  const brass = part => mat(part, pick(brassRef, { clearcoat: 0.7, clearcoatRoughness: 0.12 }), { xray: true });
  const mBroquet = mat('broquet', pick(silverRef), { phys: false, xray: true });
  const mTudel = brass('tudel');
  const mMain = brass('bombaAfin');
  const mPist = brass('pistons');
  const mSlide = brass('bombes');
  const mBell = brass('pavello');
  const mClau = brass('clau');
  const mPiston = mat('pistons', pick(nickelRef), { phys: false, xray: true });   // pistó per dins de la camisa
  const mStem = M.nickel('pistons');
  const mSkirt = M.nickel('pistons');
  const mPearl = mat('pistons', {
    color: 0xF4EFE6, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    iridescence: 0.55, iridescenceIOR: 1.35, sheen: 0.35, sheenColor: new THREE.Color(0xFFE6F0), side: THREE.DoubleSide
  });
  const mFelt = M.felt('pistons', 0x7A1F24);
  const mCork = mat('clau', { color: 0xA87A4E, roughness: 0.95 });

  // Materials de la brillantor de l'aire (no són peces: no es poden seleccionar)
  const GLOW = new THREE.Color(0x66E0FF), BEAD = new THREE.Color(0xC8F6FF);
  const glowMat = op => new THREE.MeshBasicMaterial({
    color: GLOW, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide, toneMapped: false
  });
  const noPick = o => { o.raycast = () => {}; o.castShadow = false; o.receiveShadow = false; return o; };

  // ---------------------------------------------------------------- ajudes de corbes
  // Polilínia amb cantonades arrodonides. Cada punt: [x,y,z] o [x,y,z,radi].
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
  // Talla una polilínia en trams segons una clau calculada al punt mig de cada segment
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
  // Tub de llautó al llarg d'una polilínia
  function tubeAlong(group, P, r, m, part, radial = 16) {
    const seg = Math.max(12, Math.round(plen(P) / 2.2));
    return add(group, geo.curveTube(P.map(p => [p.x, p.y, p.z]), r, seg, radial), m, part);
  }
  // Lathe orientat al llarg de -X: la y del perfil creix cap a -X a partir de x0
  const xLathe = (group, prof, m, part, x0, y, z, seg = 56) =>
    add(group, geo.lathe(prof, seg), m, part, { pos: [x0, y, z], rot: [0, 0, PI / 2] });
  // Cilindre orientat en una direcció qualsevol
  function cylAlong(group, center, dir, r, len, m, part) {
    const me = add(group, geo.cyl(r, len, 'y', 28), m, part, { pos: [center.x, center.y, center.z] });
    me.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
    return me;
  }

  // ---------------------------------------------------------------- mides principals
  const AX_LEAD = { y: 32, z: 21 };     // eix del broquet i del tudel
  const AX_BELL = { y: 30, z: -20 };    // eix del tub del pavelló i del pavelló
  const VX = { 1: 28, 2: 0, 3: -28 };   // posició X de cada pistó
  const CAS_R = 11.5;                   // radi de la camisa dels pistons
  const BELL_X0 = -90, BELL_L = 146;    // el pavelló va de x=-90 a x=-236
  const bellR = d => 58 * Math.pow(10.05 / (d + 10.05), 0.8); // d = distància a la vora

  // ================================================================ BROQUET
  {
    const prof = [
      [8.6, 0.4], [8.3, 1.6], [7.7, 3.6], [6.6, 6], [5.0, 8], [3.3, 9.6], [2.1, 11], [1.85, 13], [1.9, 20],
      [2.4, 32], [3.0, 48], [3.6, 66], [4.1, 86], [4.75, 88], [4.85, 70], [5.0, 62], [5.6, 58], [6.6, 54],
      [7.0, 46], [7.6, 36], [8.6, 28], [10.2, 20], [11.6, 13], [12.5, 7], [13.0, 3.2], [13.2, 1.2],
      [12.9, -0.3], [12.0, -1.1], [10.9, -1.3], [9.8, -1.0], [9.0, -0.4], [8.6, 0.4]
    ];
    xLathe(G.broquet, prof, mBroquet, 'broquet', 263, AX_LEAD.y, AX_LEAD.z, 64);
  }
  // Llavis que vibren (brillantor, no és una peça de l'instrument)
  const lipMat = new THREE.MeshBasicMaterial({ color: 0xFF8A66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const lipRingMat = lipMat.clone();
  const lipDisc = noPick(new THREE.Mesh(new THREE.CircleGeometry(8.2, 36), lipMat));
  const lipRing = noPick(new THREE.Mesh(new THREE.TorusGeometry(9.6, 1.5, 10, 44), lipRingMat));
  for (const o of [lipDisc, lipRing]) { o.position.set(265.5, AX_LEAD.y, AX_LEAD.z); o.rotation.y = PI / 2; o.renderOrder = 6; o.visible = false; G.broquet.add(o); }

  // ================================================================ TUDEL (tub d'entrada)
  {
    // receptor del broquet (x 205 → 175)
    xLathe(G.tudel, [[4.8, 0], [7.2, 0], [7.9, 0.8], [7.9, 3.2], [7.0, 4.2], [6.8, 6], [6.7, 24], [6.2, 28], [5.3, 30]], mTudel, 'tudel', 205, AX_LEAD.y, AX_LEAD.z);
    // tub cònic (x 175 → -62)
    xLathe(G.tudel, [[5.2, 0], [5.45, 60], [5.85, 160], [6.2, 237]], mTudel, 'tudel', 175, AX_LEAD.y, AX_LEAD.z);
    // virolla on entra la bomba d'afinació
    xLathe(G.tudel, [[6.1, 0], [7.0, 0.6], [7.1, 5.4], [6.4, 6.6]], mTudel, 'tudel', -56, AX_LEAD.y, AX_LEAD.z);
    // anelles decoratives
    xLathe(G.tudel, [[6.1, 0], [6.9, 0.5], [6.9, 2.5], [6.1, 3]], mTudel, 'tudel', 150, AX_LEAD.y, AX_LEAD.z);
    // ganxo del dit petit
    add(G.tudel, new THREE.TorusGeometry(5, 1.3, 8, 20, PI), mTudel, 'tudel', { pos: [-8, 35, AX_LEAD.z], rot: [0, PI / 2, 0] });
    // travesses: tudel ↔ camises i tudel ↔ tub del pavelló
    add(G.tudel, geo.tube([28, 28.5, 16.4], [28, 25.5, 11.2], 2.0, 1, 10), mTudel, 'tudel');
    add(G.tudel, geo.tube([-28, 28.5, 16.4], [-28, 25.5, 11.2], 2.0, 1, 10), mTudel, 'tudel');
    add(G.tudel, geo.tube([-50, 31, 15], [-50, 30.5, -14.2], 1.7, 1, 10), mTudel, 'tudel');
    for (const z of [15.2, -14.4]) add(G.tudel, geo.cyl(3.2, 1.2, 'z', 20), mTudel, 'tudel', { pos: [-50, 30.8, z] });
  }

  // ================================================================ BOMBA D'AFINACIÓ (+ clau de l'aigua)
  const MAIN_PTS = [[-62, 32, 21], [-130, 32, 21, 12], [-130, 8, 21, 12], [-44, 8, 21]];
  {
    const P = rounded([[-57, 32, 21], [-130, 32, 21, 12], [-130, 8, 21, 12], [-46, 8, 21]]);
    tubeAlong(G.bombaAfin, P, 6.0, mMain, 'bombaAfin');
    // tubs exteriors de la bomba (més gruixuts) i anelles
    add(G.bombaAfin, geo.cyl(6.7, 36, 'x', 32), mMain, 'bombaAfin', { pos: [-80, 32, 21] });
    add(G.bombaAfin, geo.cyl(6.7, 32, 'x', 32), mMain, 'bombaAfin', { pos: [-62, 8, 21] });
    for (const [x, y] of [[-98, 32], [-78, 8], [-63, 32]]) add(G.bombaAfin, geo.cyl(7.2, 2.6, 'x', 32), mMain, 'bombaAfin', { pos: [x, y, 21] });
    // travessa entre les dues branques
    add(G.bombaAfin, geo.tube([-104, 26.2, 21], [-104, 13.8, 21], 1.8, 1, 10), mMain, 'bombaAfin');
    // clau de l'aigua (a sota de la branca inferior)
    add(G.bombaAfin, geo.cyl(2.8, 5, 'y', 20), mClau, 'clau', { pos: [-114, 1.6, 21] });            // brocal
    add(G.bombaAfin, geo.cyl(3.9, 2.2, 'y', 24), mClau, 'clau', { pos: [-114, -2.4, 21] });          // cassoleta
    add(G.bombaAfin, geo.cyl(3.2, 1.2, 'y', 24), mCork, 'clau', { pos: [-114, -0.9, 21] });          // suro
    add(G.bombaAfin, geo.box(-114, -88, -3.7, -2.5, 19.9, 22.1), mClau, 'clau');                     // palanca
    add(G.bombaAfin, geo.box(-89, -80, -5.0, -3.6, 18.8, 23.2), mClau, 'clau');  // paleta del dit
    add(G.bombaAfin, geo.box(-101, -97, -2.8, 2.6, 18.4, 19.3), mClau, 'clau');                // suports del pern
    add(G.bombaAfin, geo.box(-101, -97, -2.8, 2.6, 23.1, 23.6), mClau, 'clau');
    add(G.bombaAfin, geo.cyl(0.9, 6.0, 'z', 12), mStem, 'clau', { pos: [-99, -1.4, 21] });          // pern
    add(G.bombaAfin, new THREE.TorusGeometry(1.7, 0.45, 6, 18), mStem, 'clau', { pos: [-99, -1.4, 21] }); // molla
  }

  // ================================================================ PISTONS (camises, botons, colzes)
  const mov = { 1: null, 2: null, 3: null };   // part mòbil de cada pistó (botó + tija + pistó)
  {
    const knurl = [[2.6, 0], [12.5, 0]];
    for (let k = 0; k < 6; k++) { const y = 0.5 + k * 0.75; knurl.push([12.95, y], [12.55, y + 0.38]); }
    knurl.push([12.7, 5.2], [11.6, 5.9], [4.2, 6.1], [2.6, 6.1]);
    const bottom = [[0, -7.6], [6, -7.2], [10.5, -6.2], [12.3, -4.6], [12.8, -3.4], [12.8, -0.6], [12.4, 0]];
    for (let n = 1; n <= 3; n++) {
      const x = VX[n];
      add(G.pistons, geo.cyl(CAS_R, 84, 'y', 48), mPist, 'pistons', { pos: [x, -12, 0] });              // camisa (y -54 → 30)
      add(G.pistons, geo.cyl(12.3, 4, 'y', 48), mPist, 'pistons', { pos: [x, 32, 0] });                  // virolla de dalt
      add(G.pistons, geo.cyl(12.3, 4, 'y', 48), mPist, 'pistons', { pos: [x, -56, 0] });                 // virolla de baix
      add(G.pistons, geo.cyl(12.0, 2, 'y', 48), mPist, 'pistons', { pos: [x, 10, 0] });                  // anella del mig
      add(G.pistons, geo.lathe(knurl, 56), mPist, 'pistons', { pos: [x, 34, 0] });                         // tapa de dalt
      add(G.pistons, geo.lathe(bottom, 56), mPist, 'pistons', { pos: [x, -58, 0] });                       // tapa de baix
      const g = new THREE.Group(); G.pistons.add(g); mov[n] = g;
      add(g, geo.cyl(10.6, 70, 'y', 40), mPiston, 'pistons', { pos: [x, -10, 0] });                       // pistó (es veu amb raigs X)
      for (const y of [-40, 20]) add(g, geo.cyl(10.9, 2.4, 'y', 40), mPiston, 'pistons', { pos: [x, y, 0] });
      add(g, geo.cyl(2.1, 30, 'y', 16), mStem, 'pistons', { pos: [x, 49, 0] });                           // tija
      add(g, geo.cyl(5.6, 2.4, 'y', 28), mFelt, 'pistons', { pos: [x, 61.2, 0] });                        // feltre
      add(g, geo.lathe([[0, 0], [8.3, 0], [8.9, 0.6], [8.9, 4.6], [8.6, 5.2], [7.8, 5.4], [0, 5.4]], 48), mSkirt, 'pistons', { pos: [x, 62.4, 0] });
      add(g, geo.lathe([[7.7, -0.2], [7.5, 0.35], [6.2, 0.85], [3.4, 1.15], [0, 1.25]], 48), mPearl, 'pistons', { pos: [x, 67.7, 0] });
    }
    // entrada del pistó 3 (des de la bomba d'afinació)
    tubeAlong(G.pistons, rounded([[-46, 8, 21], [-28, 8, 21, 8], [-28, 8, 8]]), 6.0, mPist, 'pistons');
    add(G.pistons, geo.cyl(7.1, 5, 'x', 32), mPist, 'pistons', { pos: [-46, 8, 21] });
    // colzes entre pistons (costat -Z)
    tubeAlong(G.pistons, rounded([[-28, 8, -8], [-28, 8, -17, 5], [0, 8, -17, 5], [0, 8, -8]]), 5.0, mPist, 'pistons');
    tubeAlong(G.pistons, rounded([[0, 16, -8], [0, 16, -17, 5], [28, 16, -17, 5], [28, 16, -8]]), 5.0, mPist, 'pistons');
  }

  // ================================================================ BOMBES DELS PISTONS
  const SLIDE = {
    1: { group: 'bomba1', test: m => m.x < 14 && m.z > 14, ext: [[28, -5, 8], [28, -5, 20, 8], [-50, -5, 20, 8], [-50, -21, 20, 8], [28, -21, 20, 8], [28, -21, 8]] },
    2: { group: 'bomba2', test: m => m.z < -22, ext: [[0, -6, -8], [0, -6, -40, 7], [0, -20, -40, 7], [0, -20, -8]] },
    3: { group: 'bomba3', test: m => m.x > -14 && m.z > 14, ext: [[-28, -33, 8], [-28, -33, 20, 8], [86, -33, 20, 8], [86, -49, 20, 8], [-28, -49, 20, 8], [-28, -49, 8]] }
  };
  for (let n = 1; n <= 3; n++) {
    const sd = SLIDE[n];
    const runs = splitRuns(rounded(sd.ext), m => (sd.test(m) ? 'slide' : 'stub'));
    for (const r of runs) {
      if (r.key === 'stub') { tubeAlong(G.pistons, r.P, 5.6, mPist, 'pistons'); continue; }
      tubeAlong(G[sd.group], r.P, 5.4, mSlide, 'bombes');
      // tubs exteriors (fundes) a les dues entrades de la bomba
      const a = r.P[0], a2 = r.P[Math.min(3, r.P.length - 1)];
      const b = r.P[r.P.length - 1], b2 = r.P[Math.max(0, r.P.length - 4)];
      const da = a2.clone().sub(a).normalize(), db = b.clone().sub(b2).normalize();
      cylAlong(G[sd.group], a.clone().addScaledVector(da, 8), da, 6.3, 16, mSlide, 'bombes');
      cylAlong(G[sd.group], b.clone().addScaledVector(db, -8), db, 6.3, 16, mSlide, 'bombes');
      cylAlong(G[sd.group], a.clone().addScaledVector(da, 1), da, 6.9, 2.2, mSlide, 'bombes');
      cylAlong(G[sd.group], b.clone().addScaledVector(db, -1), db, 6.9, 2.2, mSlide, 'bombes');
    }
  }
  // anella de la 3a bomba i ganxo del polze a la 1a
  add(G.bomba3, new THREE.TorusGeometry(7.5, 1.6, 10, 36), mSlide, 'bombes', { pos: [64, -61, 20] });
  add(G.bomba1, new THREE.TorusGeometry(6, 1.4, 8, 20, PI), mSlide, 'bombes', { pos: [-25, -5, 22], rot: [PI / 2, 0, 0] });
  // tap final de la 2a bomba (pom)
  add(G.bomba2, geo.cyl(2.2, 6, 'z', 16), mSlide, 'bombes', { pos: [0, -13, -48] });
  add(G.bomba2, new THREE.SphereGeometry(3.4, 18, 12), mSlide, 'bombes', { pos: [0, -13, -51.5] });

  // ================================================================ PAVELLÓ (colze + tub + campana)
  const BOW_PTS = [[39.5, -40, -2], [70, -40, -6, 30], [172, -40, -14, 35], [172, 30, -20, 35], [BELL_X0, 30, -20]];
  {
    tubeAlong(G.pavello, rounded([[36, -40, -2], [70, -40, -6, 30], [172, -40, -14, 35], [172, 30, -20, 35], [BELL_X0 + 2, 30, -20]]), 6.0, mBell, 'pavello', 18);
    // campana
    const prof = [];
    for (let i = 0; i <= 64; i++) { const y = BELL_L * Math.pow(i / 64, 0.85); prof.push([bellR(BELL_L - y), y]); }
    xLathe(G.pavello, prof, mBell, 'pavello', BELL_X0, AX_BELL.y, AX_BELL.z, 96);
    // vora enrotllada
    add(G.pavello, new THREE.TorusGeometry(59.6, 1.9, 14, 120), mBell, 'pavello', { pos: [BELL_X0 - BELL_L - 0.3, AX_BELL.y, AX_BELL.z], rot: [0, PI / 2, 0] });
    // garlanda (unió del tub i la campana)
    xLathe(G.pavello, [[6.0, -4], [7.3, -3.4], [7.7, -1], [7.7, 5], [7.4, 9], [7.0, 13]], mBell, 'pavello', BELL_X0, AX_BELL.y, AX_BELL.z);
    // anelles
    add(G.pavello, geo.cyl(6.7, 5, 'x', 32), mBell, 'pavello', { pos: [118, 30, -20] });
    cylAlong(G.pavello, V3(46, -40, -2.6), V3(1, 0, -0.13), 6.7, 5, mBell, 'pavello');
    // travesses
    add(G.pavello, geo.tube([0, 27, -14.8], [0, 25.5, -11.2], 2.0, 1, 10), mBell, 'pavello');
    add(G.pavello, geo.tube([28, 27, -14.8], [28, 25.5, -11.2], 2.0, 1, 10), mBell, 'pavello');
    add(G.pavello, geo.tube([-118, 30, -12.6], [-118, 31.2, 15.3], 1.7, 1, 10), mBell, 'pavello');
    add(G.pavello, geo.tube([128, 30, -14.2], [128, 31, 15.9], 1.7, 1, 10), mBell, 'pavello');
    for (const [x, z] of [[-118, -12.9], [128, -14.5]]) add(G.pavello, geo.cyl(3, 1.2, 'z', 18), mBell, 'pavello', { pos: [x, 30, z] });
  }

  // ================================================================ CAMÍ DE L'AIRE (brillantor)
  // Cada tros: polilínia en el sentit de l'aire, dins del grup on viu el tub.
  const pieces = {}, allPieces = [];
  function piece(id, group, P, rIn, rOut) {
    const L = plen(P), segs = Math.max(6, Math.round(L / 3));
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    curve.arcLengthDivisions = Math.max(200, P.length * 4);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const p = { id, group, P, cum, L, segs, inner: null, outer: null };
    p.inner = noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, rIn, 8, false), glowMat(0)));
    p.inner.renderOrder = 5; p.inner.visible = false; G[group].add(p.inner);
    if (rOut) {
      p.outer = noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, rOut, 12, false), glowMat(0)));
      p.outer.renderOrder = 6; p.outer.visible = false; G[group].add(p.outer);
    }
    pieces[id] = p; allPieces.push(p);
    return id;
  }
  piece('mp', 'broquet', rounded([[263, 32, 21], [176, 32, 21]]), 1.6, 0);
  piece('lead', 'tudel', rounded([[176, 32, 21], [-62, 32, 21]]), 4.2, 6.9);
  piece('main', 'bombaAfin', rounded(MAIN_PTS), 4.4, 7.2);
  piece('p3in', 'pistons', rounded([[-44, 8, 21], [-28, 8, 21, 8], [-28, 8, 11.5]]), 4.2, 6.7);
  piece('k32', 'pistons', rounded([[-28, 8, -11.5], [-28, 8, -17, 5], [0, 8, -17, 5], [0, 8, -11.5]]), 3.4, 5.7);
  piece('k21', 'pistons', rounded([[0, 16, -11.5], [0, 16, -17, 5], [28, 16, -17, 5], [28, 16, -11.5]]), 3.4, 5.7);
  piece('bow', 'pavello', rounded(BOW_PTS), 4.3, 6.9);
  // el pavelló: l'aire va per l'eix; la brillantor és una campana interior
  {
    const P = densify([V3(BELL_X0, 30, -20), V3(BELL_X0 - BELL_L - 2, 30, -20)], 5);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    pieces.bell = { id: 'bell', group: 'pavello', P, cum, L: plen(P), bell: true };
  }
  const bellGlowProf = [];
  for (let i = 0; i <= 40; i++) { const y = BELL_L * (i / 40); bellGlowProf.push([bellR(BELL_L - y) * 0.8, y]); }
  const bellGlow = noPick(new THREE.Mesh(geo.lathe(bellGlowProf, 64), glowMat(0)));
  bellGlow.material.side = THREE.DoubleSide;
  bellGlow.position.set(BELL_X0, AX_BELL.y, AX_BELL.z); bellGlow.rotation.z = PI / 2;
  bellGlow.renderOrder = 6; bellGlow.visible = false; G.pavello.add(bellGlow);

  // pistons: camí obert (sense prémer) i camí desviat per la bomba (prement)
  const PATH = {
    1: {
      open: [[28, 16, -11.5], [28, 16, -2, 4], [28, -40, -2, 5], [39.5, -40, -2]],
      pressed: [[28, 16, -11.5], [25, 16, -3, 4], [25, -5, 3, 4], [28, -5, 8, 3], [28, -5, 20, 8], [-50, -5, 20, 8], [-50, -21, 20, 8], [28, -21, 20, 8], [28, -21, 8, 3], [31, -21, 2, 4], [31, -40, -2, 5], [39.5, -40, -2]]
    },
    2: {
      open: [[0, 8, -11.5], [0, 8, -3, 4], [0, 16, -3, 4], [0, 16, -11.5]],
      pressed: [[0, 8, -11.5], [-4, 8, -3, 4], [-4, -6, -3, 4], [0, -6, -8, 3], [0, -6, -40, 7], [0, -20, -40, 7], [0, -20, -8, 3], [4, -20, -3, 4], [4, 16, -3, 4], [0, 16, -11.5]]
    },
    3: {
      open: [[-28, 8, 11.5], [-28, 8, -11.5]],
      pressed: [[-28, 8, 11.5], [-32, 8, 3, 4], [-32, -33, 3, 4], [-28, -33, 8, 3], [-28, -33, 20, 8], [86, -33, 20, 8], [86, -49, 20, 8], [-28, -49, 20, 8], [-28, -49, 8, 3], [-24, -49, 3, 4], [-24, 8, -3, 4], [-28, 8, -11.5]]
    }
  };
  const VALVE = {};
  for (let n = 1; n <= 3; n++) {
    const open = piece('v' + n + 'o', 'pistons', rounded(PATH[n].open), 3.6, 0);
    const runs = splitRuns(rounded(PATH[n].pressed), m => (SLIDE[n].test(m) ? SLIDE[n].group : 'pistons'));
    const pressed = runs.map((r, i) => piece('v' + n + 'p' + i, r.key, r.P, 3.6, r.key === 'pistons' ? 6.2 : 6.6));
    VALVE[n] = { open: [open], pressed };
  }
  const routes = {};
  function routeFor(vs) {
    const key = vs.slice().sort().join('');
    if (routes[key]) return routes[key];
    const v = n => (vs.includes(n) ? VALVE[n].pressed : VALVE[n].open);
    const ids = ['mp', 'lead', 'main', 'p3in', ...v(3), 'k32', ...v(2), 'k21', ...v(1), 'bow', 'bell'];
    const list = ids.map(id => pieces[id]), offs = [];
    let tot = 0; for (const p of list) { offs.push(tot); tot += p.L; }
    return (routes[key] = { list, offs, total: tot });
  }

  // polsos de llum que viatgen pel camí (es veuen sense raigs X)
  const NB = 80, SPEED = 1300, RATE = 16;   // mm per segon visual, polsos per segon
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
    size: 26, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
  });
  const beadPts = noPick(new THREE.Points(bGeo, bMat));
  beadPts.frustumCulled = false; beadPts.renderOrder = 8; G.tudel.add(beadPts);

  const _p = V3(0, 0, 0), _o = V3(0, 0, 0), _air = V3(0, 0, 0), _dir = V3(-1, 0, 0);
  function sampleRoute(R, s, out) {
    let i = 0; while (i < R.list.length - 1 && s > R.offs[i] + R.list[i].L) i++;
    const p = R.list[i], ls = Math.min(p.L, Math.max(0, s - R.offs[i]));
    let lo = 0, hi = p.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] <= ls) lo = mid; else hi = mid; }
    const seg = p.cum[hi] - p.cum[lo], u = seg > 0 ? (ls - p.cum[lo]) / seg : 0;
    out.lerpVectors(p.P[lo], p.P[hi], u);
    // els grups es desplacen quan es desmunta: corregim respecte del grup del tudel
    _o.copy(G[p.group].position).sub(G.tudel.position);
    return out.add(_o);
  }

  // ---------------------------------------------------------------- notes i so
  // Noms escrits (com llegeix el trompetista); freqüències reals que sonen (trompeta en Si bemoll).
  const notes = [
    { label: 'Do', f: 233.08, valves: [] },
    { label: 'Re', f: 261.63, valves: [1, 3] },
    { label: 'Mi', f: 293.66, valves: [1, 2] },
    { label: 'Fa', f: 311.13, valves: [1] },
    { label: 'Sol', f: 349.23, valves: [] },
    { label: 'La', f: 392.00, valves: [1, 2] },
    { label: 'Si', f: 440.00, valves: [2] },
    { label: 'Do agut', f: 466.16, valves: [] }
  ];
  const partials = [];
  for (let k = 1; k <= 16; k++) partials.push({ k, a: Math.pow(k, 0.6) * Math.exp(-k / 4), tau: 0.9 / (1 + 0.06 * k) });

  // ---------------------------------------------------------------- estat d'animació
  const press = { 1: 0, 2: 0, 3: 0 };
  let lastT = 0, lastIdx = -1, spawnAcc = 0, beadsDirty = false;

  return {
    id: 'trompeta',
    family: 'Vent metall',
    name: 'Trompeta',
    intro: 'Els llavis del músic vibren dins del broquet i fan vibrar l\'aire d\'un tub de llautó d\'uns 1,4 metres. Els pistons allarguen el camí de l\'aire i així la nota surt més greu.',
    floorY: -95,
    camera: {
      explore: { pos: [80, 420, 660], target: [-5, 6, 0] },
      exploded: { pos: [110, 610, 900], target: [-10, 40, 0] }
    },
    parts: {
      broquet: { name: 'Broquet', text: 'És la peça on el músic posa els llavis. Els llavis vibren dins de la seva copa, com quan fas una pedorreta.', dato: 'Es pot treure, i molts trompetistes porten sempre el seu broquet preferit.' },
      tudel: { name: 'Tudel', text: 'És el primer tub, on encaixa el broquet. Porta l\'aire que vibra cap a la resta de la trompeta.', dato: 'Es va eixamplant a poc a poc, com un con molt llarg i prim.' },
      pistons: { name: 'Pistons', text: 'Són tres vàlvules que es premen amb els dits de la mà dreta. Cada pistó desvia l\'aire per un tros de tub extra.', dato: 'Amb els mateixos pistons es fan diverses notes canviant la pressió dels llavis: per això el Do i el Sol es toquen sense pistons.' },
      bombes: { name: 'Bombes dels pistons', text: 'Són els tubs extra en forma d\'U, un per a cada pistó. Quan prems un pistó, l\'aire hi fa la volta i la nota baixa.', dato: 'La bomba del tercer pistó té una anella perquè el músic la pugui estirar amb un dit i afinar millor.' },
      bombaAfin: { name: 'Bomba d\'afinació', text: 'És un tub en forma d\'U que es pot estirar o empènyer. Si l\'estires, el tub és més llarg i tota la trompeta sona una mica més greu.', dato: 'Els músics l\'ajusten abans de tocar per quedar afinats amb els altres instruments.' },
      clau: { name: 'Clau de l\'aigua', text: 'És una palanqueta per buidar l\'aigua que es forma dins del tub. Aquesta aigua ve sobretot del vapor de l\'alè, que es refreda.', dato: 'Un tap de suro o de goma tanca el forat quan no la prems.' },
      pavello: { name: 'Pavelló', text: 'És la campana del final del tub. Ajuda que el so surti amb força cap endavant.', dato: 'Fa uns 12 centímetres d\'amplada i sovint es fa amb una sola planxa de llautó.' }
    },
    labels: [
      { part: 'broquet', group: 'broquet', at: [238, 45, 21], internal: false },
      { part: 'tudel', group: 'tudel', at: [90, 38, 21], internal: false },
      { part: 'bombaAfin', group: 'bombaAfin', at: [-140, 20, 21], internal: false },
      { part: 'clau', group: 'bombaAfin', at: [-96, -5, 21], internal: false },
      { part: 'pistons', group: 'pistons', at: [0, 69, 0], internal: false },
      { part: 'bombes', group: 'bomba3', at: [80, -41, 26], internal: false },
      { part: 'pavello', group: 'pavello', at: [-226, 63, -20], internal: false }
    ],
    explode: {
      broquet: [110, 0, 0, 0],
      tudel: [30, 0, 75, 0.06],
      bombaAfin: [-85, 0, 75, 0.12],
      pistons: [0, 125, 0, 0.18],
      bomba1: [-75, 55, 40, 0.3],
      bomba2: [0, 60, -75, 0.3],
      bomba3: [85, 30, 50, 0.33],
      pavello: [-45, -5, -125, 0.22]
    },
    notes,
    options: null,
    chain: ['Llavis', 'Broquet', 'Tubs i pistons', 'Pavelló', 'Aire'],
    tour: [
      { part: 'broquet', chain: 0, title: 'Els llavis i el broquet', text: 'El músic posa els llavis dins del broquet i bufa. Els llavis vibren molt de pressa, com quan fas una pedorreta. Aquesta vibració fa vibrar l\'aire de dins del tub.', cam: { pos: [348, 122, 191], target: [228, 32, 21] }, slow: 0.4, xray: false, note: 0 },
      { part: 'tudel', chain: 2, title: 'El tub', text: 'La trompeta és un tub de llautó d\'uns 1,4 metres, enrotllat perquè sigui fàcil d\'aguantar. Amb els raigs X veus el camí que fa l\'aire per dins. Com més llarg és el tub, més greu és la nota.', cam: { pos: [60, 430, 560], target: [-10, 0, 0] }, slow: 0.6, xray: true, note: 0 },
      { part: 'pistons', chain: 2, title: 'Els pistons', text: 'Quan prems un pistó, l\'aire es desvia per un tros de tub extra. El camí es fa més llarg i la nota baixa. Mira el Re: amb els pistons 1 i 3, l\'aire fa molta més volta.', cam: { pos: [70, 210, 330], target: [5, -5, 5] }, slow: 0.5, xray: true, note: 1 },
      { part: 'bombes', chain: 2, title: 'Les bombes', text: 'Cada pistó té la seva bomba, un tub en forma d\'U. La del segon pistó és la més curta i la del tercer, la més llarga. La bomba d\'afinació, al davant, serveix per afinar tota la trompeta.', cam: { pos: [90, 60, 400], target: [15, -30, 15] }, slow: 0.6, xray: false, note: 1 },
      { part: 'pavello', chain: 3, title: 'El pavelló', text: 'Al final, el tub s\'eixampla i forma el pavelló. Ajuda que el so surti amb força cap endavant. Les ones de so viatgen per l\'aire fins a les nostres orelles.', cam: { pos: [-520, 160, 300], target: [-170, 30, -20] }, slow: 0.6, xray: false, note: 4 }
    ],
    soundSource: { group: 'pavello', at: [-240, 30, -20] },

    play(note) {
      const n = typeof note === 'number' ? notes[note] : note;
      const f = (n && n.f) || 233.08;
      synth.additive({
        f, partials, attack: 0.05, hold: 1.0, release: 0.18,
        vibrato: { rate: 5, depth: 6 },
        noise: { amount: 0.035, dur: 0.08, lp: 3200, hp: 450 },
        gain: 0.85
      });
      // L'envolupant visual s'allarga una mica perquè es vegi l'aire recórrer tot el tub.
      return { attack: 0.05, hold: 1.6, release: 0.35 };
    },

    update(dt, s) {
      const env = s.env || 0, t = s.t || 0;
      const nt = notes[s.noteIndex] || s.note || {};
      const vs = (nt && nt.valves) || [];

      // --- pistons: baixen 15 mm mentre sona la nota i pugen quan s'apaga
      for (let n = 1; n <= 3; n++) {
        const want = env > 0.3 && vs.includes(n) ? 1 : 0;
        press[n] += (want - press[n]) * Math.min(1, dt * 16);
        mov[n].position.y = -15 * press[n];
      }

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
            bellGlow.visible = true; bellGlow.material.opacity = 0.22 * env * frac;
            return;
          }
          const k = Math.max(1, Math.ceil(frac * p.segs));
          p.inner.visible = true;
          p.inner.geometry.setDrawRange(0, k * 8 * 6);
          p.inner.material.opacity = (s.xray ? 0.42 : 0.6) * env;
          if (p.outer) {
            p.outer.visible = true;
            p.outer.geometry.setDrawRange(0, k * 12 * 6);
            p.outer.material.opacity = env * (s.xray ? 0.05 : 0.34 + 0.07 * sh);
          }
        });
      }

      // --- aire que surt pel pavelló (quan hi arriba)
      if (bellFrac > 0.02 && env > 0.02) {
        _air.set(BELL_X0 - BELL_L - 4, AX_BELL.y, AX_BELL.z).add(G.pavello.position);
        fx.air(_air, _dir, 460 * env * Math.min(1, bellFrac * 3), 0.45, 210);
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
          const fade = Math.min(1, (R.total - b.s) / 120);
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
