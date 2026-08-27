# Gato Virtual

Um gato que vive no seu bolso — não um bichinho de botão, mas uma simulação de
um gato de verdade: com fome, sede, sono, temperamento e vontade própria.

PWA feito em React + Three.js. Instalável pelo navegador do celular, funciona
offline e não depende de servidor: tudo roda no aparelho.

## O gato é o modelo esculpido, animado por um esqueleto gerado na hora

O `public/models/cat.glb` chegou como uma casca única de 98 mil vértices, sem
ossos e sem animação — um modelo de impressão 3D, apesar de anunciado como
"game ready". Em vez de virar estátua, ele passa por um rigger automático que lê
a anatomia da própria malha e monta 38 ossos sobre ela. A partir daí responde ao
mesmo sistema de poses, marchas e IK do gato procedural, que segue no projeto
como reserva caso o arquivo falte.

## O que faz dele um gato, e não um tamagotchi

**Ele cresce no tempo do calendário.** Chega com oito semanas, pesando cerca de
900 g, e leva um ano real para virar adulto de 4,5 kg. A curva de peso segue os
valores de referência veterinária, e a escala do modelo é a raiz cúbica da razão
de peso — por isso o filhote tem as proporções certas, e não é um adulto
reduzido. A cabeça encolhe proporcionalmente conforme ele cresce.

**O tempo passa com o app fechado.** A simulação avança em passos fixos de um
minuto desde o último instante registrado, então ele come, bebe, usa a caixa e
dorme enquanto você não está olhando. Deixar ração e água antes de sair é a
diferença entre voltar para um gato bem e para um gato desidratado.

**Ele decide, você não manda.** O comportamento sai de uma disputa contínua
entre impulsos — fome, bexiga, tédio, sono, medo, afeto — pesados pelo
temperamento dele e pelo ritmo crepuscular (picos de atividade ao amanhecer e ao
entardecer). Às vezes ele vem quando você chama. Às vezes escolhe a soneca.

**Carinho tem limite.** Todo gato tem um teto de tolerância ao toque. Passar dele
custa confiança, e acordar um gato que está dormindo custa mais ainda.

**Cada gato é único, e a perda é definitiva.** A semente sorteia sete traços de
temperamento. Se você negligenciar a ponto de perdê-lo, ele não volta: fica um
memorial com o nome, quanto viveu, do que morreu e quem ele era. O próximo gato
terá outro temperamento — nunca o mesmo.

**Ele esconde a doença, como todo gato.** O app nunca avisa que ele está doente:
gato é presa, e mostrar fraqueza é instinto de morte. O que muda é o
comportamento — ele engasca, espirra, para de se lamber, se esconde, recusa a
ração, anda encolhido. Perceber é trabalho seu. Quem dá nome ao quadro é o
veterinário, e é isso que torna a consulta uma decisão em vez de um botão.

**Onde você encosta importa.** Queixo, bochecha e base da cauda são bem-vindos —
é onde ele próprio se esfrega em você. Barriga, patas e cauda não são: a barriga
exposta é confiança, não convite, e quem insiste leva mordida. Um gato arisco
não deixa encostar em lugar nenhum até confiar.

## Números que a simulação respeita

| Grandeza | Valor | Origem |
|---|---|---|
| Consumo de ração | ~60 g/dia (adulto 4,5 kg) | manutenção calórica |
| Consumo de água | ~200 ml/dia | dieta só de ração seca |
| Sono | 12–16 h/dia, em blocos | etologia felina |
| Uso da caixa | 3–5 vezes/dia | idem |
| Peso ao adotar | 0,9 kg (8 semanas) | curva de crescimento |
| Peso adulto | 4,5 kg (12–24 meses) | idem |
| Altura na cernelha | ~25 cm | medida no modelo importado |
| Negligência até a perda | 5 a 6 dias | resistência real sem água |
| Autonomia do pote de água | ~1,5 dia | 320 ml |
| Autonomia da fonte | ~4 dias | 1,2 L que não envelhece |

## Como uma escultura vira um gato que anda

O rigging automático acontece no aparelho, uma vez, ao abrir o app.

1. **Limpeza** (`meshclean`) — solda vértices coincidentes e descarta tudo que
   não seja o maior componente conexo: o arquivo traz um fragmento solto
   flutuando atrás do gato. Converte os atributos quantizados do meshopt para
   float, sem o que qualquer escrita nos buffers truncaria os valores a zero — as
   normais somem e o modelo renderiza inteiramente preto sob luz.
2. **Anatomia** (`skeletonize`) — fatia o corpo ao longo do eixo focinho-cauda e
   lê a estrutura dos cortes. O tronco é a região larga que toca o chão pelas
   pernas; o pescoço fica logo à frente do último corte com patas no solo; a
   cauda é reconstruída por anéis de distância a partir da base, porque um corte
   transversal deixa de descrevê-la assim que ela sobe.
