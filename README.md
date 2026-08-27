# Gato Virtual

Um gato que vive no seu bolso — não um bichinho de botão, mas uma simulação de
um gato de verdade: com fome, sede, sono, temperamento e vontade própria.

PWA feito em React + Three.js. Instalável pelo navegador do celular, funciona
offline e não depende de servidor: tudo roda no aparelho.

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

**Cada gato é único.** A semente sorteia sete traços de temperamento e a
pelagem. Um gato arisco pode levar semanas para deixar você encostar.

## Números que a simulação respeita

| Grandeza | Valor | Origem |
|---|---|---|
| Consumo de ração | ~60 g/dia (adulto 4,5 kg) | manutenção calórica |
| Consumo de água | ~200 ml/dia | dieta só de ração seca |
| Sono | 12–16 h/dia, em blocos | etologia felina |
| Uso da caixa | 3–5 vezes/dia | idem |
| Peso ao adotar | 0,9 kg (8 semanas) | curva de crescimento |
| Peso adulto | 4,5 kg (12–24 meses) | idem |
| Altura na cernelha | ~25 cm | proporções do modelo |

## O corpo é construído, não importado

Não há modelo 3D no repositório: o gato é gerado por código a cada quadro.

- **Coluna** — 30 pontos gerados por acúmulo de ângulo, o que deixa o corpo
  arquear, torcer e enrolar como um corpo inteiro, não como peças articuladas.
- **Pernas** — IK analítico de dois ossos por membro, com o segmento digitígrado
  que faz o gato parecer andar na ponta dos dedos. Recolher a perna encurta os
  ossos e desliza o pé para debaixo do corpo, porque uma perna dobrada em Z
  ocupa muito menos espaço do que a soma dos seus segmentos.
- **Marchas** — caminhada em sequência lateral, trote diagonal e galope saltado,
  com a frequência da passada derivada da velocidade real: o pé nunca patina.
- **Cauda** — Verlet perseguindo uma curva-alvo definida pela musculatura, o que
  dá o peso e o atraso de uma cauda de verdade sem nunca sair de controle.
- **Pelagem** — textura procedural (rajado, marmorizado, sólido, bicolor,
  escaminha) com o mapa espelhado em torno da barriga, para não haver costura no
  dorso; sobre ela, pelo em cascas deslocadas ao longo da normal e um material
  físico com brilho de veludo.
- **Rosto** — pupila em fenda vertical que dilata com a excitação, pálpebras que
  fecham de verdade, orelhas que achatam com o estresse, bigodes que se abrem
  quando ele está alerta.

## Rodar

```bash
npm install
npm run dev       # desenvolvimento
npm run build     # produção em dist/
npm run preview   # servir o build
```

Para instalar no celular: abra o endereço no navegador e use "Adicionar à tela
de início".

## Ferramentas de desenvolvimento

`tools/` traz os utilitários usados para validar o resultado sem depender de
olhar na mão:

```bash
node tools/multishot.mjs <dir> '[{"name":"side","behavior":"walk","cam":[1.3,0.13,1.05]}]'
node tools/uitest.mjs <dir>       # percorre a interface inteira e reporta erros
node tools/offlinetest.mjs        # simula ausências de 8 h a 7 dias
node tools/makeicons.mjs          # regenera os ícones do PWA
```

Todos precisam do `npm run preview` rodando em `127.0.0.1:4173`. A cena expõe
`window.__catScene` com `freeze()`, `setCamera()` e `cat` para inspeção.

## Estrutura

```
src/sim/      necessidades, crescimento, saúde, economia, persistência
src/ai/       escolha de comportamento e locomoção
src/render/   anatomia, esqueleto, poses, pelagem, cena
src/ui/       interface React
```

## Próximos passos

- Notificações push quando o pote esvazia ou a saúde cai
- Migração para React Native (a camada `src/sim` e `src/ai` é agnóstica de
  plataforma; só `src/render` e `src/ui` precisam de porte)
- Compras reais para ração, remédio e veterinário
