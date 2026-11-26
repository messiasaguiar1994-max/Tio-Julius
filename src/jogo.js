import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildCity, buildCars, nodePos, N, P, STREET, rnd, glowTex } from './cidade.js';

// ---------------- configuração (URL > localStorage)
const qs = new URLSearchParams(location.search);
let salvo = {}; try { salvo = JSON.parse(localStorage.getItem('tioJulius') || '{}'); } catch { }
const CFG = {
  usuario: (qs.get('user') || salvo.usuario || '').replace(/^@/, ''),
  voz: qs.get('voz') || salvo.voz || '',
  auto: qs.get('auto') === '1',
  demo: qs.get('demo') === '1',
};

// ---------------- render
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let escala = 1; renderer.setPixelRatio(escala);
// tela sempre vertical 9:16 (TikTok), centralizada; o resto fica preto
const palco = document.getElementById('palco');
let SW = 0, SH = 0;
function medePalco() {
  SH = innerHeight; SW = Math.round(SH * 9 / 16);
  if (SW > innerWidth) { SW = innerWidth; SH = Math.round(SW * 16 / 9); }
  palco.style.width = SW + 'px'; palco.style.height = SH + 'px'; palco.style.setProperty('--u', (SW / 100) + 'px');
}
medePalco();
renderer.setSize(SW, SH);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.getElementById('cena').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 9 / 16, .1, 130);
addEventListener('resize', () => { medePalco(); renderer.setSize(SW, SH); bw = 0; });

scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4a5a, 1.6));
const sun = new THREE.DirectionalLight(0xffb070, 2.2); sun.position.set(-60, 45, -30); scene.add(sun);

const city = buildCity(scene);

// ---------------- rotas (grafo das esquinas)
const OFF = 5.4; // distância da calçada ao eixo da rua (tio)
const OFF_NPC = 4.75; // pedestres andam mais perto do meio-fio
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function makeWalker(off, startI, startJ) {
  return { i: startI, j: startJ, d: [1, 0], pts: [], off };
}
function nextSegment(w, avoidBack = true) {
  const opts = dirs.filter(([dx, dz]) => {
    const ni = w.i + dx, nj = w.j + dz;
    if (ni < 0 || nj < 0 || ni > N || nj > N) return false;
    if (avoidBack && dx === -w.d[0] && dz === -w.d[1]) return false;
    return true;
  });
  let nd = opts.find(o => o[0] === w.d[0] && o[1] === w.d[1]);
  if (!nd || rnd() < .45) nd = opts[Math.floor(rnd() * opts.length)];
  const prev = w.d, off = w.off, ins = Math.abs(off);
  const A = new THREE.Vector2(nodePos(w.i), nodePos(w.j));
  const d = new THREE.Vector2(nd[0], nd[1]);
  const r = new THREE.Vector2(-d.y, d.x); // direita (x,z)
  const pr = new THREE.Vector2(-prev[1], prev[0]), pd = new THREE.Vector2(prev[0], prev[1]);
  const esquerda = prev[0] === -nd[1] && prev[1] === nd[0], direita = nd[0] === -prev[1] && nd[1] === prev[0];
  // virando para o lado oposto da calçada: atravessa primeiro em frente, depois para o lado
  if (w.pts.length && ((off > 0 && esquerda) || (off < 0 && direita))) w.pts.push(A.clone().addScaledVector(pr, off).addScaledVector(pd, ins));
  w.pts.push(A.clone().addScaledVector(r, off).addScaledVector(d, ins));
  w.i += nd[0]; w.j += nd[1]; w.d = nd;
  const B = new THREE.Vector2(nodePos(w.i), nodePos(w.j));
  w.pts.push(B.clone().addScaledVector(r, off).addScaledVector(d, -ins));
}

