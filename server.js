// Servidor do "Tio Julius no Bairro": lê o chat da live, gera a resposta e a voz.
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FISH_API_KEY = process.env.FISH_API_KEY || '';
const FISH_MODEL = process.env.FISH_MODEL || 's2.1-pro-free';
const FISH_VOICE_ID = process.env.FISH_VOICE_ID || '';
const EDGE_VOICE = process.env.EDGE_VOICE || 'pt-BR-AntonioNeural';
const EULER_API_KEY = process.env.EULER_API_KEY || '';

const app = express();
app.use(express.static('public', { maxAge: '1h' }));
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

// ---------------- áudios gerados (guardados por 10 minutos)
const audios = new Map();
app.get('/audio/:id', (req, res) => {
  const a = audios.get(req.params.id);
  if (!a) return res.status(404).end();
  res.set('Content-Type', 'audio/mpeg'); res.set('Cache-Control', 'no-store'); res.send(a.buf);
});
setInterval(() => { const t = Date.now() - 10 * 60e3; for (const [k, v] of audios) if (v.t < t) audios.delete(k); }, 60e3);
app.get('/saude', (_q, res) => res.json({ ok: true, ia: OPENAI_API_KEY ? 'openai' : GEMINI_API_KEY ? 'gemini' : 'frases prontas', fish: !!FISH_API_KEY }));

// ---------------- personalidade
const PERSONA = `Você é o "Tio Julius", um tiozão brasileiro fortão, careca, de macacão azul de trabalho, que mora num bairro de prédios de tijolo estilo anos 80 e está andando pela rua enquanto conversa com o público de uma live do TikTok.
Jeito: bem-humorado, sincero, trabalhador, conselheiro de família, meio bravo de brincadeira, cheio de histórias do bairro, carinhoso com o público. Fala português do Brasil, informal, frases curtas.
Regras:
- Responda em NO MÁXIMO 2 frases curtas (até 30 palavras). Sem emojis, sem hashtags, sem listas.
- Chame a pessoa pelo nome quando fizer sentido (só o primeiro nome, sem números e sem @).
- Nunca peça presentes, rosas, curtidas ou seguidores, e nunca prometa nada em troca de presentes.
- Não fale palavrão, não fale de política nem religião, não dê conselhos médicos ou financeiros sérios, não peça nem compartilhe dados pessoais.
- Se o comentário for ofensivo ou de mau gosto, desconverse com bom humor sem repetir a ofensa.
- Se perguntarem se você é real ou uma IA, diga com humor que é o personagem virtual do canal, criado pela família.
- Não imite nem cite personagens de séries ou filmes.`;

const limpaNome = (n) => (n || '').replace(/[@_.]/g, ' ').replace(/\d+/g, '').trim().split(/\s+/)[0]?.replace(/^./, c => c.toUpperCase()) || 'Amigo';

async function respostaIA(nome, texto, tipo) {
  const pedido = tipo === 'presente'
    ? `${limpaNome(nome)} mandou um presente (${texto}). Agradeça de um jeito engraçado e caloroso, numa frase só.`
    : tipo === 'chegada'
      ? `${limpaNome(nome)} acabou de entrar na live. Dê boas-vindas curtinha e engraçada, numa frase só.`
      : `Comentário de ${limpaNome(nome)}: "${texto}"`;
  if (OPENAI_API_KEY) {
    for (const model of [...new Set([OPENAI_MODEL, 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini'])]) {
      try {
        const body = { model, messages: [{ role: 'system', content: PERSONA }, { role: 'user', content: pedido }] };
        if (/^gpt-5/.test(model)) body.max_completion_tokens = 400; else { body.max_tokens = 90; body.temperature = .9; }
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
        });
        if (r.status === 404 || r.status === 400) { console.log('OpenAI modelo', model, r.status); continue; }
        if (!r.ok) throw new Error('OpenAI ' + r.status + ' ' + (await r.text()).slice(0, 200));
        const j = await r.json(); const t = j.choices?.[0]?.message?.content?.trim();
        if (t) return t;
      } catch (e) { console.log('Erro OpenAI:', e.message); break; }
    }
  }
  if (GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: PERSONA }] }, contents: [{ role: 'user', parts: [{ text: pedido }] }], generationConfig: { maxOutputTokens: 120, temperature: .9, thinkingConfig: { thinkingBudget: 0 } } }),
      });
      if (!r.ok) throw new Error('Gemini ' + r.status + ' ' + (await r.text()).slice(0, 200));
      const j = await r.json(); const t = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
      if (t) return t;
    } catch (e) { console.log('Erro Gemini:', e.message); }
  }
  return frasePronta(nome, texto, tipo);
}

