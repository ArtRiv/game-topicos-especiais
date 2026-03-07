# Resumo do Jogo e Decisões Criativas

---

## 1. Pitch (Uma Frase)

> **"Um jogo cooperativo top-down onde 1 a 4 jogadores combinam magias elementais entre si e com o ambiente para derrotar inimigos e resolver puzzles — a criatividade do jogador é a arma mais poderosa."**

*(Ajuste essa frase conforme o tom que quiser — mais épico, mais casual, etc.)*

---

## 2. Resumo do Jogo

**Gênero:** Action / Coop PvE / Puzzle-Combat — Top-down 2D
**Plataforma:** PC e Mobile (web via Phaser 3)
**Jogadores:** 1 a 4 (multiplayer online obrigatório no MVP)
**Engine/Framework:** Phaser 3 + TypeScript + Vite
**Câmera:** Top-down (sem isometria)
**Equipe:** 2-3 desenvolvedores
**Prazo:** 1 semestre (MVP)

### Premissa Central
Magias individuais são limitadas. **Combos são fortes.** O jogo recompensa criatividade,
cooperação e uso inteligente do ambiente. Jogar solo é possível, mas exige mais habilidade.

### Core Loop
1. Jogadores entram em uma fase/área
2. Encontram inimigos, obstáculos ou puzzles
3. Observam o ambiente e possíveis interações elementais
4. Planejam e executam combos de magias (entre jogadores e/ou com o ambiente)
5. Resolvem o desafio
6. Avançam para a próxima área
7. Ganham XP / desbloqueiam melhorias

---

## 3. Decisões Criativas — Perguntas a Responder

Estas perguntas vão definir a identidade do jogo. Responda cada uma (pode ser breve)
e use as respostas para guiar o desenvolvimento.

### 🌍 MUNDO

**3.1 — Qual é o setting/cenário do jogo?**
O GDD menciona "castelo mágico" como ponto de partida. Defina melhor:
- [ ] É um mundo medieval fantasioso clássico? (castelos, florestas, ruínas)
- [ ] É um mundo mais estilizado/abstrato? (dimensões mágicas, realms elementais)
- [ ] Outro? Descreva: _______________________________________________

**3.2 — Como é a estrutura do mapa?**
O GDD diz "mapa fixo e linear". Defina:
- [ ] Fases sequenciais (fase 1 → fase 2 → fase 3) como um jogo de fases clássico
- [ ] Mapa conectado tipo Metroidvania (áreas interligadas, mas sequência sugerida)
- [ ] Dungeon único longo com vários andares/ambientes
- [ ] Arenas independentes (cada sessão multiplayer é uma arena diferente)
- [ ] Outro: _______________________________________________

**3.3 — Quais biomas/temas de fase existem?**
O GDD menciona: gelo, ruínas, floresta, arcano. Defina pelo menos 1 para o MVP:
- [ ] Bioma do MVP: _______________________________________________
- [ ] Biomas futuros (lista): _______________________________________________

**3.4 — Existem NPCs ou cidades? Ou é direto na ação?**
- [ ] Sem NPCs — o jogo é 100% combate/puzzles
- [ ] NPCs mínimos (vendedor, NPC que dá quest, etc.)
- [ ] Hub central com NPCs entre as fases
- [ ] Outro: _______________________________________________

---

### 👤 PERSONAGENS

**3.5 — Os jogadores são personagens pré-definidos ou customizáveis?**
- [ ] Personagem único — todos jogam com o mesmo visual (diferenciado por cor)
- [ ] 4 personagens pré-definidos com visuais diferentes
- [ ] Personagem customizável (pelo menos cor/aparência)
- [ ] Outro: _______________________________________________

**3.6 — Os personagens têm classes/especializações?**
- [ ] Não — todos são iguais, a diferença é na escolha dos elementos
- [ ] Sim — cada personagem tem habilidade passiva única
- [ ] Sim — classes com árvore de habilidades diferentes
- [ ] Outro: _______________________________________________

**3.7 — Existe lore/background dos personagens?**
- [ ] Não — são avatares genéricos
- [ ] Mínimo — um parágrafo de contexto
- [ ] Sim — cada um tem história e motivação
- [ ] Outro: _______________________________________________

---

### 🎯 OBJETIVO E NARRATIVA

**3.8 — Qual é o objetivo final do jogo?**
O GDD diz "avançam em direção a um objetivo final (a definir)":
- [ ] Derrotar um boss final
- [ ] Chegar a um lugar específico
- [ ] Coletar X itens/fragmentos
- [ ] Sobreviver a ondas de inimigos
- [ ] Outro: _______________________________________________

**3.9 — Existe um vilão/antagonista?**
- [ ] Sim — um vilão principal com presença narrativa
- [ ] Sim — mas é só o boss final, sem build-up
- [ ] Não — os desafios são naturais/ambientais
- [ ] Ainda não definido: _______________________________________________

**3.10 — Como a história é contada?**
O GDD diz "narrativa ambiental, não textual":
- [ ] Zero texto — tudo visual e ambiental (ações no cenário, eventos automáticos)
- [ ] Texto mínimo — frases curtas em momentos chave
- [ ] Cutscenes simples — cenas com diálogo entre fases
- [ ] Outro: _______________________________________________