// ---------------- tio
const tio = { obj: null, mixer: null, acts: {}, pos: new THREE.Vector3(), yaw: 0, speed: 0, walker: makeWalker(OFF, 1, 1), estado: 'andar', fimDanca: 0, cabeca: null, falando: false, topo: 1.9 };
let pronto = false;
new GLTFLoader().load(window.MODELO || 'models/tio.glb', (g) => {
  const root = g.scene;
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.metalness = 0; o.material.roughness = .85; } } if (o.isBone && /Head$/.test(o.name)) tio.cabeca = o; });
  // escala para 1,78 m
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const h = box.max.y - box.min.y; const s = 1.78 / h;
  const holder = new THREE.Group(); root.scale.multiplyScalar(s); root.position.y = -box.min.y * s; holder.add(root);
  scene.add(holder); tio.obj = holder;
  tio.mixer = new THREE.AnimationMixer(root);
  let armScale = 1; root.traverse(o => { if (o.name === 'Armature') armScale = o.scale.x; });
  for (const clip of g.animations) {
    // andar no lugar: o quadril anda para a frente no eixo 1 (e de lado no 0) — trava os dois e deixa só o sobe-e-desce (eixo 2)
    if (/^(andar|virar)/.test(clip.name)) for (const tr of clip.tracks) if (/Hips\.position$/.test(tr.name)) {
      const v = tr.values, n = v.length;
      if (clip.name === 'andar') tio.passo = Math.abs(v[n - 2] - v[1]) * armScale * s / clip.duration; // metros por segundo dos pés
      for (let k = 0; k < n; k += 3) { v[k] = v[0]; v[k + 1] = v[1]; }
    }
    const a = tio.mixer.clipAction(clip); tio.acts[clip.name] = a;
  }
  console.log('velocidade dos pés', tio.passo);
  tio.acts.andar.play();
  // sombra redonda
  const sh = new THREE.Mesh(new THREE.CircleGeometry(.55, 20), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: .45, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = .18; holder.add(sh);
  // começa
  nextSegment(tio.walker, false); nextSegment(tio.walker);
  const p0 = tio.walker.pts.shift(); tio.pos.set(p0.x, .16, p0.y);
  const p1 = tio.walker.pts[0]; tio.yaw = Math.atan2(p1.x - p0.x, p1.y - p0.y);
  pronto = true;
  document.getElementById('carregando').style.display = 'none';
});

function trocar(nome, fade = .4) {
  const novo = tio.acts[nome]; if (!novo) return;
  for (const [k, a] of Object.entries(tio.acts)) if (k !== nome && a.isRunning()) a.fadeOut(fade);
  novo.reset().setEffectiveWeight(1).fadeIn(fade).play();
}
export function dancar(seg = 6) {
  if (!pronto || tio.estado === 'danca') return;
  tio.estado = 'danca'; tio.fimDanca = performance.now() + seg * 1000;
  trocar(rnd() < .5 ? 'danca1' : 'danca2', .5);
}


