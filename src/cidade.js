// Cidade procedural "bairro americano anos 80" — leve (geometrias mescladas por material)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BLOCK = 36, STREET = 14, P = BLOCK + STREET, N = 4; // nós 0..N
export const ROAD_HALF = 4, SIDEWALK_OUT = STREET / 2;           // calçada de 4 a 7 m do eixo
export const nodePos = (i) => (i - N / 2) * P;

let seed = 1984;
export function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const rr = (a, b) => a + rnd() * (b - a);

// ---------- texturas desenhadas em canvas
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function noise(g, w, h, amt, n = 900) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * amt})`;
    g.fillRect(rnd() * w, rnd() * h, rr(1, 3), rr(1, 3));
  }
}
function bricks(g, w, h, base, mortar) {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  const bh = 6, bw = 16;
  for (let y = 0, r = 0; y < h; y += bh, r++) {
    for (let x = (r % 2) * -bw / 2; x < w; x += bw) {
      const k = rr(-14, 14);
      g.fillStyle = shade(base, k);
      g.fillRect(x + 1, y + 1, bw - 1.5, bh - 1.5);
    }
  }
}
function shade(hex, k) {
  const c = new THREE.Color(hex); c.offsetHSL(0, 0, k / 255);
  return '#' + c.getHexString();
}
const BRICKS = ['#8a3b2a', '#7a4a36', '#9b5a3c', '#6b3a2e', '#a0705a', '#5e4a42', '#8c6046'];
function facadeTex(base, trim, lit) {
  return canvasTex(128, 128, (g, w, h) => {
    bricks(g, w, h, base, '#5a5048');
    // janela
    const wx = 34, wy = 26, ww = 60, wh = 74;
    g.fillStyle = trim; g.fillRect(wx - 6, wy - 8, ww + 12, 8);           // verga
    g.fillStyle = shade(trim, -30); g.fillRect(wx - 5, wy + wh, ww + 10, 7); // peitoril
    g.fillStyle = '#e9e2cf'; g.fillRect(wx, wy, ww, wh);                  // caixilho
    const glass = lit ? '#f2c66b' : pick(['#24303f', '#2c3a4a', '#1f2833', '#34404d']);
    g.fillStyle = glass; g.fillRect(wx + 4, wy + 4, ww - 8, wh / 2 - 6); g.fillRect(wx + 4, wy + wh / 2 + 2, ww - 8, wh / 2 - 6);
    if (!lit && rnd() < .5) { g.fillStyle = pick(['#c9b48a', '#a9c2c9', '#d8a07a', '#9c8f7a']); g.fillRect(wx + 4, wy + 4, ww - 8, rr(10, 30)); } // cortina
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(wx + 8, wy + 8, 8, wh / 2 - 14);
    noise(g, w, h, .12, 500);
  });
}
const SHOPS = [['DELI', '#c0392b'], ['PIZZA', '#1e7a3a'], ['BARBER', '#2054a8'], ['LAUNDRY', '#6a3d9a'], ['RECORDS', '#d35400'],
  ['BODEGA', '#b8860b'], ['SHOES', '#7f1d1d'], ['DINER', '#0f766e'], ['GROCERY', '#9a3412'], ['ARCADE', '#7c3aed'], ['VIDEO', '#be185d'], ['DONUTS', '#c2410c']];
function shopTex(name, col) {
  return canvasTex(256, 128, (g, w, h) => {
    bricks(g, w, h, pick(BRICKS), '#4e463f');
    g.fillStyle = '#1b1b1b'; g.fillRect(10, 30, 236, 98);
    // placa
    g.fillStyle = col; g.fillRect(6, 4, 244, 28);
    g.fillStyle = '#fff6d8'; g.font = 'bold 22px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, 128, 19);
    // toldo listrado
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f5f0e6' : col; g.fillRect(8 + i * 15, 32, 15, 12); }
    // vitrine e porta
    g.fillStyle = rnd() < .5 ? '#3a4a55' : '#4b4030'; g.fillRect(16, 50, 150, 72);
    g.fillStyle = 'rgba(255,220,150,.55)'; g.fillRect(16, 50, 150, 72);
    g.fillStyle = '#d9d0b8'; g.fillRect(16, 84, 150, 3);
    for (let i = 0; i < 6; i++) { g.fillStyle = pick(['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#ecf0f1']); g.fillRect(rr(22, 150), rr(92, 112), 10, 12); }
    g.fillStyle = '#2b2018'; g.fillRect(180, 50, 52, 78); g.fillStyle = '#41505c'; g.fillRect(186, 56, 40, 34);
    noise(g, w, h, .1, 600);
  });
}
function shutterTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8b8f94'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = '#6f7378'; g.fillRect(0, y, w, 2); }
    noise(g, w, h, .2, 700);
  });
}
const TAGS = ['FRESH', 'DEF', 'BX84', 'KING', 'BOOM', 'JULIUS', 'CREW', 'RAD', 'WILD', 'BEAT', 'DOPE', 'TIO', 'FUNK', 'JAM', 'SUPER'];
function graffitiTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const word = pick(TAGS);
    const fill = pick(['#ff3b6b', '#22d3ee', '#facc15', '#a3e635', '#fb923c', '#c084fc', '#f472b6']);
    const fill2 = pick(['#ffffff', '#fde047', '#38bdf8', '#f97316']);
    g.save(); g.translate(128, 66); g.rotate(rr(-.12, .12));
    g.font = `bold ${word.length > 5 ? 50 : 64}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText(word, 4, 5);
    g.lineWidth = 9; g.strokeStyle = fill2; g.strokeText(word, 0, 0);
    const gr = g.createLinearGradient(0, -30, 0, 30); gr.addColorStop(0, fill); gr.addColorStop(1, shade(fill, -60));
    g.fillStyle = gr; g.fillText(word, 0, 0);
    g.restore();
    for (let i = 0; i < 7; i++) { g.fillStyle = fill; g.fillRect(rr(40, 210), rr(80, 96), 3, rr(8, 30)); } // escorridos
    for (let i = 0; i < 4; i++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(rr(30, 230), rr(20, 110), 3, 0, 7); g.fill(); }
  }, false);
}
function asphaltTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a3a3d'; g.fillRect(0, 0, w, h);
    noise(g, w, h, .18, 4000);
    for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(20,20,20,.5)'; g.lineWidth = 1; g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rr(-20, 20); y += rr(-20, 20); g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(25,25,28,.6)'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, rr(8, 30), rr(5, 15), rnd(), 0, 7); g.fill(); }
  });
}
function concreteTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9d9a92'; g.fillRect(0, 0, w, h); noise(g, w, h, .12, 1500);
    g.strokeStyle = '#7b7870'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    g.fillStyle = 'rgba(60,55,50,.25)'; g.beginPath(); g.arc(rr(20, 100), rr(20, 100), rr(3, 9), 0, 7); g.fill(); // chiclete
  });
}
function fenceTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#b9bec4'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
}
function courtTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4b5a4f'; g.fillRect(0, 0, w, h); noise(g, w, h, .15, 3000);
    g.strokeStyle = '#e8e2c8'; g.lineWidth = 5;
    g.strokeRect(30, 30, w - 60, h - 60); g.beginPath(); g.moveTo(30, h / 2); g.lineTo(w - 30, h / 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 50, 0, 7); g.stroke();
    for (const y of [30, h - 30]) { g.strokeRect(w / 2 - 60, y === 30 ? 30 : h - 170, 120, 140); g.beginPath(); g.arc(w / 2, y === 30 ? 170 : h - 170, 60, 0, 7); g.stroke(); }
  }, false);
}
export function glowTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}

