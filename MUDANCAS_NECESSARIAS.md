# Mudanças Necessárias para Adaptar ao GDD

Este documento mapeia o que precisa ser modificado ou adicionado em cada parte do código
para transformar o jogo Zelda-like em um jogo cooperativo de combos de magia conforme o GDD.

---

## 1. `src/main.ts` — Configuração do Jogo

**O que mudar:**
- Aumentar a resolução (`width`/`height`) — o jogo atual é 256×224 (resolução de NES). Para um jogo com visão isométrica e 4 jogadores simultâneos, vai precisar de resolução maior
---

## 2. `src/scenes/preload-scene.ts` — Carregamento

**O que adicionar:**
- Carregar assets de **4 elementos** de magia (Fogo, Gelo, Energia/Laser, Terra) — spritesheet de partículas, efeitos, projéteis
- Carregar assets de **UI de magia** (barra de mana, indicadores de elemento equipado, ícones de cooldown)
- Carregar assets de **preview fantasma** (visual semitransparente mostrando magia que aliado está preparando)
- Carregar assets de ambiente interativo (superfícies refletivas, objetos destrutíveis/congeláveis)
- Carregar assets de rede/multiplayer se for necessário algum sprite de indicador de latência

---

## 3. `src/scenes/game-scene.ts` — Cena Principal

**Esta cena precisa das maiores mudanças:**

### 3.1 Multiplayer — Múltiplos Jogadores
- Atualmente: cria 1 player. Precisará criar 2 players depois
- Adicionar lógica de spawn para cada jogador conectado
- Cada jogador precisa de seu próprio `InputComponent` (local ou via rede)
- Registrar colisões entre cada player e inimigos/objetos (atualmente registra só para `this.#player`)

### 3.2 Sistema de Colisões — Magias e Combos
- Adicionar colliders entre:
  - Projéteis de magia ↔ inimigos
  - Projéteis de magia ↔ projéteis de magia de aliado (para combos)
  - Projéteis de magia ↔ ambiente (superfícies refletivas, água, etc.)
  - Projéteis de magia ↔ player (fogo amigo? ou nenhum dano a aliado)
- O sistema de colisão de magias precisa verificar **tipos de elemento** para determinar se gera combo

### 3.3 Sistema de Combos
- Criar um **ComboManager** ou **ComboSystem** que:
  - Detecta quando duas magias de elementos diferentes colidem
  - Calcula o efeito resultante (ex: Fogo + Vento = área ampliada)
  - Instancia o efeito de combo na posição da colisão
  - Aplica dano/efeitos na área do combo

### 3.4 Ambiente Interativo
- O código atual trata o ambiente como estático (walls, pots). Precisa adicionar:
  - Superfícies que **refletem** laser
  - Superfícies que **congelam** com gelo (criando espelho para laser)
  - Áreas de água que se tornam plataforma com Terra
  - Objetos que propagam fogo
- Criar novos tile properties no Tiled para definir tipo de superfície

### 3.6 Networking
- Toda a lógica de sincronização de estado (posições dos jogadores, projéteis, estado de inimigos) vai ser gerenciada aqui ou em uma cena separada de networking
- Considerar usar WebSocket ou WebRTC

---

## 4. `src/scenes/ui-scene.ts` — Interface

**O que adicionar:**
- **Barra de mana** para cada jogador (não existe no código atual)
- **Indicadores de elemento equipado** (2 slots por jogador)
- **Cooldown visual** por magia
- **Preview fantasma** das magias que aliados estão preparando
- **Indicadores de vida de todos os jogadores** (não só do player local)
- Remover sistema de corações estilo Zelda e substituir por barra de HP
- Adicionar indicadores de combo (visual de que um combo foi ativado, nome do combo, etc.)

---

## 5. `src/game-objects/common/character-game-object.ts` — Base de Personagem

**O que mudar:**

### 5.1 Novas Propriedades
```
- mana: number              // mana atual
- maxMana: number           // mana máxima
- equippedElements: [Element, Element]  // 2 elementos equipados
- castingState: CastingState  // IDLE, PREPARING, CASTING, CHANNELING
- currentSpell: Spell | null  // magia sendo preparada/canalizada
```

