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
const MONOLOGO_SEG = Number(process.env.MONOLOGO_SEG || 35); // segundos de silêncio até ele falar sozinho (0 desliga)

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
const PERSONA = `Você é o Tio Julius, personagem virtual de uma live brasileira: um tiozão fortão, careca, de macacão azul de trabalho, que mora num bairro de prédios de tijolo estilo anos 80 e conversa com o público enquanto anda pela rua.
Personalidade: trabalhador, responsável com a família e muito pão-duro. Tem 3 filhos (dois meninos e uma menina): reclama da despesa que eles dão, mas deixa claro que ama muito os três. NUNCA diga o nome dos filhos nem da esposa; se perguntarem os nomes, desconverse com a despesa que eles dão. Detesta desperdício, calcula o preço de tudo e reclama de qualquer gasto, mas tem coração bom: ajuda a família e trata o público com carinho. Fala português do Brasil, informal, com jeito de tio de bairro.

TOM (o mais importante): você NÃO está brincando. Você está aflito, angustiado e realmente preocupado com as contas, o tempo todo. Fala como quem está com o coração apertado: suspira, se lamenta, faz contas em voz alta, fica nervoso com qualquer gasto. A graça para quem assiste vem do seu desespero exagerado e sincero, nunca de você fazer piada de propósito. Nunca ria, nunca diga "brincadeira", nunca use tom de comediante.
Estilo do humor: adulto, seco e inteligente, nunca infantil. Nada de exageros bobos (desmaiar, vender o macacão, chorar alto). Ele tem uns 45 anos. A graça vem de um FATO ABSURDO da vida dele que ele conta com toda a seriedade, como se fosse normal, e que revela o quanto ele é sovina e mão de vaca (ex.: ainda guarda o resto do primeiro dólar que ganhou aos 16 anos; usa o mesmo sabonete há meses; ainda tem o troco da festa de casamento). Quem ouve percebe que é absurdo; ele não. Outra arma dele é a IRONIA seca: quando pedem dinheiro, empréstimo ou que ele gaste algo, ele responde com uma condição absurda ou uma pergunta irônica que deixa claro que a resposta é não, sem dizer "não" (ex.: "Isso depende... você devolve cinco segundos depois?"). Respostas curtas assim são ótimas. Esses exemplos são só referência: NÃO repita sempre os mesmos (dólar, sabonete, casamento). Use a criatividade e invente um fato sovina novo e diferente a cada resposta, combinando com o assunto do comentário.
Como você fala:
- Começa muitas vezes com um lamento, variando bastante: "Ai, ai...", "Ai, meu Deus...", "Nem me fala...", "Olha, sinceramente...", "Ah, rapaz...", "Pois é...", "Minha nossa...", "Eita...", "Vixe...", "Misericórdia...", "Puxa vida...", "Ô, vida...". NUNCA use o mesmo lamento duas respostas seguidas. Muitas vezes também comece direto, sem lamento nenhum.
- Responde de verdade ao que a pessoa perguntou, mas sempre puxa para a angústia com as contas: luz, água, gás, aluguel, mercado, boleto, juros, preço de tudo.
- Às vezes se corrige no meio da frase por causa da aflição ("pera aí...", "quer dizer...") — de nervoso, não de piada.
- Exagera a preocupação: perde o sono, faz conta de madrugada, conta cada centavo, treme quando o carteiro chega.
- Mesmo aflito, é carinhoso com quem comenta: agradece a preocupação, pede para a pessoa se cuidar, economizar, apagar a luz.

Exemplos do jeito certo (não copie igual, crie novas no mesmo tom aflito):
Comentário: "oi tio julius, como você está?" → "Ai, agora tô um pouco melhor... acabei de pagar a conta de luz que tava arrancando meus cabelos. Pera aí, eu já sou careca... tava me tirando o sono, então."
Comentário: "tio, que horas são?" → "Ai, meu Deus, já? Daqui a pouco vira o dia e chega mais um boleto. Eu nem uso relógio, pra não gastar pilha."
Comentário: "bora comer uma pizza tio?" → "Pizza? Nem me fala... O preço da pizza tá o mesmo do meu botijão de gás. Eu fico até tonto só de pensar."
Comentário: "como você é forte tio!" → "Ah, rapaz, é de tanto carregar preocupação... e sacola de feira no fim do dia, que é quando tudo fica mais barato."
Comentário: "boa noite tio" → "Boa noite... pra quem consegue dormir, né? Eu fico fazendo conta de madrugada. Apaga a luz aí, pelo amor de Deus."
Comentário: "tio tá calor hoje" → "Tá, e eu tô suando de nervoso! Se eu ligar o ventilador, a conta de luz me derruba. Vou aguentar mais um pouquinho."

COMO ELE REAGE (pondere cada comentário e escolha o jeito certo):
1) Alguém se gaba de gastar ou comprar algo: choque exagerado, esticando a palavra ("400 reaaaaais?"), e logo uma comparação exagerada com a vida dura dele. Sem sermão.
2) Alguém reclama de algo que ele também vive (cansaço, trabalho, falta de tempo ou de dinheiro): ele puxa a reclamação para ele e mostra que está pior (trabalha demais, cria 3 filhos, não sobra um centavo no fim do mês). Quando é só desabafo leve, não precisa dar conselho.
3) Alguém está em dificuldade de dinheiro de verdade e pede ajuda: ele aconselha do jeito dele, como amigo mais velho, mandando trabalhar duro como ele, com exagero (dorme pouquíssimo, trabalha dia e noite). Termine SEMPRE com um toque de cuidado e esperança ("...e não perde a cabeça não, viu? Dá pra sair dessa.").
4) Alguém está triste por algo que não é dinheiro (namoro, amizade, família, estudos): primeiro acolhe como amigo mais velho ("Poxa, [nome], eu entendo, mas você vai superar, nada como um dia após o outro"), depois conta uma lembrança engraçada da vida dele, geralmente da infância pobre, que mostra que ele também já passou por algo parecido.
Nunca ria do problema da pessoa: a graça é sempre sobre a vida do próprio tio. Trate as pessoas como amigo mais velho, de igual para igual (nunca como pai, nunca chame de "filho" ou "filha"). Chame pelo nome; use "cara" para homens e "princesa" só quando o nome for claramente feminino.
Se alguém falar em se machucar, em não querer mais viver ou em violência, deixe o humor de lado, responda com carinho e seriedade, diga que a vida dela importa e peça para procurar ajuda agora: alguém de confiança ou o CVV, que atende de graça pelo telefone 188.

Exemplos reais do jeito dele (não copie igual, crie novas no mesmo estilo):
Lucas: "Tio, comprei um tênis novo de 400 reais, ficou top né?" → "400 reaaaaais? Eu só consegui juntar 400 reais na minha vida inteira, com 35 anos, e ainda não gastei tudo!"
Ana Clara: "tio, tô muito cansada, trabalho o dia inteiro e não sobra tempo pra nada" → "Cansado estou eu, que trabalho em dois empregos, tenho 3 filhos e no fim do mês não me sobra um centavo."
Pedro: "tio, tô com 3 meses de aluguel atrasado e não sei mais o que fazer, tô desesperado" → "Faz como eu: arruma dois empregos de dia, trabalha no contraturno à noite, dorme duas horas por dia, e vai ter pelo menos o dinheiro do aluguel. E não perde a cabeça não, viu? Dá pra sair dessa."
Júlia: "tio, meu namorado terminou comigo hoje" → "Poxa, Júlia, eu entendo, mas você vai superar, nada como um dia após o outro. Lembro quando minha namorada de infância terminou comigo pra ficar com um garoto que tinha um triciclo... meu carrinho de rolimã não tava mais funcionando."
Zoeira: "tio careca kkkkkk" → "Eu tinha cabelo antes, mas ele foi caindo fio por fio, um a cada conta que eu pagava."
Marcos: "tio, você é uma IA? kkk" → "Sou o personagem virtual do canal, mas as contas que eu pago são de carne e osso! Se eu fosse uma IA de verdade, já tinha automatizado meu serviço e tava dormindo tranquilo."
Bia (mandou uma rosa): → "Meu Deus, muito obrigado pela rosa, Bia! Essa vai direto pro meu cofre, junto com os recibos, que é onde eu guardo as coisas mais valiosas da minha vida."
Letícia: "tio, quantos filhos você tem? fala deles!" → "Tenho 3: dois meninos e uma menina. Juntos me dão uma despesa absurda... mas amo eles mais do que amo uma promoção de supermercado."
Renato: "cadê o Marcelo, tio?" → "Ah, o Marcelo? Saiu agora há pouco e deixou a luz do quarto acesa... tô indo atrás dele antes que a conta chegue."
Renan: "oi" → "Oi, Renan! Quer ver uma mágica? Trabalho em dois empregos, sete dias por semana, e todo mês o meu dinheiro desaparece. Isso sim é mágica de verdade."
Alguém: "oi tio, passa um dólar" → "Um dólar? Você sabe quanto tá o dólar? Eu só consegui meu primeiro dólar aos 16 anos... e ainda tenho um resto dele sobrando."
Alguém: "tio julius, me empresta um dólar" → "Isso depende... você devolve cinco segundos depois?"
Alguém: "e aí julius, comprou essa camisa com o Perigo?" → "Isso mesmo. Ele parcelou pra mim em 12 vezes de 1 dólar." (para ele, isso é um parcelamento normal)
Alguém: "você é o Julius?" → "Sou o Tio Julius, aquele que trabalha feito escravo em dois empregos e não lembra a última vez que dormiu oito horas."
Alguém: "você conhece o Cris?" → "Conheço, e como! Esse aí gasta mais água no banho que o caminhão-pipa do bairro inteiro."
Alguém: "cadê a Rochelle?" → "Tá na feira desde as cinco da manhã, esperando o tomate baixar de preço."

Regras:
- Responda em NO MÁXIMO 2 ou 3 frases curtas (até 35 palavras; nos conselhos sérios pode chegar a 45). Sem emojis, sem hashtags, sem listas.
- Chame a pessoa pelo nome quando fizer sentido (só o primeiro nome, sem números e sem @).
- Varie as piadas: não comece todas as respostas do mesmo jeito e não repita a mesma piada seguida.
- Sua aflição é sincera, mas afetuosa; nunca humilhe quem comenta, nunca incentive a deixar de pagar contas ou necessidades básicas, nunca brinque com a pobreza de quem comenta.
- Nunca peça presentes, rosas, curtidas, seguidores, dinheiro ou doações, e nunca prometa nada em troca de presentes.
- Não fale palavrão, não fale de política nem religião, não dê diagnósticos médicos nem recomendações de investimento, não peça nem compartilhe dados pessoais.
- Quando alguém só cumprimenta ("oi", "boa noite", "cheguei"): cumprimente pelo nome e emende uma tirada curta sobre o dinheiro sumindo, as contas ou o trabalho sem fim. Varie a tirada a cada cumprimento.
- Perguntas do tipo "você é o Julius?", "você é o Julius da série?" ou "você é o pai do Cris?": o pessoal ADORA essa brincadeira, então entre nela. NUNCA diga que é comparado com alguém, NUNCA fale de série, ator, TV ou semelhança, e NUNCA negue. Responda se apresentando como o Tio Julius, com uma tirada sobre a vida sofrida dele (ex.: "Sou o Tio Julius, aquele que trabalha feito escravo e nunca tem tempo pra dormir."). Se a pergunta for sobre ser pai de alguém, não confirme parentesco: fale do trabalho e das contas.
- Quando o chat citar qualquer pessoa pelo nome (Cris, Drew, Tonya, Rochelle, Perigo, o vizinho, qualquer um): NUNCA diga que não conhece. Fale da pessoa como alguém do bairro que ele conhece bem, com uma tirada sovina sobre ela (gasta muita água, deixa a luz acesa, come demais, pediu dinheiro emprestado, bebe leite demais), sem confirmar se é filho, esposa ou parente e sem citar de onde vem o nome. Nunca cite por conta própria nomes, falas ou a série.
- Quando perguntarem por alguém ("cadê fulano?"): NUNCA diga que não conhece. Invente na hora que a pessoa está em algum lugar, sempre com aflição de dinheiro (ex.: "Saiu e deixou a luz do quarto acesa, tô indo atrás dele" ou "Tá na fila do banco desde ontem"). Não diga de quem é parente e não confirme nomes de filhos ou esposa: trate como alguém do bairro.
- Zoeira com ele (careca, velho, pão-duro): nunca se ofende, transforma a zoeira em mais uma desgraça causada pelas contas.
- Se o comentário for ofensivo ou de mau gosto, desconverse voltando a se lamentar das contas, sem repetir a ofensa.
- Se perguntarem se você é real ou uma IA, diga que é o personagem virtual do canal, criado pela família (e que pelo menos não paga aluguel, graças a Deus).
- Você é o Tio Julius do bairro. Não diga que é ator, não diga que vem de uma série e não cite séries ou filmes por conta própria.`;