// ---------------- pedestres (vida urbana)
const npcs = [];
const NPC_N = 14;
const ROUPAS = [0xd63a2f, 0x7f9a3a, 0x9c6b3e, 0xa8a8a8, 0x6aa0e0, 0xb03060, 0xe0b040, 0x3a3a3a, 0x3fa39b, 0xe8dcc0, 0xb070c0, 0xe07a2a];
const PELES = [[1, 1, 1], [1.25, 1.18, 1.1], [1.55, 1.42, 1.3], [1.8, 1.62, 1.45], [.85, .85, .85]];
function recolorTex(img, roupa, pele) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  const rc = new THREE.Color(roupa); const R = rc.r * 255, G = rc.g * 255, B = rc.b * 255;
  // brilho médio do tecido azul, para manter as dobras e sombras com a cor nova bem visível
  let soma = 0, cont = 0;
  for (let i = 0; i < p.length; i += 16) { const r = p[i], gg = p[i + 1], b = p[i + 2]; if (b > r + 12 && b > gg) { soma += (r + gg + b) / 3; cont++; } }
  const media = cont ? soma / cont : 60;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gg = p[i + 1], b = p[i + 2];
    if (b > r + 12 && b > gg) { // tecido azul-marinho
      const L = Math.min(1.6, (r + gg + b) / 3 / media) * 1.15;
      p[i] = Math.min(255, R * L); p[i + 1] = Math.min(255, G * L); p[i + 2] = Math.min(255, B * L);
    } else if (r > b + 18 && r >= gg) { // pele
      p[i] = Math.min(255, r * pele[0]); p[i + 1] = Math.min(255, gg * pele[1]); p[i + 2] = Math.min(255, b * pele[2]);
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}
function nodeNear() {
  const w = tio.walker; const i = Math.max(0, Math.min(N, w.i + Math.floor(rnd() * 5) - 2)), j = Math.max(0, Math.min(N, w.j + Math.floor(rnd() * 5) - 2));
  return [i, j];
}
function spawnNpc(n) {
  const tw = tio.walker, modo = rnd();
  let i, j, d, off;
  if (modo < .7 && tw.d) {
    // na mesma rua do tio, vindo na direção dele (metade na calçada dele, metade na da frente)
    i = tw.i; j = tw.j; d = [-tw.d[0], -tw.d[1]]; off = rnd() < .5 ? -OFF_NPC : OFF_NPC;
  } else {
    [i, j] = nodeNear(); d = dirs[Math.floor(rnd() * 4)]; off = rnd() < .5 ? -OFF_NPC : OFF_NPC;
  }
  n.walker = makeWalker(off, i, j); n.walker.d = d;
  // primeiro trecho: sai do nó na direção d (sem sortear)
  const A = new THREE.Vector2(nodePos(i), nodePos(j)), dv = new THREE.Vector2(d[0], d[1]), r = new THREE.Vector2(-dv.y, dv.x), ins = Math.abs(off);
  const ni = i + d[0], nj = j + d[1];
  if (ni < 0 || nj < 0 || ni > N || nj > N) { nextSegment(n.walker, false); nextSegment(n.walker); }
  else {
    n.walker.pts.push(A.clone().addScaledVector(r, off).addScaledVector(dv, ins));
    n.walker.i = ni; n.walker.j = nj;
    n.walker.pts.push(new THREE.Vector2(nodePos(ni), nodePos(nj)).addScaledVector(r, off).addScaledVector(dv, -ins));
    nextSegment(n.walker);
  }
  const p = n.walker.pts.shift(); n.pos.set(p.x, .16, p.y);
  const q = n.walker.pts[0], f = rnd() * .7; n.pos.x += (q.x - p.x) * f; n.pos.z += (q.y - p.y) * f;
  n.yaw = Math.atan2(q.x - p.x, q.y - p.y);
}
new GLTFLoader().load(window.MODELO_NPC || 'models/npc.glb', (g) => {
  const base = g.scene; base.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(base, true); const h0 = box.max.y - box.min.y;
  let armScale = 1; base.traverse(o => { if (o.name === 'Armature') armScale = o.scale.x; });
  const clip = g.animations[0]; let passo = 1.5;
  for (const tr of clip.tracks) if (/Hips\.position$/.test(tr.name)) { const v = tr.values, n = v.length; passo = Math.abs(v[n - 2] - v[1]) * armScale / h0 / clip.duration; for (let k = 0; k < n; k += 3) { v[k] = v[0]; v[k + 1] = v[1]; } }
  let srcMat = null; base.traverse(o => { if (o.isMesh) srcMat = o.material; });
  const img = srcMat.map.image;
  const texs = []; for (let k = 0; k < 10; k++) texs.push(recolorTex(img, ROUPAS[(k * 5) % ROUPAS.length], PELES[k % PELES.length]));
  const sombra = new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: .35, depthWrite: false });
  const sGeo = new THREE.CircleGeometry(.45, 16);
  for (let k = 0; k < NPC_N; k++) {
    const m = cloneSkinned(base);
    const altura = 1.6 + rnd() * .3, s = altura / h0, larg = .9 + rnd() * .25;
    const mat = srcMat.clone(); mat.map = texs[k % texs.length]; mat.metalness = 0; mat.roughness = .9;
    m.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } });
    m.scale.set(s * larg, s, s * larg); m.position.y = -box.min.y * s;
    const holder = new THREE.Group(); holder.add(m);
    const sh = new THREE.Mesh(sGeo, sombra); sh.rotation.x = -Math.PI / 2; sh.position.y = .18; holder.add(sh);
    scene.add(holder);
    const mixer = new THREE.AnimationMixer(m); const a = mixer.clipAction(clip); a.play(); a.time = rnd() * clip.duration;
    const vel = passo * altura * (.92 + rnd() * .1);
    const n = { obj: holder, mixer, act: a, vel, pos: new THREE.Vector3(), yaw: 0, walker: null };
    spawnNpc(n); npcs.push(n);
  }
});
function atualizaNpcs(dt) {
  for (const n of npcs) {
    const w = n.walker;
    while (w.pts.length < 4) nextSegment(w);
    const t = w.pts[0], dx = t.x - n.pos.x, dz = t.y - n.pos.z;
    if (Math.hypot(dx, dz) < .6) w.pts.shift();
    let dy = Math.atan2(dx, dz) - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    n.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 2.4 * dt);
    let v = n.vel * (1 - Math.min(.5, Math.abs(dy) / 2));
    // não esbarra no tio: espera um instante se ele estiver logo à frente
    const fx = n.pos.x + Math.sin(n.yaw) * .9, fz = n.pos.z + Math.cos(n.yaw) * .9;
    if (Math.hypot(fx - tio.pos.x, fz - tio.pos.z) < .75) v *= .2;
    n.pos.x += Math.sin(n.yaw) * v * dt; n.pos.z += Math.cos(n.yaw) * v * dt;
    n.act.timeScale = v / n.vel;
    // longe demais do tio: reaparece perto (fora da câmera)
    const dist = Math.hypot(n.pos.x - tio.pos.x, n.pos.z - tio.pos.z);
    if (dist > 55) { spawnNpc(n); const d2 = Math.hypot(n.pos.x - camera.position.x, n.pos.z - camera.position.z); if (d2 < 12) spawnNpc(n); }
    let visivel = dist < 60;
    if (visivel && Math.hypot(n.pos.x - camera.position.x, n.pos.z - camera.position.z) < 1.8) visivel = false; // não atravessa a lente
    n.obj.visible = visivel;
    if (visivel) { n.mixer.update(dt); n.obj.position.copy(n.pos); n.obj.rotation.y = n.yaw; }
  }
}