### 5.2 Novos Componentes
- **ManaComponent**: similar ao `LifeComponent`, mas para mana (com regeneração passiva)
- **ElementComponent**: gerencia os 2 elementos equipados e elementos desbloqueados
- **SpellCastingComponent**: gerencia a conjuração (preparação, direção, timing, cooldowns)
- **ComboPreviewComponent**: gera o "fantasma" visual da magia sendo preparada (para aliados verem)

### 5.3 Mudanças no `hit()`
- Atualmente só recebe `direction` e `damage`. Precisará receber também:
  - `elementType`: tipo de elemento do ataque (para resistências/fraquezas)
  - `effects`: efeitos ao ser atingido (congelamento, queimadura, etc.)
  - `sourcePlayerId`: quem causou o dano (para sistemas de score/cooperação)

### 5.4 Novos Métodos
```typescript
castSpell(element: Element, direction: Direction): void
cancelSpell(): void
channelSpell(): void  // para magias canalizadas (laser)
combineMagic(otherSpell: Spell): ComboResult
```

### 5.5 Remover ou Adaptar
- O sistema de arma melee (WeaponComponent/Sword) provavelmente será substituído pelas magias, a não ser que queiram manter ataques melee como opção

---

## 6. `src/game-objects/player/player.ts` — Jogador

**O que mudar:**

### 6.1 Novos Componentes
- Adicionar `ManaComponent` no constructor
- Adicionar `ElementComponent` com os 2 elementos iniciais
- Adicionar `SpellCastingComponent`
- Adicionar `ComboPreviewComponent`
- Possível: `NetworkComponent` para sincronização multiplayer

### 6.2 Novos Estados na State Machine
Adicionar estados:
- `CASTING_STATE`: o jogador está conjurando uma magia
- `CHANNELING_STATE`: o jogador está canalizando uma magia (laser, por ex.)
- `PREPARING_SPELL_STATE`: o jogador está escolhendo direção da magia
- `STUNNED_STATE`: imobilizado por efeito elemental
- `FROZEN_STATE`: congelado por magia de gelo

### 6.3 Input
- Remover ou reinterpretar a tecla de "attack" (Z) — agora seria "cast spell"
- Adicionar tecla para **trocar elemento** (ou usar combinação)
- Adicionar tecla para **cancelar conjuração**
- `ActionKey (X)` pode continuar para interação com ambiente, mas sem lift/throw de pots (a menos que queira manter)

### 6.4 Multiplayer
- O player precisa de um **playerId** para identificação em rede
- Cor/skin diferente para cada jogador
- Precisa ser instanciável N vezes (atualmente é singleton na cena)

---

## 7. `src/game-objects/enemies/` — Inimigos

**O que mudar em todos os inimigos:**

### 7.1 Resistências Elementais
- Adicionar propriedade de **resistência/fraqueza** por elemento
- Ex: inimigo de gelo resiste a gelo mas é fraco contra fogo
- Modificar `hit()` para considerar o tipo de elemento do ataque

### 7.2 Mecânicas Específicas (do GDD)
- **Escudo frontal**: inimigos que só tomam dano por trás. Adicionar verificação de ângulo de ataque
- **Pontos fracos posicionais**: regiões específicas do corpo que recebem dano extra
- **Comportamento mais inteligente**: reações a magias específicas (ex: derreter quando hit por fogo, congelar quando hit por gelo)

### 7.3 Spider (`spider.ts`)
- IA atual é puramente aleatória. Pode manter como inimigo básico "pressão constante" do GDD
- Adicionar resistência elemental

### 7.4 Wisp (`wisp.ts`)
- Atualmente é invulnerável. No novo jogo pode ser vulnerável a certo elemento
- Pode ser o inimigo que ensina que magias específicas funcionam contra inimigos específicos

### 7.5 Drow/Boss (`drow.ts`)
- Boss precisa de mecânicas mais complexas conforme GDD:
  - **HP alto**
  - **Áreas reforçadas** vs **ponto fraco** explorável com combos
  - Via lenta: ataque direto em partes reforçadas
  - Via rápida: usar combos no ponto fraco
