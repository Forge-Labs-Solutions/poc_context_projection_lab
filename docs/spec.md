# Context Projection Lab

## Visão Geral

O Context Projection Lab é a POC principal da Parte 2 do ForgeOS.

Seu objetivo é validar o novo paradigma cognitivo do sistema:

```txt
Tudo é Contexto
↓
Tudo é Projeção
```

A POC existe para comprovar que documentos, chats e futuras estruturas cognitivas podem ser representados por artefatos cognitivos persistentes (FCIDs), e que esses artefatos podem ser projetados, reconstruídos, navegados e reutilizados independentemente da forma original que os gerou.

---

# Objetivo

Validar os fundamentos arquiteturais da Parte 2:

```txt
FCID
FCAS
Documents
Chat Projection
Cognitive Navigation
Projection Model
```

A POC deve responder:

```txt
Como recursos são convertidos em artefatos cognitivos?

Como documentos são reconstruídos?

Como chats são reconstruídos?

Como FCAS acessa artefatos?

Como artefatos evoluem?

Como novas projeções podem ser criadas?
```

---

# Escopo

Esta POC valida exclusivamente os conceitos da Parte 2.

Inclui:

```txt
Documents
Chats
FCID
FCAS
Projection Engine
Lineage
Context Assembly
Synthetic Projection
```

---

# Fora do Escopo

Não faz parte desta POC:

```txt
Memory Layer
Knowledge Layer
Epistemology
Runtime
Procedures
Flows
Automation
Portability
```

Esses componentes serão tratados nas Partes 3 a 6.

---

# Hipóteses a Validar

Ao final da POC deve ser possível afirmar:

```txt
✓ Documento é projeção

✓ Chat é projeção

✓ FCIDs são a fonte de verdade

✓ FCAS navega artefatos cognitivos

✓ Documentos podem ser reconstruídos

✓ Chats podem ser reconstruídos

✓ Lineage funciona

✓ Context Assembly funciona

✓ Novas projeções podem ser criadas
```

## Resultado da POC (2026-11-19)

| Hipótese | Resultado | Onde |
| -------- | --------- | ---- |
| Documento é projeção | Validada | Labs 01 e 02 |
| Chat é projeção | Validada | Labs 01 e 02 |
| FCIDs são a fonte de verdade | Validada: o FCID persiste ao editar, renomear, mover e reordenar, e muda só na mudança de sentido | Labs 03.5 e 04 (ADR-004, ADR-005, ADR-024) |
| FCAS navega artefatos cognitivos | Validada, com a sintaxe unificada fechada; `[[#conceito]]` e referência nomeada são reconhecidas e não resolvidas pela POC | Lab 03 (ADR-017) |
| Documentos podem ser reconstruídos | Validada para o texto. A estrutura de bloco (lista, tabela, código, ênfase) não é representada | Lab 02; Lab 01.5 |
| Chats podem ser reconstruídos | Validada para o texto: 0 perdas em 165 mensagens de teste; 59 mudam de forma | Lab 01.5 (EXP-014) |
| Lineage funciona | Validada | Lab 04 |
| Context Assembly funciona | Validada | Lab 05 |
| Novas projeções podem ser criadas | Validada. O Lab 06 foi **antecipado** (planejado para o EPIC 22) e mantido por decisão de 2026-11-19 | Lab 06 |

Detalhes e decisões: `docs/results/architecture-decisions.md` (ADR-001 a ADR-024) e `docs/results/experiment-results.md` (EXP-001 a EXP-015). O gate Go/No-go e o que falta estão em `docs/06. evolucao-e-roadmap/proximos-passos.md`, seção 5.

---

# Arquitetura Conceitual

```txt
Resource
↓
Artifact Mapping
↓
FCIDs
↓
Projection Engine
↓
Views

Document View
Chat View
```

---

# Estruturas Validadas

## Workspace

```txt
WS
```

---

## Project

```txt
PJ
```

---

## Directory

```txt
DR
```

---

## Documents

```txt
DC
SS
PG
SN
```

---

## Chats

```txt
CH
MS
SN
```

---

# Lab 01 — Artifact Mapping

## Objetivo

Validar a transformação de recursos em artefatos cognitivos.

---

## Pergunta Principal

```txt
Como recursos se tornam FCIDs?
```

---

## Funcionalidades

### Document Mapping

Converter:

```txt
document.md
```

em:

```txt
DC
SS
PG
SN
```

---

### Chat Mapping

Converter:

```txt
Chat
```

em:

```txt
CH
MS
SN
```

---

### Hierarchy Visualization

Visualizar:

