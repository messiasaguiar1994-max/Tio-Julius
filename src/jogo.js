import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.getElementById('cena').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 400);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4a5a, 1.6));
const sun = new THREE.DirectionalLight(0xffb070, 2.2); sun.position.set(-60, 45, -30); scene.add(sun);

const city = buildCity(scene);

// ---------------- rotas (grafo das esquinas)
const OFF = 5.0; // distância da calçada ao eixo da rua
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
  const prev = w.d;
  const A = new THREE.Vector2(nodePos(w.i), nodePos(w.j));
  const d = new THREE.Vector2(nd[0], nd[1]);
  const r = new THREE.Vector2(-d.y, d.x); // direita (x,z)
  // se virou à esquerda: atravessa primeiro em frente, depois para o lado
  const pr = new THREE.Vector2(-prev[1], prev[0]);
  if (prev[0] === -nd[1] && prev[1] === nd[0] && w.pts.length) {
    // nd = esquerda de prev
    const pd = new THREE.Vector2(prev[0], prev[1]);
    w.pts.push(A.clone().addScaledVector(pr, w.off).addScaledVector(pd, w.off));
  }
  w.pts.push(A.clone().addScaledVector(r, w.off).addScaledVector(d, w.off));
  w.i += nd[0]; w.j += nd[1]; w.d = nd;
  const B = new THREE.Vector2(nodePos(w.i), nodePos(w.j));
  w.pts.push(B.clone().addScaledVector(r, w.off).addScaledVector(d, -w.off));
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
  for (const clip of g.animations) {
    // remove o deslocamento do quadril (andar no lugar)
    for (const tr of clip.tracks) if (/Hips\.position$/.test(tr.name)) { const v = tr.values; for (let k = 0; k < v.length; k += 3) { v[k] = v[0]; v[k + 2] = v[2]; } }
    const a = tio.mixer.clipAction(clip); tio.acts[clip.name] = a;
  }
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

// ---------------- carros
const PARK = 26, MOV = 6;
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
const steamMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xe8e0d8, transparent: true, depthWrite: false, opacity: .25 });
const puffs = [];
for (const src of city.steam) for (let k = 0; k < 4; k++) { const s = new THREE.Sprite(steamMat.clone()); s.userData = { src, t: rnd() * 4 }; scene.add(s); puffs.push(s); }

// ---------------- câmera
const camModos = ['atras', 'lado', 'frente', 'atras', 'alto', 'lado'];
let camIdx = 0, camTroca = 0, camForce = null;
const camPos = new THREE.Vector3(0, 5, 10), camLook = new THREE.Vector3();
function alvoCamera(modo) {
  const f = new THREE.Vector3(Math.sin(tio.yaw), 0, Math.cos(tio.yaw));
  const r = new THREE.Vector3(-f.z, 0, f.x); // direita do tio (prédios ficam à direita)
  const head = tio.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  switch (modo) {
    case 'atras': return [tio.pos.clone().addScaledVector(f, -4.2).addScaledVector(r, -1.2).add(new THREE.Vector3(0, 2.4, 0)), head.clone().addScaledVector(f, 2)];
    case 'lado': return [tio.pos.clone().addScaledVector(r, -4.8).addScaledVector(f, 1.2).add(new THREE.Vector3(0, 1.7, 0)), head.clone().add(new THREE.Vector3(0, -.2, 0))];
    case 'frente': return [tio.pos.clone().addScaledVector(f, 3.6).addScaledVector(r, -.9).add(new THREE.Vector3(0, 1.75, 0)), head.clone().add(new THREE.Vector3(0, -.1, 0))];
    case 'alto': return [tio.pos.clone().addScaledVector(f, -7).addScaledVector(r, -6).add(new THREE.Vector3(0, 11, 0)), tio.pos.clone().addScaledVector(f, 3)];
    case 'danca': return [tio.pos.clone().addScaledVector(r, -2.2).addScaledVector(f, 3.2).add(new THREE.Vector3(0, 1.5, 0)), head.clone().add(new THREE.Vector3(0, -.5, 0))];
  }
}

// ---------------- balão de fala
const balao = document.getElementById('balao');
const bFoto = document.getElementById('b-foto'), bNome = document.getElementById('b-nome'), bPerg = document.getElementById('b-perg'), bResp = document.getElementById('b-resp');
const tmpV = new THREE.Vector3();
function posicionaBalao() {
  if (!tio.obj || balao.style.display === 'none') return;
  tmpV.copy(tio.pos).add(new THREE.Vector3(0, 2.05, 0)).project(camera);
  let x = (tmpV.x * .5 + .5) * innerWidth, y = (-tmpV.y * .5 + .5) * innerHeight;
  const bw = balao.offsetWidth, bh = balao.offsetHeight;
  x = Math.max(bw / 2 + 8, Math.min(innerWidth - bw / 2 - 8, x));
  y = Math.max(bh + 70, Math.min(innerHeight * .62, y));
  balao.style.transform = `translate(${x - bw / 2}px, ${y - bh}px)`;
}