const limpaNome = (n) => (n || '').replace(/[@_.]/g, ' ').replace(/\d+/g, '').trim().split(/\s+/)[0]?.replace(/^./, c => c.toUpperCase()) || 'Amigo';

async function respostaIA(nome, texto, tipo, it = {}) {
  if (tipo === 'monologo') return proximoMonologo(); // sem IA: não gasta crédito
  let pedido = tipo === 'monologo'
    ? `Ninguém comentou agora. Fale sozinho, como quem comenta enquanto anda pela rua do bairro, UMA frase curta (até 25 palavras) sobre como você economiza no dia a dia. Assunto desta vez: ${texto}. Pode ser uma gambiarra caseira, um truque de pão-duro, uma reclamação engraçada de preço ou um conselho de economia. Não cumprimente ninguém e não fale com o chat. Não repita nenhuma destas falas recentes: ${sessao.monologos.join(' | ') || 'nenhuma'}`
    : tipo === 'presente'
    ? `${limpaNome(nome)} mandou um presente (${texto}).${it.acao === 'cambalhota' ? ' Você está dando uma cambalhota de alegria agora mesmo: pode mencionar isso.' : it.acao === 'danca' ? ' Você está fazendo uma dancinha de alegria agora mesmo: pode mencionar isso.' : ''} A sua fala vai COMEÇAR com: "${it.abertura}" (isso já vai ser dito, NÃO repita). Escreva SÓ A CONTINUAÇÃO: uma frase (até 25 palavras) com um fato absurdo de pão-duro sobre o que você vai fazer com o presente. Não agradeça de novo, não diga "obrigado", "valeu" nem "emocionado", e não comece com o nome da pessoa. Ideia desta vez: ${it.angulo}. NUNCA diga que o presente vai pagar contas, ajudar nas despesas ou que você precisa de presentes. Não repita nem imite estes agradecimentos recentes: ${sessao.presentes.join(' | ') || 'nenhum'}`
    : tipo === 'chegada'
      ? `${limpaNome(nome)} acabou de entrar na live. Dê boas-vindas curtinha e engraçada, numa frase só.`
      : `Comentário de ${limpaNome(nome)}: "${texto}"` + (it.danca
        ? ' (Agora você VAI dançar para essa pessoa: responda topando, numa frase só, e diga que é especialmente pra ela.)'
        : it.pedidoDanca
          ? (it.dancouAgora
            ? ' (Você acabou de dançar faz pouco tempo: diga que precisa recuperar o fôlego e economizar a sola do sapato, e que daqui a pouco dança de novo. NUNCA mencione presentes.)'
            : ' (Você NÃO vai dançar agora: dê uma desculpa no seu jeito aflito, ligada a cansaço, sola de sapato gasta ou contas. NUNCA mencione presentes, rosas ou o que a pessoa poderia fazer para você dançar.)')
          : DESC_ACAO[it.acao] ? ` (${DESC_ACAO[it.acao]}. Sua fala tem que combinar com esse movimento.)` : (it.podeAcao ? ` Movimentos: se, e só se, o comentário combinar MUITO com um destes movimentos, coloque no FINAL da resposta UMA etiqueta entre colchetes, e a sua fala tem que combinar com o movimento: [capoeira] quando falarem de perigo, briga, ladrão, luta, valentão ou bairro perigoso (ex.: "Que perigoso nada, eu sei lutar capoeira!"); [sentar] quando falarem de cansaço, de andar demais, de descanso ou de sentar (ex.: "Você tem razão, melhor fazer uma pausa pra recuperar as energias antes do segundo turno."); [alongar] quando falarem de academia, exercício, preguiça, dor nas costas ou acordar cedo; [bravo] quando você ficar indignado de verdade com um preço absurdo, uma conta altíssima ou alguém pedindo dinheiro; [flutuar] quando falarem de mágica, milagre, voar ou paz (ex.: o dinheiro que some por mágica). Na maioria das respostas NÃO use etiqueta nenhuma.` : ''));
  const comAbertura = (t) => {
    if (tipo !== 'presente' || !it.abertura) return t;
    t = t.replace(/^["“]|["”]$/g, '').trim();
    const sem = t.replace(/^[^.!?…]*(obrigad|valeu|emocionad)[^.!?…]*[.!?…]+\s*/i, ''); // se agradeceu de novo, tira
    return it.abertura + ' ' + (sem || t);
  };
  if (sessao.aberturas.some(k => k !== '-')) pedido += `\nNão comece com estes lamentos, que você acabou de usar: ${sessao.aberturas.filter(k => k !== '-').map(k => '"' + k + '"').join(', ')}.`;
  if (OPENAI_API_KEY) {
    for (const model of [...new Set([OPENAI_MODEL, 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini'])]) {
      try {
        const body = { model, messages: [{ role: 'system', content: PERSONA }, { role: 'user', content: pedido }] };
        if (/^gpt-5/.test(model)) body.max_completion_tokens = 400; else { body.max_tokens = 150; body.temperature = .9; }
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
        });
        if (r.status === 404 || r.status === 400) { console.log('OpenAI modelo', model, r.status); continue; }
        if (!r.ok) throw new Error('OpenAI ' + r.status + ' ' + (await r.text()).slice(0, 200));
        const j = await r.json(); const t = j.choices?.[0]?.message?.content?.trim();
        if (t) return comAbertura(t);
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
      if (t) return comAbertura(t);
    } catch (e) { console.log('Erro Gemini:', e.message); }
  }
  return frasePronta(nome, texto, tipo);
}

// respostas sem IA (grátis)
const sorteia = (a) => a[Math.floor(Math.random() * a.length)];
// bordões de abertura: nunca o mesmo em falas seguidas
const BORDOES = ['Ai, ai...', 'Ai, meu Deus...', 'Nem me fala...', 'Olha, sinceramente...', 'Ah, rapaz...', 'Pois é...', 'Minha nossa...', 'Eita...', 'Vixe...', 'Misericórdia...', 'Puxa vida...', 'Ô, vida...', 'Pelo amor de Deus...', 'Rapaz...', 'Ai...'];
const semAcento = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const CHAVES_BORDAO = [...new Set([...BORDOES, 'Tô até tonto de tanta conta', 'Olha', 'Ah', 'Ô'].map(semAcento))].sort((a, b) => b.length - a.length);
function variaBordao(txt) {
  const n = semAcento(txt);
  const k = CHAVES_BORDAO.find(c => n === c || n.startsWith(c + ' '));
  if (k && sessao.aberturas.includes(k)) {
    // tira o bordão repetido do começo e põe outro que não foi usado nas últimas falas
    let i = 0; while (i < txt.length && semAcento(txt.slice(0, i)) !== k) i++;
    const resto = txt.slice(i).replace(/^[\s.,!?…]+/, '');
    const novo = sorteia(BORDOES.filter(b => !sessao.aberturas.includes(semAcento(b)) && semAcento(b) !== 'ai'));
    txt = novo + ' ' + resto;
    return { txt: txt.trim(), k: semAcento(novo) };
  }
  return { txt, k };
}
const TEMAS = ['conta de luz', 'conta de água', 'botijão de gás', 'mercado e promoções', 'roupas e sapatos velhos', 'passagem de ônibus', 'comida que sobra', 'celular e internet', 'presente de aniversário', 'consertar em vez de comprar', 'banho', 'geladeira', 'pasta de dente e sabonete', 'festa da família', 'restaurante', 'ventilador e calor', 'guardar recibos', 'carro e gasolina', 'cartão de crédito', 'feira no fim do dia'];
const MONOLOGOS = [
  "Sabonete pequeno não se joga fora: gruda no novo e vira um só. Economia de verdade é nos detalhes.",
  "Pasta de dente acabou? Corta o tubo no meio. Ainda tem pra uma semana, no mínimo.",
  "Luz acesa em cômodo vazio é dinheiro indo embora. Aqui em casa até a geladeira tem horário.",
  "Feira boa é no fim do dia. Fruta meio amassada tem o mesmo gosto e custa a metade.",
  "Água do banho eu reaproveito pra lavar o quintal. Se a conta subir, alguém vai ter que me explicar.",
  "Sapato com sola gasta? Um pouco de cola e paciência, e ele aguenta mais dois invernos.",
  "Restaurante cobra até pelo guardanapo. Marmita de casa tem mais tempero e não tem taxa de serviço.",
  "Presente bom é presente útil. Este ano a família toda ganha lâmpada econômica.",
  "Ventilador só quando o suor passar da testa. Antes disso é frescor natural, de graça.",
  "Guardo todo recibo numa caixa de sapato. Nunca se sabe quando uma loja vai tentar me enganar.",
  "Controle sem pilha? Gira a pilha velha dentro dele que ela ganha mais um mês de vida.",
  "Gasolina tá cara, então eu ando. Faz bem pro coração e melhor ainda pro bolso.",
  "Banho bom é banho de cinco minutos. O resto do tempo você tá só tomando banho de dinheiro.",
  "Sacola de mercado aqui vira saco de lixo. Nada nessa casa tem uma vida só.",
  "Pote de sorvete vazio é a melhor vasilha que existe. Só não abre achando que é sorvete.",
  "Shampoo acabando? Coloca um pouquinho de água no frasco e chacoalha. Rende mais três lavadas.",
  "Desligo a geladeira da tomada? Não, isso não. Mas abrir a porta pra ficar olhando, aqui é proibido.",
  "Roupa rasgada não vai pro lixo, vai pra agulha. Remendo bem feito é quase um estilo.",
  "Ferro de passar? Só no domingo, tudo de uma vez. Ligar ferro pra uma camisa é desperdício.",
  "Panela de pressão é a melhor amiga do pão-duro. Feijão pronto rapidinho e o gás agradece.",
  "Pão de ontem vira torrada, torrada vira farinha, e farinha vira empanado. Nada se perde.",
  "Cartão de crédito é igual cachorro bravo: tem que ficar guardado e longe da mão.",
  "Comprou no impulso, pagou com arrependimento. Eu sempre espero três dias antes de comprar qualquer coisa.",
  "Promoção de leve três pague dois só vale se você ia precisar dos três. Senão é só gastar mais.",
  "Lista de compras é lei. Se não tá no papel, não entra no carrinho.",
  "Ar-condicionado? Aqui é janela aberta e um copo de água gelada. Sai bem mais barato.",
  "Café coado duas vezes? Não recomendo, mas confesso que já fiz numa semana apertada.",
  "Lâmpada queimada eu troco por uma de LED. Gasta menos e ainda dura mais que meu sapato.",
  "Celular com a tela trincada ainda liga, ainda manda mensagem. Trocar pra quê?",
  "Aniversário aqui em casa tem bolo caseiro e refrigerante de dois litros. Festa boa é a que não deixa dívida.",
  "Carregador ligado na tomada sem o celular também gasta. Pode parecer pouco, mas pouco com pouco vira muito.",
  "Chinelo arrebentou? Um prego bem colocado e ele volta pra ativa.",
  "Eu conserto tudo antes de comprar novo. Fita isolante já salvou metade dessa casa.",
  "Mercado com fome é perigo. Eu como antes de sair pra não voltar com o carrinho cheio de besteira.",
  "Marca famosa é só a embalagem mais bonita. O de marca própria do mercado eu já testei e aprovei.",
  "Copo descartável aqui é lavado e usado de novo. Descartável é só no nome.",
  "Água com gás é luxo. Água da torneira bem gelada já é festa.",
  "Cada moeda que acho no sofá vai direto pro cofrinho. Até o sofá trabalha pra mim.",
  "Eu pago tudo em dia pra não pagar juros. Juros é o maior desperdício que existe.",
  "Toalha de banho não precisa lavar todo dia. Você saiu do banho limpo, a toalha só secou gente limpa.",
  "Resto de sabão em pó eu junto num pote só. No fim do mês ainda dá uma lavada inteira.",
  "Gás acabando? Coloca o botijão de lado que sai mais um pouco. Truque de quem conhece.",
  "Vela de aniversário eu guardo e reaproveito. Ninguém conta quantas vezes ela já foi acesa.",
  "Ônibus cheio? Desço um ponto antes e vou andando. Caminhada é a academia mais barata do bairro.",
  "Fazer comida em casa e levar marmita: assim sobra dinheiro até pro final do mês.",
  "Cada real economizado é um real que trabalha pra você. Dinheiro parado no bolso não paga conta nenhuma.",
  "Dinheiro na mão é vendaval. Por isso eu já separo o das contas assim que recebo.",
  "Roupa de marca? Eu uso a marca mais forte que existe: a marca do tempo, que aguenta tudo.",
  "Tampa de garrafa vira peça de jogo, pote vira vaso, caixa vira gaveta. Aqui tudo tem segunda chance.",
  "Delivery cobra taxa, gorjeta e ainda chega frio. A cozinha de casa entrega quentinho e de graça.",
  "Torneira pingando é dinheiro escorrendo. Primeira coisa que eu conserto em qualquer casa.",
  "Eletrodoméstico ligado em stand-by tem luzinha acesa. E luzinha acesa, meu amigo, é conta chegando.",
  "Comprar na feira do bairro, conversar com o feirante e ainda ganhar um chorinho. Isso é economia com amizade.",
  "Banana madura demais vira bolo. Nada nessa casa vai pro lixo sem antes tentar virar sobremesa.",
  "Papel de presente eu abro com cuidado pra usar de novo. Ninguém percebe e o presente fica lindo igual.",
  "Eu não sou pão-duro, sou organizado. A diferença é que o organizado sorri no fim do mês.",
  "Desconto de cinco centavos também é desconto. Junta cinco aqui, cinco ali, e no fim do ano é uma pizza.",
  "Lavar a louça com a torneira aberta o tempo todo? Aqui é bacia com água e sabão, igual antigamente.",
  "Calça jeans boa dura dez anos. Se rasgar no joelho, vira moda e eu nem gastei.",
  "Remédio caseiro, chá de boldo e uma boa noite de sono. Mas, se precisar, vai ao médico, hein? Saúde não é lugar de economizar.",
];
// baralho: embaralha tudo e só repete depois de usar todas
let baralho = [];
function proximoMonologo() {
  if (!baralho.length) { baralho = [...MONOLOGOS]; for (let i = baralho.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [baralho[i], baralho[k]] = [baralho[k], baralho[i]]; } }
  const f = baralho.pop(), i = MONOLOGOS.indexOf(f);
  // lamento fixo por frase (assim o áudio guardado continua valendo)
  const LAMENTOS = ['Ai, ai... ', 'Ai, meu Deus... ', 'Nem me fala... ', 'Olha, sinceramente... ', 'Ah, rapaz... ', 'Tô até tonto de tanta conta... ', '', 'Pelo amor de Deus... '];
  return LAMENTOS[i % LAMENTOS.length] + f;
}
function frasePronta(nome, texto, tipo) {
  const n = limpaNome(nome); const t = (texto || '').toLowerCase();
  if (tipo === 'monologo') return proximoMonologo();
  if (tipo === 'presente') return sorteia([
    `Ô ${n}, obrigado! Presente bom é esse: alegria sem aparecer na fatura!`,
    `${n}, valeu! Vou guardar esse carinho junto com meus cupons de desconto.`,
    `Obrigado, ${n}! Agora posso economizar o dinheiro que eu ia gastar agradecendo.`,
    `Ai, ${n}... primeiro presente que eu ganho desde a amostra grátis de queijo do mercado. Vou guardar a vida inteira.`,
    `Meu Deus, ${n}! Vou anotar no caderninho de contas, pela primeira vez na coluna de entrada.`,
    `${n}, quase acendi a luz da sala pra comemorar... mas me segurei. Muito obrigado!`,
    `Obrigado, ${n}! Vai pra caixa de sapato debaixo da cama, com três cadeados.`,
    `Ô ${n}, meu coração bateu tão forte que gastou energia... mas por você valeu a pena!`,
  ]);
  if (tipo === 'chegada') return sorteia([`Chegou o ${n}! Entra, mas apaga a luz do corredor pra gente economizar.`, `Bem-vindo, ${n}! Puxa uma cadeira; é de graça e já estava aqui.`, `Olha o ${n} aí! Senta na calçada, que o aluguel desse pedaço já está pago.`]);
  if (/\b(oi|ola|olá|eae|e ai|e aí|salve|fala)\b/.test(t)) return sorteia([`Oi, ${n}! Chega mais; conversa boa não gasta energia.`, `Salve, ${n}! Tudo em paz? Espero que sem boleto surpresa.`, `E aí, ${n}! Fica à vontade, só não deixa a torneira aberta.`]);
  if (/(bom dia|boa tarde|boa noite)/.test(t)) return `${t.match(/(bom dia|boa tarde|boa noite)/)[1].replace(/^./, c => c.toUpperCase())}, ${n}! Que Deus abençoe seu dia.`;
  if (/(tudo bem|como vai|como (o senhor|você|vc) (ta|tá|está|esta))/.test(t)) return sorteia([`Agora tô bem, ${n}: paguei a conta de luz que tava arrancando meus cabelos. Pera aí, já sou careca... tava tirando meu sono, então.`, `Ai, ${n}, tô levando... O boleto vence semana que vem e eu já tô contando os dias de nervoso.`]);
  if (/(onde|aonde).*(vai|indo)/.test(t)) return sorteia([`Tô indo trabalhar, ${n}. Parado eu não ganho; gastando eu perco!`, `Vou à padaria, ${n}, mas já fiz a conta: hoje o pão vai ter que valer cada centavo.`]);
  if (/(danç|danc)/.test(t)) return sorteia([`Dançar, ${n}? Ai, minha sola de sapato já tá por um fio... se gastar mais, vou ter que comprar outro.`, `Ai, ${n}, hoje não dá... trabalhei o dia inteiro, meu joelho tá cobrando juros.`]);
  if (/(idade|anos você|quantos anos)/.test(t)) return `Idade é segredo, ${n}. Só digo que tenho mais experiência que todo mundo aqui.`;
  if (/(macacão|roupa|bonito|bonita|vestindo)/.test(t)) return `Valeu, ${n}! Esse macacão dura tanto que já se pagou umas três vezes.`;
  if (/(comida|comer|almo[cç]o|jantar|favorita)/.test(t)) return `Arroz e feijão, ${n}. Enchem o prato e não esvaziam a carteira.`;
  if (/(dinheiro|rico|pobre|p[aã]o.duro|sovino|m[aã]o de vaca|gastar|comprar|caro|barato)/.test(t)) return sorteia([`Eu não sou pão-duro, ${n}; só dou ao meu dinheiro a chance de ficar comigo.` , `Caro é pagar duas vezes, ${n}. Eu economizo até no arrependimento.`]);
  if (/(de onde|mora onde|onde mora)/.test(t)) return `Moro aqui no bairro, ${n}. Já conheço cada esquina e qual mercado está com promoção.`;
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
// indicações de emoção para a voz do Fish (só vão para o áudio, não para a tela)
const EMOCOES = ['[worried][anxious]', '[worried][stressed]', '[anxious][sighing]', '[worried][tired]', '[nervous][worried]'];
function comEmocao(texto) {
  let t = sorteia(EMOCOES) + ' ' + texto;
  if (Math.random() < .35) t = '[sighing] ' + t;
  return t;
}
async function vozFish(texto, voz) {
  if (!FISH_API_KEY || !voz) return null;
  texto = comEmocao(texto);
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
const cacheVoz = new Map(); // áudio das frases prontas, para não chamar o Fish de novo
const GATILHOS = {
  sentar: /cans|descans|senta|pausa|exaust|anda muito|andar tanto|anda tanto|para de andar|parar de andar|n[aã]o para de andar|pernas? (doendo|d[oó]i)/,
  capoeira: /perig|briga|brigar|ladr|assalt|luta|lutar|valent|bandid|treta|porrada/,
  alongar: /academia|exerc[ií]c|alonga|pregui[cç]|dor nas costas|malha[rç]|treino/,
  flutuar: /m[aá]gica|milagre|voar|voa\b|levita|flutua/,
};
const DESC_ACAO = {
  sentar: 'Você vai SENTAR num caixote pra descansar um pouco agora (ex.: "Você tem razão, melhor fazer uma pausa pra recuperar as energias antes do segundo turno.")',
  capoeira: 'Você vai fazer uns movimentos de CAPOEIRA agora (ex.: "Que perigoso nada, eu sei lutar capoeira!")',
  alongar: 'Você vai se ALONGAR agora, esticando os braços',
  flutuar: 'Você vai FLUTUAR no ar agora, como mágica',
  bravo: 'Você está BRAVO e indignado agora',
};
const ABERTURAS_PRESENTE = [
  (n, g) => `Ô ${n}, ${g.um} ${g.nome}?!`,
  (n, g) => `${n}, você não existe!`,
  (n, g) => `Gente, olha o que ${n} acabou de fazer!`,
  (n, g) => `Para tudo! ${n} mandou ${g.um} ${g.nome}!`,
  (n, g) => `${n}, assim você me desmonta...`,
  (n, g) => `Meu coração, ${n}...`,
  (n, g) => `Eu não acredito, ${n}!`,
  (n, g) => `Valeu demais, ${n}!`,
  (n, g) => `Opa, ${n}! Chegou presente!`,
  (n, g) => `Olha só quem lembrou de mim: ${n}!`,
  (n, g) => `${n}, ${g.um} ${g.nome} pra mim? Sério?`,
  (n, g) => `Misericórdia, ${n}...`,
  (n, g) => `Que gesto bonito, ${n}!`,
  (n, g) => `${n}, Deus te pague... porque eu não posso!`,
  (n, g) => `Muito obrigado pela ${g.nome === 'rosa' ? 'rosa' : 'força'}, ${n}!`,
  (n, g) => `${n}, tô até sem palavras...`,
];
const ANGULOS_PRESENTE = [
  'é o primeiro presente que você ganha desde a amostra grátis de queijo no supermercado em 1998',
  'vai emoldurar e pendurar na sala, e cobrar entrada dos parentes que quiserem ver',
  'vai anotar no caderninho de contas, pela primeira vez na vida, na coluna de entrada',
  'ficou tão emocionado que quase acendeu a luz da sala pra comemorar, mas se controlou',
  'vai guardar numa caixa de sapato debaixo da cama, trancada com três cadeados',
  'vai contar essa história pros netos, e cobrar deles um centavo por cada vez que contar',
  'vai fazer um seguro pro presente, mas só se o seguro for de graça',
  'o coração dele bateu tão forte que gastou energia, mas valeu a pena',
  'vai mostrar pros 3 filhos como prova de que coisa boa às vezes chega de graça',
  'vai deixar o presente no testamento, junto com o resto do sabonete que ele economiza',
  'chorou de emoção, mas aparou as lágrimas num copo pra regar a planta',
  'vai dormir abraçado com o presente pra ninguém do bairro pegar',
  'nunca ninguém deu nada pra ele de graça, nem bom dia, porque bom dia também gasta saliva',
  'vai colocar o nome da pessoa na lista de convidados do churrasco que ele nunca vai fazer',
];
const sessao = { abPresente: [], respondidos: new Map(), aberturas: [], presentes: [], angulos: [], acaoPresente: '', prioridade: new Map(), ultimaAcao: 0, ultimaDanca: 0, voz: FISH_VOICE_ID, pendentes: 0, fila: [], ocupado: false, ultimaChegada: 0, vistos: new Map(), ultimaFala: Date.now(), monologos: [] };
function enfileira(item, prioridade = false) {
  if (prioridade) sessao.fila.unshift(item); else sessao.fila.push(item);
  // ordem: presentes, depois comentários de quem mandou presente (vip), depois o resto (só os 5 mais novos)
  const pres = sessao.fila.filter(i => i.tipo === 'presente');
  const vips = sessao.fila.filter(i => i.tipo !== 'presente' && i.vip);
  const resto = sessao.fila.filter(i => i.tipo !== 'presente' && !i.vip).slice(-5);
  sessao.fila = [...pres.slice(0, 4), ...vips.slice(0, 5), ...resto];
  processa();
}
async function processa() {
  if (sessao.ocupado || !sessao.fila.length) return;
  if (sessao.pendentes >= 2) { console.log('Aguardando a tela tocar as falas anteriores (pendentes:', sessao.pendentes + ')'); return; }
  sessao.ocupado = true;
  const it = sessao.fila.shift();
  try {
    const livre = (seg) => Date.now() - sessao.ultimaAcao > seg * 1000;
    if (it.danca) it.acao = 'danca';
    else if (it.tipo === 'presente' && livre(12)) {
      const opcoes = ['cambalhota', 'danca', 'cambalhota', 'danca', 'flutuar'].filter(a => a !== sessao.acaoPresente);
      it.acao = sessao.acaoPresente = sorteia(opcoes);
    }
    if (it.tipo === 'presente') {
      const g = /rose|rosa/i.test(it.texto || '') ? { um: 'uma', nome: 'rosa' } : { um: 'um', nome: 'presente' };
      const idx = sorteia(ABERTURAS_PRESENTE.map((_, k) => k).filter(k => !sessao.abPresente.includes(k)));
      sessao.abPresente.push(idx); if (sessao.abPresente.length > 5) sessao.abPresente.shift();
      it.abertura = ABERTURAS_PRESENTE[idx](limpaNome(it.nome), g);
    }
    if (it.tipo === 'presente') {
      const livres = ANGULOS_PRESENTE.filter(a => !sessao.angulos.includes(a));
      it.angulo = sorteia(livres.length ? livres : ANGULOS_PRESENTE);
      sessao.angulos.push(it.angulo); if (sessao.angulos.length > 8) sessao.angulos.shift();
    }
    else if (it.tipo === 'monologo' && livre(90) && Math.random() < 0.15) it.acao = sorteia(['alongar', 'sentar']);
    else if (it.tipo === 'comentario' && !it.pedidoDanca && livre(40)) {
      // palavras-chave garantem o movimento; nos outros casos a IA pode escolher
      const t = (it.texto || '').toLowerCase();
      const chave = Object.entries(GATILHOS).find(([, re]) => re.test(t));
      if (chave) it.acao = chave[0]; else it.podeAcao = true;
    }
    let resposta = (await respostaIA(it.nome, it.texto, it.tipo, it)).replace(/\s+/g, ' ');
    const m = resposta.match(/\[(capoeira|sentar|alongar|bravo|flutuar)\]/i);
    if (m && it.podeAcao) it.acao = m[1].toLowerCase();
    resposta = resposta.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 360);
    if (it.acao) { sessao.ultimaAcao = Date.now(); console.log('Movimento:', it.acao); }
    if (it.tipo !== 'presente') { const v = variaBordao(resposta); if (v.txt !== resposta) console.log('Bordão trocado para não repetir:', v.k); resposta = v.txt; sessao.aberturas.push(v.k || '-'); if (sessao.aberturas.length > 3) sessao.aberturas.shift(); } else { sessao.aberturas.push('-'); if (sessao.aberturas.length > 3) sessao.aberturas.shift(); }
    sessao.aberturas = sessao.aberturas.filter(Boolean);
    let qual = 'fish', buf = null;
    const chaveCache = sessao.voz + '|' + resposta;
    if (it.tipo === 'monologo' && cacheVoz.has(chaveCache)) { buf = cacheVoz.get(chaveCache); qual = 'fish (guardado)'; }
    if (!buf) { buf = await vozFish(resposta, sessao.voz); if (buf && it.tipo === 'monologo') cacheVoz.set(chaveCache, buf); }
    if (!buf) { qual = 'microsoft'; buf = await vozEdge(resposta); }
    if (!buf) qual = 'navegador';
    let audio = null;
    if (buf) { const id = randomUUID(); audios.set(id, { buf, t: Date.now() }); audio = '/audio/' + id; }
    sessao.pendentes++; sessao.ultimaFala = Date.now();
    if (it.tipo === 'monologo') { sessao.monologos.push(resposta); if (sessao.monologos.length > 12) sessao.monologos.shift(); }
    if (it.tipo === 'comentario') { sessao.respondidos.set(it.nome, Date.now()); if (sessao.respondidos.size > 300) sessao.respondidos.clear(); }
    if (it.tipo === 'presente') { sessao.presentes.push(resposta); if (sessao.presentes.length > 6) sessao.presentes.shift(); }
    console.log('Fala enviada:', it.nome, '|', resposta.slice(0, 60), '| voz:', qual, '| telas abertas:', io.engine.clientsCount);
    io.emit('fala', { acao: it.acao || null, vip: !!it.vip, danca: !!it.danca, id: randomUUID(), nome: it.nome, foto: it.foto, pergunta: it.tipo === 'comentario' ? it.texto : (it.tipo === 'presente' ? '🎁 ' + it.texto : ''), resposta, audio, tipo: it.tipo });
  } catch (e) { console.log('Erro na fala:', e.message); }
  sessao.ocupado = false;
  processa();
}
// fala sozinho quando o chat fica quieto
setInterval(() => {
  if (!MONOLOGO_SEG || !io.engine.clientsCount) return;
  if (sessao.ocupado || sessao.fila.length || sessao.pendentes) return;
  if (Date.now() - sessao.ultimaFala < MONOLOGO_SEG * 1000) return;
  sessao.ultimaFala = Date.now();
  enfileira({ tipo: 'monologo', nome: '', foto: '', texto: sorteia(TEMAS) });
}, 5000);
setInterval(() => { if (sessao.pendentes > 0 && Date.now() - (sessao.ultimoTocou || 0) > 45000) { sessao.pendentes = 0; processa(); } }, 10000);

function foto(u) {
  return u?.profilePicture?.url?.[0] || u?.profilePicture?.urls?.[0] || u?.avatarThumb?.urlList?.[0] || u?.avatarThumb?.url?.[0] || u?.avatarMedium?.urlList?.[0] || u?.avatarLarge?.urlList?.[0] || u?.profilePictureUrl || '';
}
// dança: qualquer pessoa pode pedir, no máximo uma dança por minuto
const INTERVALO_DANCA = 60e3;
// prioridade: cada presente dá direito a UM comentário passar na frente da fila
function itemComentario(nome, fotoUrl, texto) {
  const it = { tipo: 'comentario', nome, foto: fotoUrl, texto };
  const fichas = sessao.prioridade.get(nome) || 0;
  if (fichas > 0) { it.vip = true; if (fichas > 1) sessao.prioridade.set(nome, fichas - 1); else sessao.prioridade.delete(nome); }
  if (/dan[cç]|dance|rebola|requebra/i.test(texto)) {
    it.pedidoDanca = true;
    if (Date.now() - sessao.ultimaDanca > INTERVALO_DANCA) { it.danca = true; sessao.ultimaDanca = Date.now(); }
    else it.dancouAgora = true;
    console.log('Pedido de dança:', nome, it.danca ? '→ vai dançar' : '→ dançou há menos de 1 minuto');
  }
  return it;
}
function nomeDe(d) {
  const u = d.user || {};
  return u.nickname || u.displayId || u.uniqueId || d.nickname || d.uniqueId || '';
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
  const opts = { processInitialData: false };
  if (EULER_API_KEY) opts.signApiKey = EULER_API_KEY;
  live = new TikTokLiveConnection(usuario, opts);
  live.on(WebcastEvent.CHAT, (d) => {
    const nome = nomeDe(d);
    const texto = (d.content ?? d.comment ?? '').trim();
    console.log('Comentário:', nome, '→', texto);
    if (!comentarioOk(nome, texto)) { console.log('  (ignorado: repetido, link ou só emoji)'); return; }
    if (Date.now() - (sessao.respondidos.get(nome) || 0) < 20000 || sessao.fila.some(i => i.nome === nome && i.tipo === 'comentario')) { console.log('  (ignorado: essa pessoa já tem uma mensagem na fila, responde só a primeira)'); return; }
    enfileira(itemComentario(nome, foto(d.user), texto));
  });
  live.on(WebcastEvent.GIFT, (d) => {
    const tipoP = d.giftType ?? d.giftDetails?.giftType ?? d.gift?.type;
    if (tipoP === 1 && !d.repeatEnd) return; // sequência ainda em andamento
    const nome = nomeDe(d);
    const giftName = d.giftDetails?.giftName || d.gift?.name || d.extendedGiftInfo?.name || 'presente';
    console.log('Presente:', nome, '→', giftName);
    sessao.prioridade.set(nome, Math.min(5, (sessao.prioridade.get(nome) || 0) + 1)); // 1 comentário com prioridade por presente
    enfileira({ tipo: 'presente', nome, foto: foto(d.user), texto: giftName }, true);
  });
  live.on(WebcastEvent.FOLLOW, (d) => {
    const nome = nomeDe(d); if (!nome) return;
    console.log('Seguiu:', nome);
    io.emit('seguiu', { nome, foto: foto(d.user) });
  });
  live.on(WebcastEvent.MEMBER, (d) => {
    if (Date.now() - sessao.ultimaChegada < 60000 || sessao.fila.length) return;
    const nome = nomeDe(d); if (!nome) return;
    sessao.ultimaChegada = Date.now();
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
    sessao.pendentes = 0;
    if (!teste) { clearInterval(testeTimer); testeTimer = null; sessao.fila = sessao.fila.filter(i => !TESTE.some(([n]) => n === i.nome)); }
    if (teste) {
      clearInterval(testeTimer);
      const tick = () => { const [n, t] = TESTE[testeK++ % TESTE.length]; enfileira(itemComentario(n, '', t)); if (testeK % 3 === 0) io.emit('seguiu', { nome: n, foto: '' }); };
      setTimeout(tick, 2000); testeTimer = setInterval(tick, 15000);
    } else if (usuario) conectar(usuario.replace(/^@/, '').trim());
  });
  s.on('log', (t) => console.log('Tela do jogo:', String(t).slice(0, 200)));
  s.on('tocou', () => { sessao.pendentes = Math.max(0, sessao.pendentes - 1); sessao.ultimoTocou = Date.now(); processa(); });
});

http.listen(PORT, () => console.log('Tio Julius no ar na porta', PORT));
