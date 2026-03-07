# Dúvidas para Iniciar a Implementação do Core

Este documento reúne apenas os pontos que realmente precisam de confirmação antes de começar a implementar o núcleo do jogo.

A ideia é evitar retrabalho e começar pelo que entrega valor mais rápido: magia, mana, HP, hitbox, dano e base para combos.

## 1. O que já está claro

Pelos documentos e pelo pedido atual, estes pontos já podem ser tratados como direção principal:

- O foco inicial deve ser nas mecânicas centrais, não em UI completa, fases, lobby ou polish.
- O jogo deve priorizar magias, combos, HP, mana, hitbox e resposta de dano.
- O projeto continua em Phaser 3 + TypeScript.
- O multiplayer existe no plano, mas não precisa bloquear o início do sistema de magia.
- Você quer usar os spritesheets de fogo agora para validar o sistema de magia.
- O asset `Explosion 2 SpriteSheet.png` pode ser usado como magia de área de fogo para os primeiros testes.

## 2. Conflitos encontrados nos documentos

Antes de desenvolver, há um conflito importante que precisa ser fechado:

### 2.1 Perspectiva do jogo

Os documentos não estão alinhados:

- `MUDANCAS_NECESSARIAS.md` fala em mudar para isométrico. NÃO MUDE PARA ISOMÉTRICO
- `docs/MUDANCAS_NECESSARIAS.md` também fala em isométrico. NÃO VAI SER ISOMÉTRICO, VAI SER TOP DOWN
- `docs/PLANEJAMENTO_DESENVOLVIMENTO.md` define top-down.
- `docs/RESUMO_E_DECISOES_CRIATIVAS.md` define top-down.

### Recomendação técnica

Para começar o core de magia com velocidade e reaproveitar o projeto atual, a melhor decisão é:

- **manter top-down no MVP inicial**

Se a escolha for isométrica agora, a implementação das mecânicas centrais fica mais lenta porque muda junto:

- câmera
- mapa
- colisão
- leitura visual de direção
- reaproveitamento dos sprites atuais

## 3. Perguntas que bloqueiam a primeira implementação

Responda estas primeiro. Com elas fechadas já dá para começar o desenvolvimento.

### 3.1 Perspectiva final do MVP inicial

Escolha uma:

- [X] Top-down
- [ ] Isométrico

Se você não tiver preferência forte agora, a recomendação é **Top-down**.

### 3.2 Escopo do primeiro vertical slice

Sugestão de recorte inicial para desenvolver primeiro:

- 1 jogador local SIM
- 1 magia de projétil de fogo
- 1 magia de área de fogo usando `Explosion 2 SpriteSheet.png`
- sistema de mana
- sistema de HP
- hitbox/hurtbox
- dano em inimigo
- cooldown básico
- 1 inimigo adaptado para testar combate

Pergunta:

- [X] Sim, esse deve ser o primeiro slice
- [ ] Não, quero incluir também: ______________________

### 3.3 Multiplayer entra agora ou depois do core solo?

Escolha uma:

- [X] Primeiro fazer o core solo bem estruturado, depois adaptar para multiplayer
- [ ] Já quero começar com arquitetura pronta para multiplayer, mas teste inicial ainda solo
- [ ] Já quero multiplayer funcional desde a primeira implementação

### 3.4 Ataque melee continua ou sai agora?

Hoje o player ainda usa espada. Para iniciar o sistema novo, preciso saber se:

- [X] A espada deve ser removida logo no começo
- [ ] A espada pode continuar temporariamente enquanto as magias entram
- [ ] A espada continua como ataque secundário fixo

### 3.5 Layout de input do core

Proposta mais simples para começar:

- `Z` = magia do slot 1
- `X` = magia do slot 2
- `C` = trocar elemento do slot ativo ou alternar loadout

Pergunta:

- [ ] Pode seguir essa proposta
- [X] Quero outro layout: __eu queria que a pessoa andasse com wasd, e castasse magia com os numeros, 1,2 3 etc. E mire com o mouse onde a magia vai cair____________________

### 3.6 Quais magias entram primeiro no código?

Minha recomendação para o primeiro passo:

- magia 1: **Fire Bolt / Fire Ball**
- magia 2: **Fire Area / Explosion 2**

Isso permite testar:

- projétil
- área de efeito
- custo de mana
- cooldown
- hitbox única e hitbox em área

Pergunta:

- [X] Sim, começar com duas magias de fogo para validar o sistema
- [ ] Não, quero começar com: ______________________

### 3.7 Como os combos devem entrar no primeiro passo?

Aqui existem 3 caminhos possíveis:

