// Catàleg d'instruments: noms, família, subfamília, descripció curta i lloc a l'orquestra.
// seat: sector del mapa de l'orquestra (angles en graus des del director, -90 esquerra / +90 dreta; radis en unitats del mapa).
// n: quantes cadires es dibuixen al sector (aproximat, per donar idea de la mida de la secció).

export const SUBS = {
  fregada:   { fam: 'Corda',     sub: 'Fregada',    color: '--c-fregada' },
  pincada:   { fam: 'Corda',     sub: 'Pinçada',    color: '--c-pincada' },
  percudida: { fam: 'Corda',     sub: 'Percudida',  color: '--c-percudida' },
  fusta:     { fam: 'Vent',      sub: 'Fusta',      color: '--c-fusta' },
  metall:    { fam: 'Vent',      sub: 'Metall',     color: '--c-metall' },
  afinada:   { fam: 'Percussió', sub: 'Afinada',    color: '--c-afinada' },
  noafinada: { fam: 'Percussió', sub: 'No afinada', color: '--c-noafinada' }
};

export const INSTR = [
  { id: 'violi',      name: 'Violí',             short: 'Violins',    s: 'fregada',   seat: [-80, -31, 125, 300], n: 16, desc: 'El més petit i el més agut de la corda fregada. L’arc frega les cordes i les fa vibrar.' },
  { id: 'viola',      name: 'Viola',             short: 'Violes',     s: 'fregada',   seat: [-30, 9, 125, 235],   n: 10, desc: 'Una mica més gran que el violí, amb un so més greu i més fosc.' },
  { id: 'violoncel',  name: 'Violoncel',         short: 'Violoncels', s: 'fregada',   seat: [10, 52, 125, 265],   n: 10, desc: 'Es toca assegut, amb la pica recolzada a terra. Té un so greu i càlid.' },
  { id: 'contrabaix', name: 'Contrabaix',        short: 'Contrab.',   s: 'fregada',   seat: [53, 80, 205, 340],   n: 8,  desc: 'El més greu de la corda fregada. Al jazz es toca gairebé sempre pinçant les cordes.' },
  { id: 'arpa',       name: 'Arpa',              short: 'Arpa',       s: 'pincada',   seat: [-84, -68, 312, 372], n: 2,  desc: 'Té 47 cordes que es pincen amb els dits i 7 pedals per canviar les notes.' },
  { id: 'piano',      name: 'Piano',             short: 'Piano',      s: 'percudida', seat: [-84, -58, 52, 118],  n: 0,  desc: 'Cada tecla mou un martellet que colpeja les cordes. Sovint és el solista, davant del director.' },
  { id: 'flauta',     name: 'Flauta travessera', short: 'Flautes',    s: 'fusta',     seat: [-28, -1, 272, 326],  n: 3,  desc: 'Es bufa per sobre d’un forat. És de metall, però és de la família de la fusta.' },
  { id: 'oboe',       name: 'Oboè',              short: 'Oboès',      s: 'fusta',     seat: [1, 28, 272, 326],    n: 3,  desc: 'Té llengüeta doble. Abans del concert, dona el La perquè tota l’orquestra afini.' },
  { id: 'clarinet',   name: 'Clarinet',          short: 'Clarinets',  s: 'fusta',     seat: [-28, -1, 332, 388],  n: 3,  desc: 'Una sola canya vibra contra el broquet i fa vibrar l’aire del tub.' },
  { id: 'fagot',      name: 'Fagot',             short: 'Fagots',     s: 'fusta',     seat: [1, 28, 332, 388],    n: 3,  desc: 'Un tub de 2,5 metres plegat en dos. Té llengüeta doble i un so greu.' },
  { id: 'trompa',     name: 'Trompa',            short: 'Trompes',    s: 'metall',    seat: [-62, -30, 398, 468], n: 4,  desc: 'El tub fa voltes en cercle i el pavelló mira cap enrere.' },
  { id: 'trompeta',   name: 'Trompeta',          short: 'Trompetes',  s: 'metall',    seat: [-26, 3, 398, 455],   n: 3,  desc: 'La més aguda del metall. Els llavis vibren dins del broquet.' },
  { id: 'trombo',     name: 'Trombó de vares',   short: 'Trombons',   s: 'metall',    seat: [5, 31, 398, 455],    n: 3,  desc: 'En lloc de pistons té una vara que allarga o escurça el tub.' },
  { id: 'tuba',       name: 'Tuba',              short: 'Tuba',       s: 'metall',    seat: [33, 50, 398, 455],   n: 1,  desc: 'La més greu del metall, amb el pavelló cap amunt.' },
  { id: 'xilofon',    name: 'Xilòfon',           short: 'Xilòfon',    s: 'afinada',   seat: [-48, -19, 482, 545], n: 1,  desc: 'Làmines de fusta de llargades diferents, amb un tub ressonador sota cada una.' },
  { id: 'timbals',    name: 'Timbals',           short: 'Timbals',    s: 'afinada',   seat: [-16, 16, 482, 552],  n: 4,  desc: 'Tambors de coure que sí que fan una nota. El pedal la canvia mentre toques.' },
  { id: 'caixa',      name: 'Caixa',             short: 'Caixa',      s: 'noafinada', seat: [19, 36, 482, 545],   n: 1,  desc: 'Tambor petit amb bordons a sota, que fan el seu so rasposo.' },
  { id: 'bombo',      name: 'Bombo',             short: 'Bombo',      s: 'noafinada', seat: [38, 54, 482, 545],   n: 1,  desc: 'El tambor més gran de l’orquestra: so molt greu, sense nota clara.' },
  { id: 'plats',      name: 'Plats',             short: 'Plats',      s: 'noafinada', seat: [56, 69, 470, 535],   n: 1,  desc: 'Dos discos de bronze que es fan xocar, o un de sol penjat que es toca amb masses.' },
  { id: 'triangle',   name: 'Triangle',          short: 'Triangle',   s: 'noafinada', seat: [-64, -51, 470, 530], n: 1,  desc: 'Una barra d’acer doblegada amb una cantonada oberta.' },
  { id: 'guitarra',   name: 'Guitarra',          short: 'Guitarra',   s: 'pincada',   seat: null,                 n: 0,  desc: 'Es pincen les cordes amb els dits. No forma part de l’orquestra simfònica: és la nostra convidada.' }
];

export const BY_ID = Object.fromEntries(INSTR.map(i => [i.id, i]));
// Ordre per navegar amb les fletxes: per famílies i subfamílies
export const ORDER = ['violi', 'viola', 'violoncel', 'contrabaix', 'guitarra', 'arpa', 'piano', 'flauta', 'oboe', 'clarinet', 'fagot', 'trompeta', 'trompa', 'trombo', 'tuba', 'xilofon', 'timbals', 'caixa', 'bombo', 'plats', 'triangle'];
