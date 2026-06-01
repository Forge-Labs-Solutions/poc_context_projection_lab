# Context Projection Lab UI Specification

## Visão Geral

A Context Projection Lab UI é uma interface mínima criada exclusivamente para validar os Labs 01, 02 e 03 da POC Context Projection Lab.

Ela não tem como objetivo ser um produto final nem antecipar o Forge Hub.

Seu propósito é fornecer uma forma prática de:

```txt
Importar dados

Visualizar artefatos

Executar projeções

Testar FCAS

Validar comportamentos arquiteturais
```

---

# Objetivos

A interface deve permitir validar:

```txt
Lab 01 — Artifact Mapping

Lab 02 — Projection Engine

Lab 03 — FCAS Resolution
```

sem exigir ferramentas externas ou manipulação direta do banco de dados.

---

# Princípios

## Não é um editor

A interface não possui edição de documentos.

Não possui gerenciamento completo de projetos.

Não possui recursos colaborativos.

---

## É uma ferramenta de experimentação

Toda funcionalidade deve existir para validar hipóteses arquiteturais.

---

## Dados de entrada são importados

Documentos e diretórios são criados através de importação.

A única criação manual permitida é:

```txt
Chat

Mensagem
```

para simular conversas.

---

# Stack Recomendada

## Frontend

```txt
React
TypeScript
Vite
Mantine UI
```

---

## Navegação

```txt
React Router
```

---

## Estado

```txt
TanStack Query
```

ou equivalente.

---

# Estrutura Geral

```txt
AppShell
│
├─ Header
│   ├─ Project Selector
│   ├─ API Status
│   └─ Reset Seeds
│
├─ Sidebar
│   ├─ Document View
│   ├─ Chat View
│   └─ FCAS Search
│
└─ Main
    ├─ Artifact Tree
    ├─ Projection Preview
    └─ Artifact Inspector
```

---

# Header

## Project Selector

Seleciona o projeto atual.

---

### Função

```txt
Definir contexto visual atual.
```

---

### Fonte

Artefatos:

```txt
PJ_*
```

---

## API Status

Utiliza:

```txt
GET /health
```

---

Exibe:

```txt
Online

Offline
```

---

## Reset Seeds

Executa:

```txt
POST /v1/seeds/reset
```

---

Objetivo:

```txt
Recriar dataset de teste.
```

---

# Document View

## Objetivo

Validar:

```txt
Artifact Mapping

Projection Engine
```

para documentos.

---

# Funcionalidades

## Import Document

Executa:

```txt
POST /v1/lab01/import/document
```

---

Campos:

```txt
Nome

Markdown
```

---

## Import Directory

Executa:

```txt
POST /v1/lab01/import/directory
```

---

Campos:

```txt
Nome

Documentos
```

---

## Import Directory Inside Directory

Permite importar um diretório dentro de outro.

---

Campos adicionais:

```txt
Parent Directory
```

---

Resultado:

```txt
DR
 └─ DR
      └─ DC
```

---

# Artifact Tree

Estrutura:

```txt
PJ
 └─ DR
      ├─ DR
      │    └─ DC
      │         └─ SS
      │              └─ PG
      │                   └─ SN
      │
      └─ DC
```

---

# Seleção

Qualquer artefato pode ser selecionado.

---

Exemplos:

```txt
DC

SS

PG

SN
```

---

Ao selecionar:

```txt
POST /v1/lab02/project
```

---

Resultado:

```txt
Projection Preview
```

---

# Chat View

## Objetivo

Validar:

```txt
Chat Projection

FCAS

Artifact Mapping
```

---

# Criar Chat

Executa:

```txt
POST /v1/lab01/chat/create
```

---

Campos:

```txt
Chat Key

Título opcional
```

---

# Adicionar Mensagem

Executa:

```txt
POST /v1/lab01/chat/:chatFcid/messages
```

---

Campos:

```txt
Role

user
assistant

Markdown
```

---

Importante:

```txt
Nenhum LLM é utilizado.
```

O usuário cria manualmente a conversa.

---

# Estrutura da Árvore

```txt
CH
 └─ MS
      └─ SS*
           └─ PG
                └─ SN
```

