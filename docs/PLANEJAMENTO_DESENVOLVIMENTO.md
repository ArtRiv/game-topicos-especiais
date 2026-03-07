# Planejamento de Desenvolvimento

**Contexto das decisões:**
- Framework: Phaser 3 + TypeScript + Vite
- Câmera: Top-down (sem isometria)
- Multiplayer: obrigatório no MVP
- Equipe: 2-3 pessoas
- Prazo: 1 semestre

---

## Princípio de Ordenação

A ordem abaixo segue o princípio de **dependência + valor**:
- Funcionalidades que outras dependem vêm primeiro
- Funcionalidades "core" (que definem o jogo) têm prioridade sobre polish
- O multiplayer é integrado cedo porque é obrigatório e afeta toda a arquitetura
- Cada sprint entrega algo **testável e jogável**

---

## Visão Geral das Sprints

```
Sprint 1 ──── Infraestrutura base (networking + elemento mínimo)
Sprint 2 ──── Sistema de magia single-player funcional
Sprint 3 ──── Combos entre magias
Sprint 4 ──── Multiplayer jogável (2+ jogadores lançando magias)
Sprint 5 ──── Inimigos com mecânicas elementais
Sprint 6 ──── Ambiente interativo + puzzles
Sprint 7 ──── Progressão, UI e polish
Sprint 8 ──── Testes, balanceamento e entrega
```

---

## Sprint 1 — Infraestrutura e Base (Semanas 1-2)

### Objetivo: ter a base técnica pronta para tudo que vem depois

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 1.1 | **Criar tipos base de Elemento e Magia** | Novo: `src/common/magic-types.ts` | Dev A |
|     | Definir tipos `Element`, `SpellType`, `CastType`, `StatusEffect`, `ComboResult` | | |
| 1.2 | **Criar ManaComponent** | Novo: `src/components/game-object/mana-component.ts` | Dev A |
|     | Similar ao LifeComponent. Propriedades: mana, maxMana, regenRate. Métodos: spend(), regen(), isFull() | | |
| 1.3 | **Criar ElementComponent** | Novo: `src/components/game-object/element-component.ts` | Dev A |
|     | Armazena elementos desbloqueados e os 2 equipados. Método: switchElement() | | |
| 1.4 | **Preparar arquitetura de networking** | Novo: `src/networking/network-manager.ts` | Dev B |
|     | Escolher lib (Colyseus, Socket.io, ou WebSocket puro). Criar classe NetworkManager com connect/disconnect/sendState/onStateReceived | | |
| 1.5 | **Criar NetworkInputComponent** | Novo: `src/components/input/network-input-component.ts` | Dev B |
|     | Implementa InputComponent, mas recebe input via rede ao invés de teclado | | |
| 1.6 | **Criar cena de Lobby** | Novo: `src/scenes/lobby-scene.ts` | Dev B |
|     | Tela simples: criar sala / entrar em sala / lista de jogadores / botão iniciar | | |
| 1.7 | **Atualizar config.ts** | `src/common/config.ts` | Dev A |
|     | Adicionar constantes de mana, custos de magia, cooldowns, max players | | |
| 1.8 | **Atualizar event-bus.ts** | `src/common/event-bus.ts` | Dev A |
|     | Adicionar eventos: SPELL_CAST, COMBO_TRIGGERED, MANA_UPDATED, PLAYER_JOINED, PLAYER_LEFT | | |

### Entregável: componentes base + servidor de rede rodando + lobby funcional

---

## Sprint 2 — Sistema de Magia Solo (Semanas 3-4)

