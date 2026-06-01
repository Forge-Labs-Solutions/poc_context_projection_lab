# ForgeOS — FCID & FCAS Architecture (Parte 2)

## Visão Geral

Este documento formaliza as definições atualizadas de FCID e FCAS após os refinamentos realizados durante o desenvolvimento do Context Projection Lab.

O objetivo destas definições é estabelecer a fundação arquitetural da Parte 2 do ForgeOS, permitindo a implementação de:

* Documents
* Chat Projection
* FCID
* FCAS
* Cognitive Navigation
* Projection Engine

---

# Princípio Fundamental

O ForgeOS adota o seguinte paradigma:

```txt
Tudo é Contexto
↓
Tudo é Projeção
```

Recursos como documentos e chats deixam de ser considerados a fonte de verdade.

A fonte de verdade passa a ser composta por artefatos persistentes representados por FCIDs.

---

# FCID

## Definição

FCID (Forge Cognitive Identifier) é a identidade persistente de um artefato dentro do ForgeOS.

Um FCID representa um elemento estrutural ou cognitivo do sistema.

FCIDs são independentes de:

```txt
Nome

Localização

Arquivo

Diretório

Projeção
```

e permanecem válidos mesmo após:

```txt
Renomeações

Movimentações

Reorganizações

Mudanças de projeção
```

---

# Categorias de FCID

Após os refinamentos da Parte 2, os FCIDs passam a ser divididos em duas categorias.

---

# Artefatos Cognitivos

Representam conteúdo e significado.

São os elementos que carregam conhecimento.

---

## Parte 2

A menor unidade cognitiva persistente implementada é:

```txt
SN
```

---

## Futuras Partes

O sistema poderá evoluir para:

```txt
PH
CU
CP
EV
```

---

## Responsabilidades

```txt
Conteúdo

Significado

Relações cognitivas

Síntese

Memória

Conhecimento
```

---

## Exemplo

```txt
SN_A7K2M9

"FCIDs provide persistent identity."
```

---

# Artefatos Estruturais

Representam organização.

Não armazenam significado.

Não são a unidade cognitiva principal.

---

## Workspace

```txt
WS
PJ
DR
```

---

## Documents

```txt
DC
SS
PG
```

---

## Chats

```txt
CH
MS
```

---

## Responsabilidades

```txt
Estrutura

Hierarquia

Ordenação

Referências

Estados

Metadados

Projeções
```

---

## Exemplo

```txt
PG_L2X6Q1

Children:
- SN_A
- SN_B
- SN_C
```

---

# Estrutura Compartilhada

Chats e documentos compartilham a mesma estrutura textual interna.

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

Documentos e chats diferem apenas nos containers estruturais.

---

## Documento

```txt
DC
```

Container de projeção documental.

---

## Chat

```txt
CH
```

Container de projeção conversacional.

---

## Mensagem

```txt
MS
```

Container de projeção textual.

---

# Projeções

## Definição

Uma projeção é a transformação de artefatos internos em uma representação compreensível para humanos.

---

## Fluxo

```txt
Artifacts
↓
Projection Engine
↓
Projection
↓
View
↓
User
```

---

# O que NÃO é uma projeção

Uma projeção não é:

```txt
Tela

Janela

Página

Componente UI
```

---

# O que é uma projeção

Uma projeção é:

```txt
Documento

Chat

Mensagem

Seção

Parágrafo

Sentença
```

renderizados para consumo humano.

---

# View

## Definição

Uma View é uma interface que exibe projeções.

---

## Exemplos

### Document View

Exibe:

```txt
Diretórios

Subdiretórios

Documentos
```

---

### Chat View

Exibe:

```txt
Conversas

Mensagens
```

---

### FCAS View

Exibe:

```txt
Referências cognitivas
```

---

# FCAS

## Definição

FCAS (Forge Cognitive Addressing Syntax) é a linguagem de endereçamento humano do ForgeOS.

Ela permite que usuários e sistemas referenciem recursos cognitivos utilizando uma sintaxe amigável.

---

## Exemplos

Documento:

```txt
[[architecture.md]]
```

---

Seção:

```txt
[[architecture.md#Introduction]]
```

---

Chat:

```txt
[[::retrieval-chat]]
```

---

Mensagem:

```txt
[[::retrieval-chat<2>]]
```

---

Artefato:

```txt
[[PG_L2X6Q1]]
```

---

# FCAS ≠ FCID

FCAS e FCID possuem funções diferentes.

---

## FCAS

Representa:

```txt
Endereçamento humano
```

---

## FCID

Representa:

```txt
Identidade persistente
```

---

# Resolução de Referências

Quando o usuário cria uma referência:

```txt
[[architecture.md#Introduction]]
```

o sistema executa:

```txt
FCAS
↓
Resolver
↓
FCID
```

---

Resultado:

```txt
SS_R1C9K2
```

---

# Reference Artifact

Referências persistentes não armazenam apenas FCAS.

Elas armazenam:

```txt
FCAS
+
FCID
```

---

Modelo conceitual:

```txt
RF_A
├─ fcas
└─ target_fcid
```

---

Exemplo

```txt
RF_A

fcas:
[[architecture.md#Introduction]]

target:
SS_R1C9K2
```

---

# Persistência

O ForgeOS persiste:

```txt
FCID

Reference Artifacts
```

---

O ForgeOS NÃO persiste FCAS como identidade principal.

---

# Reconstrução de FCAS

Durante uma projeção:

```txt
FCID
↓
Projection Engine
↓
FCAS
```

---

Exemplo

Persistido:

```txt
SS_R1C9K2
```

---

Projetado:

```txt
[[core-architecture.md#Introduction]]
```

---

# Benefícios

Esse modelo garante:

```txt
Referências persistentes

Renomeação segura

Movimentação segura

Reorganização segura

Compatibilidade histórica

Projeções atualizadas
```

---

# Fluxo Completo

## Criação

```txt
Usuário
↓
FCAS

[[architecture.md#Introduction]]

↓
Resolver

↓
Reference Artifact

↓
FCID

SS_R1C9K2
```

---

## Consumo

```txt
FCID

↓
Projection Engine

↓
FCAS

[[core-architecture.md#Introduction]]

↓
View

↓
Usuário
```

---

# Resultado Arquitetural

Ao final da Parte 2:

```txt
FCID
=
Identidade persistente

FCAS
=
Endereçamento humano

Projection
=
Representação humana

View
=
Interface

Artifacts
=
Fonte de verdade
```

estabelecendo a base para a navegação cognitiva, reconstrução de documentos, reconstrução de chats e futuras camadas de memória, conhecimento e raciocínio do ForgeOS.