```txt
WS
 └─ PJ
      └─ DR
           └─ Resource
```

---

## Resultado Esperado

Todo recurso passa a possuir representação cognitiva persistente.

---

# Lab 02 — Projection Engine

## Objetivo

Validar a criação e reconstrução de projeções.

---

## Pergunta Principal

```txt
Como artefatos geram visualizações?
```

---

## Funcionalidades

### Document Projection

```txt
FCIDs
↓
Document View
```

---

### Chat Projection

```txt
FCIDs
↓
Chat View
```

---

### Projection Removal

Remover projeções mantendo os artefatos.

---

### Projection Rebuild

Reconstruir projeções a partir dos FCIDs.

---

## Resultado Esperado

Documentos e chats tornam-se apenas visualizações temporárias.

---

# Lab 03 — FCAS Resolution

## Objetivo

Validar a FCAS como sistema de navegação cognitiva.

---

## Pergunta Principal

```txt
Como acessar artefatos cognitivos?
```

---

## Funcionalidades

### FCAS Parser

Interpretar:

```txt
[[document.md]]

[[document.md#Introduction]]

[[::chat]]

[[::chat<2>]]
```

---

### FCAS Resolver

Resolver:

```txt
FCAS
↓
FCID
```

---

### FCID Resolution

Resolver:

```txt
[[DC_*]]

[[PG_*]]

[[CH_*]]

[[MS_*]]
```

---

### Preview

Visualizar o destino resolvido.

---

## Resultado Esperado

FCAS torna-se a camada oficial de navegação cognitiva.

---

# Lab 04 — Evolution & Lineage

## Objetivo

Validar identidade cognitiva e rastreabilidade.

---

## Pergunta Principal

```txt
Como artefatos evoluem?
```

---

## Funcionalidades

### Edit

Validar quando um FCID permanece.

---

### Semantic Change

Validar quando um novo FCID é criado.

---

### Split

```txt
PG_A
↓
PG_B
PG_C
```

---

### Merge

```txt
PG_A
PG_B
↓
PG_C
```

---

### Chat Evolution

Aplicar as mesmas regras para:

```txt
MS
SN
```

---

### Lineage Tracking

Registrar:

```txt
evolves_from

split_from

merged_from
```

---

## Resultado Esperado

Definir o modelo oficial de evolução cognitiva do ForgeOS.

---

# Lab 05 — Context Assembly

## Objetivo

Validar a montagem de projeções a partir de artefatos.

---

## Pergunta Principal

```txt
Como artefatos são organizados em uma view?
```

---

## Funcionalidades

### Document Assembly

```txt
DC
↓
SS
↓
PG
↓
SN
```

---

### Chat Assembly

```txt
CH
↓
MS
↓
SN
```

---

### Partial Assembly

Montagem parcial de conteúdo.

Exemplo:

```txt
Somente uma seção
```

ou

```txt
Somente algumas mensagens
```

---

### FCAS Expansion

Expandir:

```txt
[[document.md]]

[[::chat]]
```

em conteúdo resolvido.

---

## Resultado Esperado

Validar a formação de projeções completas e parciais.

---

# Lab 06 — Synthetic Projection

## Objetivo

Validar a criação de projeções inéditas a partir de artefatos existentes.

---

## Pergunta Principal

```txt
FCIDs conseguem gerar novas projeções?
```

---

## Funcionalidades

### Document Synthesis

Criar novo documento usando:

```txt
PG_A
PG_B
PG_C
```

---

### Chat Synthesis

Criar nova conversa usando:

```txt
MS_A
MS_B
MS_C
```

---

### Random Projection

Selecionar artefatos aleatórios:

```txt
SN_*
```

e gerar uma nova projeção.

---

### Selection Projection

Selecionar manualmente:

```txt
SN
PG
MS
```

para formar uma nova view.

---

### FCAS-Based Projection

Criar projeções usando referências FCAS.

Exemplo:

```txt
[[PG_A]]

[[PG_B]]

[[MS_C]]
```

---

## Resultado Esperado

Validar que documentos e chats são apenas uma das possíveis projeções dos artefatos cognitivos.

---

# Resultado Final da POC

Ao término do Context Projection Lab deve ser possível demonstrar:

```txt
Resource
↓
Artifact Mapping
↓
FCIDs
↓
FCAS Resolution
↓
Evolution & Lineage
↓
Context Assembly
↓
Projection Engine
↓
Document View
Chat View
Synthetic View
```

provando que o ForgeOS pode operar sobre artefatos cognitivos persistentes e tratar documentos e chats como projeções reconstruíveis, navegáveis e reutilizáveis.