// ---------- utilidades de geometria
function boxUV(w, h, d, bayW, bayH, x, y, z, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv; const nrm = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    let su = 1, sv = 1;
    if (ny > .5) { su = w / bayW; sv = d / bayW; }
    else if (nx > .5) { su = d / bayW; sv = h / bayH; }
    else { su = w / bayW; sv = h / bayH; }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}
function box(w, h, d, x, y, z, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; }
function cyl(rt, rb, h, x, y, z, seg = 8) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return g; }
function strip(geos) { return geos.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }); }
function merged(geos, mat, scene) {
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(strip(geos)), mat); m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m;
}

// ---------- construção
export function buildCity(scene) {
  const out = { steam: [], lampHeads: [], semaforos: [] };
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  // céu fim de tarde
  const sky = canvasTex(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#24205a'); gr.addColorStop(.45, '#7d4f8f'); gr.addColorStop(.72, '#f08a5d'); gr.addColorStop(.86, '#ffc47a'); gr.addColorStop(1, '#ffd9a0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  scene.background = sky;
  scene.fog = new THREE.Fog(0xe7a47a, 28, 115);

  // chão (asfalto)
  const asph = asphaltTex(); asph.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), lam({ map: asph }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  const facadeMats = [];
  for (let i = 0; i < 9; i++) facadeMats.push(lam({ map: facadeTex(pick(BRICKS), pick(['#d8cfb8', '#c9c2b0', '#e6dcc6', '#8d8577']), false) }));
  const litMats = []; for (let i = 0; i < 3; i++) litMats.push(lam({ map: facadeTex(pick(BRICKS), '#d8cfb8', true), emissive: new THREE.Color(0x553311) }));
  const shopMats = SHOPS.map(([n, c]) => lam({ map: shopTex(n, c) }));
  shopMats.forEach(m => m.userData.geos = []);
  facadeMats.concat(litMats).forEach(m => { m.userData.geos = []; });
  const shutterMat = lam({ map: shutterTex() }); shutterMat.userData.geos = [];
  const roofG = [], corniceG = [], ironG = [], stoopG = [], tankG = [], sideG = [], curbG = [], lineG = [], crossG = [], propRed = [], propMetal = [], propBlue = [], lampPoles = [], lampHeads = [], courtFence = [], courtPoles = [];
  const conc = concreteTex(); conc.repeat.set(1, 1);
  const grafMats = []; for (let i = 0; i < 10; i++) grafMats.push(new THREE.MeshLambertMaterial({ map: graffitiTex(), transparent: true, alphaTest: .05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const grafG = grafMats.map(() => []);

  const courtBlock = [1, 2]; // bloco com quadra de basquete
  const range = []; for (let i = -2; i <= N + 1; i++) range.push(i);

  for (const bi of range) for (const bj of range) {
    const x0 = nodePos(bi) + STREET / 2, z0 = nodePos(bj) + STREET / 2, x1 = x0 + BLOCK, z1 = z0 + BLOCK;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // calçada (laje) do quarteirão
    sideG.push(boxUV(BLOCK + 6, .16, BLOCK + 6, 3, 3, cx, .08, cz));
    curbG.push(box(BLOCK + 6.2, .17, .25, cx, .085, z0 - 3.05), box(BLOCK + 6.2, .17, .25, cx, .085, z1 + 3.05), box(.25, .17, BLOCK + 6.2, x0 - 3.05, .085, cz), box(.25, .17, BLOCK + 6.2, x1 + 3.05, .085, cz));
    const isCourt = bi === courtBlock[0] && bj === courtBlock[1];
    const far = bi < 0 || bj < 0 || bi >= N || bj >= N; // quarteirões de fundo: menos detalhe
    // 4 lados: fachada voltada para a rua
    const sides = [
      { ax: 'x', from: x0, to: x1, fixed: z0, out: -1 }, // norte (rua em z0)
      { ax: 'x', from: x0, to: x1, fixed: z1, out: 1 },
      { ax: 'z', from: z0 + 12, to: z1 - 12, fixed: x0, out: -1 },
      { ax: 'z', from: z0 + 12, to: z1 - 12, fixed: x1, out: 1 },
    ];
    for (const s of sides) {
      if (isCourt && s.out === -1) continue; // lado da quadra aberto
      let p = s.from;
      while (p < s.to - 3) {
        let w = Math.min(rr(6, 10), s.to - p); if (s.to - p - w < 4) w = s.to - p;
        const floors = Math.floor(rr(3, 6)), fh = 3.2, h = floors * fh + (rnd() < .3 ? 1.5 : 0);
        const d = 12, mid = p + w / 2;
        const rot = s.ax === 'x' ? 0 : Math.PI / 2;
        const bx = s.ax === 'x' ? mid : s.fixed - s.out * d / 2;
        const bz = s.ax === 'x' ? s.fixed - s.out * d / 2 : mid;
        const fx = (u) => s.ax === 'x' ? u : s.fixed + s.out * 0; // helper not used
        const lit = rnd() < .12;
        const fm = lit ? pick(litMats) : pick(facadeMats);
        const shop = rnd() < .42;
        const bodyH = shop ? h - 4 : h, bodyY = shop ? 4 + bodyH / 2 : h / 2;
        const ww = s.ax === 'x' ? w : d, dd = s.ax === 'x' ? d : w;
        fm.userData.geos.push(boxUV(ww, bodyH, dd, 3, fh, bx, bodyY, bz));
        // fachada frontal coordenadas
        const front = (off) => s.ax === 'x' ? [mid, s.fixed + s.out * off] : [s.fixed + s.out * off, mid];
        if (shop) {
          const sm = rnd() < .18 ? shutterMat : pick(shopMats);
          const g = new THREE.BoxGeometry(w, 4, d);
          // UV só na frente: deixa o resto pequeno
          const uv = g.attributes.uv, nr = g.attributes.normal;
          for (let i = 0; i < uv.count; i++) { const isFront = (s.ax === 'x' ? Math.abs(nr.getZ(i)) : Math.abs(nr.getX(i))) > .5; if (!isFront) uv.setXY(i, uv.getX(i) * .05, .5 + uv.getY(i) * .05); else if (sm === shutterMat) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * 1.3); }
          g.rotateY(rot); g.translate(bx, 2, bz); sm.userData.geos.push(g);
          // marquise
          const [ax_, az_] = front(.6); roofG.push(box(s.ax === 'x' ? w : 1.2, .15, s.ax === 'x' ? 1.2 : w, ax_, 3.8, az_));
        } else if (!far && rnd() < .8) {
          // escadinha da entrada (stoop)
          const sw = 1.8, off0 = rr(-w / 4, w / 4);
          for (let k = 0; k < 5; k++) {
            const depth = 1.15 - k * .21, hh = .25 * (k + 1);
            const c = s.ax === 'x' ? [mid + off0, s.fixed + s.out * depth / 2] : [s.fixed + s.out * depth / 2, mid + off0];
            stoopG.push(box(s.ax === 'x' ? sw : depth, hh, s.ax === 'x' ? depth : sw, c[0], hh / 2, c[1]));
          }
          const r1 = s.ax === 'x' ? [mid + off0 - sw / 2, s.fixed + s.out * .58] : [s.fixed + s.out * .58, mid + off0 - sw / 2];
          const r2 = s.ax === 'x' ? [mid + off0 + sw / 2, s.fixed + s.out * .58] : [s.fixed + s.out * .58, mid + off0 + sw / 2];
          for (const r of [r1, r2]) ironG.push(box(s.ax === 'x' ? .05 : 1.15, .05, s.ax === 'x' ? 1.15 : .05, r[0], 1.6, r[1]), box(.05, 1, .05, r[0], 1.1, r[1]));
        }
        // cornija e telhado
        corniceG.push(box(ww + .5, .5, dd + .5, bx, h + .25, bz));
        roofG.push(box(ww - .2, .1, dd - .2, bx, h + .52, bz));
        if (!far && rnd() < .22) { // caixa d'água
          const tx = bx + rr(-2, 2), tz = bz + rr(-2, 2), th = h + .5;
          tankG.push(cyl(1.3, 1.3, 2.4, tx, th + 2.6, tz, 10)); const cone = new THREE.ConeGeometry(1.45, 1, 10); cone.translate(tx, th + 4.3, tz); tankG.push(cone);
          for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tankG.push(box(.12, 1.4, .12, tx + a * .9, th + .7, tz + b * .9));
        }
        // escada de incêndio
        if (!far && floors >= 3 && rnd() < .45) {
          const ew = Math.min(w - 1.5, 4), ec = mid + rr(-(w - ew) / 2 + .3, (w - ew) / 2 - .3);
          for (let f = 1; f < floors; f++) {
            const y = f * fh + (shop ? 1 : 0) + .1;
            const pc = s.ax === 'x' ? [ec, s.fixed + s.out * .6] : [s.fixed + s.out * .6, ec];
            ironG.push(box(s.ax === 'x' ? ew : 1.2, .07, s.ax === 'x' ? 1.2 : ew, pc[0], y, pc[1]));
            const rc = s.ax === 'x' ? [ec, s.fixed + s.out * 1.18] : [s.fixed + s.out * 1.18, ec];
            ironG.push(box(s.ax === 'x' ? ew : .04, .04, s.ax === 'x' ? .04 : ew, rc[0], y + .9, rc[1]));
            for (let k = -1; k <= 1; k++) { const kc = s.ax === 'x' ? [ec + k * ew / 2, rc[1]] : [rc[0], ec + k * ew / 2]; ironG.push(box(.04, .9, .04, kc[0], y + .45, kc[1])); }
            // escada diagonal
            const lad = new THREE.BoxGeometry(.5, .06, 3.6);
            lad.rotateX(Math.atan2(fh, ew - .6) * 0); // simplificada
            const L = new THREE.BoxGeometry(ew * .85, .06, .5);
            L.rotateZ((f % 2 ? 1 : -1) * Math.atan2(fh, ew * .85));
            if (s.ax === 'z') L.rotateY(Math.PI / 2);
            const lc = s.ax === 'x' ? [ec, s.fixed + s.out * .85] : [s.fixed + s.out * .85, ec];
            L.translate(lc[0], y - fh / 2, lc[1]); if (f > 1) ironG.push(L);
          }
        }
        // grafite no térreo de alguns
        if (!far && !shop && rnd() < .35) {
          const k = Math.floor(rnd() * grafMats.length);
          const pl = new THREE.PlaneGeometry(Math.min(w - 1, 5), 2.5);
          const ang = s.ax === 'x' ? (s.out > 0 ? 0 : Math.PI) : (s.out > 0 ? Math.PI / 2 : -Math.PI / 2);
          pl.rotateY(ang);
          const gc = s.ax === 'x' ? [mid + rr(-w / 5, w / 5), s.fixed + s.out * .03] : [s.fixed + s.out * .03, mid + rr(-w / 5, w / 5)];
          pl.translate(gc[0], 1.7, gc[1]); grafG[k].push(pl);
        }
        p += w;
      }
    }
    if (isCourt) {
      const court = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 2, BLOCK / 2 + 6), lam({ map: courtTex() }));
      court.rotation.x = -Math.PI / 2; court.position.set(cx, .17, z0 + (BLOCK / 2 + 6) / 2 + .5); scene.add(court);
      // alambrado
      const ft = fenceTex(); ft.repeat.set(30, 4);
      const fmat = new THREE.MeshLambertMaterial({ map: ft, transparent: true, alphaTest: .3, side: THREE.DoubleSide });
      const fl = BLOCK - 1, fh2 = 4;
      for (const [w2, x2, z2, ry] of [[fl, cx, z0 + .5, 0], [fl / 2 + 6, x0 + .5, z0 + (fl / 2 + 6) / 2, Math.PI / 2], [fl / 2 + 6, x1 - .5, z0 + (fl / 2 + 6) / 2, Math.PI / 2]]) {
        const pg = new THREE.PlaneGeometry(w2, fh2); pg.rotateY(ry); pg.translate(x2, fh2 / 2 + .16, z2); courtFence.push(pg);
      }
      for (let k = 0; k <= 12; k++) courtPoles.push(cyl(.05, .05, 4.2, x0 + .5 + k * (fl / 12), 2.1, z0 + .5));
      // cestas
      for (const zz of [z0 + 3, z0 + BLOCK / 2 + 4]) {
        courtPoles.push(cyl(.1, .1, 3.6, cx, 1.8, zz + (zz === z0 + 3 ? -1 : 1)));
        propMetal.push(box(1.8, 1.1, .08, cx, 3.6, zz));
        const ring = new THREE.TorusGeometry(.25, .025, 6, 14); ring.rotateX(Math.PI / 2); ring.translate(cx, 3.15, zz + (zz === z0 + 3 ? .35 : -.35)); propRed.push(ring);
      }
      // muro grafitado ao fundo
      const wallG = boxUV(BLOCK - 4, 4.5, .4, 3, 3.2, cx, 2.25, z0 + BLOCK / 2 + 7);
      facadeMats[0].userData.geos.push(wallG);
      for (let k = 0; k < 4; k++) { const pl = new THREE.PlaneGeometry(6.5, 3.2); pl.rotateY(Math.PI); pl.translate(x0 + 5 + k * 8.5, 2.2, z0 + BLOCK / 2 + 6.78); grafG[(k * 3) % grafG.length].push(pl); }
    }
  }
  // ruas: faixas amarelas e faixas de pedestre
  const lo = nodePos(-2) - P / 2, hi = nodePos(N + 2) + P / 2;
  for (let i = -2; i <= N + 2; i++) {
    const c = nodePos(i);
    for (let t = lo; t < hi; t += 5) {
      const near = range.concat([N + 2]).some(k => Math.abs(t + 1.5 - nodePos(k)) < STREET / 2 + 1);
      if (near) continue;
      lineG.push(box(.14, .02, 3, c - .12, .015, t + 1.5), box(.14, .02, 3, c + .12, .015, t + 1.5));
      lineG.push(box(3, .02, .14, t + 1.5, .015, c - .12), box(3, .02, .14, t + 1.5, .015, c + .12));
    }
  }
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const X = nodePos(i), Z = nodePos(j);
    for (let k = -3; k <= 3; k++) {
      crossG.push(box(.5, .02, 2, X + k * 1.05, .016, Z - 5.2), box(.5, .02, 2, X + k * 1.05, .016, Z + 5.2));
      crossG.push(box(2, .02, .5, X - 5.2, .016, Z + k * 1.05), box(2, .02, .5, X + 5.2, .016, Z + k * 1.05));
    }
    // postes nas esquinas
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = X + sx * (ROAD_HALF + .3), pz = Z + sz * (STREET / 2 + 1.2);
      lampPoles.push(cyl(.09, .12, 6.5, px, 3.25, pz, 6), box(1.6, .08, .08, px - sx * .8, 6.4, pz));
      const head = box(.6, .2, .35, px - sx * 1.5, 6.3, pz); lampHeads.push(head);
      out.lampHeads.push(new THREE.Vector3(px - sx * 1.5, 6.15, pz));
    }
    // semáforos (dois por cruzamento)
    for (const [sx, sz, axis] of [[-1, -1, 0], [1, 1, 1]]) {
      const px = X + sx * (ROAD_HALF + .3), pz = Z + sz * (ROAD_HALF + .3);
      lampPoles.push(cyl(.07, .07, 3.4, px, 1.7, pz, 6));
      lampPoles.push(box(.38, 1.05, .32, px, 3.6, pz));
      out.semaforos.push({ x: px, z: pz, axis, face: axis ? [0, -sz] : [-sx, 0] });
    }
    // hidrante, lixeira, caixa azul
    const hx = X + (ROAD_HALF + .3), hz = Z - STREET / 2 - 6;
    propRed.push(cyl(.17, .2, .7, hx, .5, hz, 8), cyl(.12, .12, .2, hx, .95, hz, 8), box(.5, .1, .1, hx, .65, hz));
    const tx = X - (SIDEWALK_OUT - .5), tz = Z + STREET / 2 + 7;
    propMetal.push(cyl(.32, .28, .95, tx, .64, tz, 10), cyl(.35, .35, .08, tx, 1.14, tz, 10));
    if ((i + j) % 2 === 0) propBlue.push(box(.55, 1.1, .5, X + (SIDEWALK_OUT - .45), .7, Z + STREET / 2 + 4), cyl(.28, .28, .55, X + (SIDEWALK_OUT - .45), 1.25, Z + STREET / 2 + 4));
    out.steam.push(new THREE.Vector3(X + rr(-2, 2), .1, Z + rr(-2, 2)));
  }

  merged(sideG, lam({ map: conc }), scene);
  merged(curbG, lam({ color: 0x86837c }), scene);
  merged(lineG, lam({ color: 0xd9b23a }), scene);
  merged(crossG, lam({ color: 0xd9d6cc }), scene);
  for (const m of facadeMats.concat(litMats, shopMats, [shutterMat])) merged(m.userData.geos, m, scene);
  merged(corniceG, lam({ color: 0x5b4c42 }), scene);
  merged(roofG, lam({ color: 0x3b3735 }), scene);
  merged(ironG, lam({ color: 0x1d1d1f }), scene);
  merged(stoopG, lam({ color: 0x6e5446 }), scene);
  merged(tankG, lam({ color: 0x6b4b33 }), scene);
  merged(propRed, lam({ color: 0xb3261e }), scene);
  merged(propMetal, lam({ color: 0x7c8186 }), scene);
  merged(propBlue, lam({ color: 0x1f4e8c }), scene);
  merged(lampPoles, lam({ color: 0x2f3a33 }), scene);
  merged(lampHeads, new THREE.MeshBasicMaterial({ color: 0xffd38a }), scene);
  merged(courtPoles, lam({ color: 0x5a5f63 }), scene);
  if (courtFence.length) { const ft = fenceTex(); ft.repeat.set(24, 4); merged(courtFence, new THREE.MeshLambertMaterial({ map: ft, transparent: true, alphaTest: .3, side: THREE.DoubleSide }), scene); }
  grafMats.forEach((m, k) => merged(grafG[k], m, scene));

  // brilho dos postes
  const gt = glowTex();
  const lg = new THREE.BufferGeometry().setFromPoints(out.lampHeads);
  const lamps = new THREE.Points(lg, new THREE.PointsMaterial({ map: gt, color: 0xffc070, size: 3, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55, fog: true }));
  lamps.matrixAutoUpdate = false; scene.add(lamps);
  // lâmpadas dos semáforos (instanciadas, cor muda com o tempo)
  const bulbGeo = new THREE.SphereGeometry(.1, 8, 6);
  const nB = out.semaforos.length * 3;
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), nB);
  const m4 = new THREE.Matrix4();
  out.semaforos.forEach((s, k) => {
    for (let b = 0; b < 3; b++) {
      const off = .17;
      // as luzes ficam nos dois lados da caixa (dá para ver de qualquer rua)
      m4.makeTranslation(s.x + (s.axis ? 0 : 0), 3.95 - b * .33, s.z); bulbs.setMatrixAt(k * 3 + b, m4.multiply(new THREE.Matrix4().makeScale(2.1, 1, 2.1)));
    }
  });
  scene.add(bulbs);
  const OFFC = [new THREE.Color(0x3a1010), new THREE.Color(0x3a3010), new THREE.Color(0x103a18)];
  const ONC = [new THREE.Color(0xff3020), new THREE.Color(0xffc020), new THREE.Color(0x30ff60)];
  let fase = -1;
  out.atualizaSemaforos = (t) => {
    const ciclo = t % 20, f = ciclo < 8 ? 0 : ciclo < 10 ? 1 : ciclo < 18 ? 2 : 3; // 0: eixo x verde, 1 amarelo, 2: eixo z verde, 3 amarelo
    if (f === fase) return; fase = f;
    out.semaforos.forEach((s, k) => {
      const verde = (s.axis === 0 && f === 0) || (s.axis === 1 && f === 2);
      const amarelo = (s.axis === 0 && f === 1) || (s.axis === 1 && f === 3);
      const acesa = verde ? 2 : amarelo ? 1 : 0;
      for (let b = 0; b < 3; b++) bulbs.setColorAt(k * 3 + b, b === acesa ? ONC[b] : OFFC[b]);
    });
    bulbs.instanceColor.needsUpdate = true;
  };
  out.atualizaSemaforos(0);
  return out;
}