### Objetivo: o jogador lança magias ao invés de usar espada

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 2.1 | **Criar BaseSpell** | Novo: `src/game-objects/spells/base-spell.ts` | Dev A |
|     | Classe abstrata que define: element, damage, manaCost, cooldown, castType, métodos cast/update/onCollision. Estender Phaser.Physics.Arcade.Sprite | | |
| 2.2 | **Criar primeira magia: FireBall** | Novo: `src/game-objects/spells/fire-ball.ts` | Dev A |
|     | Projétil que anda em linha reta na direção do player. Causa dano ao hit. Usar Dagger como referência (já tem lógica de projétil) | | |
| 2.3 | **Criar segunda magia: IceWall** | Novo: `src/game-objects/spells/ice-wall.ts` | Dev A |
|     | Magia instantânea que cria uma parede/barreira de gelo na frente do player. Bloqueia inimigos temporariamente | | |
| 2.4 | **Criar SpellCastingComponent** | Novo: `src/components/game-object/spell-casting-component.ts` | Dev A |
|     | Gerencia conjuração: cooldowns por elemento, verificação de mana, instanciação de magia | | |
| 2.5 | **Criar CastingState** | Novo: `src/components/state-machine/states/character/casting-state.ts` | Dev A |
|     | Estado onde o player para, conjura, e dispara a magia. Transiciona para IdleState ao terminar | | |
| 2.6 | **Atualizar character-states.ts** | `src/components/state-machine/states/character/character-states.ts` | Dev A |
|     | Adicionar: CASTING_STATE, CHANNELING_STATE | | |
| 2.7 | **Adaptar Player para usar magias** | `src/game-objects/player/player.ts` | Dev A |
|     | Adicionar ManaComponent, ElementComponent, SpellCastingComponent. Trocar WeaponComponent/Sword por sistema de magias. Registrar CastingState na state machine | | |
| 2.8 | **Adaptar input para magias** | `src/components/input/input-component.ts` + `keyboard-component.ts` | Dev A |
|     | Z = lançar magia do slot 1, X = lançar magia do slot 2 (ou Z = magia, X = trocar elemento) | | |
| 2.9 | **Registrar colisões de magia** | `src/scenes/game-scene.ts` | Dev A |
|     | Adicionar collider: projéteis de magia ↔ inimigos, projéteis ↔ paredes | | |

### Entregável: Player lança FireBall e IceWall, gasta mana, tem cooldown, mata inimigos

---

## Sprint 3 — Sistema de Combos (Semanas 5-6)

### Objetivo: magias interagem entre si gerando efeitos combinados

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 3.1 | **Criar tabela de interações elementais** | Novo: `src/systems/magic/element-interactions.ts` | Dev A |
|     | Mapa de Element × Element → ComboResult. Ex: FIRE + ICE = explosão congelante, LASER + ICE = reflexão, etc. | | |
| 3.2 | **Criar ComboSystem** | Novo: `src/systems/magic/combo-system.ts` | Dev A |
|     | Detecta quando dois projéteis de elementos diferentes colidem. Consulta a tabela, instancia efeito combinado, destrói os projéteis originais | | |
| 3.3 | **Criar efeitos de combo** | Novo: `src/game-objects/spells/combo-effects/` | Dev A |
|     | Pelo menos 2-3 combos no MVP: FireIceExplosion, LaserReflect, e outro à escolha | | |
| 3.4 | **Registrar colisões entre magias** | `src/scenes/game-scene.ts` | Dev A |
|     | projétil de magia ↔ projétil de magia → chamar ComboSystem | | |
| 3.5 | **Criar 3ª e 4ª magias** | Novo: `laser-beam.ts`, `earth-wall.ts` | Dev B |
|     | Laser: feixe contínuo (canalizado, consome mana/seg). Terra: parede sólida temporária | | |
| 3.6 | **Efeitos visuais de combo** | Vários | Dev B |
|     | Partículas, flash, screen shake quando combo é ativado. Usar juice-utils.ts como base | | |

### Entregável: 2 jogadores locais (ou vs IA) podem combinar magias com resultado visual e de dano

---

## Sprint 4 — Multiplayer Funcional (Semanas 7-8)

