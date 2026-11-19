# API Reference

Documentacao completa dos endpoints disponiveis na POC.

## Visao geral

- Base URL local: `http://localhost:3000`
- Content-Type para requests com body: `application/json`
- Autenticacao: nao aplicavel nesta fase da POC
- Formato de resposta:
  - sucesso: objeto com `data` ou `status`
  - erro: objeto com `error`

## Convencoes

- FCID: identificador persistente de artefato, formato `TYPE_[A-Z0-9]{6}`
  - exemplos: `DC_KDCK60`, `CH_8A626C`, `MS_A1B2C3`
- Projection ID: identificador de projecao, formato `PROJ_[A-Z0-9]{8}`
- Status HTTP:
  - `200` sucesso
  - `400` payload invalido
  - `404` recurso nao encontrado
  - `500` erro interno

## 1) Health

### GET `/health`
Verifica se a API esta ativa.

Resposta `200`:
```json
{
  "status": "ok"
}
```

Exemplo:
```bash
curl http://localhost:3000/health
```

## 2) Endpoints base

### GET `/v1/artifacts`
Lista todos os artefatos persistidos.

Resposta `200`:
```json
{
  "data": [
    {
      "fcid": "DC_KDCK60",
      "type": "DC",
      "category": "structural",
      "state": "active",
      "metadataJson": "{\"resourceKey\":\"docs/architecture.md\"}",
      "createdAt": 1780000000000,
      "updatedAt": 1780000000000
    }
  ]
}
```

Exemplo:
```bash
curl http://localhost:3000/v1/artifacts
```

### GET `/v1/artifacts/:fcid`
Retorna um artefato especifico por FCID.

Path params:
- `fcid` (string, obrigatorio)

Resposta `200`:
```json
{
  "data": {
    "fcid": "DC_KDCK60",
    "type": "DC",
    "category": "structural",
    "state": "active",
    "metadataJson": "{\"resourceKey\":\"docs/architecture.md\"}",
    "createdAt": 1780000000000,
    "updatedAt": 1780000000000
  }
}
```

Resposta `404`:
```json
{
  "error": "Artifact not found"
}
```

Exemplo:
```bash
curl http://localhost:3000/v1/artifacts/DC_KDCK60
```

### GET `/v1/graph`
Retorna o grafo bruto persistido (`nodes` e `edges`).

Resposta `200`:
```json
{
  "data": {
    "nodes": [],
    "edges": []
  }
}
```

Exemplo:
```bash
curl http://localhost:3000/v1/graph
```

### POST `/v1/seeds/reset`
Reseta e reaplica o dataset base da POC.

Resposta `200`:
```json
{
  "status": "ok",
  "message": "Seed reset completed."
}
```

Exemplo:
```bash
curl -X POST http://localhost:3000/v1/seeds/reset
```

## 3) Lab 01 - Artifact Mapping

### POST `/v1/lab01/import/document`
Importa um documento bruto em Markdown e cria artefatos no formato:
`DC -> SS -> PG -> SN`.

Body:
```json
{
  "resourceKey": "docs/architecture.md",
  "title": "Architecture",
  "text": "# Introduction\nFCID is persistent identity.\n\n## Scope\nDocument is projection.",
  "parentFcid": "PJ_CORE"
}
```

Campos:
- `resourceKey` (string, obrigatorio): chave logica do recurso
- `title` (string, obrigatorio): titulo da projecao
- `text` (string, obrigatorio): documento bruto em Markdown
- `parentFcid` (string, opcional): parent deve ser `PJ` ou `DR`; se omitido, o parent vira o `WS`
- `text` aceita Markdown:
  - headings (`#`, `##`, etc.) viram `SS`
  - blocos de paragrafo viram `PG`
  - frases viram `SN`

Resposta `200`:
```json
{
  "data": {
    "rootFcid": "DC_KDCK60",
    "projectionId": "PROJ_2YGO1FRJ"
  }
}
```

Resposta `400`:
```json
{
  "error": {}
}
```

Exemplo:
```bash
curl -X POST http://localhost:3000/v1/lab01/import/document \
  -H "Content-Type: application/json" \
  -d "{\"resourceKey\":\"docs/architecture.md\",\"title\":\"Architecture\",\"text\":\"# Introduction\nFCID is persistent identity.\n\n## Scope\nDocument is projection.\"}"
```

