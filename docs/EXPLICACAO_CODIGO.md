# Explicação do Código Base (Phaser Zelda-like)

Este documento descreve a arquitetura e funcionamento de cada parte do código existente.
O projeto é um jogo top-down 2D estilo Zelda, feito com **Phaser 3** + **TypeScript** + **Vite**.

---

## 1. Ponto de Entrada — `src/main.ts`

Cria a instância do jogo Phaser com as seguintes configurações:
- **Renderer:** WebGL
- **Resolução:** 256×224 (pixel art, sem arredondamento sub-pixel)
- **Física:** Arcade (sem gravidade — é top-down)
- **Escala:** `HEIGHT_CONTROLS_WIDTH` — a altura controla a largura para manter proporção

Registra 4 cenas e inicia pela `PreloadScene`.

---

## 2. Cenas (`src/scenes/`)

### 2.1 `scene-keys.ts`
Objeto constante com as chaves de todas as cenas: `PRELOAD_SCENE`, `GAME_SCENE`, `UI_SCENE`, `GAME_OVER_SCENE`.

### 2.2 `preload-scene.ts` — Cena de Carregamento
- Carrega todos os assets do jogo via Asset Pack (`assets/data/assets.json`)
- Cria todas as animações (player, spider, wisp, drow, pot break, dagger, enemy death, HUD)
- Após o carregamento, inicia a `GameScene` com os dados de área/sala do `DataManager`

### 2.3 `game-scene.ts` — Cena Principal do Jogo
Esta é a cena mais complexa. Ela é responsável por:

**Criação do nível:**
- Carrega imagens de background e foreground
- Cria o tilemap do Tiled com as camadas de colisão (player e inimigos têm camadas separadas)
- Parseia todas as "rooms" (salas) do mapa e cria objetos para cada uma:
  - **Doors** (portas): com tipos OPEN, LOCK, TRAP, BOSS
  - **Pots** (vasos): podem ser levantados e arremessados
  - **Chests** (baús): contêm recompensas (chaves, mapa, bússola, boss key)
  - **Buttons** (botões/switches): ao pisar, acionam ações (abrir portas, revelar baús)
  - **Enemies** (inimigos): 3 tipos — Spider(1), Wisp(2), Drow/Boss(3)

**Gerenciamento de salas:**
- Cada sala tem seu próprio conjunto de objetos
- Ao trocar de sala, objetos da sala anterior são desativados e os da nova são ativados
- A câmera faz transição suave entre salas

**Sistema de colisões (`#registerColliders`):**
- Player ↔ camada de colisão do mapa
- Player ↔ zones de transição de porta (dispara troca de sala)
- Player ↔ objetos bloqueantes (portas, pots, baús) — permite interação
- Player ↔ switches (dispara ação ao pisar)
- Player ↔ portas trancadas (tenta usar chave do inventário)
- Inimigos ↔ camada de colisão
- Player ↔ grupo de inimigos (player toma dano)
- Arma do player ↔ inimigos (inimigo toma dano)
- Arma do inimigo ↔ player (player toma dano)
- Pots arremessados ↔ inimigos (causa dano)
- Pots arremessados ↔ parede ou objeto (pot quebra)

**Eventos customizados:**
- `OPENED_CHEST`: mostra a recompensa do baú
- `ENEMY_DESTROYED`: verifica se todos os inimigos foram derrotados (abre portas trap, revela baús)
- `PLAYER_DEFEATED`: faz fade out e vai para GameOver
- `DIALOG_CLOSED`: esconde item de recompensa e retoma o jogo
- `BOSS_DEFEATED`: marca boss como derrotado no DataManager

**Transição de salas (`#handleRoomTransition`):**
1. Trava o input do player
2. Anima o player entrando no corredor
3. Anima a câmera para a próxima sala
4. Anima o player entrando na sala
5. Habilita objetos da nova sala e desabilita os da antiga
6. Destrava o input

### 2.4 `ui-scene.ts` — HUD e Diálogos
- Roda como cena **paralela** (overlay) à GameScene
- Desenha os corações de vida (até 20 slots, baseado no `DataManager`)
- Anima a perda de corações
- Mostra diálogos de recompensa ao abrir baús (com timer de 3s)

