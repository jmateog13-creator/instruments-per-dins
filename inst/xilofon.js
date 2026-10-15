// Xilòfon — mòdul d'instrument (Percussió afinada)
// Unitats: mm. Y amunt. El músic és a +Z; les notes greus a -X (a l'esquerra del músic).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, geo, fx, synth, heat } = ctx;
  const add = (g, ge, m, part, o) => ctx.add(g, ge, m, part, o || {});

  const G = groups(['estructura', 'rails', 'ressonadors', 'lamines', 'cordo', 'baquetes']);

  // ---------------------------------------------------------------- mides
  const W = 38;            // amplada de la làmina
  const TH = 22;           // gruix de la làmina
  const BEV = 1.2;         // bisell
  const PITCH = 48;        // distància entre centres de làmines
  const NODE = 0.224;      // node a 22,4 % de cada punta
  const NOFF = 0.5 - NODE; // distància del node al centre (fracció de la llargada)
  const HOLE_Y = 9.5, HOLE_R = 3.0;
  const SHARP_Y = 38;      // base de les làmines de la fila dels sostinguts (més alta)
  const RES_R = 20;        // radi dels tubs ressonadors
  const C_AIR = 343000;    // velocitat del so (mm/s)

  const lenOf = st => 380 * Math.pow(2, -0.4406 * st / 12); // 380 mm (Do5) -> 280 mm (Do6)

  const NAT = [
    ['Do', 523.25, 0], ['Re', 587.33, 2], ['Mi', 659.25, 4], ['Fa', 698.46, 5],
    ['Sol', 783.99, 7], ['La', 880.00, 9], ['Si', 987.77, 11], ['Do agut', 1046.50, 12]
  ];
  const notes = NAT.map(([label, f]) => ({ label, f }));
  const nat = NAT.map(([label, f, st], i) => ({ i, f, x: -168 + PITCH * i, L: lenOf(st), z: 0 }));

  // fila de sostinguts (decorativa, no es toca): Do#, Re#, Fa#, Sol#, La#
  const sh = [[1, -144], [3, -96], [6, 0], [8, 48], [10, 96]].map(([st, x]) => ({
    x, L: lenOf(st), f: 523.25 * Math.pow(2, st / 12), z: 0
  }));
  const zsIdeal = s => {
    const nb = nat.filter(n => Math.abs(n.x - s.x) < 30);
    const avg = nb.reduce((a, n) => a + n.L, 0) / nb.length;
    return -(avg / 2 + s.L / 2 - 40); // 40 mm de solapament per sobre de les naturals
  };
  const line = (x0, z0, x1, z1) => { const m = (z1 - z0) / (x1 - x0); return x => z0 + m * (x - x0); };
  const zsLine = line(sh[0].x, zsIdeal(sh[0]), sh[4].x, zsIdeal(sh[4]));
  for (const s of sh) s.z = zsLine(s.x);

  // línies dels nodes (on van els rails)
  const n0 = nat[0], n7 = nat[7], s0 = sh[0], s4 = sh[4];
  const natF = line(n0.x, NOFF * n0.L, n7.x, NOFF * n7.L);
  const natB = x => -natF(x);
  const shF = line(s0.x, s0.z + NOFF * s0.L, s4.x, s4.z + NOFF * s4.L);
  const shB = line(s0.x, s0.z - NOFF * s0.L, s4.x, s4.z - NOFF * s4.L);
  const XR = 215; // llargada útil dels rails: de -XR a +XR

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = u => u * u * (3 - 2 * u);

  // primer mode de flexió d'una barra lliure: nodes a 0,224 i 0,776; puntes = 1, centre ≈ -0,61
  const BETA = 4.730040745, SIG = 0.982502215;
  const mode = xi => (Math.cosh(BETA * xi) + Math.cos(BETA * xi)
    - SIG * (Math.sinh(BETA * xi) + Math.sin(BETA * xi))) / 2;

  // ---------------------------------------------------------------- materials
  const barTex = tex.rosewoodBar(1 / 420, 1 / 120);
  const barMat = k => {
    const t = barTex.clone();
    t.offset.set((k * 0.137) % 1, (k * 0.291) % 1);
    t.needsUpdate = true;
    return M.wood('lamines', t);
  };
  const railTex = tex.maple(1 / 260, 1 / 260); railTex.rotation = Math.PI / 2;
  const railWood = M.rawWood('rails', railTex, { color: 0xc89a66 });
  const feltMat = M.felt('rails', 0x7a1d2c);
  const boardMat = M.wood('estructura', tex.mahogany(1 / 520, 1 / 260));
  const standMat = mat('estructura', { color: 0x1e2124, metalness: 0.75, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const chromeMat = M.chrome('estructura');
  const wheelMat = M.plastic('estructura', 0x2a2c2f);
  const resMat = mat('ressonadors', { color: 0xd9dce1, metalness: 1, roughness: 0.27, clearcoat: 0.5, clearcoatRoughness: 0.25 }, { xray: true });
  const strapMat = mat('ressonadors', { color: 0x9da2a8, metalness: 1, roughness: 0.4 });
  const cordMat = mat('cordo', { color: 0xe8dfca, roughness: 0.85, metalness: 0 });
  const pinMat = M.nickel('cordo');
  const sleeveMat = M.plastic('cordo', 0x3a3530);
  const shaftMat = mat('baquetes', { color: 0xcfa774, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const nodeMat = mat('baquetes', { color: 0xa9834f, roughness: 0.55 });
  const gripMat = mat('baquetes', { color: 0x2b2b30, roughness: 0.9 });
  const headMat = M.plastic('baquetes', 0x8c1f2a);

  // ---------------------------------------------------------------- làmines
  // Perfil lateral (x = llargada, y = gruix) amb l'arc tallat per sota, extrudit al llarg de l'amplada.
  function barGeo(L) {
    const h = L / 2 - BEV, y0 = BEV, y1 = TH - BEV, a = 0.24 * L, H = 7;
    const xs = [];
    const N = 56;
    for (let k = 0; k <= N; k++) xs.push(-h + 2 * h * k / N);
    xs.push(-a, a);
    xs.sort((p, q) => p - q);
    const ux = xs.filter((x, k) => k === 0 || x - xs[k - 1] > 0.5);
    const pts = [];
    for (const x of ux) { const u = x / a; pts.push([x, Math.abs(u) < 1 ? y0 + H * (1 - u * u) : y0]); }
    for (let k = ux.length - 1; k >= 0; k--) pts.push([ux[k], y1]);
    const shape = geo.shape(pts);
    for (const sx of [-1, 1]) {           // forats del cordó als nodes
      const c = [], cx = sx * NOFF * L;
      for (let k = 0; k < 14; k++) {
        const an = k / 14 * Math.PI * 2;
        c.push([cx + HOLE_R * Math.cos(an), HOLE_Y + HOLE_R * Math.sin(an)]);
      }
      shape.holes.push(geo.path(c));
    }
    const g = geo.ext(shape, W - 2 * BEV, { bevelThickness: BEV, bevelSize: BEV, bevelSegments: 2 });
    g.translate(0, 0, -(W - 2 * BEV) / 2);
    return g;
  }

  const bars = nat.map((n, i) => {
    const g = barGeo(n.L);
    const cnt = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(cnt * 3), 3));
    const base = Float32Array.from(g.attributes.position.array);
    const baseN = Float32Array.from(g.attributes.normal.array);
    const phi = new Float32Array(cnt);
    for (let k = 0; k < cnt; k++) phi[k] = mode(clamp01(base[k * 3] / n.L + 0.5));
    // eix local x (llargada) -> +Z del món
    const mesh = add(G.lamines, g, barMat(i), 'lamines', { pos: [n.x, 0, 0], rot: [0, -Math.PI / 2, 0], note: i });
    const overlay = heat.overlay(mesh);
    return { geo: g, mesh, overlay, base, baseN, phi, cnt, moved: false };
  });
  sh.forEach((s, k) => {
    add(G.lamines, barGeo(s.L), barMat(20 + k), 'lamines', { pos: [s.x, SHARP_Y, s.z], rot: [0, -Math.PI / 2, 0] });
  });

  // ---------------------------------------------------------------- rails (fusta + feltre)
  function alongLine(group, lineFn, yBot, yTop, width, material, part, r, xa = -XR, xb = XR, cast = true) {
    const za = lineFn(xa), zb = lineFn(xb);
    const dx = xb - xa, dz = zb - za, len = Math.hypot(dx, dz);
    const g = geo.ext(geo.rrect(-width / 2, width / 2, yBot, yTop, r), len);
    g.translate(0, 0, -len / 2);
    return add(group, g, material, part, { pos: [(xa + xb) / 2, 0, (za + zb) / 2], rot: [0, Math.atan2(dx, dz), 0], cast });
  }
  for (const fn of [natF, natB]) {
    alongLine(G.rails, fn, -44, -4, 26, railWood, 'rails', 3);
    alongLine(G.rails, fn, -4, 0, 22, feltMat, 'rails', 1.2);
  }
  for (const fn of [shF, shB]) {
    alongLine(G.rails, fn, SHARP_Y - 44, SHARP_Y - 4, 26, railWood, 'rails', 3);
    alongLine(G.rails, fn, SHARP_Y - 4, SHARP_Y, 22, feltMat, 'rails', 1.2);
  }

  // ---------------------------------------------------------------- cordó i passadors
  const pinGeo = geo.cyl(1.3, 21, 'y', 10);
  const sleeveGeo = geo.cyl(2.2, 10, 'y', 12);
  const capGeo = new THREE.SphereGeometry(1.7, 12, 8);
  const knotGeo = new THREE.SphereGeometry(2.6, 14, 10);
  function pins(xs, lineFn, yRail, side) {
    for (const x of xs) {
      const z = lineFn(x) - side * 3.6;
      add(G.cordo, pinGeo, pinMat, 'cordo', { pos: [x, yRail + 10.5, z] });
      add(G.cordo, sleeveGeo, sleeveMat, 'cordo', { pos: [x, yRail + 9.5, z] });
      add(G.cordo, capGeo, pinMat, 'cordo', { pos: [x, yRail + 21, z] });
    }
  }
  function cord(barList, lineFn, yHole, side, xStart, xEnd) {
    const pts = [[xStart, yHole, lineFn(xStart)]];
    for (const b of barList) {
      const zn = (b.z || 0) + side * NOFF * b.L;
      pts.push([b.x - W / 2 - 1.5, yHole, zn], [b.x, yHole, zn], [b.x + W / 2 + 1.5, yHole, zn]);
    }
    pts.push([xEnd, yHole, lineFn(xEnd)]);
    add(G.cordo, geo.curveTube(pts, 1.25, 260, 6), cordMat, 'cordo', { cast: false });
    add(G.cordo, knotGeo, cordMat, 'cordo', { pos: pts[0] });
    add(G.cordo, knotGeo, cordMat, 'cordo', { pos: pts[pts.length - 1] });
  }
  const natPins = [-192, -144, -96, -48, 0, 48, 96, 144, 192];
  const shPins = [-168, -120, -48, 24, 72, 120];
  pins(natPins, natF, -4, 1); pins(natPins, natB, -4, -1);
  pins(shPins, shF, SHARP_Y - 4, 1); pins(shPins, shB, SHARP_Y - 4, -1);
  cord(nat, natF, HOLE_Y, 1, -200, 200);
  cord(nat, natB, HOLE_Y, -1, -200, 200);
  cord(sh, shF, SHARP_Y + HOLE_Y, 1, -176, 128);
  cord(sh, shB, SHARP_Y + HOLE_Y, -1, -176, 128);

  // ---------------------------------------------------------------- ressonadors
  function tubeGeo(yt, yb) {
    const R = RES_R;
    return geo.lathe([[0, yb], [R - 3, yb], [R - 0.4, yb + 1.2], [R, yb + 4], [R, yt],
      [R - 1, yt], [R - 1, yb + 3], [0, yb + 3]], 48);
  }
  const rimGeo = new THREE.TorusGeometry(RES_R - 0.5, 1.2, 8, 48);
  function makeTube(x, z, yt, f) {
    const Lt = C_AIR / (4 * f) - 0.61 * RES_R; // tub tancat: un quart de la longitud d'ona
    const yb = yt - Lt;
    add(G.ressonadors, tubeGeo(yt, yb), resMat, 'ressonadors', { pos: [x, 0, z] });
    add(G.ressonadors, rimGeo, resMat, 'ressonadors', { pos: [x, yt, z], rot: [Math.PI / 2, 0, 0] });
    return { x, z, yt, yb, Lt };
  }
  const RES_TOP = -28, SH_RES_TOP = 6;
  const glowColor = new THREE.Color(0x3fb4ff);
  const res = nat.map(n => {
    const r = makeTube(n.x, 0, RES_TOP, n.f);
    const colMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const col = add(G.ressonadors, geo.cyl(RES_R - 1.8, r.Lt - 4, 'y', 32), colMat, 'ressonadors',
      { pos: [r.x, (r.yt + r.yb + 3) / 2, 0], cast: false, pick: false });
    const diskMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const disk = add(G.ressonadors, new THREE.CircleGeometry(RES_R - 1.2, 40), diskMat, 'ressonadors',
      { pos: [r.x, r.yt - 1, 0], rot: [-Math.PI / 2, 0, 0], cast: false, pick: false });
    col.visible = false; disk.visible = false;
    return Object.assign(r, { col, colMat, disk, diskMat });
  });
  sh.forEach(s => makeTube(s.x, s.z, SH_RES_TOP, s.f));
  // platines que subjecten els tubs
  add(G.ressonadors, geo.box(-XR, XR, -50, -38, RES_R + 0.5, RES_R + 3.5), strapMat, 'ressonadors');
  add(G.ressonadors, geo.box(-XR, XR, -50, -38, -RES_R - 3.5, -RES_R - 0.5), strapMat, 'ressonadors');
  alongLine(G.ressonadors, x => zsLine(x) + RES_R + 2, SH_RES_TOP - 22, SH_RES_TOP - 10, 3, strapMat, 'ressonadors', 0.8);
  alongLine(G.ressonadors, x => zsLine(x) - RES_R - 2, SH_RES_TOP - 22, SH_RES_TOP - 10, 3, strapMat, 'ressonadors', 0.8);

  // ---------------------------------------------------------------- estructura
  const BOARD_BOT = -80, FLOOR = -831;
  function endBoard(xFace, x0) {
    const zF = natF(xFace) + 30, zNB = natB(xFace) - 14, zSF = shF(xFace) + 14, zB = shB(xFace) - 30;
    const legF = zF - 45, legB = zB + 45;
    const pts = [[zB, BOARD_BOT]];
    for (let k = 0; k <= 20; k++) {                 // arc decoratiu per sota, entre les potes
      const t = k / 20, z = (legB + 25) + (legF - 25 - (legB + 25)) * t;
      pts.push([z, BOARD_BOT + 24 * Math.sin(Math.PI * t)]);
    }
    pts.push([zF, BOARD_BOT], [zF, -2]);
    for (let k = 0; k <= 12; k++) {                 // esglaó suau cap a la fila alta
      const t = k / 12;
      pts.push([(zNB - 12) + ((zSF + 12) - (zNB - 12)) * t, -2 + (SHARP_Y - 2 + 2) * (0.5 - 0.5 * Math.cos(Math.PI * t))]);
    }
    pts.push([zB, SHARP_Y - 2]);
    const g = geo.ext(geo.shape(pts), 22, { bevelThickness: 2, bevelSize: 2, bevelSegments: 2 });
    add(G.estructura, g, boardMat, 'estructura', { pos: [x0, 0, 0], rot: [0, -Math.PI / 2, 0] });
    return { legF, legB };
  }
  const wheelGeo = geo.cyl(30, 22, 'x', 28);
  const hubGeo = geo.cyl(9, 27, 'x', 16);
  function stand(xc, legs) {
    const yFoot = FLOOR + 72;
    for (const z of [legs.legF, legs.legB]) {
      add(G.estructura, geo.tube([xc, BOARD_BOT + 2, z], [xc, yFoot, z], 15, 1, 20), standMat, 'estructura');
      add(G.estructura, geo.box(xc - 20, xc + 20, BOARD_BOT - 6, BOARD_BOT + 2, z - 24, z + 24), standMat, 'estructura');
    }
    add(G.estructura, geo.tube([xc, -560, legs.legF], [xc, -560, legs.legB], 12, 1, 16), standMat, 'estructura');
    const zA = legs.legF + 55, zB = legs.legB - 55;
    add(G.estructura, geo.tube([xc, yFoot, zA], [xc, yFoot, zB], 16, 1, 18), standMat, 'estructura');
    for (const z of [zA, zB]) {
      add(G.estructura, geo.cyl(16.5, 4, 'z', 18), standMat, 'estructura', { pos: [xc, yFoot, z] });
      add(G.estructura, geo.box(xc - 15, xc + 15, FLOOR + 30, yFoot - 6, z - 4, z + 4), chromeMat, 'estructura');
      add(G.estructura, wheelGeo, wheelMat, 'estructura', { pos: [xc, FLOOR + 30, z] });
      add(G.estructura, hubGeo, chromeMat, 'estructura', { pos: [xc, FLOOR + 30, z] });
    }
    return (legs.legF + legs.legB) / 2;
  }
  const legsL = endBoard(-XR, -XR - 2);
  const legsR = endBoard(XR, XR + 24);
  const midL = stand(-228, legsL), midR = stand(228, legsR);
  add(G.estructura, geo.tube([-228, -560, midL], [228, -560, midR], 14, 1, 18), standMat, 'estructura');

  // ---------------------------------------------------------------- baquetes
  const LM = 340, HEAD_R = 13, HEAD_Y = TH + HEAD_R;
  const TH_C = -0.25, TH_R = 0.10, TH_W = 0.24;     // inclinació: cop, repòs, preparació
  const offsetOf = (th, psi) => {
    const c = Math.cos(th);
    return [-LM * c * Math.sin(psi), LM * Math.sin(th), -LM * c * Math.cos(psi)];
  };
  const headGeo = new THREE.SphereGeometry(HEAD_R, 32, 22);
  const ringGeo = new THREE.TorusGeometry(4.3, 0.7, 6, 18);
  function makeMallet(psi, restX, ph) {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    G.baquetes.add(pivot);
    add(pivot, new THREE.SphereGeometry(4.9, 16, 10), gripMat, 'baquetes');
    add(pivot, geo.cyl(4.8, 72, 'z', 16), gripMat, 'baquetes', { pos: [0, 0, -36] });
    const sLen = LM - HEAD_R + 4 - 70;
    add(pivot, geo.cyl(4.0, sLen, 'z', 14), shaftMat, 'baquetes', { pos: [0, 0, -(70 + sLen / 2)] });
    for (const z of [-125, -205, -280]) add(pivot, ringGeo, nodeMat, 'baquetes', { pos: [0, 0, z] });
    add(pivot, geo.cyl(5.2, 8, 'z', 16), gripMat, 'baquetes', { pos: [0, 0, -(LM - HEAD_R - 2)] });
    add(pivot, headGeo, headMat, 'baquetes', { pos: [0, 0, -LM] });
    return { pivot, psi, x: restX, fromX: restX, toX: restX, ph };
  }
  const mL = makeMallet(-0.18, nat[1].x, 0);
  const mR = makeMallet(0.18, nat[6].x, 1.7);
  function poseMallet(m, hx, th) {
    const oc = offsetOf(TH_C, m.psi);
    m.pivot.position.set(hx - oc[0], HEAD_Y - oc[1], -oc[2]);
    m.pivot.rotation.set(th, m.psi, 0);
  }
  poseMallet(mL, mL.x, TH_R); poseMallet(mR, mR.x, TH_R);
  const restHeadL = (() => {
    const oc = offsetOf(TH_C, mL.psi), orr = offsetOf(TH_R, mL.psi);
    return [mL.x - oc[0] + orr[0], HEAD_Y - oc[1] + orr[1], -oc[2] + orr[2]];
  })();

  // ---------------------------------------------------------------- estat de l'animació
  const T_MOVE = 0.10, T_WIND = 0.05, T_HIT = 0.15, T_BACK = 0.35; // temps visual
  const AMP = 4.2; // mm a les puntes (exagerat)
  let pending = null, strike = null, lastT = 0, active = null, flip = false;

  const validIdx = i => typeof i === 'number' && i >= 0 && i < nat.length;

  function glowOff(idx) {
    const r = res[idx];
    r.col.visible = false; r.disk.visible = false;
  }
  function restoreBar(idx) {
    const b = bars[idx];
    glowOff(idx);
    if (!b.moved) return;
    const pa = b.geo.attributes.position, na = b.geo.attributes.normal, ca = b.geo.attributes.color;
    pa.array.set(b.base); na.array.set(b.baseN); ca.array.fill(0);
    pa.needsUpdate = true; na.needsUpdate = true; ca.needsUpdate = true;
    b.moved = false;
  }
  function startStrike(idx, t) {
    if (active !== null && active !== idx) restoreBar(active);
    active = idx;
    const m = idx < 4 ? mL : mR;
    m.fromX = m.x; m.toX = nat[idx].x;
    strike = { idx, m, t0: t };
  }

  // ---------------------------------------------------------------- objecte de l'instrument
  return {
    id: 'xilofon',
    family: 'Percussió afinada',
    name: 'Xilòfon',
    intro: 'El xilòfon és un instrument de percussió afinada: cada làmina de fusta fa una nota. La baqueta colpeja la làmina, la làmina vibra i el tub de sota fa el so més fort.',
    floorY: FLOOR,
    camera: {
      explore: { pos: [-480, 560, 820], target: [0, -40, -110] },
      exploded: { pos: [-1250, 760, 1700], target: [0, -110, -130] }
    },
    parts: {
      lamines: {
        name: 'Làmines',
        text: 'Són barres de fusta que sonen quan les colpeges. Com més curta és la làmina, més aguda és la nota.',
        dato: 'Les de qualitat són de palissandre, una fusta molt dura. L’arc tallat per sota serveix per afinar-les.'
      },
      baquetes: {
        name: 'Baquetes',
        text: 'Són pals prims amb un cap dur i rodó. El cap toca la làmina un instant i rebota de seguida.',
        dato: 'El mànec sovint és de ratan, una canya flexible. Com més dur és el cap, més brillant sona la nota.'
      },
      cordo: {
        name: 'Cordó i nodes',
        text: 'Els nodes són els dos punts de la làmina que no es mouen quan vibra. El cordó passa per uns forats just en aquests punts i aguanta la làmina sense apagar-ne el so.',
        dato: 'Cada node és a poc més d’una cinquena part de la llargada, comptant des de la punta.'
      },
      ressonadors: {
        name: 'Ressonadors',
        text: 'Són tubs de metall tancats per baix, un sota cada làmina. L’aire de dins vibra amb la mateixa nota i reforça el so de la seva làmina.',
        dato: 'Cada tub té la llargada justa per a la seva nota: els de les notes agudes són més curts.'
      },
      rails: {
        name: 'Rails de feltre',
        text: 'Són llistons de fusta coberts de feltre, just a sota dels nodes. La làmina hi reposa sense tocar la fusta i no fa sorolls.',
        dato: 'Els rails no són paral·lels: s’acosten cap a les notes agudes, perquè les làmines són més curtes.'
      },
      estructura: {
        name: 'Estructura',
        text: 'El marc de fusta aguanta els rails i els tubs. Les potes de metall amb rodes posen les làmines a l’alçada de la cintura.',
        dato: 'Els xilòfons de concert solen tenir entre 3 i 4 octaves. Aquí en veus només un tros.'
      }
    },
    labels: [
      { part: 'lamines', group: 'lamines', at: [nat[0].x, TH, 120], internal: false },
      { part: 'baquetes', group: 'baquetes', at: restHeadL, internal: false },
      { part: 'cordo', group: 'cordo', at: [192, HOLE_Y + 6, natF(192)], internal: false },
      { part: 'ressonadors', group: 'ressonadors', at: [nat[0].x, -110, RES_R], internal: false },
      { part: 'rails', group: 'rails', at: [-205, -24, natF(-205) + 13], internal: false },
      { part: 'estructura', group: 'estructura', at: [-228, -400, legsL.legF], internal: false }
    ],
    explode: {
      baquetes: [0, 300, 320, 0],
      lamines: [0, 200, 0, 0.08],
      cordo: [0, 110, 0, 0.16],
      rails: [0, 40, 0, 0.22],
      ressonadors: [0, -230, 0, 0.28],
      estructura: [0, 0, 0, 0.35]
    },
    notes,
    options: null,
    chain: ['Baqueta', 'Làmina', 'Ressonador', 'Aire'],
    tour: [
      {
        part: 'baquetes', chain: 0, title: 'La baqueta',
        text: 'La baqueta cau en arc i colpeja el centre de la làmina. Rebota de seguida: si es quedés enganxada, apagaria el so.',
        cam: { pos: [-260, 230, 470], target: [-40, 50, 40] }, slow: 0.3, xray: false
      },
      {
        part: 'lamines', chain: 1, title: 'La làmina vibra',
        text: 'La làmina es doblega amunt i avall moltes vegades cada segon. Quan el centre baixa, les puntes pugen. Al mapa de vibració, el taronja vol dir que puja i el blau, que baixa.',
        cam: { pos: [-360, 110, 300], target: [-60, 10, 0] }, slow: 0.3, xray: false
      },
      {
        part: 'cordo', chain: 1, title: 'Els nodes',
        text: 'Hi ha dos punts de la làmina que no es mouen: són els nodes. El cordó i el feltre l’aguanten just allà. Així la làmina pot vibrar lliure i el so dura més.',
        cam: { pos: [-330, 150, 260], target: [-90, 5, 80] }, slow: 0.3, xray: false
      },
      {
        part: 'ressonadors', chain: 2, title: 'El ressonador',
        text: 'Sota cada làmina hi ha un tub tancat per baix. L’aire de dins vibra amb la mateixa nota que la làmina. Així el so es fa més fort.',
        cam: { pos: [-180, -60, 560], target: [-30, -90, 0] }, slow: 0.5, xray: true
      },
      {
        part: 'lamines', chain: 3, title: 'El so surt',
        text: 'La làmina i l’aire del tub empenyen l’aire de la sala. Aquestes vibracions viatgen fins a les teves orelles. Les làmines llargues fan notes greus i les curtes, agudes.',
        cam: { pos: [-850, 600, 1250], target: [0, -40, -120] }, slow: 1, xray: false
      }
    ],
    soundSource: { group: 'lamines', at: [0, 10, 0] },

    play(note, opt) {
      let idx = -1;
      if (typeof note === 'number') idx = note;
      else if (note && typeof note.index === 'number') idx = note.index;
      else if (note) idx = notes.findIndex(n => n === note || (typeof note.f === 'number' && Math.abs(n.f - note.f) < 0.01));
      if (!validIdx(idx)) idx = 0;
      const f = notes[idx].f;
      synth.additive({
        f,
        partials: [
          { k: 1, a: 1, tau: 0.6 },
          { k: 3, a: 0.35, tau: 0.25 },
          { k: 6.0, a: 0.12, tau: 0.08 }
        ],
        attack: 0.002,
        noise: { amount: 0.15, dur: 0.012, lp: 7000 }
      });
      pending = idx;
      return { attack: 0.005, hold: 0, release: 0.7 };
    },

    update(dt, s) {
      const t = s.t || 0;
      if (pending !== null) { startStrike(pending, t); pending = null; }
      else if (t + 1e-4 < lastT) {
        if (strike && t < strike.t0) strike.t0 = t;            // el motor ha reiniciat el rellotge
        else if (validIdx(s.noteIndex)) startStrike(s.noteIndex, t);
      }
      if (strike && t < strike.t0) strike.t0 = t;
      lastT = t;
      const tt = strike ? t - strike.t0 : 1e9;

      // --- baquetes: arc avall, cop, rebot
      for (const m of [mL, mR]) {
        let th = TH_R + 0.012 * Math.sin((s.time || 0) * 1.3 + m.ph);
        let x = m.x;
        if (strike && strike.m === m) {
          if (tt < T_HIT + T_BACK) {
            x = m.fromX + (m.toX - m.fromX) * ease(clamp01(tt / T_MOVE));
            if (tt < T_WIND) th = TH_R + (TH_W - TH_R) * ease(tt / T_WIND);
            else if (tt < T_HIT) { const v = (tt - T_WIND) / (T_HIT - T_WIND); th = TH_W + (TH_C - TH_W) * v * v; }
            else { const v = (tt - T_HIT) / T_BACK; th = TH_C + (TH_R - TH_C) * (1 - Math.pow(1 - v, 3)); }
          } else x = m.toX;
        }
        m.x = x;
        poseMallet(m, x, th);
      }

      // --- làmina: primer mode de flexió + mapa de vibració; ressonador que brilla i bufa aire
      if (active === null) return;
      const b = bars[active];
      const tau = tt - T_HIT;
      const env = s.env || 0;
      const amp = tau > 0 ? env * clamp01(tau / 0.02) : 0;
      if (amp <= 0.003) { restoreBar(active); return; }

      const fv = s.fvis || 1.5;
      const ph = 2 * Math.PI * fv * tau;
      const sn = Math.sin(ph) * amp; // el centre baixa primer (empès per la baqueta)
      const pa = b.geo.attributes.position, ca = b.geo.attributes.color;
      const P = pa.array, C = ca.array, B = b.base, PH = b.phi;
      const doHeat = !!s.heat;
      for (let k = 0; k < b.cnt; k++) {
        const v = PH[k] * sn;
        P[k * 3 + 1] = B[k * 3 + 1] + AMP * v;
        if (doHeat) heat.color(Math.max(-1, Math.min(1, v)), C, k);
      }
      pa.needsUpdate = true;
      if (doHeat) ca.needsUpdate = true;
      b.geo.computeVertexNormals();
      b.moved = true;

      const r = res[active];
      const I = amp * (0.35 + 0.65 * Math.abs(Math.sin(ph)));
      r.colMat.color.copy(glowColor).multiplyScalar(0.55 * I);
      r.diskMat.color.copy(glowColor).multiplyScalar(0.9 * I);
      r.col.visible = I > 0.004; r.disk.visible = I > 0.004;

      if (amp > 0.04) {
        G.ressonadors.updateWorldMatrix(true, false);
        const p = G.ressonadors.localToWorld(V3(r.x, r.yt + 1, 0));
        const e = s.explode || 0;
        flip = !flip;
        const dir = V3(0, 0.5 + 0.5 * e, (flip ? 0.85 : -0.85) * (1 - e)).normalize();
        fx.air(p, dir, 420 * amp * (0.4 + 0.6 * Math.abs(Math.cos(ph))), 0.45, 150);
      }
    }
  };
}