### POST `/v1/lab01/import/directory`
Importa um diretorio criando um artefato `DR` e importa uma lista de documentos como filhos desse diretorio.

Body:
```json
{
  "title": "Architecture",
  "parentFcid": "PJ_CORE",
  "documents": [
    {
      "resourceKey": "docs/a.md",
      "title": "Doc A",
      "text": "# Intro\nA."
    },
    {
      "resourceKey": "docs/b.md",
      "title": "Doc B",
      "text": "# Intro\nB."
    }
  ]
}
```

Campos:
- `title` (string, obrigatorio): titulo do diretorio (`DR`)
- `parentFcid` (string, opcional): deve ser `PJ` ou `DR`; se omitido, usa o `WS`
- `documents` (array, obrigatorio, min 1): mesmo payload do import de documento

Comportamento:
- se `parentFcid` nao vier, usa o `WS` atual como parent
- cria `DR` novo
- cria/importa `DC` dos documentos e relaciona todos ao `DR`

Resposta `200`:
```json
{
  "data": {
    "directoryFcid": "DR_A1B2C3",
    "parentFcid": "WS_MAIN",
    "documents": [
      {
        "rootFcid": "DC_D4E5F6",
        "projectionId": "PROJ_ABCDEFGH"
      }
    ]
  }
}
```

### POST `/v1/lab01/chat/create`
Cria um chat (`CH`) para uma chave logica.

Body:
```json
{
  "resourceKey": "::retrieval-chat",
  "title": "Retrieval Chat"
}
```

Campos:
- `resourceKey` (string, obrigatorio)
- `title` (string, obrigatorio)

Resposta `200`:
```json
{
  "data": {
    "chatFcid": "CH_8A626C",
    "projectionId": "PROJ_Q1W2E3R4"
  }
}
```

Exemplo:
```bash
curl -X POST http://localhost:3000/v1/lab01/chat/create \
  -H "Content-Type: application/json" \
  -d "{\"resourceKey\":\"::retrieval-chat\",\"title\":\"Retrieval Chat\"}"
```

### POST `/v1/lab01/chat/:chatFcid/messages`
Adiciona mensagem em um chat existente.

Path params:
- `chatFcid` (string, obrigatorio): FCID do chat (`CH_*`)

Body (simples):
```json
{
  "role": "user",
  "text": "Hello world"
}
```

Body com Markdown (secoes no proprio `text`):
```json
{
  "role": "assistant",
  "text": "# Answer\nSentence 1. Sentence 2.\n\n## Details\nMore details here."
}
```

Campos:
- `role` (enum: `user | assistant | system`, opcional, default `user`)
- `text` (string, obrigatorio)
- `text` aceita Markdown:
  - headings (`#`, `##`, etc.) viram `SS`
  - blocos de paragrafo viram `PG`
  - frases viram `SN`

Resposta `200`:
```json
{
  "data": {
    "messageFcid": "MS_A1B2C3"
  }
}
```

Resposta `404`:
```json
{
  "error": "Chat not found"
}
```

Exemplo:
```bash
curl -X POST http://localhost:3000/v1/lab01/chat/CH_8A626C/messages \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"user\",\"text\":\"Hello world\"}"
```

### POST `/v1/lab01/projection/remove`
Marca uma projecao como removida sem apagar artefatos persistidos.

Body:
```json
{
  "projectionId": "PROJ_2YGO1FRJ"
}
```

Campos:
- `projectionId` (string, obrigatorio)

Resposta `200`:
```json
{
  "status": "ok"
}
```

Resposta `404`:
```json
{
  "error": "Projection not found"
}
```

Exemplo:
```bash
curl -X POST http://localhost:3000/v1/lab01/projection/remove \
  -H "Content-Type: application/json" \
  -d "{\"projectionId\":\"PROJ_2YGO1FRJ\"}"
```

### GET `/v1/lab01/explorer/artifacts`
Lista artefatos com enriquecimento de:
- parent (pais)
- children (filhos)
- references

Resposta `200`:
```json
{
  "data": [
    {
      "fcid": "PG_L2X6Q1",
      "type": "PG",
      "category": "structural",
      "state": "active",
      "parent": ["SS_R1C9K2"],
      "children": ["SN_A7K2M9"],
      "references": []
    }
  ]
}
```

