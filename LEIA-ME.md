# Tio Julius no Bairro — live do TikTok

O tio anda por um bairro 3D estilo anos 80 e responde o chat da live com voz.

## Como colocar no ar (GitHub + Render)

1. Crie um repositório novo no GitHub (ex.: `tio-julius`) e envie TODOS os arquivos desta pasta
   (Add file → Upload files → arraste tudo, inclusive as pastas `public` e `src`).
2. No Render: New → Blueprint → escolha esse repositório → Apply.
3. Quando o Render pedir as variáveis, preencha:
   - `OPENAI_API_KEY`: sua chave da OpenAI (para respostas inteligentes). Pode deixar vazio: aí ele usa frases prontas, grátis.
   - `GEMINI_API_KEY`: opcional, alternativa grátis do Google no lugar da OpenAI.
   - `FISH_API_KEY`: chave da API do Fish Audio (fish.audio → API Keys). Pode deixar vazio por enquanto.
   - `FISH_VOICE_ID`: o ID da voz (Model Id). Pode deixar vazio e colar depois na tela inicial do jogo.
4. Espere o deploy terminar e abra o endereço que o Render mostrar (ex.: `https://tio-julius.onrender.com`).

## Como usar

- Tela inicial: digite o @ da conta que está ao vivo e, se quiser, o ID da voz do Fish. Clique em CONECTAR NA LIVE.
- MODO TESTE: comentários de exemplo, para ver e ouvir tudo funcionando sem live.
- Link direto (para o TikTok LIVE Studio, sem precisar clicar):
  `https://SEU-ENDERECO.onrender.com/?user=SEU_ARROBA&voz=ID_DA_VOZ&auto=1`

## Voz

1º Fish Audio (modelo grátis `s2.1-pro-free`) com o ID que você colocar.
2º Se o Fish falhar ou estiver sem chave/ID: voz grátis da Microsoft (Antonio, português).
3º Se as duas falharem: a voz do próprio navegador.

## O que acontece na live

- Comentário: o tio responde em voz, com balão mostrando a foto, o @ e o comentário.
- Presente: ele dança e agradece.
- Alguém entra: de vez em quando ele dá boas-vindas.
- Ele nunca pede presente, e não há nenhum texto na tela pedindo presente.
- A câmera troca de ângulo sozinha e fica de frente para ele quando ele fala.

## Para mexer no visual (avançado)

O código do jogo fica em `src/`. Depois de mudar, rode `npm install` e `npm run build` para gerar `public/jogo.bundle.js`.