### Objetivo: 2+ jogadores online jogam juntos lançando magias e fazendo combos

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 4.1 | **Sincronização de estado dos jogadores** | `src/networking/sync-manager.ts` (novo) | Dev B |
|     | Enviar/receber: posição, direção, estado da state machine, vida, mana. Delta compression ou snapshot interpolation | | |
| 4.2 | **Spawn de múltiplos jogadores** | `src/scenes/game-scene.ts` | Dev B |
|     | Ao invés de criar 1 Player, criar N Players baseado nos jogadores conectados. Players remotos usam NetworkInputComponent | | |
| 4.3 | **Sincronização de magias** | `src/networking/sync-manager.ts` | Dev B |
|     | Quando um jogador lança magia: enviar evento para todos. Instanciar projétil em todos os clientes | | |
| 4.4 | **Sincronização de inimigos** | `src/networking/sync-manager.ts` | Dev B |
|     | Host controla IA dos inimigos, envia posições para clientes. Dano é calculado no host | | |
| 4.5 | **Preview fantasma de magias** | Novo: `src/components/game-object/combo-preview-component.ts` | Dev A |
|     | Quando aliado está preparando magia, enviar via rede: elemento + posição + direção. Renderizar sprite semitransparente para aliados | | |
| 4.6 | **Diferenciar jogadores visualmente** | `src/game-objects/player/player.ts` | Dev A |
|     | Cor diferente para cada jogador (tint) ou sprite sheet diferente. Indicador de nome sobre a cabeça | | |
| 4.7 | **Tratamento de desconexão** | `src/networking/network-manager.ts` | Dev B |
|     | Player desconectado: remover da cena. Reconexão: restaurar estado | | |

### Entregável: 2-4 jogadores online em uma sala, lançando magias, fazendo combos juntos

---

## Sprint 5 — Inimigos e Combate (Semanas 9-10)

### Objetivo: inimigos com mecânicas que incentivam uso de magias e combos

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 5.1 | **Adicionar resistência elemental aos inimigos** | `src/game-objects/common/character-game-object.ts` | Dev A |
|     | Nova propriedade: resistances/weaknesses por elemento. Modificar hit() para aplicar multiplicador | | |
| 5.2 | **Criar inimigo com escudo frontal** | Novo: `src/game-objects/enemies/shield-enemy.ts` | Dev A |
|     | Só toma dano por trás ou quando escudo é quebrado por magia específica | | |
| 5.3 | **Criar inimigo à distância** | Novo: `src/game-objects/enemies/ranged-enemy.ts` | Dev A |
|     | Atira projéteis no jogador. Projétil pode ser refletido com IceWall/EarthWall | | |
| 5.4 | **Adaptar Spider com resistência elemental** | `src/game-objects/enemies/spider.ts` | Dev A |
|     | Dar fraqueza a um elemento e resistência a outro | | |
| 5.5 | **Criar boss com mecânica de ponto fraco** | `src/game-objects/enemies/boss/` | Dev A |
|     | Boss com escudo elemental + ponto fraco que só abre com combo específico. 2 vias: lenta (ataque direto) ou rápida (combo no ponto fraco) | | |
| 5.6 | **Efeitos de status** | Novo: `src/components/game-object/status-effect-component.ts` | Dev B |
|     | FROZEN (não move), BURNING (dano over time), STUNNED (sem ação). Criar FrozenState e StunnedState | | |
| 5.7 | **Scaling de dificuldade por nº de jogadores** | `src/scenes/game-scene.ts` | Dev B |
|     | Mais jogadores = mais inimigos spawnam / inimigos têm mais HP | | |

### Entregável: combate diverso que recompensa uso inteligente de elementos e combos

---

## Sprint 6 — Ambiente Interativo + Puzzles (Semanas 11-12)