Exemplo:
```bash
curl http://localhost:3000/v1/lab01/explorer/artifacts
```

### GET `/v1/lab01/explorer/artifacts/:fcid`
Retorna um artefato especifico com relacoes (pai, filhos, referencias).

Path params:
- `fcid` (string, obrigatorio)

Resposta `200`:
```json
{
  "data": {
    "fcid": "PG_L2X6Q1",
    "type": "PG",
    "category": "structural",
    "state": "active",
    "parent": ["SS_R1C9K2"],
    "children": ["SN_A7K2M9"],
    "references": []
  }
}
```

Resposta `404`:
```json
{
  "error": "Artifact not found"
}
```

Exemplo:
```bash
curl http://localhost:3000/v1/lab01/explorer/artifacts/PG_L2X6Q1
```

### GET `/v1/lab01/validation/:projectionId`
Executa checks basicos de validacao do Lab 01 para uma projecao.

Path params:
- `projectionId` (string, obrigatorio)

Resposta `200`:
```json
{
  "data": {
    "projectionId": "PROJ_2YGO1FRJ",
    "checks": {
      "hasPersistentRootFcid": true,
      "separatesStructureAndContent": true,
      "projectionIsNotSourceOfTruth": true
    }
  }
}
```

Resposta `404`:
```json
{
  "error": "Projection not found"
}
```

Exemplo:
```bash
curl http://localhost:3000/v1/lab01/validation/PROJ_2YGO1FRJ
```

## Fluxo recomendado de uso (Lab 01)

1. Criar chat (quando fluxo conversacional):
```bash
POST /v1/lab01/chat/create
```
2. Adicionar mensagens no chat:
```bash
POST /v1/lab01/chat/:chatFcid/messages
```
3. Importar documentos:
```bash
POST /v1/lab01/import/document
```
4. Inspecionar artefatos:
```bash
GET /v1/lab01/explorer/artifacts
```
5. Validar projecao:
```bash
GET /v1/lab01/validation/:projectionId
```
6. Testar independencia de projecao:
```bash
POST /v1/lab01/projection/remove
```
e depois consultar artifacts novamente no explorer.

## 4) Lab 02 - Projection Engine

### POST `/v1/lab02/project`
Projeta qualquer artefato suportado (`SN`, `PG`, `SS`, `MS`, `DC`, `CH`) para formato humano.

Body:
```json
{
  "artifactFcid": "DC_KDCK60",
  "targetFormat": "markdown"
}
```

Campos:
- `artifactFcid` (string, obrigatorio)
- `targetFormat` (opcional): `markdown | text | json`
  - default: `markdown`

Resposta `200` (markdown/text):
```json
{
  "data": {
    "artifactFcid": "DC_KDCK60",
    "scope": "DC",
    "targetFormat": "markdown",
    "content": "# Document title\n\n# Section\n\nParagraph...",
    "lineageMeta": {
      "statelessRebuild": true
    }
  }
}
```

Resposta `200` (json):
```json
{
  "data": {
    "artifactFcid": "DC_KDCK60",
    "scope": "DC",
    "targetFormat": "json",
    "structured": {},
    "lineageMeta": {
      "statelessRebuild": true
    }
  }
}
```

Resposta `404`:
```json
{
  "error": "Artifact not found"
}
```

Resposta `409`:
```json
{
  "error": "Artifact type not projectable in Lab 02"
}
```

Exemplo:
```bash
curl -X POST http://localhost:3000/v1/lab02/project \
  -H "Content-Type: application/json" \
  -d "{\"artifactFcid\":\"DC_KDCK60\",\"targetFormat\":\"markdown\"}"
```

## 5) Lab 03 - FCAS Resolution

### POST `/v1/lab03/parse`
Faz parse da sintaxe FCAS para estrutura interpretada.

Body:
```json
{
  "fcas": "[[architecture.md#Introduction]]"
}
```

### POST `/v1/lab03/resolve`
Resolve FCAS para FCID persistente.

Body:
```json
{
  "fcas": "[[::retrieval-chat<2>]]"
}
```

Resposta `200`:
```json
{
  "data": {
    "parsed": {},
    "targetFcid": "MS_A1B2C3"
  }
}
```