### 2.5 `game-over-scene.ts` — Tela de Game Over
- Mostra menu "Continue" / "Quit"
- Continue: reinicia a GameScene
- Quit: recarrega a página

---

## 3. Objetos de Jogo (`src/game-objects/`)

### 3.1 `common/character-game-object.ts` — Classe Base de Personagem
**Esta é a classe mais importante do código.** Todo personagem (player e inimigos) herda dela.

Ela estende `Phaser.Physics.Arcade.Sprite` e implementa `CustomGameObject`.

**Componentes que ela gerencia:**
- `ControlsComponent` — encapsula o input
- `SpeedComponent` — velocidade de movimento
- `DirectionComponent` — direção atual (UP/DOWN/LEFT/RIGHT)
- `AnimationComponent` — mapeamento de animações por estado/direção
- `InvulnerableComponent` — controle de invulnerabilidade
- `LifeComponent` — vida atual e máxima
- `StateMachine` — máquina de estados para comportamento

**Propriedades e getters:**
- `isDefeated`: se o personagem morreu
- `isEnemy`: se NÃO é o player
- `controls`: acesso ao InputComponent
- `speed`: velocidade
- `direction`: direção atual (com setter)

**Métodos principais:**
- `update()`: atualiza a state machine
- `hit(direction, damage)`: recebe dano — verifica invulnerabilidade, reduz vida, troca estado para HURT ou DEATH
- `disableObject()`: desliga física, torna inativo/invisível
- `enableObject()`: religa física, torna ativo/visível

**Inimigos** começam desabilitados e são habilitados quando o player entra na sala.

### 3.2 `player/player.ts` — O Jogador
Herda de `CharacterGameObject`. Adiciona:

- **CollidingObjectsComponent**: rastreia objetos com os quais o player está colidindo (resetado todo frame)
- **HeldGameObjectComponent**: referência ao objeto sendo segurado (pot)
- **WeaponComponent**: gerencia a arma (Sword por padrão)
- Registra os estados: Idle, Move, Hurt, Death, Lift, OpenChest, IdleHolding, MoveHolding, Throw, Attack
- Se auto-registra no UPDATE da cena para atualizar todo frame
- Physics body: 12×16 pixels

### 3.3 `enemies/spider.ts` — Inimigo Aranha
- IA simples: a cada X ms, para e escolhe uma direção aleatória
- Rota continuamente para indicar direção
- Estados: Idle, Move, Hurt, Death
- Vida: 2 | Velocidade: 80

### 3.4 `enemies/wisp.ts` — Inimigo Fantasma
- **Invulnerável** — não pode ser atacado
- Usa `BounceMoveState`: escolhe direção aleatória e rebate nas paredes (`setBounce(1)`)
- Animação de "pulsar" via tween
- Vida: 1 (mas é invulnerável) | Velocidade: 50

### 3.5 `enemies/boss/drow.ts` — Boss Drow
- Tem sua própria arma: `Dagger` (projétil)
- Estados únicos: Hidden → Teleport → PrepareAttack → Attack (e volta para Teleport ao ser atingido)
- Teleporta entre posições pré-definidas
- Ao morrer: animação de flash + wipe effect + emite BOSS_DEFEATED
- Escala: 1.25x | Vida: 6 | Velocidade: 80

### 3.6 `objects/pot.ts` — Vaso
- Pode ser levantado (`InteractiveObjectComponent` com tipo PICKUP)
- Pode ser arremessado (`ThrowableObjectComponent`)
- Ao colidir após arremesso: quebra (animação de quebra)
- Ao reentrar na sala: reseta posição

### 3.7 `objects/chest.ts` — Baú
- 3 estados: HIDDEN → REVEALED → OPEN
- Pode precisar de Boss Key para abrir (baús grandes)
- Conteúdo: SMALL_KEY, BOSS_KEY, MAP, COMPASS, NOTHING
- Pode ser revelado por trigger (derrotar inimigos, pisar em switch)
- Usa `InteractiveObjectComponent` com tipo OPEN