// respostas sem IA (grátis)
const sorteia = (a) => a[Math.floor(Math.random() * a.length)];
function frasePronta(nome, texto, tipo) {
  const n = limpaNome(nome); const t = (texto || '').toLowerCase();
  if (tipo === 'presente') return sorteia([`Ô ${n}, muito obrigado! Assim você me deixa até sem graça, meu amigo!`, `${n}, valeu demais! Hoje o tio vai até dançar de alegria!`, `Obrigado, ${n}! Você é gente boa igual pão quentinho de manhã.`]);
  if (tipo === 'chegada') return sorteia([`Chegou o ${n}! Seja bem-vindo ao bairro, fica à vontade.`, `Olha quem apareceu, ${n}! Pega um lugar aí na calçada.`, `Fala, ${n}! Entra, que aqui no bairro todo mundo é família.`]);
  if (/\b(oi|ola|olá|eae|e ai|e aí|salve|fala)\b/.test(t)) return sorteia([`Oi ${n}! Que bom te ver por aqui no bairro.`, `Salve, ${n}! Tudo em paz por aí?`, `E aí, ${n}! Chega mais, vem andar comigo.`]);
  if (/(bom dia|boa tarde|boa noite)/.test(t)) return `${t.match(/(bom dia|boa tarde|boa noite)/)[1].replace(/^./, c => c.toUpperCase())}, ${n}! Que Deus abençoe seu dia.`;
  if (/(tudo bem|como vai|como (o senhor|você|vc) ta)/.test(t)) return sorteia([`Tudo ótimo, ${n}! Cansado de tanto trabalhar, mas feliz.`, `Tô bem, ${n}, graças a Deus. E você, tá se cuidando?`]);
  if (/(onde|aonde).*(vai|indo)/.test(t)) return sorteia([`Tô indo pro trabalho, ${n}. Homem trabalhador não para!`, `Vou ali na padaria da esquina, ${n}. Quer que eu traga um pão pra você?`]);
  if (/(danç|danc)/.test(t)) return `Dançar, ${n}? Daqui a pouco o tio mostra quem manda na pista!`;
  if (/(idade|anos você|quantos anos)/.test(t)) return `Idade é segredo, ${n}. Só digo que tenho mais experiência que todo mundo aqui.`;
  if (/(de onde|mora onde|onde mora)/.test(t)) return `Moro aqui mesmo, ${n}, nesse bairro desde sempre. Conheço cada esquina.`;
  if (/(forte|músculo|musculo|bra[cç]o)/.test(t)) return `Isso aqui é músculo de trabalho, ${n}! Nada de academia cara.`;
  if (/\?$/.test(t)) return sorteia([`Boa pergunta, ${n}! Vou pensar nisso enquanto ando até a esquina.`, `Olha, ${n}, na vida a gente aprende que o importante é trabalhar e ter paciência.`]);
  return sorteia([`É isso aí, ${n}! Você tem razão.`, `Ô ${n}, gostei do seu jeito! Continua comentando aí.`, `${n}, você é dos meus! Vamos que vamos.`, `Hahaha, ${n}, você é uma figura!`]);
}