### POST `/v1/lab03/references`
Cria Reference Artifact persistindo `fcas + target_fcid`.

Body:
```json
{
  "sourceFcid": "CH_8A626C",
  "fcas": "[[::retrieval-chat<2>]]"
}
```

### POST `/v1/lab03/project-fcas`
Reconstrói FCAS humana a partir de um FCID.

Body:
```json
{
  "targetFcid": "DC_KDCK60"
}
```

Resposta `200`:
```json
{
  "data": {
    "targetFcid": "DC_KDCK60",
    "fcas": "[[architecture.md]]"
  }
}
```

## 6) Lab 04 - Evolution & Lineage

Regras em `docs/lab 04.md` (ADR-004, ADR-005). Erros seguem o formato:

```json
{ "error": "Artifact SN_A1B2C3 is superseded", "code": "SUPERSEDED", "details": { "fcid": "SN_A1B2C3", "current": ["SN_Q3R8T1"] } }
```

Codigos: `NOT_FOUND` (404), `SUPERSEDED` (409), `INVALID_OPERATION`, `NO_CHANGE`, `CONTENT_CHANGED`, `NO_PARENT`, `DIFFERENT_PARENTS`, `NOT_ADJACENT` (422). Body invalido retorna 400.

### POST `/v1/lab04/edit`
Edicao de forma: mantem o FCID. `text` para SN, `title` para SS (exatamente um).

Body:
```json
{ "fcid": "SN_A7K2M9", "text": "FCIDs provide persistent identity." }
```

Resposta `200`:
```json
{ "data": { "fcid": "SN_A7K2M9", "revision": 2, "eventId": "EVT_K2M9A7Q1", "classification": { "suggestion": "edit", "reason": "token_level_typos", "similarity": 0.97 } } }
```

### POST `/v1/lab04/semantic-change`
Mudanca de significado de um SN: cria novo SN com `evolves_from`.

Body:
```json
{ "fcid": "SN_A7K2M9", "text": "FCIDs provide versioned identity." }
```

Resposta `200`:
```json
{ "data": { "fcid": "SN_Q3R8T1", "supersededFcid": "SN_A7K2M9", "eventId": "EVT_...", "classification": { "suggestion": "semantic_change", "reason": "content_changed", "similarity": 0.8 } } }
```

### POST `/v1/lab04/classify`
Sugestao (nao decide) entre edit e semantic change para um SN.

Body:
```json
{ "fcid": "SN_A7K2M9", "text": "FCIDs provide persistent identity." }
```

### POST `/v1/lab04/split`
SN: `parts` (concatenacao normalizada deve ser igual ao original). PG/MS: `boundaries` (indices dos filhos onde cada nova parte comeca).

Body:
```json
{ "fcid": "PG_L2X6Q1", "boundaries": [2] }
```

Resposta `200`:
```json
{ "data": { "supersededFcid": "PG_L2X6Q1", "fcids": ["PG_B...", "PG_C..."], "eventId": "EVT_..." } }
```

### POST `/v1/lab04/merge`
Junta SN, PG ou MS do mesmo tipo, mesmo pai e adjacentes (MS: mesmo role).

Body:
```json
{ "fcids": ["PG_A...", "PG_B..."] }
```

### POST `/v1/lab04/regenerate`
Substitui uma mensagem inteira: novo MS com `evolves_from`, na mesma posicao do chat.

Body:
```json
{ "fcid": "MS_T2W7K5", "text": "A persistent cognitive identifier." }
```

### GET `/v1/lab04/lineage/:fcid`
Retorna `ancestors`, `descendants` (com `relation`, `via`, `depth`, `state`), `current` e `events`.

### GET `/v1/lab04/current/:fcid`
Retorna os FCIDs ativos atuais (o proprio FCID se estiver `active`).

### GET `/v1/lab04/references/:referenceId`
Continuidade de um Reference Artifact: `status` = `resolved` | `evolved` | `ambiguous` | `orphaned`, com `currentFcids`.

### Mudanca no Lab 03
`POST /v1/lab03/resolve` com `[[FCID]]` superseded resolve para o descendente (`evolvedFrom` no retorno) ou retorna `409` com `details.candidates` quando houve split.
