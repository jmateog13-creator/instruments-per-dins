// Piano de cua — un tros obert (una octava, Do4–Do5) per veure el mecanisme per dins.
// Eixos: X al llarg del teclat (greus a -x, aguts a +x), Y amunt, +Z cap al pianista.
// Les cordes van de davant (clavilles, z ≈ -200) cap al fons (pont, z ≈ -900…-1080).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const G = groups(['caixa', 'tecles', 'accio', 'apagadors', 'cordes', 'marc', 'taula']);

  /* ---------------- ajudes ---------------- */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const bev = (t, s, n = 2) => ({ bevelThickness: t, bevelSize: s, bevelSegments: n });
  const rotX = (y, z, a) => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) out.push(p);
    }
    const f = out[0], l = out[out.length - 1];
    if (out.length > 3 && Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) out.pop();
    return out;
  }
  function shapeOf(pts, holes) {
    const s = geo.shape(dedupe(pts));
    if (holes) for (const h of holes) s.holes.push(geo.path(h));
    return s;
  }
  // contorn vist des de dalt [x, z] → peça entre y0 i y0+h
  function extXZ(pts, y0, h, bv, holes) {
    const t = bv ? bv.bevelThickness : 0;
    const map = (p) => [p[0], -p[1]];
    const g = geo.ext(shapeOf(pts.map(map), holes && holes.map((hh) => hh.map(map))), Math.max(0.1, h - 2 * t), bv);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0 + t, 0);
    return g;
  }
  // perfil lateral [z, y] → peça entre x0 i x0+w
  function extZY(pts, x0, w, bv, holes) {
    const t = bv ? bv.bevelThickness : 0;
    const map = (p) => [-p[0], p[1]];
    const g = geo.ext(shapeOf(pts.map(map), holes && holes.map((hh) => hh.map(map))), Math.max(0.1, w - 2 * t), bv);
    g.rotateY(Math.PI / 2);
    g.translate(x0 + t, 0, 0);
    return g;
  }
  // perfil frontal [x, y] → peça entre z0 i z0+d
  function extXY(pts, z0, d, bv, holes) {
    const t = bv ? bv.bevelThickness : 0;
    const g = geo.ext(shapeOf(pts, holes), Math.max(0.1, d - 2 * t), bv);
    g.translate(0, 0, z0 + t);
    return g;
  }
  function circ(cx, cy, r, n = 32) {
    const p = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return p;
  }
  function rrPts(x0, x1, y0, y1, r, n = 5) {
    const p = [];
    const cs = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
    for (const [cx, cy, a0] of cs) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return p;
  }
  // ajunta geometries estàtiques (menys objectes a dibuixar)
  function merge(list) {
    let n = 0;
    const hs = list.map((g) => { const h = g.index ? g.toNonIndexed() : g; n += h.attributes.position.count; return h; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const h of hs) {
      const c = h.attributes.position.count;
      pos.set(h.attributes.position.array, o * 3);
      if (h.attributes.normal) nor.set(h.attributes.normal.array, o * 3);
      if (h.attributes.uv) uv.set(h.attributes.uv.array, o * 2);
      o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  /* ---------------- materials ---------------- */
  const lacquer = mat('caixa', { color: 0x0a0a0c, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }, { xray: true });
  const lacquerK = mat('caixa', { color: 0x0a0a0c, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
  const bedWood = M.rawWood('caixa', tex.spruce(1 / 500, 1 / 500), { color: 0xE6D3AE });
  const linerWood = M.rawWood('caixa', tex.mahogany(1 / 400, 1 / 400), { xray: true });
  const railWood = M.rawWood('caixa', tex.maple(1 / 400, 1 / 400), { color: 0xDCC197 });

  const keyTex = tex.spruce(1 / 300, 1 / 300); keyTex.rotation = Math.PI / 2;
  const keyWood = M.rawWood('tecles', keyTex, { color: 0xF2E6CC });
  const ivory = M.ivory('tecles');
  const ebonyKey = M.blackKey('tecles');
  const feltRedK = M.felt('tecles', 0x8E1C24);
  const feltGreenK = M.felt('tecles', 0x2F5E3E);
  const brassK = M.brass('tecles');
  const nickelK = M.nickel('tecles');
  const frameWoodK = M.rawWood('tecles', tex.maple(1 / 400, 1 / 400), { color: 0xD9BE92 });

  const shankWood = M.rawWood('martellet', tex.maple(1 / 150, 1 / 150), { color: 0xF0E2C2 });
  const moldWood = M.rawWood('martellet', tex.mahogany(1 / 150, 1 / 150));
  const wipWood = M.rawWood('martellet', tex.maple(1 / 200, 1 / 200), { color: 0xE6CFA2 });
  const railWoodA = M.rawWood('martellet', tex.maple(1 / 300, 1 / 300), { color: 0xD8BC8C });
  const hamWhite = M.felt('martellet', 0xF3EEE2);
  const hamRed = M.felt('martellet', 0xA3212C);
  const knFelt = M.felt('martellet', 0xDCD4C4);
  const heelFelt = M.felt('martellet', 0x8E1C24);
  const actMetal = mat('martellet', { color: 0xA4A8AE, metalness: 0.85, roughness: 0.32 });
  const pinMetal = M.nickel('martellet');

  const dampHead = mat('apagador', { color: 0x121215, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const dampFelt = M.felt('apagador', 0xF5F2EA);
  const dampFelt2 = M.felt('apagador', 0x2F5E3E);
  const dampWire = M.brass('apagador');
  const dampWood = M.rawWood('apagador', tex.maple(1 / 200, 1 / 200), { color: 0xD8BC8C });

  const steel = mat('cordes', { color: 0xDCDCD8, metalness: 1, roughness: 0.18 });
  const braid = M.felt('cordes', 0x8E1C24);

  const iron = mat('marc', { color: 0xC9A458, metalness: 0.72, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.22 }, { xray: true });
  const agrMat = M.brass('marc');
  const hitchMat = M.nickel('marc');
  const pinMat = M.nickel('clavilles');
  const coilMat = M.string('clavilles', true);
  const blockWood = M.rawWood('clavilles', tex.maple(1 / 250, 1 / 250), { color: 0xC79A64 });

  const bridgeWood = M.rawWood('pont', tex.maple(1 / 250, 1 / 250), { color: 0xD8B27A });
  const bridgeCap = mat('pont', { color: 0x2b2b2e, roughness: 0.55, metalness: 0.2 });
  const bridgePinMat = M.nickel('pont');

  const sbWood = M.wood('taula', tex.spruce(1 / 500, 1 / 500), { xray: true });
  const ribWood = M.rawWood('taula', tex.spruce(1 / 300, 1 / 300), { color: 0xE8D6AE });

  /* ---------------- mides generals ---------------- */
  const WK = 23.5, X0 = -94, GAP = 0.45;           // tecla blanca: 23,5 mm d'amplada
  const KYB = 14, KYT = 36;                          // sota i dalt de la fusta de la tecla
  const KP = [0, KYB, -250];                         // punt de balanç (balancí)
  const KMAX = 0.04;                                 // ≈ 10 mm de baixada a la punta
  const YS = 186;                                    // alçada de les cordes
  const ZA = -300;                                   // agrafes (inici de la part que vibra)
  const xa = (c) => -84 + 14 * c;                    // posició del mecanisme de cada nota (13 per octava)
  const Lc = (c) => 780 * Math.pow(620 / 780, c / 12);
  const zbx = (x) => ZA - Lc((x + 84) / 14);         // línia del pont
  const ZB = (c) => ZA - Lc(c);
  const WHITE_C = [0, 2, 4, 5, 7, 9, 11, 12];
  const BLACK = [{ c: 1, after: 0, off: -1.8 }, { c: 3, after: 1, off: 1.8 }, { c: 6, after: 3, off: -2.6 }, { c: 8, after: 4, off: 0 }, { c: 10, after: 5, off: 2.6 }];
  const bxOf = (b) => X0 + (b.after + 1) * WK + b.off;

  const NOTES = [
    { label: 'Do', f: 261.63, c: 0, i: 0 },
    { label: 'Re', f: 293.66, c: 2, i: 1 },
    { label: 'Mi', f: 329.63, c: 4, i: 2 },
    { label: 'Fa', f: 349.23, c: 5, i: 3 },
    { label: 'Sol', f: 392.0, c: 7, i: 4 },
    { label: 'La', f: 440.0, c: 9, i: 5 },
    { label: 'Si', f: 493.88, c: 11, i: 6 },
    { label: 'Do agut', f: 523.25, c: 12, i: 7 }
  ];
  const noteOfC = new Array(13).fill(-1);
  NOTES.forEach((n, i) => { noteOfC[n.c] = i; });

  /* ================= CAIXA ================= */
  // llit del teclat (fusta) i llistó de davant
  add(G.caixa, geo.box(-125, 122, -30, 0, -545, 22), bedWood, 'caixa');
  add(G.caixa, extZY(rrPts(2, 20, -30, 27, 3), -125, 222, bev(1.2, 1.2)), lacquerK, 'caixa');
  // galta (bloc al costat del teclat)
  {
    const p = [[22, -30], [-165, -30], [-165, 62], [8, 62]];
    for (let i = 1; i <= 10; i++) { const a = Math.PI / 2 - (i / 10) * Math.PI / 2; p.push([8 + 14 * Math.cos(a), 48 + 14 * Math.sin(a)]); }
    add(G.caixa, extZY(p, 97, 63, bev(2, 2, 3)), lacquerK, 'caixa');
  }
  // tros de la paret lateral (cèrcol) i llistó interior on s'enganxa la taula
  add(G.caixa, extXY(rrPts(122, 160, -60, 230, 8), -1300, 1135, bev(2, 2, 3)), lacquer, 'caixa');
  add(G.caixa, geo.box(108, 122, 118, 145, -1290, -505), linerWood, 'caixa');
  // travesser (on recolza la taula harmònica per davant)
  add(G.caixa, geo.box(-112, 122, 0, 145, -545, -500), railWood, 'caixa');

  /* ================= TECLES ================= */
  // bastidor: llistó de davant, de balanç i de darrere, amb feltres
  add(G.tecles, geo.box(-96, 96, 0, 3, -30, -12), frameWoodK, 'tecles');
  add(G.tecles, geo.box(-96, 96, 0, 10, -262, -238), frameWoodK, 'tecles');
  add(G.tecles, geo.box(-96, 96, 0, 10, -472, -438), frameWoodK, 'tecles');
  add(G.tecles, geo.box(-96, 96, 10, 14, -470, -440), feltGreenK, 'tecles', { cast: false });
  {
    const fr = [], bal = [];
    for (let n = 0; n < 8; n++) fr.push(geo.cyl(4.5, 1.2, 'y', 20).translate(X0 + (n + 0.5) * WK, 3.6, -21));
    for (let c = 0; c < 13; c++) bal.push(geo.box(xa(c) - 5, xa(c) + 5, 10, 14, -254, -246));
    add(G.tecles, merge(fr), feltRedK, 'tecles', { cast: false });
    add(G.tecles, merge(bal), feltGreenK, 'tecles', { cast: false });
  }

  const keyMeshes = [];
  for (let c = 0; c < 13; c++) keyMeshes.push([]);
  function keyAdd(c, g, m, opts) {
    g.translate(-KP[0], -KP[1], -KP[2]);
    const me = add(G.tecles, g, m, 'tecles', Object.assign({ pos: KP.slice() }, opts || {}));
    keyMeshes[c].push(me);
    return me;
  }
  function keyCommon(c, opts) {
    const a = xa(c);
    keyAdd(c, geo.lathe([[0, 36], [4.6, 36], [4.6, 44], [4, 46.5], [3, 48], [0, 48]], 20).translate(a, 0, -340), brassK, opts); // capstan
    keyAdd(c, geo.tube([a, 36, -442], [a, 58, -442], 1.0, 1, 8), nickelK, opts);                                            // tija del retenidor
    keyAdd(c, extZY([[-436, 56], [-449, 55], [-450, 77], [-438, 79]], a - 5, 10, bev(0.6, 0.6, 1)), frameWoodK, opts);       // retenidor
    keyAdd(c, extZY([[-434.5, 58], [-437, 58], [-439, 78], [-436.5, 78]], a - 4.6, 9.2), feltGreenK, opts);
  }
  // tecles blanques
  for (let n = 0; n < 8; n++) {
    const c = WHITE_C[n], a = xa(c), opts = { note: n };
    const l = X0 + n * WK + GAP, r = X0 + (n + 1) * WK - GAP;
    const bl = BLACK.find((b) => b.after === n - 1), br = BLACK.find((b) => b.after === n);
    const lt = bl ? bxOf(bl) + 6.5 + 0.9 : l, rt = br ? bxOf(br) - 6.5 - 0.9 : r;
    const lever = [[l, 0], [r, 0], [r, -51], [rt, -51], [rt, -150], [a + 6.2, -195], [a + 6.2, -470], [a - 6.2, -470], [a - 6.2, -195], [lt, -150], [lt, -51], [l, -51]];
    keyAdd(c, extXZ(lever, KYB, KYT - KYB, bev(0.4, 0.3, 1)), keyWood, opts);
    const top = [[l + 0.5, -0.5], [r - 0.5, -0.5], [r - 0.5, -50.5], [rt - 0.5, -50.5], [rt - 0.5, -149.5], [lt + 0.5, -149.5], [lt + 0.5, -50.5], [l + 0.5, -50.5]];
    keyAdd(c, extXZ(top, KYT, 2.5, bev(0.5, 0.5, 2)), ivory, opts);
    keyAdd(c, extXY(rrPts(l + 0.2, r - 0.2, 20, 38.4, 1.2), -0.5, 1.9), ivory, opts);
    keyCommon(c, opts);
  }
  // tecles negres
  for (const b of BLACK) {
    const c = b.c, a = xa(c), bx = bxOf(b);
    const lever = [[bx - 6.4, -52], [bx + 6.4, -52], [bx + 6.4, -150], [a + 6.2, -195], [a + 6.2, -470], [a - 6.2, -470], [a - 6.2, -195], [bx - 6.4, -150]];
    keyAdd(c, extXZ(lever, KYB, KYT - KYB, bev(0.4, 0.3, 1)), keyWood);
    keyAdd(c, extZY([[-53.2, 37.2], [-148.8, 37.2], [-148.8, 46.3], [-60, 46.3], [-54.5, 44.5], [-53.2, 41]], bx - 6.5, 13, bev(1.2, 1.2, 3)), ebonyKey);
    keyCommon(c);
  }

  /* ================= MECANISME (palanques i martellets) ================= */
  const HP = (c) => [xa(c), 92, -290];   // eix del martellet
  const WP = (c) => [xa(c), 57, -405];   // eix de la palanca intermèdia
  const hamMeshes = [], wipMeshes = [], jackMeshes = [];
  for (let c = 0; c < 13; c++) { hamMeshes.push([]); wipMeshes.push([]); }
  function pivAdd(list, P, g, m) {
    g.translate(-P[0], -P[1], -P[2]);
    const me = add(G.accio, g, m, 'martellet', { pos: P.slice() });
    list.push(me);
    return me;
  }
  const dome = [[-400, 114], [-430, 114]];
  for (let i = 0; i <= 16; i++) { const t = Math.PI - (i / 16) * Math.PI; dome.push([-415 + 9 * Math.cos(t), 131 + 9 * Math.sin(t)]); }

  const flangesA = [], pinsA = [];
  for (let c = 0; c < 13; c++) {
    const a = xa(c), hp = HP(c), wp = WP(c);
    // martellet: canya, nou, cap de fusta i feltres
    pivAdd(hamMeshes[c], hp, geo.cyl(3.6, 130, 'z', 16).translate(a, 92, -355), shankWood);
    pivAdd(hamMeshes[c], hp, extZY(rrPts(-318, -291, 82, 97, 3), a - 4.5, 9, bev(0.5, 0.5, 1)), shankWood);
    pivAdd(hamMeshes[c], hp, geo.cyl(5, 9, 'x', 20).translate(a, 85, -310), knFelt);
    pivAdd(hamMeshes[c], hp, extZY([[-398, 88], [-438, 84], [-444, 90], [-432, 113], [-401, 113]], a - 5, 10, bev(0.8, 0.8, 2)), moldWood);
    pivAdd(hamMeshes[c], hp, extZY([[-397, 109], [-433, 109], [-431, 120], [-399, 120]], a - 6, 12, bev(0.6, 0.6, 2)), hamRed);
    pivAdd(hamMeshes[c], hp, extZY(dome, a - 6, 12, bev(0.8, 0.8, 3)), hamWhite);
    // palanca intermèdia (amb feltre de taló i palanca de repetició)
    pivAdd(wipMeshes[c], wp, extZY([[-298, 56], [-298, 64], [-412, 62], [-412, 52], [-372, 49], [-330, 49]], a - 4.5, 9, bev(0.6, 0.6, 1)), wipWood);
    pivAdd(wipMeshes[c], wp, geo.box(a - 4.5, a + 4.5, 48, 50, -346, -334), heelFelt);
    pivAdd(wipMeshes[c], wp, extZY(rrPts(-394, -300, 74, 79, 2), a - 2.5, 5), wipWood);
    pivAdd(wipMeshes[c], wp, geo.box(a - 2.5, a + 2.5, 62, 74.5, -392, -382), wipWood);
    // escapament (jack): gira amb la palanca i a més s'inclina quan escapa
    const jp = [a, 64, -306];
    const jg = geo.box(a - 3, a + 3, 64, 79.5, -311, -302).translate(-jp[0], -jp[1], -jp[2]);
    jackMeshes.push(add(G.accio, jg, wipWood, 'martellet', { pos: jp }));
    // peces fixes: suports (flanges) i eixos
    flangesA.push(geo.box(a - 4.5, a + 4.5, 84, 100, -293, -278));
    flangesA.push(geo.box(a - 3.5, a + 3.5, 52, 62, -414, -408));
    pinsA.push(geo.cyl(1.3, 11, 'x', 10).translate(a, 92, -290));
    pinsA.push(geo.cyl(1.3, 11, 'x', 10).translate(a, 57, -405));
  }
  add(G.accio, merge(flangesA), railWoodA, 'martellet');
  add(G.accio, merge(pinsA), pinMetal, 'martellet', { cast: false });
  add(G.accio, geo.box(-100, 98, 46, 60, -430, -412), railWoodA, 'martellet');
  add(G.accio, geo.box(-100, 98, 96, 110, -282, -256), railWoodA, 'martellet');
  add(G.accio, extZY(rrPts(-440, -248, 0, 112, 10), 98, 10, bev(1, 1, 2), [circ(-345, 55, 30), circ(-420, 30, 9)]), actMetal, 'martellet');

  /* ================= APAGADORS ================= */
  const dampMeshes = [];
  for (let c = 0; c < 13; c++) {
    const a = xa(c), list = [];
    list.push(add(G.apagadors, extZY(rrPts(-472, -450, 197, 222, 3), a - 6, 12, bev(0.8, 0.8, 2)), dampHead, 'apagador'));
    list.push(add(G.apagadors, geo.box(a - 5.8, a + 5.8, 186.6, 197.5, -471, -451), dampFelt, 'apagador'));
    list.push(add(G.apagadors, geo.cyl(0.85, 147, 'y', 8).translate(a + 2.1, 123.5, -461), dampWire, 'apagador', { cast: false }));
    list.push(add(G.apagadors, extZY(rrPts(-492, -452, 46, 54, 2), a - 5, 10), dampWood, 'apagador'));
    list.push(add(G.apagadors, geo.box(a - 4.5, a + 4.5, 37.6, 46, -470, -458), dampFelt2, 'apagador'));
    dampMeshes.push(list);
  }
  add(G.apagadors, geo.box(-100, 98, 38, 58, -500, -493), dampWood, 'apagador');
  add(G.apagadors, geo.box(-100, 98, 150, 160, -470, -452), dampWood, 'apagador');

  /* ================= MARC DE FERRO, CLAVILLER I CLAVILLES ================= */
  add(G.marc, geo.box(-112, 118, 122, 160, -305, -145), blockWood, 'clavilles');
  add(G.marc, extXZ(rrPts(-114, 118, -307, -143, 10), 160, 12, bev(1.5, 1.5, 2)), iron, 'marc');
  // dues barres laterals amb forats rodons per fer-lo més lleuger
  for (const x0 of [-114, 106]) {
    add(G.marc, extZY([[-150, 165], [-1290, 160], [-1290, 200], [-150, 200]], x0, 12, bev(1.5, 1.5, 2),
      [circ(-420, 181, 13), circ(-640, 181, 13), circ(-860, 181, 13)]), iron, 'marc');
  }
  // placa del fons on s'enganxen les cordes
  {
    const p = [];
    for (let i = 0; i <= 12; i++) { const x = -114 + (232 * i) / 12; p.push([x, zbx(x) - 45]); }
    p.push([118, -1290], [-114, -1290]);
    add(G.marc, extXZ(p, 162, 12, bev(1.5, 1.5, 2), [circ(-40, -1215, 35), circ(55, -1150, 35)]), iron, 'marc');
  }
  const agr = [], hitch = [], tpins = [], coils = [];
  for (let c = 0; c < 13; c++) {
    agr.push(geo.lathe([[0, 172], [5.2, 172], [5.2, 175], [3.8, 177], [3.8, 189], [4.6, 190], [4.6, 193], [0, 193]], 16).translate(xa(c), 0, ZA));
    for (let j = 0; j < 3; j++) {
      const xs = xa(c) + (j - 1) * 4.2;
      hitch.push(geo.cyl(2.2, 16, 'y', 10).translate(xs, 174, ZB(c) - 75));
      const gi = c * 3 + j, xp = -89 + (gi * 178) / 38, zp = gi % 2 ? -232 : -196;
      tpins.push(geo.lathe([[0, 150], [3.4, 150], [3.4, 209], [2.7, 212], [0, 212]], 16).translate(xp, 0, zp));
      coils.push(geo.cyl(4.4, 7, 'y', 16).translate(xp, 197, zp));
    }
  }
  add(G.marc, merge(agr), agrMat, 'marc');
  add(G.marc, merge(hitch), hitchMat, 'marc', { cast: false });
  add(G.marc, merge(tpins), pinMat, 'clavilles');
  add(G.marc, merge(coils), coilMat, 'clavilles', { cast: false });

  /* ================= CORDES ================= */
  const SEG = 80, RAD = 6, KM = 6;
  const sinTab = new Float32Array((SEG + 1) * KM);
  for (let r = 0; r <= SEG; r++) for (let k = 0; k < KM; k++) sinTab[r * KM + k] = Math.sin((k + 1) * Math.PI * (r / SEG));
  const strings = [];          // només les de les tecles blanques es mouen
  const strCoef = [];          // per nota: coeficients dels modes
  const segs = [];
  for (let c = 0; c < 13; c++) {
    const live = noteOfC[c] >= 0, L = Lc(c), u0 = 86 / L;
    const ak = [];
    for (let k = 0; k < KM; k++) ak.push(Math.sin((k + 1) * Math.PI * u0) / Math.pow(k + 1, 1.3));
    let norm = 1e-6;
    for (let r = 0; r <= SEG; r++) { let d = 0; for (let k = 0; k < KM; k++) d += ak[k] * sinTab[r * KM + k]; norm = Math.max(norm, Math.abs(d)); }
    strCoef.push(ak.map((v) => v / norm));
    for (let j = 0; j < 3; j++) {
      const xs = xa(c) + (j - 1) * 4.2;
      const curve = new THREE.LineCurve3(V3(xs, YS, ZA), V3(xs, YS, ZB(c)));
      const g = new THREE.TubeGeometry(curve, live ? SEG : 1, 0.6, RAD, false);
      const me = add(G.cordes, g, steel, 'cordes', live ? { note: noteOfC[c], cast: false } : { cast: false });
      if (live) strings.push({ c, j, me, base: Float32Array.from(g.attributes.position.array), moved: false });
      const gi = c * 3 + j, xp = -89 + (gi * 178) / 38, zp = gi % 2 ? -232 : -196;
      segs.push(geo.tube([xp, 197, zp], [xs, YS, ZA], 0.6, 1, 6));
      segs.push(geo.tube([xs, YS, ZB(c)], [xs, 178, ZB(c) - 75], 0.6, 1, 6));
    }
  }
  add(G.cordes, merge(segs), steel, 'cordes', { cast: false });
  // feltre trenat entre les cordes, darrere el pont (evita sons que no volem)
  {
    const p = [];
    for (let i = 0; i <= 12; i++) { const x = -100 + (200 * i) / 12; p.push([x, zbx(x) - 36]); }
    for (let i = 12; i >= 0; i--) { const x = -100 + (200 * i) / 12; p.push([x, zbx(x) - 46]); }
    add(G.cordes, extXZ(p, 178.5, 5, bev(0.8, 0.8, 2)), braid, 'cordes', { cast: false });
  }

  /* ================= TAULA HARMÒNICA, COSTELLES I PONT ================= */
  const SB = { x0: -112, x1: 120, z0: -505, z1: -1290, yT: 154, yB: 145 };
  function sbShape(x, z) {
    const u = clamp((x - SB.x0) / (SB.x1 - SB.x0)), v = clamp((SB.z0 - z) / (SB.z0 - SB.z1));
    const sx = Math.sin(Math.PI * (0.25 + 0.75 * u)), sz = Math.sin(Math.PI * 0.86 * v);
    const near = Math.exp(-Math.pow((z - zbx(x)) / 230, 2));
    return [sx * sz * (0.55 + 0.45 * near), sx * Math.sin(Math.PI * 1.72 * v) * (0.6 + 0.4 * near)];
  }
  const NXs = 36, NZs = 100;
  const sbPos = [], sbUV = [], sbIdx = [], sbM1 = [], sbM2 = [], sbY = [];
  function sv(x, y, z) {
    sbPos.push(x, y, z); sbUV.push(-z, x);
    const m = sbShape(x, z); sbM1.push(m[0]); sbM2.push(m[1]); sbY.push(y);
    return sbY.length - 1;
  }
  const gx = (i) => SB.x0 + ((SB.x1 - SB.x0) * i) / NXs;
  const gz = (j) => SB.z0 + ((SB.z1 - SB.z0) * j) / NZs;
  {
    const T = [], B = [];
    for (let i = 0; i <= NXs; i++) for (let j = 0; j <= NZs; j++) T.push(sv(gx(i), SB.yT, gz(j)));
    for (let i = 0; i <= NXs; i++) for (let j = 0; j <= NZs; j++) B.push(sv(gx(i), SB.yB, gz(j)));
    const id = (i, j) => i * (NZs + 1) + j;
    for (let i = 0; i < NXs; i++) for (let j = 0; j < NZs; j++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1);
      sbIdx.push(T[a], T[b], T[c], T[b], T[d], T[c]);
      sbIdx.push(B[a], B[c], B[b], B[b], B[c], B[d]);
    }
    // cantells (vèrtexs propis perquè les normals quedin netes)
    const side = (pts, out) => {
      const t = pts.map((p) => sv(p[0], SB.yT, p[1])), bb = pts.map((p) => sv(p[0], SB.yB, p[1]));
      for (let k = 0; k < pts.length - 1; k++) {
        if (out) sbIdx.push(t[k], t[k + 1], bb[k], t[k + 1], bb[k + 1], bb[k]);
        else sbIdx.push(t[k], bb[k], t[k + 1], t[k + 1], bb[k], bb[k + 1]);
      }
    };
    const left = [], right = [], front = [], back = [];
    for (let j = 0; j <= NZs; j++) { left.push([gx(0), gz(j)]); right.push([gx(NXs), gz(j)]); }
    for (let i = 0; i <= NXs; i++) { front.push([gx(i), gz(0)]); back.push([gx(i), gz(NZs)]); }
    side(left, true); side(right, false); side(front, false); side(back, true);
  }
  const sbGeo = new THREE.BufferGeometry();
  sbGeo.setAttribute('position', new THREE.Float32BufferAttribute(sbPos, 3));
  sbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sbUV, 2));
  sbGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(sbPos.length), 3));
  sbGeo.setIndex(sbIdx);
  sbGeo.computeVertexNormals();
  const sbMesh = add(G.taula, sbGeo, sbWood, 'taula');
  heat.overlay(sbMesh);
  const NV = sbY.length;

  // peces que segueixen el moviment de la taula
  const followers = [];
  const follow = (me, x, z) => { followers.push({ me, m: sbShape(x, z) }); return me; };
  for (const zr of [-600, -720, -840, -960, -1080, -1200]) {
    follow(add(G.taula, extXY([[-112, 145], [120, 145], [120, 140], [96, 127], [-112, 127]], zr - 10, 20, bev(1, 1, 1)), ribWood, 'taula'), 0, zr);
  }
  {
    const f = [], bk = [];
    for (let i = 0; i <= 16; i++) { const x = -114 + (232 * i) / 16; f.push([x, zbx(x) + 13]); bk.push([x, zbx(x) - 13]); }
    const outline = f.concat(bk.reverse());
    const zb0 = zbx(0);
    follow(add(G.taula, extXZ(outline, 154, 29, bev(1.2, 1.2, 2)), bridgeWood, 'pont'), 0, zb0);
    follow(add(G.taula, extXZ(outline, 183, 2.3), bridgeCap, 'pont', { cast: false }), 0, zb0);
    const bp = [];
    for (let c = 0; c < 13; c++) for (let j = 0; j < 3; j++) {
      const xs = xa(c) + (j - 1) * 4.2;
      bp.push(geo.cyl(0.9, 7, 'y', 8).translate(xs + 1.1, 187.5, ZB(c) + 5));
      bp.push(geo.cyl(0.9, 7, 'y', 8).translate(xs - 1.1, 187.5, ZB(c) - 5));
    }
    follow(add(G.taula, merge(bp), bridgePinMat, 'pont', { cast: false }), 0, zb0);
  }

  /* ================= ESTAT I ANIMACIÓ ================= */
  const TK = 0.14, TS = 0.17;          // tecla avall · el martellet toca la corda (temps visual)
  const HS = 0.405, HC = 0.2;          // angle de cop · angle on queda aguantat (retenidor)
  const JMAX = 0.22;                   // inclinació de l'escapament
  const ST = [];
  for (let c = 0; c < 13; c++) ST.push({ kt: 99, on: false, key: 0, ham: 0, jack: 0, lift: 0, e: 0, dk: 1, fv: 1.2, amp: 0 });
  let pending = -1, lastT = 0, curC = -1, pedal = false, sbMoved = false;

  function isPedal(opt) {
    if (opt === 1 || opt === '1') return true;
    if (typeof opt === 'string') return opt.indexOf('Amb') === 0;
    if (opt && typeof opt === 'object') return opt.index === 1 || opt.value === 1;
    return false;
  }
  function noteIdx(note) {
    if (typeof note === 'number') return clamp(note | 0, 0, NOTES.length - 1);
    if (note && typeof note.i === 'number') return note.i;
    let i = NOTES.indexOf(note);
    if (i < 0 && note && note.f) i = NOTES.findIndex((n) => Math.abs(n.f - note.f) < 0.5);
    return i < 0 ? 0 : i;
  }
  function trigger(n, s) {
    const N = NOTES[n];
    if (!N) return;
    for (const k of ST) k.on = false;           // el dit deixa l'altra tecla
    const k = ST[N.c];
    k.on = true; k.kt = 0; k.e = 1; k.dk = 1;
    k.fv = (s && s.fvis) || 1.2;
    curC = N.c;
  }

  const wpPos = (c) => WP(c);
  const tmpV = V3(0, 0, 0), tmpD = V3(0, 1, 0);

  function update(dt, s) {
    pedal = isPedal(s.opt);
    const env = s.env || 0;
    const st = typeof s.t === 'number' ? s.t : 0;
    let vdt = st - lastT;
    const reset = vdt < -1e-6;
    if (reset) vdt = Math.max(0, st);
    lastT = st;
    vdt = clamp(vdt, 0, 0.1);
    if (pending >= 0) { trigger(pending, s); pending = -1; }
    else if (reset && env > 0.5 && typeof s.noteIndex === 'number' && NOTES[s.noteIndex]) trigger(s.noteIndex, s);

    let F1 = 0, F2 = 0, ampSum = 0;
    for (let c = 0; c < 13; c++) {
      const k = ST[c];
      k.kt += vdt;
      if (k.on) {
        const tt = k.kt;
        k.key = KMAX * smooth(tt / TK);
        k.ham = tt < TS ? HS * Math.pow(tt / TS, 1.6) : HC + (HS - HC) * Math.exp(-(tt - TS) / 0.07);
        k.jack = JMAX * smooth((tt - TK * 0.7) / (TS - TK * 0.7));
        if (c === curC && tt > TS + 0.3 && env < 0.3) k.on = false;   // deixes anar la tecla
      } else {
        const r = 1 - Math.exp(-vdt * 12);
        k.key -= k.key * r; k.ham -= k.ham * r; k.jack -= k.jack * r;
      }
      // apagador: la punta de darrere de la tecla l'aixeca (o el pedal, tots alhora)
      const rise = 220 * Math.sin(k.key);
      let tgt = clamp((rise - 1.5) * 1.25, 0, 10);
      if (pedal) tgt = Math.max(tgt, 10);
      k.lift += (tgt - k.lift) * (1 - Math.exp(-vdt * (tgt > k.lift ? 28 : 12)));
      // energia de la corda
      if (c === curC && k.on) k.e = env;
      else if (c === curC) k.e = Math.min(k.e, env);
      else k.e *= Math.exp(-vdt / 1.6);
      if (k.lift < 1.2 && k.kt > TS) k.dk *= Math.exp(-vdt / 0.09);   // el feltre para la corda
      k.amp = k.kt >= TS ? k.e * k.dk : 0;
      if (k.amp > 0.002) {
        const wt = 2 * Math.PI * k.fv * (k.kt - TS);
        F1 += k.amp * Math.cos(wt);
        F2 += k.amp * Math.cos(2 * wt + 0.6);
        ampSum += k.amp;
      }
      // moure les peces
      for (const me of keyMeshes[c]) me.rotation.x = k.key;
      for (const me of hamMeshes[c]) me.rotation.x = k.ham;
      const wip = -Math.asin(clamp((90 * Math.sin(k.key)) / 65, -1, 1));
      for (const me of wipMeshes[c]) me.rotation.x = wip;
      const wp = wpPos(c), jr = rotX(7, 99, wip), jm = jackMeshes[c];
      jm.position.set(wp[0], wp[1] + jr[0], wp[2] + jr[1]);
      jm.rotation.x = wip + k.jack;
      for (const me of dampMeshes[c]) me.position.y = k.lift;
    }

    // cordes que vibren (suma de modes que s'apaga)
    for (const S of strings) {
      const k = ST[S.c], pa = S.me.geometry.attributes.position, arr = pa.array, b = S.base;
      if (k.amp > 0.002) {
        const A = 3.0 * Math.pow(k.amp, 0.65), ak = strCoef[S.c];
        const wt = 2 * Math.PI * k.fv * (k.kt - TS), ph = S.j * 0.5;
        const cs = [];
        for (let m = 0; m < KM; m++) cs.push(ak[m] * Math.cos((m + 1) * wt + ph * (m + 1) * 0.3));
        for (let r = 0; r <= SEG; r++) {
          let d = 0;
          for (let m = 0; m < KM; m++) d += cs[m] * sinTab[r * KM + m];
          d *= A;
          for (let q = 0; q <= RAD; q++) {
            const id = (r * (RAD + 1) + q) * 3;
            arr[id] = b[id] + d * 0.12;
            arr[id + 1] = b[id + 1] + d;
            arr[id + 2] = b[id + 2];
          }
        }
        pa.needsUpdate = true; S.moved = true;
      } else if (S.moved) {
        arr.set(b); pa.needsUpdate = true; S.moved = false;
      }
    }

    // taula harmònica amb mapa de vibració
    const pa = sbGeo.attributes.position.array, ca = sbGeo.attributes.color.array;
    if (ampSum > 0.002) {
      const A1 = 2.2 * clamp(F1, -1.2, 1.2), A2 = 2.2 * 0.45 * clamp(F2, -1.2, 1.2);
      for (let i = 0; i < NV; i++) {
        const d = A1 * sbM1[i] + A2 * sbM2[i];
        pa[i * 3 + 1] = sbY[i] + d;
        heat.color(clamp(d / 2.0, -1, 1), ca, i);
      }
      sbGeo.attributes.position.needsUpdate = true;
      sbGeo.attributes.color.needsUpdate = true;
      sbGeo.computeVertexNormals();
      for (const f of followers) f.me.position.y = A1 * f.m[0] + A2 * f.m[1];
      sbMoved = true;
      // aire empès per la taula (per sobre o per sota segons cap on es mou)
      if (env > 0.03) {
        const up = F1 >= 0;
        tmpV.set(-100 + Math.random() * 210, up ? 160 : 140, -560 - Math.random() * 680);
        G.taula.localToWorld(tmpV);
        tmpD.set(0, up ? 1 : -1, 0);
        fx.air(tmpV, tmpD, 380 * clamp(ampSum), 0.5, 170);
      }
    } else if (sbMoved) {
      for (let i = 0; i < NV; i++) pa[i * 3 + 1] = sbY[i];
      ca.fill(0);
      sbGeo.attributes.position.needsUpdate = true;
      sbGeo.attributes.color.needsUpdate = true;
      sbGeo.computeVertexNormals();
      for (const f of followers) f.me.position.y = 0;
      sbMoved = false;
    }
  }

  /* ================= SO ================= */
  function play(note, opt) {
    const n = noteIdx(note), N = NOTES[n];
    pedal = isPedal(opt);
    pending = n;
    const f = N.f, B = 0.0004, u0 = 1 / 8.3, tf = Math.sqrt(261.63 / f);
    const partials = [];
    for (let i = 1; i <= 14; i++) {
      const k = i * Math.sqrt(1 + B * i * i);
      if (k * f > 9500) break;
      const a = Math.pow(i, -1.1) * (0.2 + 0.8 * Math.abs(Math.sin(i * Math.PI * u0)));
      let tau = (3.0 * tf) / (1 + 0.32 * (i - 1));
      if (pedal) tau *= 1.45;
      partials.push({ k, a, tau });
      if (i <= 4) partials.push({ k: k * 1.0011, a: a * 0.45, tau: tau * 1.15 });   // les 3 cordes no són mai idèntiques
    }
    try {
      synth.additive({ f, partials, attack: 0.002, noise: { amount: 0.18, dur: 0.02, lp: 1500, hp: 80 }, gain: 0.75 });
    } catch (e) { /* sense àudio encara */ }
    return { attack: 0.01, hold: 0, release: pedal ? 3.4 : 2.2 };
  }

  /* ================= DADES ================= */
  return {
    id: 'piano',
    family: 'Corda percudida',
    name: 'Piano',
    intro: "El piano és un instrument de corda percudida: quan prems una tecla, un martellet colpeja les cordes. Aquí en veus un tros obert per dins, amb una octava de tecles.",
    floorY: -140,
    camera: {
      explore: { pos: [-760, 640, 560], target: [10, 110, -470] },
      exploded: { pos: [-1400, 1250, 1200], target: [120, 200, -560] }
    },
    parts: {
      tecles: { name: 'Tecles', text: "Cada tecla és una palanca, com un balancí. Quan prems la part de davant, la part de darrere puja i posa en marxa el mecanisme.", dato: "Un piano té 88 tecles: 52 de blanques i 36 de negres." },
      martellet: { name: 'Martellet', text: "És un cap de fusta cobert de feltre, que és llana premsada. Colpeja les cordes i rebota de seguida: si s'hi quedés enganxat, apagaria el so.", dato: "La tecla baixa només 1 cm, però les palanques fan que el martellet pugi gairebé 5 cm, molt de pressa." },
      apagador: { name: 'Apagador', text: "És un bloc amb feltre que reposa damunt les cordes. Quan deixes anar la tecla, torna a baixar i para la vibració.", dato: "El pedal dret aixeca tots els apagadors alhora; per això les notes continuen sonant." },
      cordes: { name: 'Cordes', text: "Són d'acer i estan molt tibades. En aquesta zona, cada nota té tres cordes iguals que sonen juntes.", dato: "Un piano de cua té més de 200 cordes." },
      marc: { name: 'Marc de ferro', text: "És una peça de ferro colat que aguanta la força de totes les cordes tibades. Els forats rodons el fan més lleuger.", dato: "Totes les cordes juntes estiren amb una força d'unes 20 tones." },
      clavilles: { name: 'Clavilles', text: "Cada corda està enrotllada en una clavilla, clavada en un bloc de fusta molt dura. Si la gires una mica, la corda es tensa o s'afluixa i la nota canvia.", dato: "Per afinar un piano, l'afinador ha d'ajustar més de 200 cordes, una per una." },
      pont: { name: 'Pont', text: "És una barra de fusta enganxada a la taula harmònica. Les cordes s'hi recolzen i li passen la vibració.", dato: "Uns petits claus de metall mantenen cada corda al seu lloc damunt del pont." },
      taula: { name: 'Taula harmònica', text: "És una làmina gran i prima de fusta d'avet. Vibra amb les cordes i empeny molt més aire, per això el so és fort.", dato: "Per sota té unes barres de fusta, les costelles, que la fan més forta." },
      caixa: { name: 'Caixa', text: "És el moble de fusta lacada que aguanta totes les peces. Aquí en veus només un tros, tallat per poder mirar-hi dins.", dato: "Un piano de cua de concert fa uns 2,7 metres de llarg i pesa gairebé 500 kg." }
    },
    labels: [
      { part: 'tecles', group: 'tecles', at: [X0 + 3.5 * WK, 40, -40], internal: false },
      { part: 'martellet', group: 'accio', at: [xa(0), 141, -415], internal: false },
      { part: 'apagador', group: 'apagadors', at: [xa(0), 223, -461], internal: false },
      { part: 'cordes', group: 'cordes', at: [-30, YS + 1, -700], internal: false },
      { part: 'marc', group: 'marc', at: [-108, 201, -750], internal: false },
      { part: 'clavilles', group: 'marc', at: [-61, 213, -214], internal: false },
      { part: 'pont', group: 'taula', at: [20, 186, zbx(20)], internal: false },
      { part: 'taula', group: 'taula', at: [60, 155, -720], internal: false },
      { part: 'caixa', group: 'caixa', at: [141, 232, -800], internal: false }
    ],
    explode: {
      caixa: [280, -60, 0, 0],
      tecles: [0, -30, 240, 0.05],
      accio: [0, 120, 130, 0.12],
      taula: [0, -110, -240, 0.16],
      marc: [0, 160, -120, 0.2],
      cordes: [0, 240, -60, 0.26],
      apagadors: [0, 360, 280, 0.32]
    },
    notes: NOTES,
    options: { label: 'Pedal', items: ['Sense pedal', 'Amb pedal dret'] },
    chain: ['Tecla', 'Martellet', 'Corda', 'Taula harmònica', 'Aire'],
    tour: [
      { part: 'tecles', chain: 0, title: 'La tecla', text: "La tecla és una palanca, com un balancí. Quan en prems la part de davant, la part de darrere puja i empeny les peces del mecanisme.", cam: { pos: [-420, 230, 300], target: [0, 30, -170] }, slow: 0.5, xray: false },
      { part: 'martellet', chain: 1, title: 'El martellet', text: "Unes petites palanques llancen el martellet cap amunt molt de pressa. Colpeja les cordes i rebota de seguida, per no aturar-les. Després es queda aguantat una mica més avall.", cam: { pos: [-430, 170, -300], target: [-40, 100, -360] }, slow: 0.22, xray: false },
      { part: 'apagador', chain: 2, title: "L'apagador", text: "Mentre la tecla està premuda, l'apagador està aixecat i les cordes poden vibrar. Quan la deixes anar, el feltre torna a caure damunt les cordes i el so s'acaba. Amb el pedal dret, tots els apagadors es queden aixecats.", cam: { pos: [-430, 300, -330], target: [-40, 160, -440] }, slow: 0.4, xray: false },
      { part: 'cordes', chain: 2, title: 'La corda i el pont', text: "Les cordes vibren, però són tan primes que gairebé no mouen l'aire. A l'altra punta s'aguanten sobre el pont, que passa la vibració a la taula harmònica.", cam: { pos: [-560, 520, -420], target: [0, 170, -800] }, slow: 0.5, xray: false },
      { part: 'taula', chain: 3, title: 'La taula harmònica', text: "La taula harmònica és una làmina gran de fusta que vibra sencera. Com que és tan gran, empeny molt d'aire i el so arriba fins a les teves orelles.", cam: { pos: [-650, 760, -500], target: [0, 140, -900] }, slow: 0.7, xray: true }
    ],
    soundSource: { group: 'taula', at: [0, 160, -850] },
    play,
    update
  };
}
