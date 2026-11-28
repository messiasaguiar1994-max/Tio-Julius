# Tio Julius no Bairro — live do TikTok

O tio anda por um bairro 3D estilo anos 80 e responde o chat da live com voz.

## Como colocar no ar (GitHub + Render)

1. Crie um repositório novo no GitHub (ex.: `tio-julius`) e envie TODOS os arquivos desta pasta
   (Add file → Upload files → arraste tudo, inclusive as pastas `public` e `src`).
2. No Render: New → Blueprint → escolha esse repositório → Apply.
3. Quando o Render pedir as variáveis, preencha:
   - `OPENAI_API_KEY`: sua chave da OpenAI (para respostas inteligentes). Pode deixar vazio: aí ele usa frases prontas, grátis.
   - `GEMINI_API_KEY`: opcional, alternativa grátis do Google no lugar da OpenAI.
   - `FISH_API_KEY`: chave da API do Fish Audio (fish.audio → API Keys).
   - `FISH_VOICE_ID`: ID/Reference ID da voz cadastrada no Fish Audio.
4. Espere o deploy terminar e abra o endereço que o Render mostrar (ex.: `https://tio-julius.onrender.com`).

## Como usar

- Tela inicial: digite o @ da conta que está ao vivo e, se quiser, o ID/Reference ID da voz do Fish. Clique em CONECTAR NA LIVE.
- MODO TESTE: comentários de exemplo, para ver e ouvir tudo funcionando sem live.
- Link direto (para o TikTok LIVE Studio, sem precisar clicar):
  `https://SEU-ENDERECO.onrender.com/?user=SEU_ARROBA&voz=ID_DA_VOZ&auto=1`

## Voz

Para ativar o Fish Audio, cadastre `FISH_API_KEY` e `FISH_VOICE_ID` nas variáveis privadas do serviço no Render. A tela do jogo aceita somente o ID da voz; a chave deve ficar no Render e nunca no navegador, no link ou em arquivos públicos. Depois de salvar as variáveis, faça um novo deploy.

1º Fish Audio (modelo `s2.1-pro-free`) com o ID configurado.
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

## Histórias nos presentes
As 50 lembranças absurdas do Tio Julius ficam no arquivo `historias.js` (dá para editar ou acrescentar lá).
Quando alguém manda um presente, ele sempre agradece e, às vezes, conta uma história (da biblioteca ou improvisada pela IA no mesmo estilo).
- Chance padrão: 40% dos presentes, com no mínimo 75 segundos entre uma história e outra e nunca quando há outro presente esperando na fila.
- Para mudar a chance, crie no Render a variável `CHANCE_HISTORIA` (ex.: `0.25` = 25%, `0.6` = 60%).