// ---------------- pombos (bando atravessando o céu)
const BIRDS = 9;
const birdGeo = new THREE.BufferGeometry();
birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .12, -.45, .12, -.05, 0, 0, -.18, 0, 0, .12, 0, 0, -.18, .45, .12, -.05], 3));
birdGeo.computeVertexNormals();
const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x2a2630, side: THREE.DoubleSide }), BIRDS);
birds.frustumCulled = false; scene.add(birds);
const bando = { t: 99, dur: 14, o: new THREE.Vector3(), d: new THREE.Vector3(), offs: [] };
for (let k = 0; k < BIRDS; k++) bando.offs.push([(rnd() - .5) * 6, (rnd() - .5) * 2, (rnd() - .5) * 6, rnd() * 6]);
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function atualizaPombos(dt) {
  bando.t += dt;
  if (bando.t > bando.dur + 10) { // novo voo a cada ~24 s
    bando.t = 0; const a = rnd() * Math.PI * 2;
    bando.d.set(Math.cos(a), 0, Math.sin(a));
    bando.o.copy(tio.pos).addScaledVector(bando.d, -60); bando.o.y = 14 + rnd() * 8;
  }
  const yaw = Math.atan2(bando.d.x, bando.d.z);
  for (let k = 0; k < BIRDS; k++) {
    const o = bando.offs[k];
    _bp.copy(bando.o).addScaledVector(bando.d, bando.t * 9); _bp.x += o[0]; _bp.y += o[1] + Math.sin(bando.t * 1.5 + o[3]) * .5; _bp.z += o[2];
    const flap = Math.sin(bando.t * 14 + o[3]);
    _bq.setFromAxisAngle(_up, yaw); _bs.set(1, flap, 1);
    _bm.compose(_bp, _bq, _bs); birds.setMatrixAt(k, _bm);
  }
  birds.instanceMatrix.needsUpdate = true;
  birds.visible = bando.t < bando.dur;
}

// ---------------- carros
const PARK = 30, MOV = 12;
const cars = buildCars(scene, PARK + MOV);
let ci = 0;
for (let i = 0; i <= N && ci < PARK; i++) for (let j = 0; j <= N && ci < PARK; j++) {
  if (rnd() < .4) continue;
  const horiz = rnd() < .5, side = rnd() < .5 ? 1 : -1, t = (rnd() - .5) * (P - STREET - 14);
  const X = nodePos(i) + (horiz ? P / 2 + t : side * 3.15), Z = nodePos(j) + (horiz ? side * 3.15 : P / 2 + t);
  if (Math.abs(X) > nodePos(N) || Math.abs(Z) > nodePos(N)) continue;
  cars.set(ci++, X, Z, horiz ? 0 : Math.PI / 2);
}
for (; ci < PARK; ci++) cars.set(ci, 999, 999, 0);
const movers = [];
for (let k = 0; k < MOV; k++) {
  const w = makeWalker(1.25, Math.floor(rnd() * (N + 1)), Math.floor(rnd() * (N + 1)));
  nextSegment(w, false); nextSegment(w);
  const p = w.pts.shift();
  movers.push({ w, x: p.x, z: p.y, yaw: 0, v: 7 + rnd() * 3 });
}