- [X] Sem combo no primeiro passo, só deixar a arquitetura pronta
- [ ] Primeiro combo já no core: Fogo + Gelo
- [ ] Primeiro combo já no core: outro ______________________

Recomendação:

- primeiro implementar a base de magia de forma limpa
- depois adicionar o primeiro combo em cima dessa base

### 3.8 Friendly fire

Escolha uma:

- [X] Não existe friendly fire
- [ ] Friendly fire completo
- [ ] Empurra aliado, mas não causa dano

### 3.9 Regra da magia de área de fogo

Para usar o `Explosion 2 SpriteSheet.png`, preciso fechar o comportamento exato:

- [ ] Explode instantaneamente e some
- [X] Cria uma área que dura alguns segundos e causa dano por tick
- [ ] Funciona como tornado circular de fogo puxando ou prendendo inimigos
- [ ] Outro comportamento: ______________________

Se quiser, você pode responder também:

- duração desejada: ___3 SEGUNDOS_______
- dano por tick ou dano único: ___DANO POR TICK _______
- consome quanto de mana: ____1/4 DA MANA DO PERSONAGEM_____

### 3.10 Regra do projétil de fogo

Escolha uma:

- [ ] Some ao bater no primeiro inimigo
- [ ] Atravessa inimigos
- [X] Explode ao bater em parede ou inimigo
- [ ] Outro comportamento: ______________________

### 3.11 Qual inimigo usar para os primeiros testes?

Recomendação:

- reutilizar a `Spider` primeiro, porque o comportamento dela é simples e já serve para validar HP, dano, hitbox e knockback

Escolha:

- [X] Usar Spider no primeiro teste
- [ ] Usar Wisp no primeiro teste
- [ ] Criar outro inimigo simples: ______________________

### 3.12 Balanceamento inicial pode ser provisório?

Para não travar desenvolvimento por números cedo demais:

- [X] Sim, pode usar valores provisórios e ajustar depois
- [ ] Não, quero definir agora os valores base

Se quiser definir agora, responda pelo menos:

- HP inicial do player: __________
- Mana máxima: __________
- Regeneração de mana por segundo: __________
- Custo da magia de projétil: __________
- Custo da magia de área: __________

## 4. Perguntas importantes, mas não bloqueadoras do primeiro passo

Estas não impedem começar o core, mas influenciam a arquitetura em seguida.

### 4.1 Slots e elementos

- O jogador começa com 2 slots fixos? SIM
- Cada slot guarda um elemento ou uma magia específica? CADA SLOT GUARDA 2 ELEMENTOS
- Trocar elemento muda a magia do slot ou muda só o elemento base? EU QUERIA QUE FUNCIONASSE QUE CADA ELEMENTO TEM ALGUMAS MAGIAS, ENTAO O ELEMENTO DE FOGO TEM A FIREAREA, FIREBOLT ETC.

### 4.2 Estados de conjuração

Para o MVP inicial, qual modelo você prefere?

- [X] Instantâneo ao apertar mas eu queria muito que tivesse a preview de onde a magia vai ficar, só nao sei como vai ficar a questão de mirar
- [ ] Segura para carregar e solta para lançar
- [ ] Entra em estado de preparação antes de lançar

### 4.3 Dano e reação ao hit

Quando uma magia acerta um inimigo, você quer:

- [x] só perder HP
- [ ] perder HP + knockback
- [ ] perder HP + knockback + invulnerabilidade curta

### 4.4 Morte do jogador

No modo solo inicial:

- [x] morreu = reinicia sala
- [ ] morreu = game over direto
- [ ] morreu = respawn com penalidade

### 4.5 UI mínima do primeiro passo

Para o primeiro ciclo de implementação, quer mostrar:

- [ ] barra de HP e mana já na tela
- [ ] só logs e comportamento interno por enquanto
- [x] HP/mana mínimos na tela, sem HUD final

## 5. Sugestão objetiva de começo

Se você quiser a rota mais segura e rápida, eu recomendo iniciar assim:

1. Manter top-down.
2. Fazer primeiro em single-player, mas com arquitetura compatível com multiplayer.
3. Remover a espada do fluxo principal e colocar magia no lugar do ataque.
4. Criar `ManaComponent`.
5. Criar tipos base de magia e elemento.
6. Criar uma magia de projétil de fogo.
7. Criar uma magia de área usando `Explosion 2 SpriteSheet.png`.
8. Adaptar colisão e dano contra a Spider.
9. Adicionar HP, mana, cooldown e hitbox funcionando.
10. Só depois disso subir o primeiro combo.

## 6. Como responder

Você pode responder direto neste documento ou me mandar as respostas no chat seguindo os números da seção 3.

Assim que essas decisões forem fechadas, eu já consigo começar a implementação do core sem ficar adivinhando regra de gameplay.