### 3.8 `objects/door.ts` — Porta
- 5 tipos: OPEN, LOCK, TRAP, BOSS, OPEN_ENTRANCE
- Cada porta tem: zona de transição (trigger zone) + sprite visual (se não for OPEN)
- Portas TRAP se abrem quando todos os inimigos são derrotados ou switch é acionado
- Portas LOCK/BOSS precisam de chave/boss key
- Persiste estado (unlocked) via DataManager

### 3.9 `objects/button.ts` — Botão/Switch de chão
- 2 texturas: FLOOR ou PLATE
- Ao ser pisado, retorna ação + lista de IDs alvo (portas ou baús)

### 3.10 `weapons/base-weapon.ts` — Interface e Classe Base de Arma
- Interface `Weapon`: define `baseDamage`, `isAttacking`, métodos de ataque por direção, `update`, `onCollisionCallback`
- `BaseWeapon`: implementação parcial que gerencia a animação de ataque e o physics body da arma

### 3.11 `weapons/sword.ts` — Espada
- Ataque melee: posiciona o hitbox ao redor do player baseado na direção
- Não cria sprite visual separado — usa a animação do player
- Hitbox: ~30×18 (horizontal) ou ~18×30 (vertical)

### 3.12 `weapons/dagger.ts` — Adaga (Projétil)
- Arma do Boss Drow
- Cria um sprite visual separado que se move na direção do ataque
- Tem velocidade configurável
- Ao terminar ataque ou colidir: fica invisível e para

---

## 4. Componentes (`src/components/`)

### 4.1 Sistema de Componentes — Entity-Component
Usa o padrão **Entity-Component** anexando componentes diretamente no game object via propriedade dinâmica (`_NomeDoComponente`).

#### `base-game-object-component.ts`
- Classe base de todos os componentes
- Guarda referência à `scene` e ao `gameObject`
- `getComponent<T>(gameObject)`: recupera componente de um game object (método estático)
- `removeComponent(gameObject)`: remove componente
- `assignComponentToObject(object)`: anexa o componente ao game object

#### `animation-component.ts`
- Mapeia `CharacterAnimation` (ex: `WALK_DOWN`) para configuração de animação Phaser (`key`, `repeat`, `ignoreIfPlaying`)
- `playAnimation(key, callback?)`: toca animação e chama callback ao completar
- `playAnimationInReverse(key, callback?)`: toca ao contrário (usado no throw)
- `isAnimationPlaying()`: verifica se há animação em andamento

#### `controls-component.ts`
- Encapsula o `InputComponent` dentro de um componente de game object

#### `direction-component.ts`
- Armazena a direção atual do personagem (UP/DOWN/LEFT/RIGHT)
- Chama callback ao mudar direção (usado pelo Spider para rotação)

#### `speed-component.ts`
- Armazena a velocidade do personagem

#### `life-component.ts`
- Armazena vida máxima e atual
- `takeDamage(amount)`: reduz vida (mínimo 0)

#### `invulnerable-component.ts`
- Flag de invulnerabilidade
- Duração da invulnerabilidade após hit (para animação de flash)

#### `colliding-objects-component.ts`
- Lista de game objects com os quais o personagem está colidindo
- Resetada todo frame — usada pelo Player para detectar objetos interativos

#### `interactive-object-component.ts`
- Define tipo de interação: AUTO, PICKUP, OPEN
- `canInteractWith()`: verifica se pode interagir (ex: tem boss key?)
- `interact()`: executa a interação

#### `held-game-object-component.ts`
- Referência ao objeto sendo segurado pelo personagem (pot)
- `drop()`: solta o objeto

#### `throwable-object-component.ts`
- Torna um objeto arremessável
- `throw(direction)`: aplica velocidade na direção e executa callback após delay
- `drop()`: solta sem arremessar

#### `weapon-component.ts`
- Gerencia a arma do personagem
- Tem seu próprio `Phaser.Physics.Arcade.Body` para detecção de colisão da arma
- `weaponDamage`: retorna o dano base da arma

### 4.2 Input (`src/components/input/`)