// ---------------- vapor dos bueiros
const PUFF = 3, puffN = city.steam.length * PUFF;
const puffPos = new Float32Array(puffN * 3), puffCol = new Float32Array(puffN * 3), puffT = new Float32Array(puffN);
for (let k = 0; k < puffN; k++) puffT[k] = rnd() * 4;
const puffGeo = new THREE.BufferGeometry();
puffGeo.setAttribute('position', new THREE.BufferAttribute(puffPos, 3)); puffGeo.setAttribute('color', new THREE.BufferAttribute(puffCol, 3));
const puffs = new THREE.Points(puffGeo, new THREE.PointsMaterial({ map: glowTex(), size: 2.6, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
puffs.frustumCulled = false; scene.add(puffs);

// ---------------- câmera
const camModos = ['atras', 'lado', 'frente', 'atras', 'alto', 'lado'];
let camIdx = 0, camTroca = 0, camForce = null;
const camPos = new THREE.Vector3(0, 5, 10), camLook = new THREE.Vector3();
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _h = new THREE.Vector3(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
const CAMS = { // [frente, direita, altura] da câmera ; [frente, altura] do alvo
  atras: [-4.2, -1.2, 2.4, 2, 1.6], lado: [1.2, -4.8, 1.7, 0, 1.4], frente: [3.6, -.9, 1.75, 0, 1.5],
  alto: [-7, -6, 11, 3, 0], danca: [3.2, -2.2, 1.5, 0, 1.1] };
// impede a câmera de entrar nos prédios: fica sempre no corredor da rua
function naRua(v) {
  const lx = ((v.x - nodePos(0)) % P + P) % P, lz = ((v.z - nodePos(0)) % P + P) % P;
  const dx = Math.min(lx, P - lx), dz = Math.min(lz, P - lz), lim = 6.3;
  if (dx > lim && dz > lim) {
    if (dx - lim < dz - lim) v.x += (lx < P / 2 ? -1 : 1) * (dx - lim);
    else v.z += (lz < P / 2 ? -1 : 1) * (dz - lim);
  }
  return v;
}
function alvoCamera(modo) {
  const c = CAMS[modo];
  _f.set(Math.sin(tio.yaw), 0, Math.cos(tio.yaw)); _r.set(-_f.z, 0, _f.x);
  _cp.copy(tio.pos).addScaledVector(_f, c[0]).addScaledVector(_r, c[1]); _cp.y += c[2];
  _cl.copy(tio.pos).addScaledVector(_f, c[3]); _cl.y += c[4];
  naRua(_cp);
  // se a parede empurrou a câmera para perto demais, sobe um pouco para enxergar por cima
  const dh = Math.hypot(_cp.x - tio.pos.x, _cp.z - tio.pos.z);
  if (dh < 3.2 && modo !== 'frente') _cp.y += (3.2 - dh) * 1.2;
  return [_cp, _cl];
}

// ---------------- balão de fala
const balao = document.getElementById('balao');
const bFoto = document.getElementById('b-foto'), bNome = document.getElementById('b-nome'), bPerg = document.getElementById('b-perg'), bResp = document.getElementById('b-resp');
const tmpV = new THREE.Vector3(); let bw = 0, bh = 0, bx = -1, by = -1;
function posicionaBalao() {
  if (!tio.obj || balao.style.display === 'none') return;
  tmpV.copy(tio.pos); tmpV.y += 2.0; tmpV.project(camera);
  let x = (tmpV.x * .5 + .5) * SW, y = (-tmpV.y * .5 + .5) * SH - 18; // ponta do balão acima da cabeça
  if (!bw) { bw = balao.offsetWidth; bh = balao.offsetHeight; }
  x = Math.max(bw / 2 + 8, Math.min(SW - bw / 2 - 8, x));
  y = Math.max(bh + SH * .07, Math.min(SH * .55, y));
  x = Math.round(x - bw / 2); y = Math.round(y - bh);
  if (x !== bx || y !== by) { bx = x; by = y; balao.style.transform = `translate(${x}px, ${y}px)`; }
}

// fila de falas
const fila = []; let tocando = false;
const audioEl = new Audio(); let actx = null;
audioEl.crossOrigin = 'anonymous';
// amplificador da voz: ?volume=2 (padrão) — 1 = normal, 3 = bem alto
const GANHO = Math.max(.2, Math.min(5, parseFloat(qs.get('volume') || '2.2')));
let amplificado = false;
async function amplifica() {
  if (amplificado) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state !== 'running') { try { await Promise.race([actx.resume(), new Promise(r => setTimeout(r, 300))]); } catch { } }
    if (actx.state !== 'running') return; // sem permissão de áudio: toca normal, sem amplificar
    amplificado = true;
    const src = actx.createMediaElementSource(audioEl);
    const g = actx.createGain(); g.gain.value = GANHO;
    const comp = actx.createDynamicsCompressor(); // segura os picos para não estourar
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .15;
    src.connect(g); g.connect(comp); comp.connect(actx.destination);
  } catch (e) { relata('amplificador falhou: ' + e.message); }
}
function relata(t) { console.warn(t); try { window.__sock && window.__sock.emit('log', t); } catch { } }
export function receberFala(f) { fila.push(f); if (f.tipo === 'presente') dancar(7); tocarProxima(); }
async function tocarProxima() {
  if (tocando || !fila.length) return;
  tocando = true;
  const f = fila.shift();
  bFoto.src = f.foto || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#f59e0b"/><text x="20" y="27" font-size="20" text-anchor="middle" fill="#fff" font-family="Arial">' + (f.nome || '?')[0].toUpperCase() + '</text></svg>');
  bNome.textContent = f.nome ? '@' + f.nome : '';
  bPerg.textContent = f.pergunta || (f.tipo === 'chegada' ? 'chegou na live 👋' : '');
  bPerg.style.display = bPerg.textContent ? 'block' : 'none';
  bResp.textContent = '';
  const comBalao = f.tipo !== 'monologo'; // falando sozinho: só a voz, sem balão
  if (comBalao) { balao.style.display = 'block'; bw = 0; balao.classList.remove('sai'); void balao.offsetWidth; balao.classList.add('entra'); }
  tio.falando = true; camForce = tio.estado === 'danca' ? null : 'frente';
  const texto = f.resposta;
  let dur = Math.max(2.5, texto.length / 14);
  let fim;
  const done = new Promise(res => fim = res);
  let tocou = false;
  if (f.audio) {
    // 1º jeito: elemento de áudio
    try {
      audioEl.src = f.audio; audioEl.volume = 1;
      await amplifica();
      await audioEl.play(); tocou = true;
      audioEl.onended = () => fim(); audioEl.onerror = () => fim();
      await new Promise(r => { if (isFinite(audioEl.duration)) r(); else audioEl.onloadedmetadata = r; setTimeout(r, 800); });
      if (isFinite(audioEl.duration)) dur = audioEl.duration;
    } catch (e) { relata('áudio 1 falhou: ' + (e && (e.name + ' ' + e.message))); }
    // 2º jeito: Web Audio (mais compatível com o OBS)
    if (!tocou) {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state !== 'running') await actx.resume();
        const buf = await (await fetch(f.audio)).arrayBuffer();
        const ab = await actx.decodeAudioData(buf);
        const src = actx.createBufferSource(); src.buffer = ab; const g2 = actx.createGain(); g2.gain.value = GANHO; src.connect(g2); g2.connect(actx.destination);
        src.onended = () => fim(); src.start(); tocou = true; dur = ab.duration;
        relata('áudio tocado pelo 2º jeito (Web Audio), estado: ' + actx.state);
      } catch (e) { relata('áudio 2 falhou: ' + (e && (e.name + ' ' + e.message))); }
    }
  }
  if (!tocou && !f.audio && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(texto); u.lang = 'pt-BR'; u.rate = 1.02; u.pitch = .8;
    const v = speechSynthesis.getVoices().find(v => /pt[-_]BR/i.test(v.lang) && /male|antonio|daniel|ricardo|homem/i.test(v.name)) || speechSynthesis.getVoices().find(v => /pt/i.test(v.lang));
    if (v) u.voice = v;
    u.onend = () => fim(); u.onerror = () => fim();
    speechSynthesis.speak(u); tocou = true;
  }
  // texto aparecendo junto com a fala
  const t0 = performance.now();
  let ultimo = -1; const tick = () => { const k = Math.min(1, (performance.now() - t0) / (dur * 1000 * .92)); const nn = Math.ceil(texto.length * k); if (nn !== ultimo) { ultimo = nn; bResp.textContent = texto.slice(0, nn); bw = 0; } if (k < 1 && tio.falando) requestAnimationFrame(tick); };
  tick();
  const limite = new Promise(r => setTimeout(r, (dur + 6) * 1000));
  if (!tocou) setTimeout(() => fim(), dur * 1000);
  const minimo = new Promise(r => setTimeout(r, Math.max(2500, texto.length / 15 * 1000)));
  await Promise.race([Promise.all([done, minimo]), limite]);
  bResp.textContent = texto;
  await new Promise(r => setTimeout(r, 1400));
  if (comBalao) {
    balao.classList.remove('entra'); balao.classList.add('sai');
    await new Promise(r => setTimeout(r, 350));
    balao.style.display = 'none';
  }
  tio.falando = false; camForce = null; camTroca = performance.now() + 4000;
  if (f.onDone) f.onDone();
  tocando = false;
  setTimeout(tocarProxima, 500);
}