// ---------- carros anos 80 (instanciados)
export function buildCars(scene, count) {
  const parts = [];
  const body = new THREE.BoxGeometry(4.6, .7, 1.9); body.translate(0, .65, 0);
  const cabin = new THREE.BoxGeometry(2.5, .6, 1.75); cabin.translate(-.25, 1.3, 0);
  const glass = new THREE.BoxGeometry(2.3, .45, 1.8); glass.translate(-.25, 1.3, 0);
  const bump = mergeGeometries([box(.15, .25, 1.95, 2.33, .45, 0), box(.15, .25, 1.95, -2.33, .45, 0)]);
  const wheelOne = new THREE.CylinderGeometry(.36, .36, .28, 10); wheelOne.rotateX(Math.PI / 2);
  const wheels = mergeGeometries([[1.45, .9], [1.45, -.9], [-1.45, .9], [-1.45, -.9]].map(([x, z]) => wheelOne.clone().translate(x, .36, z)));
  const lights = mergeGeometries([box(.06, .16, .4, 2.31, .75, .65), box(.06, .16, .4, 2.31, .75, -.65)]);
  const mk = (g, m) => { const im = new THREE.InstancedMesh(g, m, count); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); parts.push(im); return im; };
  const bodyM = mk(body, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  mk(cabin, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  mk(glass, new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
  mk(bump, new THREE.MeshLambertMaterial({ color: 0xc9ccd0 }));
  mk(wheels, new THREE.MeshLambertMaterial({ color: 0x151515 }));
  mk(lights, new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
  const colors = [0x7a2e1f, 0x8a6d3b, 0x2f4f4f, 0x5b2333, 0xd8cba5, 0x3c5a7a, 0x704214, 0x9c2a2a, 0x2d5e3e, 0xb08d57, 0x46464a, 0x1f3a5f];
  for (let i = 0; i < count; i++) {
    const c = new THREE.Color(pick(colors));
    parts[0].setColorAt(i, c); parts[1].setColorAt(i, i % 3 === 0 ? new THREE.Color(0xe8e2d0) : c);
  }
  parts[0].instanceColor.needsUpdate = true; parts[1].instanceColor.needsUpdate = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3();
  return {
    set(i, x, z, yaw) { q.setFromAxisAngle(up, yaw); m4.compose(pv.set(x, 0, z), q, s); for (const p of parts) p.setMatrixAt(i, m4); },
    commit() { for (const p of parts) p.instanceMatrix.needsUpdate = true; },
  };
}