#### `input-component.ts`
- Classe base de input com flags booleanas: up, down, left, right, actionKey, attackKey, selectKey, enterKey
- `isMovementLocked`: usado durante transições para bloquear input
- `reset()`: reseta todas as flags

#### `keyboard-component.ts`
- Herda `InputComponent`
- Mapeia teclas reais do Phaser:
  - Setas: movimento
  - Z: ataque
  - X: ação (falar, levantar, arremessar)
  - Shift: select
  - Enter: inventário/start
- Sobrescreve os getters para ler estado real das teclas

### 4.3 State Machine (`src/components/state-machine/`)

#### `state-machine.ts`
Interface `State`: define `name`, `onEnter(args)`, `onUpdate()`, referência ao `stateMachine`.

`StateMachine`:
- Mapa de estados por nome
- `setState(name, ...args)`: troca estado (com fila se estiver em transição)
- `update()`: processa fila de estados e chama `onUpdate` do estado atual
- Logging condicional via `ENABLE_LOGGING`

#### Estados de Personagem (`states/character/`)

Todos herdam de `BaseCharacterState` que implementa `State` e guarda referência ao `CharacterGameObject`.

| Estado | Descrição |
|--------|-----------|
| `IdleState` | Parado. Verifica input para transicionar para Move ou Attack. Solta objetos segurados |
| `MoveState` | Movendo. Verifica ação de ataque, interação com objetos (Lift/OpenChest), ou volta para Idle |
| `AttackState` | Atacando. Espera a animação da arma terminar e volta para Idle |
| `HurtState` | Tomou dano. Aplica pushback, fica invulnerável, toca animação de hurt, transiciona para Idle (ou outro estado) |
| `DeathState` | Morreu. Para velocidade, solta objetos, desabilita corpo, toca animação de morte, emite evento |
| `LiftState` | Levantando objeto. Animação de curva Bezier para o objeto ir da posição original para cima da cabeça |
| `IdleHoldingState` | Parado segurando objeto. Verifica throw ou movimento |
| `MoveHoldingState` | Andando segurando objeto. Atualiza posição do objeto acima do personagem |
| `ThrowState` | Arremessando. Toca animação reversa de Lift, aplica velocidade no objeto |
| `OpenChestState` | Abrindo baú. Torna invulnerável, toca animação de lift, emite evento de baú aberto |
| `BounceMoveState` | Movimento do Wisp. Escolhe direção aleatória e rebate (bounce=1) |

#### Estados do Boss Drow (`states/character/boss/drow/`)

| Estado | Descrição |
|--------|-----------|
| `BossDrowHiddenState` | Boss invisível. Espera e transiciona para Teleport |
| `BossDrowTeleportState` | Teleporta entre posições pré-definidas rapidamente. Tras invulnerabilidade. Termina com PrepareAttack |
| `BossDrowIdleState` | Boss parado olhando. Após tempo, volta para Teleport |
| `BossDrowPrepareAttackState` | Calcula direção do player, posiciona-se alinhado, e inicia Attack |

### 4.4 Inventário (`src/components/inventory/`)

#### `inventory-manager.ts`
Singleton que gerencia:
- **Inventário geral**: `sword: boolean`
- **Inventário por área**: map, compass, bossKey, keys (por nível)
- `addDungeonItem(area, item)`: adiciona item ao inventário da área
- `useAreaSmallKey(area)`: consome uma chave pequena

---

## 5. Common / Utilitários (`src/common/`)

### 5.1 `assets.ts`
Constantes com todas as chaves de assets, animações, frames de textura:
- `ASSET_KEYS`: chaves de carregamento dos assets
- `PLAYER_ANIMATION_KEYS`, `SPIDER_ANIMATION_KEYS`, etc.: chaves de animação por personagem
- `CHARACTER_ANIMATIONS`: mapeamento genérico de animações (IDLE_DOWN, WALK_UP, etc.)
- `CHEST_FRAME_KEYS`, `DOOR_FRAME_KEYS`, `BUTTON_FRAME_KEYS`: frames de textura
- `HEART_TEXTURE_FRAME`, `HEART_ANIMATIONS`: frames e animações do HUD de vida