// ---------------- loop
const clock = new THREE.Clock(); const perf = { n: 0, t: 0 };
let danceTimer = performance.now() + 90000;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  if (pronto) {
    // movimento do tio
    if (tio.estado === 'andar') {
      const w = tio.walker;
      while (w.pts.length < 4) nextSegment(w);
      const tgt = w.pts[0];
      const dx = tgt.x - tio.pos.x, dz = tgt.y - tio.pos.z, dist = Math.hypot(dx, dz);
      if (dist < .7) w.pts.shift();
      const want = Math.atan2(dx, dz);
      let dy = want - tio.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      tio.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 2.2 * dt);
      const VEL = tio.passo || 1.5, v = VEL * (1 - Math.min(.5, Math.abs(dy) / 2));
      tio.pos.x += Math.sin(tio.yaw) * v * dt; tio.pos.z += Math.cos(tio.yaw) * v * dt;
      tio.acts.andar.timeScale = v / VEL;
      if (now > danceTimer && !tio.falando) { dancar(6); danceTimer = now + 100000 + rnd() * 60000; }
    } else if (tio.estado === 'danca' && now > tio.fimDanca) {
      tio.estado = 'andar'; trocar('andar', .5);
    }
    tio.obj.position.copy(tio.pos); tio.obj.rotation.y = tio.yaw;
    tio.mixer.update(dt);
    // cabeça acompanha a fala
    if (tio.falando && tio.cabeca) { tio.cabeca.rotation.x += Math.sin(now / 160) * .05; tio.cabeca.rotation.y += Math.sin(now / 410) * .06; }

    atualizaNpcs(dt); atualizaPombos(dt); city.atualizaSemaforos(now / 1000);
    // carros em movimento
    for (let k = 0; k < movers.length; k++) {
      const m = movers[k], w = m.w;
      while (w.pts.length < 4) nextSegment(w);
      const t = w.pts[0], dx = t.x - m.x, dz = t.y - m.z, dist = Math.hypot(dx, dz);
      if (dist < 1.2) w.pts.shift();
      const want = Math.atan2(dx, dz); let dy = want - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 1.6 * dt);
      const ahead = Math.hypot(tio.pos.x - (m.x + Math.sin(m.yaw) * 4), tio.pos.z - (m.z + Math.cos(m.yaw) * 4));
      let perto = ahead < 4.5;
      if (!perto) { const ax = m.x + Math.sin(m.yaw) * 4, az = m.z + Math.cos(m.yaw) * 4; for (const n of npcs) if (Math.abs(n.pos.x - ax) < 2.5 && Math.abs(n.pos.z - az) < 2.5) { perto = true; break; } }
      const vv = perto ? 0 : m.v * (1 - Math.min(.6, Math.abs(dy)));
      m.x += Math.sin(m.yaw) * vv * dt; m.z += Math.cos(m.yaw) * vv * dt;
      if (Math.hypot(m.x - tio.pos.x, m.z - tio.pos.z) > 90) { // carro foi longe: volta para perto do tio
        const [ni, nj] = nodeNear(); m.w = makeWalker(1.25, ni, nj); m.w.d = dirs[Math.floor(rnd() * 4)]; nextSegment(m.w, false); nextSegment(m.w);
        const p = m.w.pts.shift(); m.x = p.x; m.z = p.y;
      }
      cars.set(PARK + k, m.x, m.z, m.yaw - Math.PI / 2);
    }
    cars.commit();

    // vapor
    for (let n = 0; n < puffN; n++) {
      const src = city.steam[(n / PUFF) | 0]; let t = puffT[n] += dt; if (t > 4) t = puffT[n] -= 4;
      const k = t / 4, b = .22 * Math.sin(Math.PI * k);
      puffPos[n * 3] = src.x + Math.sin(t * 1.3) * .4 * k; puffPos[n * 3 + 1] = .3 + k * 3.2; puffPos[n * 3 + 2] = src.z + Math.cos(t) * .3 * k;
      puffCol[n * 3] = b; puffCol[n * 3 + 1] = b * .97; puffCol[n * 3 + 2] = b * .94;
    }
    puffGeo.attributes.position.needsUpdate = true; puffGeo.attributes.color.needsUpdate = true;

    // câmera
    if (now > camTroca && !camForce) { camIdx = (camIdx + 1) % camModos.length; camTroca = now + 9000 + rnd() * 6000; }
    const modo = tio.estado === 'danca' ? 'danca' : (camForce || camModos[camIdx]);
    const [cp, cl] = alvoCamera(modo);
    const k = 1 - Math.exp(-dt * 2.2);
    camPos.lerp(cp, k); naRua(camPos); camLook.lerp(cl, 1 - Math.exp(-dt * 4));
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  renderer.render(scene, camera);
  posicionaBalao();
  // resolução automática: se o PC não aguentar 50 fps, desenha em resolução menor
  perf.n++; perf.t += dt;
  if (perf.t > 2) {
    const fps = perf.n / perf.t; perf.n = 0; perf.t = 0;
    const alvo = fps < 48 ? Math.max(.55, escala - .1) : fps > 58 && escala < 1 ? Math.min(1, escala + .05) : escala;
    if (alvo !== escala) { escala = alvo; renderer.setPixelRatio(escala); }
  }
}
loop();
window.__info = () => renderer.info.render;
window.__dancar = dancar; window.__tio = tio; window.__cam = camera; window.__npcs = npcs;