---

### 🔥 ELEMENTOS E MAGIAS

**3.11 — Quais são os 4 elementos iniciais? Confirma os do GDD?**
- [ ] Fogo, Gelo, Energia/Laser, Terra ← confirmo
- [ ] Quero trocar: _______________________________________________
- [ ] Quero começar com menos (2-3 no MVP): quais? _______________

**3.12 — Como o jogador seleciona/troca elementos?**
- [ ] Equipa 2 de uma vez, tecla dedicada para trocar (como no GDD)
- [ ] Roda de seleção rápida (segura tecla, escolhe com mouse/direcional)
- [ ] Cada tecla = um elemento diferente (1, 2, 3, 4)
- [ ] Outro: _______________________________________________

**3.13 — Como funciona a conjuração de magias?**
O GDD fala em preparação + direção + timing:
- [ ] Simples: aperta botão → dispara na direção que está olhando (instantâneo)
- [ ] Médio: segura botão para carregar, solta para disparar (mais carga = mais forte)
- [ ] Complexo: seleciona tipo de magia (projétil/área/parede), depois direção
- [ ] Outro: _______________________________________________

**3.14 — Magias podem causar dano em aliados (friendly fire)?**
- [ ] Não — magias atravessam aliados
- [ ] Sim — friendly fire total
- [ ] Parcial — empurra aliado mas não causa dano
- [ ] Outro: _______________________________________________

---

### 🤝 COOPERAÇÃO E MULTIPLAYER

**3.15 — Como funciona o preview fantasma de magias dos aliados?**
O GDD menciona isso como mecânica chave:
- [ ] Mostra a posição/direção da magia que o aliado está preparando (antes de lançar)
- [ ] Mostra área de efeito prevista da magia
- [ ] Mostra só um ícone sobre a cabeça do aliado indicando qual elemento vai usar
- [ ] Quero testar: _______________________________________________

**3.16 — O que acontece quando um jogador morre?**
- [ ] Respawna após tempo / no início da sala
- [ ] Aliado pode reviver (mecanismo de revive)
- [ ] Espera todos morrerem → game over coletivo
- [ ] Sai da sessão e observa até a fase acabar
- [ ] Outro: _______________________________________________

**3.17 — Existe scaling de dificuldade baseado no número de jogadores?**
- [ ] Sim — mais jogadores = mais inimigos / inimigos mais fortes
- [ ] Não — mesma dificuldade, mais jogadores = mais fácil
- [ ] Outro: _______________________________________________

---

### 🎨 VISUAL E ÁUDIO

**3.18 — Qual é o estilo visual?**
O GDD diz "dependente dos assets":
- [ ] Pixel art (como o jogo base Zelda-like)
- [ ] Outro estilo que já temos assets: _______________________________________________
- [ ] Vamos criar/comprar assets novos com estilo: _______________________________________________

**3.19 — Prioridades visuais (marque as mais importantes):**
- [ ] Clareza visual das magias (saber exatamente o que cada magia faz visualmente)
- [ ] Combos com efeitos visuais impressionantes
- [ ] Feedback visual de dano/hit (screen shake, flash, partículas)
- [ ] Diferenciação clara entre jogadores
- [ ] Indicadores de elemento (cor de cada magia bem distinta)

**3.20 — Áudio:**
- [ ] Sem áudio no MVP — foco na gameplay
- [ ] SFX básicos (magias, hits, combos)
- [ ] SFX + música de fundo
- [ ] Outro: _______________________________________________

---

### ⚡ INIMIGOS E COMBATE

**3.21 — Quantos tipos de inimigos no MVP?**
- [ ] 2-3 tipos básicos (um corpo-a-corpo, um à distância, um com escudo)
- [ ] 4-5 tipos com mecânicas variadas
- [ ] Reusar os 3 do código base (Spider, Wisp, Drow adaptados)
- [ ] Mix: adaptar os existentes + criar 1-2 novos: _______________

**3.22 — Boss no MVP?**
- [ ] Sim — 1 boss com mecânica de ponto fraco explorável com combos
- [ ] Sim — adaptar o Drow como boss de magia
- [ ] Não no MVP — só inimigos comuns
- [ ] Outro: _______________________________________________

**3.23 — Existem puzzles no MVP?**
O GDD menciona puzzles elementais como respiro entre lutas:
- [ ] Sim — pelo menos 1 puzzle usando elementos (ex: refletir laser com gelo)
- [ ] Sim — puzzles simples (pressionar botão, ativar sequência)
- [ ] Não no MVP — só combate
- [ ] Outro: _______________________________________________

---

## 4. Anotações Livres

Use este espaço para anotar qualquer ideia, restrição, preferência ou dúvida
que não foi coberta pelas perguntas acima:

```
[Escreva aqui]


```

---

## 5. Próximo Passo

Após responder as perguntas acima, use as respostas para:
1. Atualizar o GDD oficial com as decisões tomadas
2. Alimentar o planejamento de desenvolvimento (ver `PLANEJAMENTO_DESENVOLVIMENTO.md`)
3. Começar a implementação pela funcionalidade prioritária definida no plano