// ---------------- voz
let edge = null;
async function vozEdge(texto) {
  try {
    if (!edge) { edge = new MsEdgeTTS(); await edge.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3); }
    const safe = texto.replace(/[<>&]/g, ' ');
    const { audioStream } = edge.toStream(safe, { rate: '+4%', pitch: '-6Hz' });
    const chunks = [];
    await new Promise((res, rej) => { audioStream.on('data', c => chunks.push(c)); audioStream.on('close', res); audioStream.on('end', res); audioStream.on('error', rej); setTimeout(() => rej(new Error('timeout')), 15000); });
    const buf = Buffer.concat(chunks); if (buf.length < 500) throw new Error('áudio vazio');
    return buf;
  } catch (e) { console.log('Erro voz Microsoft:', e.message); try { edge?.close(); } catch { } edge = null; return null; }
}
async function vozFish(texto, voz) {
  if (!FISH_API_KEY || !voz) return null;
  try {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json', model: FISH_MODEL },
      body: JSON.stringify({ text: texto, reference_id: voz, format: 'mp3', mp3_bitrate: 64, latency: 'balanced', normalize: true }),
    });
    if (!r.ok) throw new Error('Fish ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 500) throw new Error('áudio vazio');
    return buf;
  } catch (e) { console.log('Erro Fish:', e.message); return null; }
}

// ---------------- fila de falas
const sessao = { voz: FISH_VOICE_ID, pendentes: 0, fila: [], ocupado: false, ultimaChegada: 0, vistos: new Map() };
function enfileira(item, prioridade = false) {
  if (prioridade) sessao.fila.unshift(item); else sessao.fila.push(item);
  // mantém a fila curta e atual: guarda presentes e os 5 comentários mais novos
  const pres = sessao.fila.filter(i => i.tipo === 'presente');
  const resto = sessao.fila.filter(i => i.tipo !== 'presente').slice(-5);
  sessao.fila = [...pres.slice(0, 4), ...resto];
  processa();
}
async function processa() {
  if (sessao.ocupado || sessao.pendentes >= 2 || !sessao.fila.length) return;
  sessao.ocupado = true;
  const it = sessao.fila.shift();
  try {
    const resposta = (await respostaIA(it.nome, it.texto, it.tipo)).replace(/\s+/g, ' ').slice(0, 260);
    const buf = (await vozFish(resposta, sessao.voz)) || (await vozEdge(resposta));
    let audio = null;
    if (buf) { const id = randomUUID(); audios.set(id, { buf, t: Date.now() }); audio = '/audio/' + id; }
    sessao.pendentes++;
    io.emit('fala', { id: randomUUID(), nome: it.nome, foto: it.foto, pergunta: it.tipo === 'comentario' ? it.texto : (it.tipo === 'presente' ? '🎁 ' + it.texto : ''), resposta, audio, tipo: it.tipo });
  } catch (e) { console.log('Erro na fala:', e.message); }
  sessao.ocupado = false;
  processa();
}
setInterval(() => { if (sessao.pendentes > 0 && Date.now() - (sessao.ultimoTocou || 0) > 45000) { sessao.pendentes = 0; processa(); } }, 10000);

function foto(u) {
  return u?.profilePicture?.url?.[0] || u?.profilePicture?.urls?.[0] || u?.avatarThumb?.urlList?.[0] || u?.avatarThumb?.url?.[0] || u?.avatarMedium?.urlList?.[0] || u?.avatarLarge?.urlList?.[0] || u?.profilePictureUrl || '';
}
function comentarioOk(nome, texto) {
  if (!texto || texto.length < 2) return false;
  if (/https?:|www\./i.test(texto)) return false;
  if (!/[a-zà-ú0-9]/i.test(texto)) return false; // só emoji
  const k = nome + '|' + texto.toLowerCase();
  const t = sessao.vistos.get(k); if (t && Date.now() - t < 120000) return false; // repetido
  sessao.vistos.set(k, Date.now()); if (sessao.vistos.size > 500) sessao.vistos.clear();
  return true;
}