### Objetivo: cenário como ferramenta de combate (pilar do GDD)

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 6.1 | **Criar sistema de superfícies interativas** | Novo: `src/game-objects/environment/interactive-surface.ts` | Dev A |
|     | Base class para superfícies que reagem a elementos. Propriedade: tipo de superfície, estado atual | | |
| 6.2 | **Superfície refletiva** | Novo: `src/game-objects/environment/reflective-surface.ts` | Dev A |
|     | Reflete projéteis de laser. Pode ser criada por gelo (congelar água = espelho) | | |
| 6.3 | **Superfície congelável** | Novo: `src/game-objects/environment/freezable-surface.ts` | Dev A |
|     | Água se torna gelo (walkable + reflete laser) quando atingida por IceWall | | |
| 6.4 | **Objeto inflamável** | Novo: `src/game-objects/environment/flammable-object.ts` | Dev B |
|     | Propaga fogo para objetos adjacentes. Usado em puzzles | | |
| 6.5 | **Criar pelo menos 1 puzzle** | Tiled map + `game-scene.ts` | Dev B |
|     | Ex: refletir laser em espelhos de gelo para atingir alvo atrás de parede. Envolve coop (um joga laser, outro cria o gelo) | | |
| 6.6 | **Ensino implícito** | Tiled map + events | Dev B |
|     | Primeiro momento da fase: um artefato dispara combo automaticamente mostrando a mecânica ao jogador | | |
| 6.7 | **Adicionar tiles/properties no Tiled** | `src/common/tiled/` | Dev B |
|     | Novos tipos de superfície: REFLECTIVE, FREEZABLE, FLAMMABLE. Propriedades nos tiles do mapa | | |

### Entregável: pelo menos 1 fase com ambiente interativo e 1 puzzle cooperativo

---

## Sprint 7 — Progressão, UI e Polish (Semanas 13-14)

### Objetivo: o jogo se sente completo

| # | Tarefa | Arquivo(s) envolvido(s) | Dev |
|---|--------|------------------------|-----|
| 7.1 | **Sistema de XP e level up** | Novo: `src/systems/progression/xp-system.ts` | Dev A |
|     | XP por inimigo/boss, level up desbloqueia melhorias de magia (maior área, menor cooldown, mais dano) | | |
| 7.2 | **UI: barra de mana** | `src/scenes/ui-scene.ts` | Dev B |
|     | Barra visual abaixo dos corações ou no canto. Muda de cor quando mana baixa | | |
| 7.3 | **UI: indicadores de elemento equipado** | `src/scenes/ui-scene.ts` | Dev B |
|     | 2 ícones mostrando quais elementos estão nos slots, com indicador de cooldown | | |
| 7.4 | **UI: feedback de combo** | `src/scenes/ui-scene.ts` | Dev B |
|     | Texto flutuante ou efeito visual quando um combo é realizado ("COMBO!", nome do combo) | | |
| 7.5 | **UI: vida e mana de todos os jogadores** | `src/scenes/ui-scene.ts` | Dev B |
|     | Em coop, mostrar mini-HUD de cada jogador conectado | | |
| 7.6 | **Tela título** | Novo: `src/scenes/title-scene.ts` | Dev A |
|     | Logo + Play / Multiplayer / Opções | | |
| 7.7 | **Adaptar Game Over para multiplayer** | `src/scenes/game-over-scene.ts` | Dev A |
|     | Game over coletivo ou revive? Baseado na decisão criativa | | |
| 7.8 | **SFX básico** | Vários | Dev B |
|     | Sons de conjuração, impacto de magia, combo, dano. Pode usar assets gratuitos | | |

### Entregável: jogo com UI completa, progressão funcional, e sensação de produto acabado

---

## Sprint 8 — Testes, Balanceamento e Entrega (Semanas 15-16)

| # | Tarefa | Dev |
|---|--------|-----|
| 8.1 | **Playtesting com 4 jogadores** | Todos |
| 8.2 | **Balancear dano, mana, cooldowns** | Dev A |
| 8.3 | **Testar edge cases de rede** (desconexão, lag, reconexão) | Dev B |
| 8.4 | **Bug fixes** | Todos |
| 8.5 | **Otimizar performance** (muitos projéteis, partículas) | Dev A |
| 8.6 | **Build final para PC e mobile** | Dev B |
| 8.7 | **Documentação final e apresentação** | Todos |