- Adicionar fases de boss (muda padrão de ataque baseado em HP restante)

### 7.6 Novos Inimigos
- Criar inimigos com **escudo elemental** (ex: escudo de fogo que precisa ser apagado com gelo antes de atacar)
- Criar inimigos que **reagem ao ambiente** (ex: inimigo que fica mais forte perto de fogo)

---

## 8. `src/game-objects/weapons/` — Sistema de Armas → Sistema de Magias

**Reestruturação principal:**

### 8.1 `base-weapon.ts` → `base-spell.ts`
- Renomear conceito de "weapon" para "spell"
- Interface `Spell`:
```typescript
interface Spell {
  element: Element;
  baseDamage: number;
  manaCost: number;
  cooldown: number;
  castType: 'instant' | 'channeled' | 'projectile' | 'area';
  isCasting: boolean;
  cast(direction: Direction): void;
  update(): void;
  onCollisionWithSpell(otherSpell: Spell): ComboResult | null;
  onCollisionWithEnvironment(surface: Surface): void;
  getPreviewGhost(): PreviewData;  // para o sistema de preview fantasma
}
```

### 8.2 Criar classes de magia específicas:
- **FireBall** (projétil de fogo)
- **IceWall** (parede de gelo instantânea)
- **LaserBeam** (feixe de energia canalizado)
- **EarthWall** (parede de pedra instantânea)

### 8.3 Remover ou Manter
- `sword.ts`: remover se o jogo for 100% magia, ou manter como ataque melee básico
- `dagger.ts`: pode servir de base para criar projéteis de magia (já tem lógica de projétil)
- `WeaponComponent` → renomear para `SpellComponent` ou manter ambos

---

## 9. `src/components/state-machine/states/character/` — Estados

**Novos estados necessários:**

### 9.1 `casting-state.ts`
- Jogador parado, conjurando magia
- Mostra indicador de direção
- Ao terminar: dispara o projétil/efeito
- Vulnerável durante conjuração (risco do GDD)

### 9.2 `channeling-state.ts`
- Jogador parado, canalizando magia contínua (ex: laser)
- Consome mana por segundo
- Pode ser interrompido ao tomar dano

### 9.3 `frozen-state.ts` / `stunned-state.ts`
- Efeitos de status causados por magias
- Imobilizado por X segundos

### 9.4 Mudar `attack-state.ts`
- Atualmente verifica `WeaponComponent`. Precisará verificar `SpellComponent` ou similar
- Direção do ataque pode precisar de mira livre (não só 4 direções)

### 9.5 Mudar `character-states.ts`
- Adicionar novas constantes:
```typescript
CASTING_STATE: 'CASTING_STATE',
CHANNELING_STATE: 'CHANNELING_STATE',
FROZEN_STATE: 'FROZEN_STATE',
STUNNED_STATE: 'STUNNED_STATE',
```

---

## 10. `src/components/input/` — Input

### 10.1 `input-component.ts`
**Adicionar novas flags:**
```typescript
#castKey: boolean;       // tecla de conjurar magia
#switchElement: boolean; // tecla de trocar elemento
#cancelCast: boolean;    // tecla de cancelar conjuração
#spell1Key: boolean;     // usar slot de magia 1
#spell2Key: boolean;     // usar slot de magia 2
```

### 10.2 `keyboard-component.ts`
- Remapear teclas para o novo layout:
  - Z → Lançar magia do elemento 1
  - X → Lançar magia do elemento 2
  - C ou Tab → Trocar elemento
  - Shift → cancelar/menu
- Considerar suporte a **gamepad** (o GDD menciona gamepad customizado)

### 10.3 Novo: `network-input-component.ts`
- Input que vem de jogadores remotos via rede
- Herda ou implementa `InputComponent`
- Atualizado pelos dados recebidos do servidor/peer

---

## 11. `src/components/inventory/inventory-manager.ts` — Inventário