// ---------------- TikTok
let live = null, liveUser = '';
async function conectar(usuario) {
  if (!usuario) return;
  if (live && liveUser === usuario) return;
  try { live?.disconnect(); } catch { }
  liveUser = usuario;
  const opts = { processInitialData: false, enableExtendedGiftInfo: true };
  if (EULER_API_KEY) opts.signApiKey = EULER_API_KEY;
  live = new TikTokLiveConnection(usuario, opts);
  live.on(WebcastEvent.CHAT, (d) => {
    const nome = d.user?.uniqueId || d.user?.nickname || 'amigo';
    const texto = (d.comment || '').trim();
    if (!comentarioOk(nome, texto)) return;
    enfileira({ tipo: 'comentario', nome, foto: foto(d.user), texto });
  });
  live.on(WebcastEvent.GIFT, (d) => {
    if (d.giftType === 1 && !d.repeatEnd) return; // sequência ainda em andamento
    const nome = d.user?.uniqueId || 'amigo';
    const giftName = d.extendedGiftInfo?.name || d.giftDetails?.giftName || 'presente';
    io.emit('presente', { nome });
    enfileira({ tipo: 'presente', nome, foto: foto(d.user), texto: giftName }, true);
  });
  live.on(WebcastEvent.MEMBER, (d) => {
    if (Date.now() - sessao.ultimaChegada < 60000 || sessao.fila.length) return;
    sessao.ultimaChegada = Date.now();
    const nome = d.user?.uniqueId || 'amigo';
    enfileira({ tipo: 'chegada', nome, foto: foto(d.user), texto: '' });
  });
  live.on(ControlEvent.DISCONNECTED, () => { io.emit('status', { texto: 'Live desconectada. Tentando de novo em 20 s…' }); setTimeout(() => { const u = liveUser; live = null; liveUser = ''; conectar(u); }, 20000); });
  try {
    const st = await live.connect();
    io.emit('status', { texto: `Conectado na live de @${usuario}`, ok: true });
    console.log('Conectado na live', usuario, st?.roomId);
  } catch (e) {
    console.log('Erro ao conectar:', e.message);
    io.emit('status', { texto: `Não consegui conectar em @${usuario} (a live está aberta?). Tentando de novo em 30 s…` });
    live = null; const u = usuario; liveUser = '';
    setTimeout(() => conectar(u), 30000);
  }
}

// ---------------- navegador do jogo
const TESTE = [
  ['maria_lu', 'Oi tio Julius! De onde o senhor é?'], ['joaozinho77', 'Tio, o senhor tá indo pra onde?'], ['bia_santos', 'Que macacão bonito'],
  ['carlos.ff', 'Dança aí tio!'], ['ana_paula', 'Boa noite tio, tudo bem?'], ['rafa_gamer', 'Tio, qual sua comida favorita?'],
];
let testeTimer = null, testeK = 0;
io.on('connection', (s) => {
  s.on('iniciar', ({ usuario, voz, teste }) => {
    if (voz) sessao.voz = voz.trim();
    s.emit('status', { texto: `Voz: ${sessao.voz && FISH_API_KEY ? 'Fish Audio' : 'Microsoft (grátis)'} · Respostas: ${OPENAI_API_KEY ? 'OpenAI' : GEMINI_API_KEY ? 'Gemini' : 'frases prontas'}`, ok: true });
    if (teste) {
      clearInterval(testeTimer);
      const tick = () => { const [n, t] = TESTE[testeK++ % TESTE.length]; enfileira({ tipo: 'comentario', nome: n, foto: '', texto: t }); if (n === 'carlos.ff') io.emit('presente', { nome: n }); };
      setTimeout(tick, 2000); testeTimer = setInterval(tick, 15000);
    } else if (usuario) conectar(usuario.replace(/^@/, '').trim());
  });
  s.on('tocou', () => { sessao.pendentes = Math.max(0, sessao.pendentes - 1); sessao.ultimoTocou = Date.now(); processa(); });
});

http.listen(PORT, () => console.log('Tio Julius no ar na porta', PORT));