### Entregável: MVP jogável, testado e apresentável

---

## Divisão Sugerida para Equipe de 2-3 Devs

| Responsabilidade | Dev A (Gameplay) | Dev B (Infra/Rede) | Dev C (Arte/UI) |
|-----------------|-----------------|-------------------|-----------------|
| Sistema de magia | ✅ | | |
| Combos | ✅ | | |
| Inimigos | ✅ | | |
| Networking | | ✅ | |
| Sincronização | | ✅ | |
| Lobby | | ✅ | |
| UI/HUD | | | ✅ |
| Efeitos visuais | | | ✅ |
| Level design | | | ✅ |
| Áudio | | | ✅ |

> Se forem 2 devs, Dev C é dividido entre A e B.

---

## Dependências Críticas (o que bloqueia o quê)

```
Sprint 1 (tipos + mana + networking)
  │
  ├──→ Sprint 2 (magia solo) ──→ Sprint 3 (combos) ──→ Sprint 5 (inimigos)
  │                                                         │
  └──→ Sprint 4 (multiplayer) ◄─────────────────────────────┘
                 │
                 └──→ Sprint 6 (ambiente) ──→ Sprint 7 (polish) ──→ Sprint 8 (entrega)
```

**Caminho crítico:** Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 7 → Sprint 8

As Sprints 2 e 4 podem ser desenvolvidas **em paralelo** por devs diferentes.
Sprint 5 e 6 dependem de 3 e 4 mas também podem ser parcialmente paralelas.

---

## Decisão Importante: Qual Lib de Networking Usar?

| Opção | Prós | Contras |
|-------|------|---------|
| **Colyseus** | Framework pronto para jogos, state sync automático, fácil de deployar | Dependência grande, menos controle |
| **Socket.io** | Muito popular, fácil de usar, boa docs | Não é otimizado para jogos em tempo real |
| **WebSocket puro** | Controle total, sem dependências | Mais código manual |
| **WebRTC (PeerJS)** | P2P, menor latência, sem servidor dedicado | Mais complexo, NAT traversal |

**Recomendação:** **Colyseus** — é feito para jogos multiplayer em tempo real com Phaser, tem state sync e rooms built-in, e o servidor pode rodar em Node.js. Reduz muito o trabalho de networking.

---

## Checklist de "Pronto para Passar para Outra IA"

Antes de entregar as sprints para uma IA de desenvolvimento, garanta que:

- [ ] As decisões criativas do `RESUMO_E_DECISOES_CRIATIVAS.md` estão respondidas
- [ ] O GDD está atualizado com as decisões finais
- [ ] Os assets necessários (sprites de magias, efeitos, inimigos) existem ou estão especificados
- [ ] O mapa do Tiled para o MVP está definido (ou pelo menos esboçado)
- [ ] A lib de networking foi escolhida e testada com um "hello world"
- [ ] As constantes de balanceamento em config.ts têm valores iniciais (não precisam ser finais)

Ao passar para a IA, envie:
1. Este arquivo (`PLANEJAMENTO_DESENVOLVIMENTO.md`)
2. O arquivo de explicação do código (`EXPLICACAO_CODIGO.md`)
3. O arquivo de mudanças necessárias (`MUDANCAS_NECESSARIAS.md`)
4. O GDD atualizado
5. As decisões criativas respondidas
6. Sprint específica que quer que ela implemente (não passe tudo de uma vez)

**Instrução sugerida para a IA de desenvolvimento:**
> "Implemente a Sprint X deste planejamento. Leia EXPLICACAO_CODIGO.md para entender o código existente e MUDANCAS_NECESSARIAS.md para saber quais arquivos criar/mudar. Siga a ordem das tarefas da sprint. Não mude nada fora do escopo desta sprint."