### 5.2 `common.ts`
Constantes e tipos reutilizados:
- `DIRECTION`: UP, DOWN, LEFT, RIGHT
- `CHEST_STATE`: HIDDEN, REVEALED, OPEN
- `INTERACTIVE_OBJECT_TYPE`: AUTO, PICKUP, OPEN
- `LEVEL_NAME`: WORLD, DUNGEON_1
- `DUNGEON_ITEM`: SMALL_KEY, BOSS_KEY, MAP, COMPASS
- `DEFAULT_UI_TEXT_STYLE`: estilo de texto padrão
- `CHEST_REWARD_TO_DIALOG_MAP`: textos de recompensa

### 5.3 `config.ts`
**Todas as constantes numéricas de balanceamento:**
- Velocidades de player e inimigos
- Duração de invulnerabilidade
- Velocidade de pushback
- Vida máxima de cada entidade
- Dano de ataque
- Delays de transição de sala
- Delays de IA do spider
- Duração de efeitos visuais do boss

### 5.4 `data-manager.ts`
Singleton que persiste dados do player entre cenas:
- Vida atual/máxima
- Área atual (nome, sala, porta)
- Estado de baús e portas por sala por área
- Boss derrotado por área
- Emite evento `PLAYER_HEALTH_UPDATED` ao mudar vida

### 5.5 `event-bus.ts`
Event emitter global (`Phaser.Events.EventEmitter`):
- `OPENED_CHEST`, `ENEMY_DESTROYED`, `PLAYER_DEFEATED`
- `PLAYER_HEALTH_UPDATED`, `SHOW_DIALOG`, `DIALOG_CLOSED`
- `BOSS_DEFEATED`

### 5.6 `types.ts`
Tipos TypeScript reutilizados: `CharacterAnimation`, `Position`, `GameObject`, `Direction`, `ChestState`, `InteractiveObjectType`, `CustomGameObject`, `LevelName`, `LevelData`, `DungeonItem`.

### 5.7 `utils.ts`
Funções utilitárias:
- `exhaustiveGuard`: garante que todos os casos de um union type foram tratados
- `isArcadePhysicsBody`: type guard para physics body
- `isDirection`, `isLevelName`, `isCustomGameObject`: type guards
- `getDirectionOfObjectFromAnotherObject`: calcula direção relativa entre dois objetos

### 5.8 `juice-utils.ts`
- `flash(target, callback?)`: efeito de flash branco piscando (usado quando player e boss tomam dano)

### 5.9 Tiled Utils (`src/common/tiled/`)
- `common.ts`: constantes do Tiled (nomes de layers, tipos de porta, tipos de trap, recompensas, propriedades)
- `types.ts`: tipos TypeScript para objetos do Tiled (TiledObject, TiledDoorObject, TiledChestObject, etc.)
- `tiled-utils.ts`: funções para parsear objetos do Tiled do tilemap Phaser — extrai rooms, doors, pots, chests, enemies e switches validando propriedades

---

## 6. Fluxo Geral do Jogo

```
PreloadScene
  ↓ (carrega assets, cria animações)
GameScene
  ↓ (cria nível, player, colisões, eventos)
  ↓ Player anda → colide com porta → transição de sala
  ↓ Player ataca inimigos / levanta pots / abre baús
  ↓ Todos os inimigos derrotados → trap doors abrem / baús revelados
  ↓ Player morre → fade out → GameOverScene
  ↓ Boss derrotado → evento → portas abrem
UIScene (overlay)
  ↓ Mostra corações / diálogos de recompensa
GameOverScene
  ↓ Continue → GameScene / Quit → reload
```

---

## 7. Padrões Arquiteturais

- **Entity-Component**: componentes são anexados aos game objects como propriedades dinâmicas
- **State Machine**: comportamento de personagens é gerenciado por máquinas de estado
- **Singleton**: `DataManager` e `InventoryManager` usam pattern singleton
- **Event Bus**: comunicação desacoplada entre cenas e objetos via EventEmitter global
- **Tiled Integration**: mapas são criados no editor Tiled e parseados pelo jogo
- **Configuração centralizada**: todos os números de balanceamento ficam em `config.ts`