3. **Ossos e pesos** (`glbrig`) — 38 ossos com a pose original como bind, e peso
   por proximidade aos segmentos, com falloff agressivo e corte das influências
   residuais: sem isso o osso de uma perna puxa a carne da outra e o tronco
   derrete ao andar.
4. **Pose** (`glbpose`) — traduz os mesmos `PoseParams` do gato procedural,
   preservando a curvatura que o escultor pôs na malha, convertendo metros para
   a escala do modelo e assentando o corpo em três iterações até a pata encostar
   no chão.

O que anima esses ossos é o mesmo sistema de sempre: IK analítico de dois ossos
por perna com segmento digitígrado, marchas reais (caminhada em sequência
lateral, trote diagonal, galope saltado) com a frequência da passada derivada da
velocidade para o pé não patinar, e cauda em Verlet perseguindo uma curva-alvo
muscular.

O gato procedural (`cat.ts`, `rig.ts`, `coat.ts`, `fur.ts`) continua completo no
projeto: corpo gerado por código a cada quadro, pelagem procedural em cinco
padrões e rosto com pupila em fenda que dilata. Ele entra em cena se o modelo
esculpido não puder ser carregado.

## Rodar

### No celular, sem computador — pela Vercel

Não exige configurar nada no GitHub, e cada push republica sozinho.

1. Abra **vercel.com** no navegador do celular e entre com **Continue with
   GitHub**
2. **Add New…** → **Project**
3. Encontre **virtual-cat** na lista e toque em **Import**
4. Toque em **Deploy** sem mudar nada — o `vercel.json` já traz o build correto

Em cerca de um minuto sai uma URL do tipo `virtual-cat-xxxx.vercel.app`. Abra,
toque no menu do navegador e use **Adicionar à tela de início**: a partir daí o
app roda em tela cheia e funciona sem internet.

O branch de trabalho já é o padrão do repositório, então a Vercel o escolhe
sozinho — não é preciso mexer em branch nenhum.

### Alternativa: GitHub Pages

O workflow `.github/workflows/deploy.yml` publica no Pages, mas só roda por
disparo manual (aba **Actions** → **Run workflow**) e exige ligar o Pages antes,
em **Settings → Pages → Source: GitHub Actions**. Sem esse passo o envio falha
com `Ensure GitHub Pages has been enabled`.

### Localmente

```bash
npm install
npm run dev       # desenvolvimento em http://localhost:5173
npm run build     # produção em dist/
npm run preview   # servir o build já compilado
```

O primeiro carregamento monta o esqueleto do modelo no aparelho e leva alguns
segundos; depois disso o app abre direto.

## Ferramentas de desenvolvimento

`tools/` traz os utilitários usados para validar o resultado sem depender de
olhar na mão:

```bash
node tools/poseshot.mjs <dir> '[{"name":"sit","behavior":"sit","cam":[1.3,0.15,1.0]}]'
node tools/glbshot.mjs <dir>      # desenha o esqueleto extraído sobre a malha
node tools/uitest.mjs <dir>       # percorre a interface inteira e reporta erros
node tools/offlinetest.mjs        # ausências de 8 h a 5 dias, até a perda
node tools/deathtest.mjs <dir>    # confere que nenhuma tela entrega o diagnóstico
node tools/fountaintest.mjs       # autonomia com e sem fonte de água
node tools/deploytest.mjs <dir>   # serve o build como em produção e confere assets e PWA
node tools/offlinepwa.mjs         # corta a rede e confere que o app ainda abre
node tools/makeicons.mjs          # regenera os ícones do PWA
```

Todos precisam do `npm run preview` rodando em `127.0.0.1:4173`. A cena expõe
`window.__catScene` com `freeze()`, `setCamera()` e `cat` para inspeção.

## Estrutura

```
src/sim/      necessidades, crescimento, doença, morte, toque, economia
src/ai/       escolha de comportamento e locomoção
src/render/   rigging do modelo, poses, marchas, cena e cômodo
src/ui/       interface React, memorial
tools/        validação visual e de simulação
public/models/cat.glb   o gato esculpido
```

## Notificações

O app avisa sobre o **ambiente** — pote vazio, água velha, caixa suja —, nunca
sobre a saúde dele. Descobrir que o gato está doente continua sendo trabalho do
dono, e um aviso automático destruiria justamente a mecânica central.

Limitação honesta: sem servidor de push, o navegador só dispara esses avisos
enquanto a aba continua viva em segundo plano. Fechada de vez, o aviso não
chega. Resolver isso exige um servidor de push ou o app nativo.

## Próximos passos

- Servidor de push, para os avisos de ambiente chegarem com o app fechado
- Ossos de orelha no modelo importado: orelha achatada é o sinal de humor mais
  legível de um gato, e a malha esculpida ainda tem o rosto estático
- Migração para React Native (`src/sim` e `src/ai` são agnósticos de plataforma;
  só `src/render` e `src/ui` precisam de porte)
- Compras reais para ração, remédio e veterinário
