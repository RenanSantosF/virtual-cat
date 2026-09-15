# Arquitetura — Virtual Cat

## 1. Estrutura de Dados e Ciclo de Crescimento Biológico

`CatState` é o agregado persistido e versionado. A idade deriva de `birth`, nunca de um contador de frames. `growth.ts` interpola uma curva de massa com suavização cúbica, converte massa em escala linear e calcula neotenia separadamente, permitindo cabeça, olhos e membros mudarem de proporção sem saltos. A média móvel de nutrição modula a massa, enquanto `motorCapabilities` libera coordenação, corrida, salto e acesso a móveis continuamente. O renderer só consome esses valores: simulação e apresentação permanecem desacopladas.

## 2. Sistema de Homeostase, Termodinâmica e Saúde

O motor avança em passos fixos de um minuto tanto ao vivo quanto no retorno offline. Fome, sede, sono, eliminação, higiene, afeto e estímulo têm taxas independentes; comida possui idade e água possui frescor. A caixa combina número de usos e tempo, registra acidentes persistentes e eleva risco urinário. `climate.ts` contém um modelo térmico RC com inércia da sala e limites de conforto dependentes da idade. `weather.ts` é o adaptador externo opcional; sem localização ou rede, um ciclo sazonal/diário determinístico mantém a simulação funcional. Exposição térmica, doenças e negligência convergem em saúde, estresse e, finalmente, mortalidade.

## 3. Behavior Tree / IA Comportamental Autônoma para o Ambiente da Sala

`brain.ts` implementa utility AI, equivalente a uma behavior tree cuja seleção pontua impulsos concorrentes. Medo e necessidades críticas preemptam lazer; histerese e duração mínima impedem oscilações robóticas. Destinos semânticos da sala ficam em `world.ts`. Frio cria desejo de buscar eletrônicos quentes; sujeira gera relutância à caixa; idade bloqueia ações motoras impossíveis. Decisão, navegação e animação são camadas distintas. A máquina de animação recebe intenções e velocidade, executando cross-fades, enquanto a locomoção gira o corpo antes de avançar.

## 4. Gerador de Personalidade Única e Sistema de Memorial de Óbito

A adoção cria uma semente de 31 bits e dela deriva sete traços contínuos por PRNG determinístico. O genótipo dá a identidade inicial; médias de segurança, nutrição e contato moldam lentamente apenas traços secundários. Após `died`, `advance` torna-se terminal: não há ressurreição no save. O memorial é escrito separadamente e de forma idempotente, contendo semente, vida exata, causa, traços, vínculo e ações compartilhadas. Uma nova adoção cria outra identidade, não uma cópia.

## 5. Implementação de Código Core

O fluxo é `store -> advance -> stepOnce`: persistência fornece tempo absoluto, `advance` fatia o intervalo e `stepOnce` atualiza termodinâmica, metabolismo, autonomia, saúde e aprendizado nessa ordem. O render loop lê o mesmo agregado, pede uma decisão à IA em frequência limitada e passa somente postura/velocidade/escala ao sistema gráfico. Adaptadores impuros (storage, geolocalização e HTTP) vivem nas bordas; crescimento, clima e seleção comportamental são funções testáveis. Novos cômodos ou provedores meteorológicos podem ser adicionados sem alterar as equações vitais.