**O que mudar:**
- Remover itens de dungeon (small_key, boss_key, map, compass) — não se aplicam ao novo jogo
- Adicionar:
  - `unlockedElements: Element[]` — elementos que o jogador desbloqueou
  - `equippedElements: [Element, Element]` — 2 elementos ativos
  - `spellUpgrades: { [element: string]: SpellUpgrade }` — upgrades de magia (maior área, menor cooldown, etc.)
  - `experience: number` — XP do jogador
  - `level: number` — nível do jogador

---

## 12. `src/common/config.ts` — Configurações

**Adicionar constantes para:**
```typescript
// Mana
PLAYER_MAX_MANA: 100
PLAYER_MANA_REGEN_RATE: 5  // por segundo

// Magias por elemento
FIRE_SPELL_DAMAGE: number
FIRE_SPELL_MANA_COST: number
FIRE_SPELL_COOLDOWN: number
ICE_SPELL_DAMAGE: number
ICE_SPELL_MANA_COST: number
ICE_SPELL_COOLDOWN: number
LASER_SPELL_DAMAGE_PER_TICK: number
LASER_SPELL_MANA_COST_PER_TICK: number
EARTH_SPELL_WALL_DURATION: number
EARTH_SPELL_MANA_COST: number

// Combos
COMBO_FIRE_ICE_DAMAGE: number
COMBO_FIRE_ICE_AREA: number
COMBO_LASER_ICE_DAMAGE: number

// Multiplayer
MAX_PLAYERS: 4
NETWORK_TICK_RATE: 20  // updates por segundo

// Efeitos de status
FREEZE_DURATION: number
BURN_DURATION: number
BURN_DAMAGE_PER_TICK: number

// Progressão
XP_PER_ENEMY: number
XP_PER_BOSS: number
```

**Remover/adaptar:**
- Constantes de portas, baús, transição de salas (manter se o mapa tiver salas, remover se for mapa aberto)

---

## 13. `src/common/event-bus.ts` — Eventos

**Adicionar novos eventos:**
```typescript
SPELL_CAST: 'SPELL_CAST'              // quando uma magia é lançada
COMBO_TRIGGERED: 'COMBO_TRIGGERED'    // quando um combo é ativado
PLAYER_JOINED: 'PLAYER_JOINED'        // jogador entrou na sessão
PLAYER_LEFT: 'PLAYER_LEFT'            // jogador saiu
MANA_UPDATED: 'MANA_UPDATED'          // mana do jogador mudou
ELEMENT_CHANGED: 'ELEMENT_CHANGED'    // jogador trocou elemento
SPELL_PREVIEW: 'SPELL_PREVIEW'        // preview de magia sendo preparada
PHASE_CHANGED: 'PHASE_CHANGED'        // fase do jogo mudou
XP_GAINED: 'XP_GAINED'               // jogador ganhou XP
LEVEL_UP: 'LEVEL_UP'                  // jogador subiu de nível
```

---

## 14. `src/common/data-manager.ts` — Dados Persistentes

**Reestruturar `PlayerData`:**
```typescript
type PlayerData = {
  currentHealth: number;
  maxHealth: number;
  currentMana: number;
  maxMana: number;
  experience: number;
  level: number;
  unlockedElements: Element[];
  equippedElements: [Element, Element];
  spellUpgrades: SpellUpgradeMap;
  currentPhase: number;  // qual fase do jogo
};
```
- Remover dados de dungeon (chests, doors por sala)
- Adicionar dados de progressão por fase

---

## 15. `src/common/types.ts` — Tipos

**Adicionar novos tipos:**
```typescript
type Element = 'FIRE' | 'ICE' | 'LASER' | 'EARTH';
type CastType = 'INSTANT' | 'CHANNELED' | 'PROJECTILE' | 'AREA';
type StatusEffect = 'FROZEN' | 'BURNING' | 'STUNNED' | 'SLOWED';
type ComboResult = {
  elements: [Element, Element];
  damage: number;
  area: number;
  effect?: StatusEffect;
};
type SpellUpgrade = {
  areaMultiplier: number;
  cooldownReduction: number;
  damageMultiplier: number;
};
type PlayerId = string;
```

