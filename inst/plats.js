// Plats — parell de plats de xoc (19") + plat suspès (18") amb peu i masses — mòdul d'instrument
// Unitats: mm. Eix Y amunt. Plat suspès a l'esquerra (x < 0), parell de xoc a la dreta (x > 0).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = 2 * PI;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, u) => a + (b - a) * u;
  function rng(seed) { let s = (seed | 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function swapUV(g) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
    uv.needsUpdate = true; return g;
  }

  const G = groups(['plat_esq', 'plat_dre', 'corretja_esq', 'corretja_dre', 'plat_suspes', 'feltres', 'peu', 'masses']);

  /* ---------------- mides ---------------- */
  const FLOOR = -960;
  const PC = { R: 241, RH: 6.5, RC1: 70, HB: 21, HC: 20, T: 3.2 };   // plat de xoc de 19" (482 mm)
  const PS = { R: 229, RH: 6.5, RC1: 66, HB: 18, HC: 19, T: 2.8 };   // plat suspès de 18" (457 mm)
  // perfil de la cara de dalt (cúpula cap amunt, vora a y = 0)
  function yTop(P, r) {
    if (r <= P.RC1) {
      const v = clamp((r - 0.3 * P.RC1) / (0.7 * P.RC1)), s = v * v * v * (v * (6 * v - 15) + 10);
      return P.HB + P.HC * (1 - s);
    }
    const u = clamp((r - P.RC1) / (P.R - P.RC1));
    return P.HB * Math.pow(1 - u, 1.25);
  }

  /* ---------------- textura del bronze (torn, martellejat), sense canvas ---------------- */
  const TS = 1024, RT = PC.R * 1.004, TX = {};
  {
    const R = rng(4242), ph = [0, 1, 2, 3, 4, 5].map(() => R() * TAU);
    const col = new Uint8Array(TS * TS * 4), det = new Uint8Array(TS * TS * 4), an = new Uint8Array(TS * TS * 4);
    // perfil radial del torn (taula cada 0,05 mm)
    const STEP = 0.05, NL = Math.ceil(RT * 1.45 / STEP) + 2;
    const tone = new Float32Array(NL), grv = new Float32Array(NL), hue = new Float32Array(NL);
    for (let i = 0; i < NL; i++) {
      const r = i * STEP;
      tone[i] = 0.84 + 0.065 * Math.sin(TAU * r / 8.3 + ph[0]) + 0.045 * Math.sin(TAU * r / 21.7 + ph[1]) +
        0.03 * Math.sin(TAU * r / 3.1 + ph[2]) + 0.03 * Math.sin(TAU * r / 57 + ph[3]);
      if (r > PC.R - 2.5) tone[i] *= 0.82;
      grv[i] = 0.5 + 0.5 * Math.sin(TAU * r / 1.6);
      hue[i] = 0.5 + 0.5 * Math.sin(TAU * r / 37 + ph[4]);
    }
    const k = 2 * RT / TS;
    for (let py = 0; py < TS; py++) {
      const z = (py + 0.5) * k - RT;
      for (let px = 0; px < TS; px++) {
        const x = (px + 0.5) * k - RT, r = Math.sqrt(x * x + z * z), li = Math.min(NL - 1, (r / STEP) | 0);
        const g = grv[li], v = tone[li] * (0.92 + 0.08 * g), h = hue[li], o = (py * TS + px) * 4;
        col[o] = clamp(v * (224 + 14 * h), 0, 255); col[o + 1] = clamp(v * (180 + 4 * h), 0, 255); col[o + 2] = clamp(v * (104 - 16 * h), 0, 255); col[o + 3] = 255;
        det[o] = 128 + 16 * (g - 0.5); det[o + 1] = 255 * (0.27 + 0.07 * (1 - g) + 0.08 * (1 - tone[li])); det[o + 2] = 0; det[o + 3] = 255;
        if (r > 0.5) { an[o] = 128 + 127 * x / r; an[o + 1] = 128 + 127 * z / r; } else { an[o] = 255; an[o + 1] = 128; }
        an[o + 2] = 200; an[o + 3] = 255;
      }
    }
    // cops de martell (petites clotades)
    for (let d = 0; d < 280; d++) {
      const rr = PC.RC1 + 6 + (0.965 * PC.R - PC.RC1 - 6) * Math.sqrt(R()), a = R() * TAU, rad = 4 + 5 * R();
      const cx = rr * Math.cos(a), cz = rr * Math.sin(a);
      const x0 = Math.max(0, Math.floor((cx - rad + RT) / k)), x1 = Math.min(TS - 1, Math.ceil((cx + rad + RT) / k));
      const y0 = Math.max(0, Math.floor((cz - rad + RT) / k)), y1 = Math.min(TS - 1, Math.ceil((cz + rad + RT) / k));
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5) * k - RT - cx, dz = (py + 0.5) * k - RT - cz, q = 1 - (dx * dx + dz * dz) / (rad * rad);
        if (q <= 0) continue;
        const p = q * q, o = (py * TS + px) * 4;
        col[o] *= 1 - 0.09 * p; col[o + 1] *= 1 - 0.11 * p; col[o + 2] *= 1 - 0.16 * p;
        det[o] = clamp(det[o] - 45 * p, 0, 255); det[o + 1] = clamp(det[o + 1] + 22 * p, 0, 255);
      }
    }
    const mk = (data, srgb) => {
      const t = new THREE.DataTexture(data, TS, TS, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
    };
    TX.col = mk(col, true); TX.det = mk(det, false); TX.an = mk(an, false);
  }

  /* ---------------- materials ---------------- */
  const bronze = (part) => mat(part, {
    color: 0xffffff, map: TX.col, metalness: 1, roughness: 1, roughnessMap: TX.det, bumpMap: TX.det, bumpScale: 1.2,
    anisotropy: 0.65, anisotropyMap: TX.an, side: THREE.DoubleSide, envMapIntensity: 1.15
  });
  const mPlats = bronze('plats'), mCupC = bronze('cupula'), mCupS = bronze('cupula'), mSusp = bronze('plat_suspes');
  const mStrap = mat('corretges', { color: 0x6B3F22, roughness: 0.6, metalness: 0, sheen: 0.35, sheenColor: new THREE.Color(0x9A6A48), clearcoat: 0.2, clearcoatRoughness: 0.5 });
  const mStand = M.chrome('peu'), mRod = M.nickel('peu'), mRubber = M.plastic('peu', 0x1A1A1A);
  const mFelt = M.felt('feltres', 0xDCD5C6), mFeltMetal = M.chrome('feltres'), mSleeve = M.plastic('feltres', 0xEDEAE0);
  const mHandle = M.wood('masses', tex.maple(1, 0.15), { color: 0xF6E6CC }), mYarn = M.felt('masses', 0x2F4170), mYarn2 = M.felt('masses', 0x3B4F86);

  /* ---------------- geometria dels plats ---------------- */
  // modes de flexió: [diàmetres nodals m, cercles nodals n, freq. visual relativa, amplitud, durada (s), temps de creixement (s)]
  const MODES = [
    [2, 0, 1.00, 1.00, 2.6, 0.00], [0, 1, 1.21, 0.30, 1.6, 0.00], [3, 0, 1.58, 0.85, 2.4, 0.03], [4, 0, 2.17, 0.70, 2.2, 0.06],
    [2, 1, 2.52, 0.42, 1.8, 0.10], [5, 0, 2.83, 0.58, 2.1, 0.12], [3, 1, 3.11, 0.40, 1.8, 0.18], [6, 0, 3.47, 0.50, 2.0, 0.22],
    [7, 0, 3.92, 0.42, 1.9, 0.30], [4, 1, 4.18, 0.34, 1.7, 0.35], [8, 0, 4.46, 0.36, 1.8, 0.42], [9, 0, 4.83, 0.30, 1.7, 0.55],
    [10, 0, 5.12, 0.26, 1.6, 0.65], [5, 2, 5.40, 0.22, 1.5, 0.75]
  ];
  const NMODE = MODES.length;
  const SOFTW = MODES.map((m, k) => Math.exp(-0.11 * k) * (k < 3 ? 1.15 : 1));
  const radial = (n, u) => { const b = Math.pow(u, 1.7); return n === 0 ? b : b * Math.cos((n + 0.25) * PI * (1 - u)); };
  const planarUV = (g, P) => {
    const p = g.attributes.position, uv = g.attributes.uv, sc = 1 / (2 * P.R * 1.004);
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) * sc, 0.5 + p.getZ(i) * sc);
    uv.needsUpdate = true; return g;
  };
  // ala (malla polar deformable): de la vora de la cúpula fins a la vora del plat, + un fil de gruix a la vora
  function makeBow(parent, P, material, part, note, seed, tauS) {
    const NR = 32, NS = 120, rings = [];
    for (let i = 0; i <= NR; i++) { const u = i / NR, r = P.RC1 + (P.R - P.RC1) * u; rings.push([r, yTop(P, r), u]); }
    rings.push([P.R + 0.25, -1.7, 1]);
    const nr = rings.length, n = nr * NS, sc = 1 / (2 * P.R * 1.004);
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const mc = [], ms = [];
    for (let k = 0; k < NMODE; k++) { mc.push(new Float32Array(n)); ms.push(new Float32Array(n)); }
    let v = 0;
    for (let i = 0; i < nr; i++) {
      const [r, y, u] = rings[i];
      for (let j = 0; j < NS; j++, v++) {
        const a = TAU * j / NS, x = r * Math.cos(a), z = r * Math.sin(a);
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        uv[v * 2] = 0.5 + x * sc; uv[v * 2 + 1] = 0.5 + z * sc;
        for (let k = 0; k < NMODE; k++) { const f = radial(MODES[k][1], u), m = MODES[k][0]; mc[k][v] = f * Math.cos(m * a); ms[k][v] = f * Math.sin(m * a); }
      }
    }
    const idx = [];
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < NS; j++) {
      const p = i * NS + j, q = i * NS + (j + 1) % NS;
      idx.push(p, q, p + NS, q, q + NS, p + NS);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = add(parent, g, material, part, note != null ? { note } : {});
    heat.overlay(mesh);
    const R = rng(seed);
    const drift = MODES.map(([m]) => (R() - 0.5) * (m ? 0.9 / m : 0));
    return { g, pos, base: pos.slice(), col, n, NS, NR, mc, ms, mesh, drift, tauS, P,
      ca: new Float32Array(NMODE), cb: new Float32Array(NMODE), dirty: false };
  }
  // cúpula (peça rígida, amb gruix) amb el forat del mig
  function cupGeo(P) {
    const N = 26, top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const r = P.RH + (P.RC1 - P.RH) * i / N, y = yTop(P, r);
      top.push([r, y]); bot.push([r, y - P.T * (1 - 0.94 * smooth((r - P.RH) / (P.RC1 - P.RH)))]);
    }
    const pts = bot.concat(top.slice().reverse()); pts.push(bot[0].slice());
    return planarUV(geo.lathe(pts, 120), P);
  }

  /* ---------------- parell de plats de xoc ---------------- */
  const C0 = V3(360, 200, -80), YAW = 0.95;
  const AX = V3(Math.cos(YAW), 0, -Math.sin(YAW));            // eix del parell (de l'esquerre al dret)
  const YC = PC.HB + PC.HC;
  function buildStrap(parent) {
    const loop = [[-2.6, YC - 16], [-3.2, YC - 4], [-4.5, YC + 3], [-13, YC + 13], [-26, YC + 36], [-27, YC + 62], [-14, YC + 80], [0, YC + 85],
      [14, YC + 80], [27, YC + 62], [26, YC + 36], [13, YC + 13], [4.5, YC + 3], [3.2, YC - 4], [2.6, YC - 16]];
    add(parent, geo.curveTube(loop.map(([x, y]) => [x, y, 0]), 1.9, 140, 10), mStrap, 'corretges', { scale: [1, 1, 4.6] });
    // nus per dins del plat
    add(parent, new THREE.SphereGeometry(1, 20, 14), mStrap, 'corretges', { pos: [0, YC - 11.5, 0], scale: [11, 7.5, 10] });
    add(parent, new THREE.TorusGeometry(8.5, 3.3, 10, 26), mStrap, 'corretges', { pos: [0, YC - 7, 0], rot: [PI / 2, 0, 0.4], scale: [1, 1.2, 1] });
    for (const s of [-1, 1]) add(parent, geo.curveTube([[s * 5, YC - 13, 2], [s * 12, YC - 19, 4], [s * 19, YC - 23, 3]], 1.8, 20, 8), mStrap, 'corretges', { scale: [1, 1, 2.2] });
  }
  function crashSide(gCym, gStrap, side) {          // side -1 = esquerre (A), +1 = dret (B)
    const mkFrame = (parent) => {
      const fr = new THREE.Group(); fr.position.copy(C0); fr.rotation.y = YAW; parent.add(fr);
      const piv = new THREE.Group(); piv.rotation.order = 'YZX'; fr.add(piv);
      const or = new THREE.Group(); or.rotation.z = -side * PI / 2; piv.add(or);    // la cúpula mira cap enfora
      return { fr, piv, or };
    };
    const a = mkFrame(gCym), b = mkFrame(gStrap);
    const bow = makeBow(a.or, PC, mPlats, 'plats', 0, side < 0 ? 11 : 23, 1);
    add(a.or, cupGeo(PC), mCupC, 'cupula', { note: 0 });
    buildStrap(b.or);
    return { fr: a.fr, piv: a.piv, or: a.or, bow, piv2: b.piv, or2: b.or, side, th: side < 0 ? 0 : PI };
  }
  const CA = crashSide(G.plat_esq, G.corretja_esq, -1), CB = crashSide(G.plat_dre, G.corretja_dre, 1);

  /* ---------------- plat suspès ---------------- */
  const PSP = V3(-380, 0, 0), TILT = 0.2;
  const YCS = PS.HB + PS.HC, YPIV = YCS - PS.T;
  const tiltFrame = (parent) => { const f = new THREE.Group(); f.position.copy(PSP); f.rotation.x = TILT; parent.add(f); return f; };
  const wobbler = (fr) => {
    const w = new THREE.Group(); w.position.set(0, YPIV, 0); fr.add(w);
    const o = new THREE.Group(); o.position.set(0, -YPIV, 0); w.add(o); return { w, o };
  };
  const frS = tiltFrame(G.plat_suspes), WS = wobbler(frS);
  const SB = makeBow(WS.o, PS, mSusp, 'plat_suspes', 2, 37, 1.2);
  add(WS.o, cupGeo(PS), mCupS, 'cupula', { note: 2 });

  /* ---------------- feltres, funda i palometa ---------------- */
  const frF = tiltFrame(G.feltres), WF = wobbler(frF);
  add(frF, geo.lathe([[4.2, YPIV - 16], [19, YPIV - 16], [20.5, YPIV - 14.6], [21, YPIV - 12.6], [19.5, YPIV - 12], [4.2, YPIV - 12], [4.2, YPIV - 16]], 40), mFeltMetal, 'feltres');
  const feltP = (y0, y1) => [[4.6, y0], [18.2, y0], [19.2, y0 + 1], [19.4, y1 - 1], [18.4, y1], [4.6, y1], [4.6, y0]];
  add(frF, geo.lathe(feltP(YPIV - 12, YPIV), 40), mFelt, 'feltres');
  add(frF, geo.cyl(5.6, YCS + 13 - (YPIV - 12), 'y', 20), mSleeve, 'feltres', { pos: [0, (YCS + 13 + YPIV - 12) / 2, 0] });
  add(WF.o, geo.lathe(feltP(YCS, YCS + 12), 40), mFelt, 'feltres');
  add(WF.o, geo.lathe([[4.2, YCS + 12], [17, YCS + 12], [17.6, YCS + 12.8], [17, YCS + 14], [4.2, YCS + 14], [4.2, YCS + 12]], 36), mFeltMetal, 'feltres');
  add(WF.o, geo.cyl(7.4, 10, 'y', 6), mFeltMetal, 'feltres', { pos: [0, YCS + 19, 0] });
  add(WF.o, geo.lathe([[4.3, YCS + 24], [7, YCS + 24], [6.4, YCS + 26.5], [4.3, YCS + 27.5]], 24), mFeltMetal, 'feltres');
  const WING = [[5, 0], [13, 1], [21, 5], [23.5, 11], [21, 15.5], [15, 15], [9, 10], [5, 9]];
  const wingBev = { bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 };
  for (const s of [1, -1]) {
    const pts = s > 0 ? WING : WING.map(([x, y]) => [-x, y]).reverse();
    const wg = geo.ext(geo.shape(pts), 3, wingBev); wg.translate(0, YCS + 14, -1.5);
    add(WF.o, wg, mFeltMetal, 'feltres');
  }

  /* ---------------- peu (trípode, tubs, inclinador) ---------------- */
  const frP = tiltFrame(G.peu);
  const HL = -52;                                            // eix de l'inclinador (coord. inclinades)
  const HW = V3(0, HL, 0).applyEuler(new THREE.Euler(TILT, 0, 0)).add(PSP);
  const TXp = HW.x, TZ = HW.z;
  add(frP, geo.cyl(4, YCS + 27 + 30, 'y', 16), mRod, 'peu', { pos: [0, (YCS + 27 - 30) / 2, 0] });       // vareta roscada
  add(frP, geo.lathe([[4, -52], [9.5, -52], [10.5, -50], [10.5, -27], [9, -24], [4, -24]], 28), mStand, 'peu');
  for (const s of [-1, 1]) add(G.peu, geo.cyl(17, 8.5, 'x', 36), mStand, 'peu', { pos: [TXp + s * 4.6, HW.y, TZ] });
  add(G.peu, geo.cyl(3.6, 34, 'x', 12), mRod, 'peu', { pos: [TXp + 22, HW.y, TZ] });
  add(G.peu, geo.cyl(7.5, 6, 'x', 6), mStand, 'peu', { pos: [TXp - 12, HW.y, TZ] });
  const knob = () => { const k = geo.ext(geo.rrect(-5, 5, -15, 15, 4.8), 4.2, wingBev); k.translate(0, 0, -2.1); return k; };
  add(G.peu, knob(), mRubber, 'peu', { pos: [TXp + 42, HW.y, TZ] });
  add(G.peu, geo.box(TXp - 9, TXp - 0.4, HW.y - 16, HW.y, TZ - 7, TZ + 7), mStand, 'peu');
  add(G.peu, geo.lathe([[9.5, HW.y - 34], [12, HW.y - 34], [12.5, HW.y - 31], [12.5, HW.y - 16], [11, HW.y - 14], [9.5, HW.y - 14]], 32), mStand, 'peu', { pos: [TXp, 0, TZ] });
  // tub de dalt, abraçadora d'alçada, tub de baix
  const Y_CL = -515;
  add(G.peu, geo.cyl(9.5, HW.y - 30 - Y_CL, 'y', 28), mStand, 'peu', { pos: [TXp, (HW.y - 30 + Y_CL) / 2, TZ] });
  add(G.peu, geo.lathe([[9.5, Y_CL - 15], [17, Y_CL - 15], [18, Y_CL - 12], [18, Y_CL + 10], [16, Y_CL + 15], [9.5, Y_CL + 15]], 36), mStand, 'peu', { pos: [TXp, 0, TZ] });
  add(G.peu, geo.lathe([[12.7, Y_CL - 30], [16.5, Y_CL - 30], [17, Y_CL - 28], [17, Y_CL - 19], [16.5, Y_CL - 17], [12.7, Y_CL - 17]], 32), mRubber, 'peu', { pos: [TXp, 0, TZ] });
  add(G.peu, geo.cyl(3.4, 22, 'x', 12), mRod, 'peu', { pos: [TXp + 26, Y_CL, TZ] });
  add(G.peu, knob(), mRubber, 'peu', { pos: [TXp + 40, Y_CL, TZ] });
  add(G.peu, geo.cyl(12.7, 375, 'y', 32), mStand, 'peu', { pos: [TXp, -702.5, TZ] });
  add(G.peu, geo.cyl(13.4, 8, 'y', 28), mRubber, 'peu', { pos: [TXp, -893, TZ] });
  add(G.peu, geo.lathe([[12.7, -718], [19, -718], [20.5, -715], [20.5, -686], [19, -683], [12.7, -683]], 36), mStand, 'peu', { pos: [TXp, 0, TZ] });
  add(G.peu, geo.lathe([[12.7, -889], [17.5, -889], [18.5, -887], [18.5, -871], [17.5, -869], [12.7, -869]], 36), mStand, 'peu', { pos: [TXp, 0, TZ] });
  const footG = geo.lathe([[0, FLOOR], [12, FLOOR], [13.5, FLOOR + 3], [12.5, FLOOR + 16], [9.5, FLOOR + 22], [0, FLOOR + 22]], 24);
  for (const a of [-PI / 2, PI / 6, 5 * PI / 6]) {
    const P = (r, y) => [TXp + r * Math.cos(a), y, TZ + r * Math.sin(a)];
    add(G.peu, geo.curveTube([P(19, -700), P(95, -768), P(200, -858), P(298, -938)], 8.5, 40, 12), mStand, 'peu');
    add(G.peu, geo.tube(P(18, -879), P(150, -818), 5, 1, 10), mStand, 'peu');
    add(G.peu, geo.cyl(4, 14, 'y', 12), mRod, 'peu', { pos: P(22, -700) });
    add(G.peu, footG, mRubber, 'peu', { pos: P(298, 0).map((c, i) => (i === 1 ? 0 : c)) });
  }

  /* ---------------- masses (baquetes de cap tou) ---------------- */
  const L_M = 362, HEAD_R = 17, REST_L = 0.42;
  const handleG = swapUV(geo.lathe([[0, 0], [4.4, 0.4], [5.2, 2.5], [5.4, 8], [5.2, 120], [4.6, 250], [4.0, L_M - 14], [3.4, L_M - 8], [0, L_M - 6]], 20));
  handleG.rotateX(PI / 2);                               // el cap mira cap a +Z
  const headG = new THREE.SphereGeometry(HEAD_R, 32, 22);
  const RM = rng(77);
  const mallets = [0, 1].map(() => {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; G.masses.add(g);
    add(g, handleG, mHandle, 'masses', { note: 3 });
    add(g, headG, mYarn, 'masses', { pos: [0, 0, L_M], note: 3 });
    for (let i = 0; i < 9; i++) {
      add(g, new THREE.TorusGeometry(HEAD_R * 0.985, 1.05, 6, 40), i % 2 ? mYarn2 : mYarn, 'masses',
        { pos: [0, 0, L_M], rot: [RM() * PI, RM() * PI, 0], cast: false });
    }
    return g;
  });
  // punts de cop a la vora del plat suspès
  frS.updateMatrix();
  const NRM_S = V3(0, 1, 0).applyEuler(frS.rotation);
  const TH = [PI - 0.32, 0.32], RHIT = 0.88 * PS.R;
  const HP = TH.map((th) => V3(RHIT * Math.cos(th), yTop(PS, RHIT), RHIT * Math.sin(th)).applyMatrix4(frS.matrix).addScaledVector(NRM_S, HEAD_R + 1.2));
  const MDIR = [V3(-0.32, 0.46, 0.83).normalize(), V3(0.32, 0.46, 0.83).normalize()];
  const MPOSE = HP.map((h, k) => {
    const grip = h.clone().addScaledVector(MDIR[k], L_M), d = h.clone().sub(grip);
    return { grip, yaw: Math.atan2(d.x, d.z), pitch: Math.atan2(-d.y, Math.hypot(d.x, d.z)) };
  });
  function setMallet(k, lift) {
    const p = MPOSE[k];
    mallets[k].position.copy(p.grip);
    mallets[k].rotation.set(p.pitch - lift, p.yaw, 0);
  }

  /* ---------------- notes ---------------- */
  const NOTES = [
    { label: 'Xoc', f: 400, kind: 'xoc' },
    { label: 'Apagat', f: 400, kind: 'apagat' },
    { label: 'Plat suspès', f: 400, kind: 'susp' },
    { label: 'Redoble', f: 400, kind: 'redoble' }
  ];
  const noteOf = (n) => {
    if (typeof n === 'number') return NOTES[n] || NOTES[0];
    if (n && n.kind) return NOTES.find((x) => x.kind === n.kind) || NOTES[0];
    if (n && n.label) return NOTES.find((x) => x.label === n.label) || NOTES[0];
    return NOTES[0];
  };
  // cops de massa al plat suspès
  const HITS = {
    susp: [{ t0: 0.2, k: 1, amp: 1, dent: 1, mid: 0, th: TH[1] }],
    redoble: []
  };
  const N_ROLL = 32, ROLL_DT = 0.07, ROLL_T0 = 0.12;
  for (let i = 0; i < N_ROLL; i++) {
    const c = smooth(i / (N_ROLL - 1));
    HITS.redoble.push({ t0: ROLL_T0 + i * ROLL_DT, k: i % 2, amp: 0.012 + 0.05 * c, dent: 0.3 + 0.6 * c, mid: 0.05 + 0.1 * c, th: TH[i % 2] });
  }
  // moviment dels plats de xoc: g = mitja separació, dyA/dyB = alçada, dz = cap al públic (+) o al pit (-), b = obertura, z = inclinació
  const T_HIT = 0.25, T_CHOKE = 0.66;
  const PK = ['g', 'dyA', 'dyB', 'dz', 'b', 'z'];
  const REST = { g: 75, dyA: 0, dyB: 0, dz: 0, b: 0, z: 0 };
  const KCOMMON = [
    { t: 0, ...REST },
    { t: 0.14, g: 108, dyA: -4, dyB: 46, dz: 0, b: 0, z: 0.10, e: 's' },
    { t: 0.25, g: 12.5, dyA: 0, dyB: 26, dz: 0, b: 0, z: 0.06, e: 'in' },
    { t: 0.31, g: 0.8, dyA: 2, dyB: -16, dz: 0, b: 0, z: 0, e: 'l' },
    { t: 0.42, g: 48, dyA: -4, dyB: -24, dz: 6, b: 0.05, z: -0.05, e: 'out' }
  ];
  const KX = KCOMMON.concat([{ t: 0.9, g: 232, dyA: 34, dyB: 34, dz: 50, b: 0.85, z: -0.04, e: 's' }]);
  const KA = KCOMMON.concat([
    { t: 0.55, g: 150, dyA: 14, dyB: 10, dz: 10, b: 0.35, z: -0.03, e: 's' },
    { t: 0.68, g: 255, dyA: -12, dyB: -12, dz: -175, b: -1.15, z: 0, e: 's' }
  ]);
  function samplePose(K, t, out) {
    let i = 0; while (i < K.length - 1 && t > K[i + 1].t) i++;
    if (i >= K.length - 1) { for (const k of PK) out[k] = K[K.length - 1][k]; return out; }
    const a = K[i], b = K[i + 1]; let u = clamp((t - a.t) / (b.t - a.t));
    u = b.e === 'in' ? u * u : b.e === 'out' ? 1 - (1 - u) * (1 - u) : b.e === 'l' ? u : smooth(u);
    for (const k of PK) out[k] = lerp(a[k], b[k], u);
    return out;
  }
  function applyCrash(p) {
    CA.piv.position.set(-p.g, p.dyA, p.dz); CA.piv.rotation.set(0, -p.b, -p.z);
    CB.piv.position.set(p.g, p.dyB, p.dz); CB.piv.rotation.set(0, p.b, p.z);
    CA.piv2.position.copy(CA.piv.position); CA.piv2.rotation.copy(CA.piv.rotation);
    CB.piv2.position.copy(CB.piv.position); CB.piv2.rotation.copy(CB.piv.rotation);
  }
  applyCrash(REST);
  for (let k = 0; k < 2; k++) setMallet(k, REST_L);
  const CRASH_EXC = [[{ t0: T_HIT, amp: 1.25, th: CA.th }], [{ t0: T_HIT, amp: 1.25, th: CB.th }]];

  /* ---------------- so ---------------- */
  function partialSet(seed, n) {
    const R = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const k = Math.exp(Math.log(30) * (i + 0.2 + 0.6 * R()) / n), lk = Math.log(k);
      const a = (0.45 + 0.55 * R()) * (0.25 + Math.exp(-Math.pow(lk - 2.1, 2) / 1.6));
      out.push({ k, a, tau: 1.1 + 2.6 * clamp(lk / Math.log(30)) + 0.5 * R() });
    }
    return out;
  }
  const CR = partialSet(91, 28), SP = partialSet(57, 26);
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(() => { try { fn(); } catch (e) { /* sense àudio */ } }, ms));
  function crashSound(choke) {
    synth.additive({ f: 340, partials: CR, attack: 0.002, hold: choke ? 0.4 : 0, release: choke ? 0.05 : null, gain: 0.85, dur: choke ? null : 6.5,
      noise: { amount: 0.55, dur: choke ? 0.5 : 3.5, hp: 2600, lp: 12500 } });
    synth.additive({ f: 340, partials: [{ k: 1, a: 0.02, tau: 0.05 }], attack: 0.001, gain: 0.5,
      noise: { amount: 1, dur: 0.22, hp: 900, lp: 9000 } });
  }
  function susSound() {
    const soft = SP.map((p, i) => ({ k: p.k, a: p.a * Math.exp(-0.09 * i) * (i < 4 ? 1.6 : 1), tau: p.tau * 1.1 }));
    synth.additive({ f: 300, partials: soft, attack: 0.015, gain: 0.7, dur: 6.5, noise: { amount: 0.12, dur: 0.6, hp: 250, lp: 2200 } });
    synth.additive({ f: 300, partials: SP.filter((p) => p.k > 5), attack: 0.5, gain: 0.3, dur: 6.5, noise: { amount: 0.35, dur: 4, hp: 3500, lp: 11000 } });
  }
  function rollSound() {
    synth.additive({ f: 300, partials: SP, attack: 2.1, hold: 0.1, gain: 0.85, dur: 7, noise: { amount: 0.5, dur: 6, hp: 2500, lp: 11000 } });
  }
  function tick(a) {
    synth.additive({ f: 300, partials: [{ k: 1, a: 0.02, tau: 0.03 }, { k: 2.7, a: 0.01, tau: 0.02 }], attack: 0.002, gain: a,
      noise: { amount: 1, dur: 0.05, hp: 250, lp: 1800 } });
  }

  /* ---------------- animació de la vibració ---------------- */
  function modeCoefs(B, exc, t, W, gain, soft) {
    const ca = B.ca, cb = B.cb; ca.fill(0); cb.fill(0);
    if (!exc || !exc.length) return 0;
    const t1 = exc[0].t0; let tot = 0;
    for (const h of exc) {
      const tau = t - h.t0; if (tau < 0) break;
      for (let k = 0; k < NMODE; k++) {
        const md = MODES[k], m = md[0], rr = md[5] * (soft ? 1.8 : 1);
        let A = h.amp * md[3] * (soft ? SOFTW[k] : 1);
        if (rr > 0) A *= 1 - Math.exp(-tau / rr);
        A *= Math.exp(-tau / (md[4] * B.tauS));
        if (A < 1e-3) continue;
        A *= gain * (1 + 0.25 * Math.sin(0.8 * (1 + 0.37 * k) * tau + 1.3 * k));   // llampurneig
        tot += A;
        const v = A * Math.sin(W * md[2] * (t - t1)), phi = h.th + B.drift[k] * tau;
        ca[k] += v * Math.cos(m * phi); cb[k] += v * Math.sin(m * phi);
      }
    }
    return tot;
  }
  const ACT = new Int32Array(NMODE);
  function deformBow(B, amp, dA, hx, hz) {
    const P = B.pos, base = B.base, C = B.col, n = B.n, ca = B.ca, cb = B.cb, mc = B.mc, ms = B.ms;
    let na = 0; for (let k = 0; k < NMODE; k++) if (Math.abs(ca[k]) + Math.abs(cb[k]) > 1e-5) ACT[na++] = k;
    const inv = 1 / (2 * 38 * 38), norm = 1 / (amp * 1.5);
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let q = 0; q < na; q++) { const k = ACT[q]; w += ca[k] * mc[k][i] + cb[k] * ms[k][i]; }
      w *= amp;
      if (dA !== 0) { const dx = base[i * 3] - hx, dz = base[i * 3 + 2] - hz; w += dA * Math.exp(-(dx * dx + dz * dz) * inv); }
      P[i * 3 + 1] = base[i * 3 + 1] + w;
      heat.color(clamp(w * norm, -1, 1), C, i);
    }
    B.g.attributes.position.needsUpdate = true; B.g.attributes.color.needsUpdate = true;
    B.g.computeVertexNormals(); B.dirty = true;
  }
  function restore(B) {
    if (!B.dirty) return;
    B.pos.set(B.base);
    for (let i = 0; i < B.n; i++) heat.color(0, B.col, i);
    B.g.attributes.position.needsUpdate = true; B.g.attributes.color.needsUpdate = true;
    B.g.computeVertexNormals(); B.dirty = false;
  }
  // aire empès per la vora (4 punts)
  const _p = V3(0, 0, 0), _d = V3(0, 0, 0);
  function rimAir(B, level) {
    if (level < 0.06) return;
    B.mesh.updateWorldMatrix(true, false);
    for (let q = 0; q < 4; q++) {
      const j = (q * B.NS / 4 + 7 * q) % B.NS, v = B.NR * B.NS + j;
      const w = B.pos[v * 3 + 1] - B.base[v * 3 + 1]; if (Math.abs(w) < 0.25) continue;
      const bx = B.base[v * 3], bz = B.base[v * 3 + 2], r = Math.hypot(bx, bz) || 1;
      _p.set(bx, B.base[v * 3 + 1], bz); B.mesh.localToWorld(_p);
      _d.set(0.35 * bx / r, Math.sign(w), 0.35 * bz / r).transformDirection(B.mesh.matrixWorld);
      fx.air(_p.clone(), _d.clone(), 60 + 240 * clamp(level), 0.5, 150);
    }
  }
  function malletLift(k, hits, t) {
    let prev = null, next = null;
    for (const h of hits) { if (h.k !== k) continue; if (h.t0 <= t) prev = h; else { next = h; break; } }
    if (!prev && !next) return REST_L;
    if (!prev) { const u = clamp(t / next.t0); return REST_L * (1 - u * u); }
    if (next) { const u = clamp((t - prev.t0) / (next.t0 - prev.t0)); return next.mid * Math.sin(PI * u); }
    const tau = t - prev.t0;
    return REST_L * smooth(tau / 0.45) + 0.1 * prev.dent * Math.sin(PI * clamp(tau / 0.3));
  }

  const st = { ni: -2, lastT: 0, pose: { ...REST }, start: { ...REST }, lift: [REST_L, REST_L] };
  const tmpPose = { ...REST }, IDQ = new THREE.Quaternion(), rotV = V3(0, 0, 0);

  /* ---------------- textos ---------------- */
  const parts = {
    plats: { name: 'Plats de xoc', text: "Són dos discos de bronze que es toquen fent-los xocar. Com que no fan una nota clara, són percussió no afinada.", dato: "El bronze és un aliatge (una barreja de metalls) de coure i estany. En molts plats és un 80 % de coure i un 20 % d'estany." },
    cupula: { name: 'Cúpula', text: "És la part bombada del centre del plat. Té un forat al mig per on passa la corretja o la vareta del peu.", dato: "Si piques la cúpula, el plat sona més agut i clar, gairebé com una campana." },
    corretges: { name: 'Corretges', text: "Són tires de cuir que passen pel forat de la cúpula i es lliguen amb un nus per dins. El músic agafa el plat per la corretja, sense tocar el metall.", dato: "Els dits sobre el metall farien callar el plat: per això el músic l'agafa només pel cuir." },
    plat_suspes: { name: 'Plat suspès', text: "És un sol plat posat damunt d'un peu. Es toca amb masses toves o amb baquetes.", dato: "Fa 18 polzades, uns 46 cm. Els plats es mesuren en polzades." },
    feltres: { name: 'Feltres i palometa', text: "Dos feltres agafen el plat pel forat del mig i una palometa (una femella amb ales) ho subjecta. El plat queda agafat però pot vibrar i balancejar-se.", dato: "Si s'estreny massa la palometa, el plat sona apagat i fins i tot es pot esquerdar." },
    peu: { name: 'Peu', text: "És un trípode de metall amb un tub que es pot allargar. A dalt té una articulació que inclina el plat cap al músic.", dato: "Les potes acaben en tacs de goma perquè el peu no rellisqui ni ratlli el terra." },
    masses: { name: 'Masses', text: "Són bastons amb una bola tova de fil a la punta. Fan sonar el plat suaument, sense el cop sec d'una baqueta de fusta.", dato: "Per fer un redoble, el músic pica molt ràpid amb dues masses, una a cada banda del plat." }
  };

  /* ---------------- etiquetes (coordenades del grup) ---------------- */
  function inGroup(obj, groupRoot, p) {
    const v = p.clone(); let o = obj;
    while (o && o !== groupRoot) { o.updateMatrix(); v.applyMatrix4(o.matrix); o = o.parent; }
    return v.toArray().map((c) => Math.round(c * 10) / 10);
  }
  const headAt = (() => { const m = mallets[1]; m.updateMatrix(); return V3(0, 0, L_M).applyMatrix4(m.matrix).toArray().map((c) => Math.round(c)); })();
  const labels = [
    { part: 'plats', group: 'plat_dre', at: inGroup(CB.or, G.plat_dre, V3(0, yTop(PC, 170) + 0.5, 170)) },
    { part: 'cupula', group: 'plat_esq', at: inGroup(CA.or, G.plat_esq, V3(0, yTop(PC, 40) + 0.8, 40)) },
    { part: 'corretges', group: 'corretja_esq', at: inGroup(CA.or2, G.corretja_esq, V3(0, YC + 85, 0)) },
    { part: 'plat_suspes', group: 'plat_suspes', at: inGroup(WS.o, G.plat_suspes, V3(150 * Math.cos(0.9), yTop(PS, 150) + 0.5, 150 * Math.sin(0.9))) },
    { part: 'feltres', group: 'feltres', at: inGroup(WF.o, G.feltres, V3(17, YCS + 7, 8)) },
    { part: 'peu', group: 'peu', at: [TXp + 13, -600, TZ] },
    { part: 'masses', group: 'masses', at: headAt }
  ];
  const ex = (d, up, dl) => [Math.round(AX.x * d), up, Math.round(AX.z * d), dl];

  return {
    id: 'plats',
    family: 'Percussió no afinada',
    name: 'Plats',
    intro: "Els plats són discos de bronze que vibren molta estona després del cop. Fan un so brillant i ple, sense una nota clara: per això són percussió no afinada.",
    floorY: FLOOR,
    camera: {
      explore: { pos: [720, 430, 1950], target: [0, -160, 0] },
      exploded: { pos: [950, 700, 2700], target: [0, -40, 60] }
    },
    parts,
    labels,
    explode: {
      plat_esq: ex(-130, 70, 0.1),
      plat_dre: ex(130, 70, 0.1),
      corretja_esq: ex(-330, 70, 0.25),
      corretja_dre: ex(330, 70, 0.25),
      plat_suspes: [0, 170, 0, 0.05],
      feltres: [0, 340, 0, 0.18],
      masses: [0, 140, 420, 0.32],
      peu: [0, 0, 0, 0]
    },
    notes: NOTES,
    options: null,
    chain: ['Cop', 'Plat', 'Vibració del metall', 'Aire'],
    tour: [
      { part: 'plats', chain: 0, note: 0, title: 'El xoc', heat: false, xray: false, slow: 0.35,
        text: "El músic fa xocar els dos plats, però no de cara: els fa lliscar un contra l'altre. Si xoquessin plans, quedaria aire atrapat al mig i el so sortiria apagat. A més, un cop de cara podria esquerdar el bronze.",
        cam: { pos: [700, 470, 900], target: [360, 210, -80] } },
      { part: 'cupula', chain: 1, note: 0, title: 'Cúpula i corretges', heat: false, xray: false, slow: 0.6,
        text: "La corretja de cuir passa pel forat de la cúpula i es lliga per dins amb un nus. El músic agafa el plat per la corretja i no toca el metall. Així el plat pot vibrar lliure molta estona.",
        cam: { pos: [-40, 380, 520], target: [310, 220, -20] } },
      { part: 'plats', chain: 2, note: 0, title: 'El metall vibra', heat: true, xray: false, slow: 0.5,
        text: "Després del xoc, tot el plat vibra (taronja: puja; blau: baixa). Es formen moltes zones que es mouen en sentits contraris i canvien sense parar. Per això el so brilla tant i no té una nota clara.",
        cam: { pos: [1130, 480, 470], target: [360, 230, -40] } },
      { part: 'plat_suspes', chain: 2, note: 3, title: 'El plat suspès', heat: true, xray: false, slow: 0.7,
        text: "El plat suspès descansa entre dos feltres, damunt d'un peu. Amb dues masses toves, el músic fa un redoble ràpid, una a cada banda. El so creix com una onada i el plat es balanceja.",
        cam: { pos: [-150, 420, 640], target: [-380, -20, 0] } },
      { part: 'plats', chain: 3, note: 1, title: "L'aire i l'apagat", heat: false, xray: false, slow: 1,
        text: "La vora del plat empeny l'aire endavant i endarrere, i el so arriba a la sala. Per aturar-lo, el músic apreta els plats contra el pit. El cos fa callar el metall de cop.",
        cam: { pos: [600, 520, 1750], target: [0, -60, 0] } }
    ],
    soundSource: { group: 'plat_esq', at: [C0.x, C0.y, C0.z] },

    play(note) {
      const n = noteOf(note);
      while (timers.length) clearTimeout(timers.pop());
      // el so arrenca uns instants més tard (quan els plats es toquen): despertem l'àudio ara, dins del clic
      try { const ac = synth.ctx; if (ac && ac.state === 'suspended') ac.resume(); } catch (e) { /* sense àudio */ }
      if (n.kind === 'xoc') { later(T_HIT * 1000, () => crashSound(false)); return { attack: 0.003, hold: 0.55, release: 1.9 }; }
      if (n.kind === 'apagat') { later(T_HIT * 1000, () => crashSound(true)); return { attack: 0.003, hold: 0.62, release: 0.14 }; }
      if (n.kind === 'susp') { later(HITS.susp[0].t0 * 1000, susSound); return { attack: 0.003, hold: 0.3, release: 1.7 }; }
      later(ROLL_T0 * 1000, rollSound);
      for (const h of HITS.redoble) later(h.t0 * 1000, () => tick(0.05 + 1.8 * h.amp));
      return { attack: 0.05, hold: 2.35, release: 1.5 };
    },

    update(dt, s) {
      dt = clamp(dt || 0, 0, 0.05);
      const t = s.t || 0, env = s.env || 0, playing = env > 0.0005;
      let ni = typeof s.noteIndex === 'number' ? s.noteIndex : -1;
      if (!(ni >= 0 && ni < NOTES.length)) ni = s.note ? NOTES.indexOf(noteOf(s.note)) : -1;
      const kind = ni >= 0 ? NOTES[ni].kind : null;
      if (ni !== st.ni || t < st.lastT - 1e-6) { st.ni = ni; Object.assign(st.start, st.pose); }
      st.lastT = t;
      const W = TAU * Math.max(1.0, 1.25 * (s.fvis || 1)), g = Math.min(1, env * 3);

      /* ---- plats de xoc: moviment de les mans ---- */
      const crash = playing && (kind === 'xoc' || kind === 'apagat');
      if (crash) {
        const K = kind === 'xoc' ? KX : KA;
        samplePose(K, t, tmpPose);
        if (kind === 'xoc' && t > K[K.length - 1].t) { const w = smooth(env / 0.3); for (const k of PK) tmpPose[k] = lerp(REST[k], tmpPose[k], w); }
        if (t < 0.14) { const u = smooth(t / 0.14); for (const k of PK) tmpPose[k] = lerp(st.start[k], tmpPose[k], u); }
        Object.assign(st.pose, tmpPose);
      } else {
        const kk = 1 - Math.exp(-dt * 3);
        for (const k of PK) st.pose[k] += (REST[k] - st.pose[k]) * kk;
      }
      applyCrash(st.pose);

      /* ---- plats de xoc: vibració ---- */
      if (crash && t >= T_HIT) {
        const damp = kind === 'apagat' && t > T_CHOKE ? Math.exp(-(t - T_CHOKE) / 0.05) : 1;
        const tl = t - T_HIT, dA = tl < 0.2 ? 3.2 * (1 - Math.exp(-tl / 0.01)) * Math.exp(-tl / 0.045) * g : 0;
        [CA, CB].forEach((C, i) => {
          const tot = modeCoefs(C.bow, CRASH_EXC[i], t, W, damp * g, false);
          deformBow(C.bow, 5.5, dA, PC.R * Math.cos(C.th), PC.R * Math.sin(C.th));
          rimAir(C.bow, tot / 2.5);
        });
        // l'aire escapa per la vora mentre els plats llisquen
        if (tl < 0.12) {
          CA.fr.updateWorldMatrix(true, false);
          const dy = (st.pose.dyA + st.pose.dyB) / 2;
          for (let q = 0; q < 6; q++) {
            const a = TAU * q / 6 + 0.3;
            _p.set(0, dy + PC.R * Math.cos(a), st.pose.dz + PC.R * Math.sin(a)); CA.fr.localToWorld(_p);
            _d.set(0, Math.cos(a), Math.sin(a)).transformDirection(CA.fr.matrixWorld);
            fx.air(_p.clone(), _d.clone(), 320, 0.6, 200);
          }
        }
      } else { restore(CA.bow); restore(CB.bow); }

      /* ---- plat suspès i masses ---- */
      const sus = playing && (kind === 'susp' || kind === 'redoble');
      const hits = sus ? HITS[kind] : null;
      const kL = 1 - Math.exp(-dt * 6);
      for (let k = 0; k < 2; k++) {
        if (sus) st.lift[k] = malletLift(k, hits, t); else st.lift[k] += (REST_L - st.lift[k]) * kL;
        setMallet(k, st.lift[k]);
      }
      if (sus) {
        const tot = modeCoefs(SB, hits, t, W, g, true);
        let dA = 0, hx = 0, hz = 0, last = null;
        for (const h of hits) { if (h.t0 <= t) last = h; else break; }
        if (last) {
          const tl = t - last.t0;
          if (tl < 0.15) { dA = -2.4 * last.dent * (1 - Math.exp(-tl / 0.006)) * Math.exp(-tl / 0.04) * g; hx = RHIT * Math.cos(last.th); hz = RHIT * Math.sin(last.th); }
        }
        deformBow(SB, 4.5, dA, hx, hz);
        rimAir(SB, tot / 2.0);
        // el plat es balanceja damunt dels feltres
        rotV.set(0, 0, 0);
        const wW = TAU * 1.3;
        for (const h of hits) {
          const tau = t - h.t0; if (tau < 0) break;
          const ang = -0.05 * h.amp * Math.exp(-tau / 1.6) * Math.sin(wW * tau);
          rotV.x += -Math.sin(h.th) * ang; rotV.z += Math.cos(h.th) * ang;
        }
        rotV.multiplyScalar(g);
        const L = rotV.length();
        if (L > 1e-6) WS.w.quaternion.setFromAxisAngle(rotV.divideScalar(L), Math.min(L, 0.09)); else WS.w.quaternion.identity();
      } else {
        restore(SB);
        WS.w.quaternion.slerp(IDQ, 1 - Math.exp(-dt * 4));
      }
      WF.w.quaternion.copy(WS.w.quaternion);
    }
  };
}