---

ou

```txt
CH
 └─ MS
      └─ PG
           └─ SN
```

---

# Seleção

Qualquer artefato pode ser selecionado.

---

Exemplos:

```txt
CH

MS

SS

PG

SN
```

---

Ao selecionar:

```txt
POST /v1/lab02/project
```

---

Resultado:

```txt
Projection Preview
```

---

# FCAS Search

## Objetivo

Validar o Lab 03.

---

# Fluxo

Entrada:

```txt
[[architecture.md#Introduction]]
```

---

## Parse

Executa:

```txt
POST /v1/lab03/parse
```

---

## Resolve

Executa:

```txt
POST /v1/lab03/resolve
```

---

Resultado:

```txt
FCID
```

---

## Projection

Executa:

```txt
POST /v1/lab02/project
```

---

Resultado:

```txt
Projection Preview
```

---

## Create Reference Artifact

Opcional.

Executa:

```txt
POST /v1/lab03/references
```

---

# Artifact Tree

A árvore é o componente central da interface.

---

# Tipos Exibidos

## Estruturais

```txt
PJ

DR

DC

CH

MS

SS

PG
```

---

## Cognitivos

```txt
SN
```

---

# Expansão

Todos os nós devem suportar expansão.

---

Exemplo

```txt
DC
 └─ SS
      └─ PG
           └─ SN
```

---

Exemplo

```txt
CH
 └─ MS
      └─ PG
           └─ SN
```

---

# Regra de Seleção

Ao clicar em qualquer nó:

```txt
Selecionar FCID
↓
Projetar FCID
↓
Mostrar resultado
```

---

# Projection Preview

## Objetivo

Visualizar projeções.

---

# Formatos

Suportados:

```txt
Markdown

Text

JSON
```

---

Executa:

```txt
POST /v1/lab02/project
```

---

Exemplo

Selecionar:

```txt
SN_A
```

↓

Projeção:

```txt
Sentence
```

---

Selecionar:

```txt
PG_A
```

↓

Projeção:

```txt
Paragraph
```

---

Selecionar:

```txt
CH_A
```

↓

Projeção:

```txt
Chat completo
```

---

# Artifact Inspector

## Objetivo

Inspecionar artefatos.

---

# Dados Exibidos

```txt
FCID

Tipo

Categoria

Pai

Filhos

Referências

Estado
```

---

Fontes:

```txt
GET /v1/artifacts/:fcid

GET /v1/lab01/explorer/artifacts/:fcid
```

---

# Copy FCAS Reference

## Objetivo

Validar o fluxo inverso do Lab 03.

---

# Disponibilidade

Todos os itens da árvore devem possuir:

```txt
Copy FCAS Reference
```

---

# Fluxo

Selecionar artefato:

```txt
PG_A
```

---

Executar:

```txt
POST /v1/lab03/project-fcas
```

---

Resultado:

```txt
[[architecture.md#Introduction]]
```

---

Copiar para clipboard.

---

Exibir:

```txt
Reference copied
```

---

# Fluxo Completo Validado

```txt
Artifact Tree
↓
Select FCID
↓
Projection Engine
↓
Projection Preview
```

---

Fluxo FCAS:

```txt
Artifact
↓
project-fcas
↓
FCAS
↓
Clipboard
↓
FCAS Search
↓
parse
↓
resolve
↓
FCID
↓
project
↓
Projection
```

---

# Funcionalidades Fora de Escopo

Não implementar:

```txt
Criação manual de diretórios

Criação manual de documentos

Edição de documentos

Renomeação

Movimentação

Exclusão

Drag and Drop

Autenticação

Integração LLM

Permissões
```

---

# Resultado Esperado

Ao final da implementação deve ser possível:

```txt
✓ Importar diretórios

✓ Importar documentos

✓ Criar chats

✓ Adicionar mensagens markdown

✓ Navegar artefatos

✓ Expandir estrutura interna

✓ Projetar qualquer FCID

✓ Resolver FCAS

✓ Gerar FCAS

✓ Copiar referências

✓ Validar os Labs 01, 02 e 03
```

sem transformar a POC em um produto completo ou antecipar funcionalidades do Forge Hub.