---

## 16. Novos Arquivos Necessários

### 16.1 Sistema de Magia (`src/systems/magic/`)
```
magic-system.ts          // gerencia conjuração e custos de mana
combo-system.ts          // detecta e executa combos
element-interactions.ts  // tabela de como elementos interagem entre si
spell-factory.ts         // cria instâncias de magias baseado no elemento
```

### 16.2 Magias (`src/game-objects/spells/`)
```
base-spell.ts            // classe base de magia
fire-ball.ts             // projétil de fogo
ice-wall.ts              // parede de gelo
laser-beam.ts            // feixe de energia (canalizado)
earth-wall.ts            // parede de terra
combo-effects/
  fire-ice-explosion.ts  // explosão congelante
  fire-wind-spread.ts    // propagação de fogo
  laser-reflect.ts       // laser refletido
```

### 16.3 Multiplayer (`src/networking/`)
```
network-manager.ts       // gerencia conexões WebSocket/WebRTC
sync-manager.ts          // sincroniza estado do jogo
player-session.ts        // dados de sessão de cada jogador
serialization.ts         // serialização/deserialização de estado
lobby-scene.ts           // cena de lobby para matching
```

### 16.4 Novos Componentes (`src/components/`)
```
game-object/
  mana-component.ts      // mana atual/máxima + regen
  element-component.ts   // elementos equipados
  status-effect-component.ts  // efeitos de status ativos
  spell-casting-component.ts  // estado de conjuração
  combo-preview-component.ts  // fantasma de preview para aliados
```

### 16.5 Ambiente Interativo (`src/game-objects/environment/`)
```
reflective-surface.ts   // superfície que reflete laser
destructible-wall.ts    // parede quebrável com magia
water-surface.ts        // água que pode ser congelada
flammable-object.ts     // objeto que propaga fogo
```

### 16.6 Progressão (`src/systems/progression/`)
```
xp-system.ts            // cálculo de XP
level-up-system.ts      // evolução de magias
spell-upgrade-tree.ts   // árvore de upgrades
```

### 16.7 Novas Cenas
```
scenes/
  lobby-scene.ts         // matchmaking / sala de espera
  title-scene.ts         // tela título
  spell-select-scene.ts  // seleção de elementos antes da fase
```

---

## 17. Resumo de Prioridades por Ordem de Implementação

### Fase 1 — Fundação (Prioridade Máxima)
1. **Sistema de Elementos e Magias**: criar `Element`, `base-spell`, pelo menos 2 magias funcionais
2. **Substituir ataque melee por magia**: o player lança magia ao invés de usar espada
3. **Mana System**: componente de mana com custo e regeneração
4. **Novos estados**: CASTING_STATE, CHANNELING_STATE

### Fase 2 — Combos e Interação
5. **Combo System**: detecção de colisão entre magias e geração de efeito
6. **Ambiente interativo**: pelo menos 1 superfície refletiva e 1 congelável
7. **Resistências elementais nos inimigos**

### Fase 3 — Multiplayer
8. **Network Manager**: conexão entre jogadores
9. **Múltiplos players na cena**: spawn e input remoto
10. **Preview fantasma**: visualização de magia do aliado
11. **Sincronização de estado**

### Fase 4 — Progressão e Polish
12. **Sistema de XP e level up**
13. **Upgrades de magia**
14. **Novas fases e inimigos**
15. **UI completa** (mana, cooldowns, elementos)

---

## 18. O Que Pode Ser Reutilizado Sem Mudanças

- `StateMachine` — a máquina de estados é genérica e funciona perfeitamente
- `BaseGameObjectComponent` — o sistema de componentes é extensível
- `InputComponent` base — só precisa de novas flags
- `DirectionComponent`, `SpeedComponent` — continuam úteis como estão
- `event-bus.ts` — o EventEmitter global funciona perfeitamente, só adicionar eventos novos
- `juice-utils.ts` — flash effect continua útil
- Estrutura geral de cenas Phaser — funciona com as devidas mudanças de conteúdo
- `exhaustiveGuard` e funções utilitárias — continuam válidas