// fila de falas
const fila = []; let tocando = false;
const audioEl = new Audio();
export function receberFala(f) { fila.push(f); if (f.tipo === 'presente') dancar(7); tocarProxima(); }
async function tocarProxima() {
  if (tocando || !fila.length) return;
  tocando = true;
  const f = fila.shift();
  bFoto.src = f.foto || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#f59e0b"/><text x="20" y="27" font-size="20" text-anchor="middle" fill="#fff" font-family="Arial">' + (f.nome || '?')[0].toUpperCase() + '</text></svg>');
  bNome.textContent = f.nome ? '@' + f.nome : '';
  bPerg.textContent = f.pergunta || '';
  bPerg.style.display = f.pergunta ? 'block' : 'none';
  bResp.textContent = '';
  balao.style.display = 'block'; balao.classList.remove('sai'); void balao.offsetWidth; balao.classList.add('entra');
  tio.falando = true; camForce = tio.estado === 'danca' ? null : 'frente';
  const texto = f.resposta;
  let dur = Math.max(2.5, texto.length / 14);
  let fim;
  const done = new Promise(res => fim = res);
  let tocou = false;
  if (f.audio) {
    try {
      audioEl.src = f.audio; await audioEl.play(); tocou = true;
      audioEl.onended = () => fim(); audioEl.onerror = () => fim();
      await new Promise(r => { if (isFinite(audioEl.duration)) r(); else audioEl.onloadedmetadata = r; setTimeout(r, 800); });
      if (isFinite(audioEl.duration)) dur = audioEl.duration;
    } catch (e) { console.warn('áudio', e); }
  }
  if (!tocou && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(texto); u.lang = 'pt-BR'; u.rate = 1.02; u.pitch = .8;
    const v = speechSynthesis.getVoices().find(v => /pt[-_]BR/i.test(v.lang) && /male|antonio|daniel|ricardo|homem/i.test(v.name)) || speechSynthesis.getVoices().find(v => /pt/i.test(v.lang));
    if (v) u.voice = v;
    u.onend = () => fim(); u.onerror = () => fim();
    speechSynthesis.speak(u); tocou = true;
  }
  // texto aparecendo junto com a fala
  const t0 = performance.now();
  const tick = () => { const k = Math.min(1, (performance.now() - t0) / (dur * 1000 * .92)); bResp.textContent = texto.slice(0, Math.ceil(texto.length * k)); if (k < 1 && tio.falando) requestAnimationFrame(tick); };
  tick();
  const limite = new Promise(r => setTimeout(r, (dur + 6) * 1000));
  if (!tocou) setTimeout(() => fim(), dur * 1000);
  const minimo = new Promise(r => setTimeout(r, Math.max(2500, texto.length / 15 * 1000)));
  await Promise.race([Promise.all([done, minimo]), limite]);
  bResp.textContent = texto;
  await new Promise(r => setTimeout(r, 1400));
  balao.classList.remove('entra'); balao.classList.add('sai');
  await new Promise(r => setTimeout(r, 350));
  balao.style.display = 'none';
  tio.falando = false; camForce = null; camTroca = performance.now() + 4000;
  if (f.onDone) f.onDone();
  tocando = false;
  setTimeout(tocarProxima, 500);
}

// ---------------- loop
const clock = new THREE.Clock();
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
      const v = 1.38 * (1 - Math.min(.5, Math.abs(dy) / 2));
      tio.pos.x += Math.sin(tio.yaw) * v * dt; tio.pos.z += Math.cos(tio.yaw) * v * dt;
      tio.acts.andar.timeScale = v / 1.38;
      if (now > danceTimer && !tio.falando) { dancar(6); danceTimer = now + 100000 + rnd() * 60000; }
    } else if (tio.estado === 'danca' && now > tio.fimDanca) {
      tio.estado = 'andar'; trocar('andar', .5);
    }
    tio.obj.position.copy(tio.pos); tio.obj.rotation.y = tio.yaw;
    tio.mixer.update(dt);
    // cabeça acompanha a fala
    if (tio.falando && tio.cabeca) { tio.cabeca.rotation.x += Math.sin(now / 160) * .05; tio.cabeca.rotation.y += Math.sin(now / 410) * .06; }

    // carros em movimento
    for (let k = 0; k < movers.length; k++) {
      const m = movers[k], w = m.w;
      while (w.pts.length < 4) nextSegment(w);
      const t = w.pts[0], dx = t.x - m.x, dz = t.y - m.z, dist = Math.hypot(dx, dz);
      if (dist < 1.2) w.pts.shift();
      const want = Math.atan2(dx, dz); let dy = want - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 1.6 * dt);
      const ahead = Math.hypot(tio.pos.x - (m.x + Math.sin(m.yaw) * 4), tio.pos.z - (m.z + Math.cos(m.yaw) * 4));
      const vv = ahead < 4.5 ? 0 : m.v * (1 - Math.min(.6, Math.abs(dy)));
      m.x += Math.sin(m.yaw) * vv * dt; m.z += Math.cos(m.yaw) * vv * dt;
      cars.set(PARK + k, m.x, m.z, m.yaw - Math.PI / 2);
    }
    cars.commit();

    // vapor
    for (const s of puffs) {
      const u = s.userData; u.t += dt; const life = 4; if (u.t > life) u.t -= life;
      const k = u.t / life;
      s.position.set(u.src.x + Math.sin(u.t * 1.3) * .4 * k, .2 + k * 3.5, u.src.z + Math.cos(u.t) * .3 * k);
      const sc = .8 + k * 2.6; s.scale.set(sc, sc, 1); s.material.opacity = .28 * Math.sin(Math.PI * k);
    }

    // câmera
    if (now > camTroca && !camForce) { camIdx = (camIdx + 1) % camModos.length; camTroca = now + 9000 + rnd() * 6000; }
    const modo = tio.estado === 'danca' ? 'danca' : (camForce || camModos[camIdx]);
    const [cp, cl] = alvoCamera(modo);
    const k = 1 - Math.exp(-dt * 1.6);
    camPos.lerp(cp, k); camLook.lerp(cl, 1 - Math.exp(-dt * 3));
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  renderer.render(scene, camera);
  posicionaBalao();
}
loop();
window.__dancar = dancar;

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
if (CFG.auto) iniciar({ modoTeste: !CFG.usuario });
