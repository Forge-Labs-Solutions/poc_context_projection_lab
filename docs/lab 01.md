# Lab 01 — Artifact Mapping

## Objetivo

Validar a transformação de recursos operacionais do ForgeOS em artefatos cognitivos e estruturais persistentes.

O Artifact Mapping é responsável por estabelecer a ponte entre:

```txt
Resources
```

e

```txt
Cognitive Graph
```

permitindo que documentos e chats sejam representados internamente através de artefatos persistentes independentes da projeção original.

---

# Pergunta Principal

```txt
Como recursos do ForgeOS são convertidos
em artefatos persistentes?
```

---

# Objetivos de Validação

Ao final do laboratório deve ser possível afirmar:

```txt
✓ Recursos podem ser representados por FCIDs

✓ Conteúdo e estrutura são separados

✓ Chats e documentos compartilham a mesma estrutura interna

✓ Projeções podem ser reconstruídas

✓ Estruturas preservam organização e metadados

✓ Conteúdo cognitivo permanece independente da projeção
```

---

# Modelo de Artefatos

O ForgeOS passa a distinguir dois tipos de artefatos.

---

## Artefatos Cognitivos

Representam conteúdo.

São os portadores de significado.

Parte 2:

```txt
SN
```

Partes futuras:

```txt
PH
CU
CP
EV
```

---

### Responsabilidades

```txt
Conteúdo

Significado

Relações cognitivas

Síntese

Evolução cognitiva
```

---

## Artefatos Estruturais

Representam organização.

Não armazenam conteúdo.

Armazenam:

```txt
Estrutura

Ordenação

Referências

Metadados

Estados
```

---

### Artefatos Estruturais

```txt
WS
PJ
DR

DC
CH
MS

SS
PG
```

---

# Estrutura Cognitiva Compartilhada

Chats e documentos utilizam a mesma estrutura textual interna.

---

## Documento

```txt
DC
 └─ SS
      └─ PG
           └─ SN
```

---

## Chat

```txt
CH
 └─ MS
      └─ SS*
           └─ PG
                └─ SN
```

Onde:

```txt
SS
```

é opcional.

---

## Chat Simples

```txt
CH
 └─ MS
      └─ PG
           └─ SN
```

---

## Chat Estruturado

```txt
CH
 └─ MS
      └─ SS
           └─ PG
                └─ SN
```

---

# Containers de Projeção

A diferença entre documentos e chats está apenas nos containers estruturais.

---

## Documento

```txt
DC
```

Representa:

```txt
Document Projection Container
```

---

## Chat

```txt
CH
```

Representa:

```txt
Chat Projection Container
```

---

## Mensagem

```txt
MS
```

Representa:

```txt
Message Projection Container
```

---

# Sub-Lab 01.1 — Resource Discovery

## Objetivo

Identificar recursos disponíveis para mapeamento.

---

### Recursos

```txt
Workspace

Projects

Directories

Documents

Chats
```

---

### Resultado

Árvore estrutural:

```txt
WS
 └─ PJ
      └─ DR
           └─ Resource
```

---

# Sub-Lab 01.2 — FCID Generation

## Objetivo

Gerar FCIDs persistentes.

---

### Estruturais

```txt
WS
PJ
DR

DC
CH
MS

SS
PG
```

---

### Cognitivos

```txt
SN
```

---

### Validações

```txt
Unicidade

Persistência

Independência de posição

Independência de nome
```

---

### Cenários

Renomear:

```txt
document.md
```

↓

```txt
architecture.md
```

---

Resultado esperado:

```txt
DC continua o mesmo
```

---

# Sub-Lab 01.3 — Structure Mapping

## Objetivo

Validar a construção da estrutura persistente.

---

### Documento

```txt
DC
 └─ SS
      └─ PG
           └─ SN
```

---

### Chat

```txt
CH
 └─ MS
      └─ PG
           └─ SN
```

ou

```txt
CH
 └─ MS
      └─ SS
           └─ PG
                └─ SN
```

---

### Resultado

Grafo estrutural persistente.

---

# Sub-Lab 01.4 — Projection Independence

## Objetivo

Validar separação entre conteúdo e projeção.

---

### Cenário

Importar:

```txt
architecture.md
```

↓

Gerar:

```txt
DC_A

SS_B

PG_C

SN_D
```

---

Excluir:

```txt
architecture.md
```

---

Validação:

```txt
DC_A

SS_B

PG_C

SN_D
```

continuam existindo.

---

### Resultado

A projeção deixa de ser a fonte de verdade.

---

# Sub-Lab 01.5 — Chat Migration

## Objetivo

Validar a migração da Parte 1.

---

### Modelo Atual

```txt
Chat
 └─ Message
```

---

### Modelo Cognitivo

```txt
CH
 └─ MS
      └─ PG
           └─ SN
```

---

### Resultado

Compatibilidade entre Parte 1 e Parte 2.

---

# Sub-Lab 01.6 — Artifact Explorer

## Objetivo

Visualizar artefatos gerados.

---

### Exibir

```txt
FCID

Tipo

Categoria
(Estrutural/Cognitivo)

Pai

Filhos

Estado

Referências
```

---

### Exemplo

```txt
PG_L2X6Q1

Categoria:
Structural

Parent:
SS_R1C9K2

Children:
SN_A7K2M9
SN_B4L8Q2
```

---

# Artefatos Produzidos

Ao final do Lab 01 o sistema deve possuir:

```txt
FCID Registry

Artifact Graph

Structural Graph

Cognitive Graph

Projection Metadata
```

---

# Resultado Final

O Artifact Mapping será considerado validado quando for possível transformar:

```txt
Workspace
Projects
Directories
Documents
Chats
```

em:

```txt
Artefatos Estruturais
+
Artefatos Cognitivos
```

preservando:

```txt
Estrutura
Identidade
Metadados
Referências
Estados
```