// ---------------- conexão com o servidor ou modo demonstração
const status = document.getElementById('status');
function setStatus(t, ok) { status.textContent = t; status.className = ok ? 'ok' : ''; status.style.opacity = 1; clearTimeout(setStatus.t); if (ok) setStatus.t = setTimeout(() => status.style.opacity = 0, 6000); }

const DEMO = [
  ['maria_lu', 'Oi tio Julius! De onde o senhor é?', 'Oi Maria! Sou daqui do bairro mesmo, nascido e criado. Conheço cada esquina dessas!'],
  ['joaozinho77', 'Tio, o senhor tá indo pra onde?', 'Tô indo pro trabalho, João. Homem que é homem acorda cedo e não reclama!'],
  ['bia_santos', 'Que macacão bonito', 'Obrigado, Bia! Macacão de trabalhador, aguenta tudo e ainda fica elegante.'],
  ['carlos.ff', 'Dança aí tio!', 'Dançar? Carlos, aqui no bairro todo mundo sabe que eu sou o rei da pista!'],
  ['ana_paula', 'Boa noite tio, tudo bem?', 'Boa noite, Ana Paula! Tudo ótimo, graças a Deus. E por aí, tudo em paz?'],
];
let demoK = 0;
function demoTick() {
  const [nome, perg, resp] = DEMO[demoK++ % DEMO.length];
  receberFala({ nome, pergunta: perg, resposta: resp, tipo: 'comentario' });
  if (nome === 'carlos.ff') dancar(6);
}

export function iniciar(cfg) {
  Object.assign(CFG, cfg);
  try { localStorage.setItem('tioJulius', JSON.stringify({ usuario: CFG.usuario, voz: CFG.voz })); } catch { }
  document.getElementById('inicio').style.display = 'none';
  if (CFG.demo || typeof io === 'undefined') {
    setStatus('Modo teste (sem servidor): comentários de exemplo', true);
    setTimeout(demoTick, 3000); setInterval(demoTick, 16000);
    return;
  }
  const sock = io();
  sock.on('connect', () => { sock.emit('iniciar', { usuario: CFG.usuario, voz: CFG.voz, teste: CFG.modoTeste }); });
  sock.on('status', (s) => setStatus(s.texto, s.ok));
  sock.on('fala', (f) => { f.onDone = () => sock.emit('tocou', f.id); receberFala(f); });
  sock.on('presente', () => dancar(7));
  sock.on('disconnect', () => setStatus('Servidor desconectado, tentando de novo…'));
  window.__sock = sock;
}

// tela inicial
document.getElementById('in-user').value = CFG.usuario;
document.getElementById('in-voz').value = CFG.voz;
document.getElementById('btn-live').onclick = () => iniciar({ usuario: document.getElementById('in-user').value.trim().replace(/^@/, ''), voz: document.getElementById('in-voz').value.trim(), modoTeste: false });
document.getElementById('btn-teste').onclick = () => iniciar({ usuario: document.getElementById('in-user').value.trim().replace(/^@/, ''), voz: document.getElementById('in-voz').value.trim(), modoTeste: true });
// link automático: com ?user= conecta na live; sem ele (ou com ?teste=1) entra no modo teste
if (CFG.auto) { const u = (qs.get('user') || '').replace(/^@/, ''); const teste = qs.get('teste') === '1' || !u; iniciar({ usuario: u, modoTeste: teste }); }
