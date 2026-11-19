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

**Reimportacao (Lab 01.5, ADR-022).** Se a `resourceKey` ja tem vinculo, o documento e levado ao texto novo, em uma transacao, sem duplicar nada: o que nao mudou fica igual, uma correcao leve mantem o `SN` (`edit`), uma mudanca de sentido cria um `SN` novo que evolui do antigo (`semantic_change`), o que sumiu fica `superseded` (`remove`) e o que e novo e criado. A resposta traz `reimport` com o resumo (`kept`, `edited`, `replaced`, `removed`, `added`, `moved`, `metadata`), ou `null` na primeira importacao. Sem `parentFcid` o documento fica onde esta; com `parentFcid` ele e movido. `POST /v1/lab01/import/directory` reaproveita o diretorio de mesmo pai e titulo exato.

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

### POST `/v1/lab01/chat/import`
Cria o chat ou o leva a uma conversa, de forma idempotente (Lab 01.5, ADR-022). Importar a mesma conversa de novo nao muda nada.

Body:
```json
{
  "resourceKey": "::retrieval-chat",
  "title": "Retrieval Chat",
  "messages": [
    { "role": "user", "text": "Como comeco?" },
    { "role": "assistant", "text": "Comece pela massa." }
  ]
}
```

Campos:
- `messages[].fcid` (string, opcional): identidade da mensagem na origem. Mensagens com `fcid` sao casadas por ele (e criadas com ele); sem, sao casadas por posicao e papel. Dar `fcid` a todas as mensagens ou a nenhuma (senao `400`).
- `messages[].role` (`user | assistant | system`) e `messages[].text` sao obrigatorios.

Resposta `200`:
```json
{
  "data": {
    "chatFcid": "CH_8A626C",
    "projectionId": "PROJ_Q1W2E3R4",
    "messageFcids": ["MS_AAAAAA", "MS_BBBBBB"],
    "reimport": { "kept": 2, "edited": 0, "replaced": 0, "removed": 0, "added": 0, "moved": 0, "metadata": 0 }
  }
}
```

`reimport` e `null` quando o chat foi criado agora. Uma mensagem a mais no fim entra sozinha (`added`); texto alterado muda a mensagem (`edited` ou `replaced`, pela regra do Lab 04); mensagem que sumiu fica `superseded` (`removed`); papel diferente na mesma posicao substitui a mensagem (`removed` e `added`). Erros: `409 FCID_CONFLICT` (o FCID ja existe fora do chat, ou a chave ja pertence a outro chat).

### POST `/v1/lab01/projection/remove`
Marca uma projecao como removida sem apagar artefatos persistidos. O vinculo do recurso e mantido: importar de novo a mesma `resourceKey` reaproveita o mesmo artefato (mesmo FCID) e reativa a mesma projecao. Enquanto estiver removido, o recurso nao resolve por nome (`[[doc.md]]` retorna 404).

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
Faz parse da sintaxe FCAS para estrutura interpretada. Sintaxe e regras em ADR-017.

Body:
```json
{
  "fcas": "[[architecture.md#Introduction]]"
}
```

Formas reconhecidas (`parsed.kind`):

| Forma | kind | Observacao |
| --- | --- | --- |
| `[[WS_ABC123]]` | `artifact` | FCID |
| `[[$workspace]]` | `workspace` | |
| `[[$ForgeOS]]` | `project` | nome do projeto (sem diferenciar maiusculas) ou FCID do projeto |
| `[[Architecture]]` | `directory` | nome do diretorio |
| `[[doc.md]]`, `[[doc.md#Secao]]` | `document` | |
| `[[::chat]]`, `[[::chat<N>]]` | `chat` | chat inteiro ou mensagem N |
| `[[::chat<A-B>]]` | `chat` com `messageRange` | intervalo fechado, a partir de 1; `A < 1` ou `B < A` retorna 400 |
| `[[#slug]]`, `[[#slug#Secao]]` | `concept` | so reconhecida; nao e resolvida pela POC |
| `[[@nome]]` | `alias` | referencia nomeada; so reconhecida; nao e resolvida pela POC |

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

`evolvedFrom` aparece quando o FCID pedido foi superseded e resolveu por lineage. `range` (`{ "from": 2, "to": 3 }`) aparece para `[[::chat<2-3>]]`: `targetFcid` e o chat e o recorte fica com quem chamou.

Erros (`{ error, code?, details? }`):

| Status | code | Quando |
| --- | --- | --- |
| 400 | - | FCAS invalida |
| 404 | - | alvo inexistente, inclusive projeto ou diretorio sem esse nome (nao cai mais no primeiro) |
| 409 | - | FCID dividido (`details.candidates`) |
| 409 | `AMBIGUOUS_NAME` | dois ou mais diretorios (ou projetos) com o mesmo nome (`details.candidates`) |
| 409 | `ORPHANED` | FCID superseded sem descendente ativo; `details.cause` (`eventId`, `operation`, `supersededRoot`) e `details.candidates` (o que o evento produziu) quando o log tem o evento |
| 422 | `UNSUPPORTED_SYNTAX` | `[[#slug]]` ou `[[@nome]]` (`details.syntax`) |

### POST `/v1/lab03/references`
Cria Reference Artifact persistindo `fcas + target_fcid`. O id usa o prefixo `REF_` (ADR-018). Os erros sao os do `resolve`. Um intervalo de chat e aceito: o alvo gravado e o chat e o intervalo fica em `fcas_raw`.

Body:
```json
{
  "sourceFcid": "CH_8A626C",
  "fcas": "[[::retrieval-chat<2>]]"
}
```

### POST `/v1/lab03/project-fcas`
Reconstrói FCAS humana a partir de um FCID. Projeto e diretorio voltam pelo nome (`[[$Labs]]`, `[[Architecture]]`) quando o nome e unico e continua sendo lido como o mesmo tipo; senao volta o FCID (`[[PJ_ABC123]]` como `[[$PJ_ABC123]]`, diretorio como `[[DR_ABC123]]`).

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

### Lab 03.5 - Estabilidade da referencia (ADR-024)

Uma referencia guarda o FCID do alvo e e valida enquanto o alvo esta ativo. Renomear, mover e reordenar nao trocam FCID e nao criam evento de evolucao; o que pode ficar velho e o texto FCAS guardado (`stale`). Depois de cada operacao, o `status` gravado de todas as referencias e sincronizado (`resolved` ou `stale`); as respostas trazem `references: { total, resolved, stale }`.

Erros (`{ error, code, details }`): `NOT_FOUND` (404), `INVALID_OPERATION` e `NOT_A_PERMUTATION` (422), `CONFLICT`, `CYCLE` e `TARGET_NOT_ACTIVE` (409). Body invalido retorna 400.

#### POST `/v1/lab03/rename`
Renomeia um documento ou chat (`resourceKey`; `title` opcional atualiza o titulo da projecao) ou um diretorio ou projeto (`title`).
```json
{ "fcid": "DC_KDCK60", "resourceKey": "core-architecture.md" }
```
Resposta: `{ fcid, previous, current, references }`. Chave de documento: termina em `.md`, sem `#`, `[`, `]` ou quebra de linha, sem comecar com `::`, `$`, `@` ou `#`. Chave de chat: comeca com `::`, sem `<`, `>`, `[`, `]`. Chave ja usada: `409 CONFLICT`. O nome antigo deixa de resolver.

#### POST `/v1/lab03/move`
Move um documento ou diretorio para o workspace, um projeto ou um diretorio.
```json
{ "fcid": "DR_AB12CD", "newParentFcid": "PJ_CORE" }
```
Resposta: `{ fcid, previousParent, newParent, references }`. Mover para si mesmo ou para um descendente: `409 CYCLE`. Como o endereco de um documento e a chave, e nao o caminho, mover nao deixa referencia `stale`.

#### POST `/v1/lab03/reorder`
Poe os filhos de um pai em outra ordem; `childFcids` precisa ser uma permutacao dos filhos atuais.
```json
{ "parentFcid": "CH_8A626C", "childFcids": ["MS_AAAAAA", "MS_CCCCCC", "MS_BBBBBB"] }
```
Resposta: `{ parentFcid, childFcids, references }`. Reordenar mensagens deixa `stale` a referencia posicional (`[[::chat<2>]]`) que passou a apontar para outra; reordenar secoes ou documentos nao deixa nenhuma.

#### GET `/v1/lab03/references/:referenceId`
Estado calculado na hora: `{ referenceId, fcasRaw, targetFcid, status, currentFcids, canonicalFcas }`, com `status` em `resolved`, `stale`, `evolved`, `ambiguous` ou `orphaned`. `canonicalFcas` e o FCAS que o alvo tem agora (do sucessor, se evoluiu; `null` se orfao).

#### POST `/v1/lab03/references/:referenceId/refresh`
Reescreve o texto guardado de uma referencia `stale` para o FCAS canonico e volta o estado a `resolved`. O alvo nunca muda. Se o alvo nao esta ativo: `409 TARGET_NOT_ACTIVE`.

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

## 7) Lab 05 - Context Assembly

Regras em `docs/lab 05.md` (ADR-007 a ADR-010). Erros seguem o formato:

```json
{ "error": "Range must satisfy 1 <= from <= 4 and to >= from", "code": "INVALID_RANGE", "details": { "from": 5, "to": null, "total": 4 } }
```

Codigos: `INVALID_TARGET` (400), `NOT_FOUND` (404), `UNSUPPORTED_SCOPE`, `AMBIGUOUS` (409, `details.candidates`, tambem para nome compartilhado por dois diretorios), `ORPHANED` (409, `details.originalFcid`, `details.cause`, `details.candidates`), `INVALID_RANGE`, `NO_CHILDREN`, `ROLES_NOT_APPLICABLE` (422). Body invalido retorna 400.

Um alvo escrito como `[[::chat<A-B>]]` monta aquela janela do chat (ADR-017). Passar tambem `range` no corpo retorna 400 `INVALID_TARGET`. `[[#slug]]` e `[[@nome]]` como alvo retornam 400 `INVALID_TARGET`.

Referencias que nao podem ser expandidas nao geram erro: o token fica literal e entra em `warnings`.

### POST `/v1/lab05/assemble`
Monta uma view a partir de um alvo (FCAS `[[...]]` ou FCID).

Body:
```json
{
  "target": "[[::retrieval-chat]]",
  "range": { "from": 2, "to": 3 },
  "roles": ["assistant"],
  "expand": true,
  "maxDepth": 3,
  "format": "markdown"
}
```

Somente `target` e obrigatorio. Padroes: `expand: true`, `maxDepth: 3` (1 a 5), `format: "markdown"` (`markdown` ou `text`).

- `range`: janela 1-based e inclusiva sobre os filhos do alvo; em chats usa a mesma numeracao do FCAS (`<n>`). `to` acima do total e reduzido.
- `roles` (`user`, `assistant`, `system`): somente para chats; filtra dentro da janela sem renumerar.
- Com `range` ou `roles`, o cabecalho do alvo e omitido.
- Alvos: SN, PG, SS, MS, DC e CH.

Resposta `200`:
```json
{
  "data": {
    "target": { "raw": "[[::retrieval-chat]]", "fcid": "CH_8A626C", "type": "CH", "evolvedFrom": null },
    "format": "markdown",
    "selection": { "from": 2, "to": 3, "total": 4, "roles": ["assistant"] },
    "content": "**assistant:**\n\nMsg two.",
    "manifest": [
      { "fcid": "CH_8A626C", "type": "CH", "role": "root", "depth": 0 },
      { "fcid": "MS_T2W7K5", "type": "MS", "role": "selected", "depth": 0 }
    ],
    "warnings": [],
    "stats": { "expanded": 0, "warnings": 0 }
  }
}
```

`selection` e `null` sem recorte. Entradas do `manifest` com `role: "expanded"` trazem `depth`, `via` (a referencia FCAS) e, quando a referencia passou por lineage, `evolvedFrom`.

Codigos de `warnings`: `NOT_FOUND`, `UNSUPPORTED_TARGET` (tambem para `[[#slug]]` e `[[@nome]]`), `AMBIGUOUS` (com `candidates`), `ORPHANED` (com `cause` e, quando conhecido, `candidates` com o que substituiu o contêiner), `INVALID_RANGE` (janela de chat fora da conversa), `CYCLE`, `DEPTH_EXCEEDED`, `BLOCK_REFERENCE_INLINE`.

Uma entrada do `manifest` de um chat expandido por `[[::chat<A-B>]]` traz `selection` (`from`, `to`, `total`).

### POST `/v1/lab05/expand`
Expande referencias FCAS em um texto qualquer, sem alvo.

Body:
```json
{ "text": "Intro.\n\n[[architecture.md#Introduction]]", "maxDepth": 3, "format": "markdown" }
```

Resposta `200`: `content`, `manifest` (apenas entradas `expanded`), `warnings` e `stats`.

## 8) Lab 06 - Synthetic Projection

Regras em `docs/lab 06.md` (ADR-011 a ADR-014). Uma projecao sintetica e uma view calculada: nao cria artefatos, nao cria arestas e nao altera nenhuma fonte.

### POST `/v1/lab06/synthesize`
Compoe uma view a partir de artefatos de origens diferentes. Exatamente um entre `items`, `template` e `random`.

Body (selecao):
```json
{
  "kind": "document",
  "title": "Resumo",
  "items": ["PG_A7K2M9", "[[architecture.md#Introduction]]", "PG_B4L8Q2"]
}
```

Body (template FCAS):
```json
{ "kind": "view", "template": "[[PG_A7K2M9]]\n\n[[PG_B4L8Q2]]\n\n[[MS_T2W7K5]]" }
```

Body (aleatorio):
```json
{ "kind": "view", "random": { "type": "SN", "count": 5, "seed": 42, "scope": "[[architecture.md]]" } }
```

Campos:
- `kind`: `document` (aceita SN, PG, SS), `chat` (aceita MS) ou `view` (SN, PG, SS, MS). Padrao `view`. DC e CH nao sao aceitos como item.
- `title`: apenas `document` e `view` (`# titulo` em markdown, titulo simples em text).
- `items`: 1 a 200 FCIDs ou referencias FCAS. Ordem preservada; repeticao permitida.
- `template`: texto com referencias FCAS; nao aceito em `chat`. Segue as regras de expansao do Lab 05.
- `random`: `type` (SN, PG, SS, MS), `count` (1 a 50), `seed` (inteiro 0 a 4294967295, opcional) e `scope` (FCAS ou FCID que restringe o pool aos descendentes, opcional).
- `expand` (padrao `true`), `maxDepth` (1 a 5, padrao 3) e `format` (`markdown` ou `text`): mesmas regras do Lab 05, aplicadas ao conteudo de cada item.

Resposta `200`:
```json
{
  "data": {
    "kind": "view",
    "mode": "random",
    "format": "markdown",
    "title": null,
    "content": "...",
    "manifest": [
      { "fcid": "SN_A", "type": "SN", "role": "item", "depth": 0, "position": 1 },
      { "fcid": "DC_X", "type": "DC", "role": "expanded", "depth": 1, "position": 1, "via": "[[plain.md]]" }
    ],
    "warnings": [
      { "code": "NOT_FOUND", "fcas": "[[missing.md]]", "depth": 0, "message": "...", "position": 2 }
    ],
    "random": { "type": "SN", "requested": 5, "picked": 5, "poolSize": 12, "seed": 42, "scope": null },
    "stats": { "items": 5, "expanded": 1, "warnings": 1 }
  }
}
```

- `mode`: `selection`, `random` ou `template`; `random` e `null` fora do modo random.
- `manifest`: `role` e `item` (artefato escolhido) ou `expanded` (trazido por referencia); `position` indica o item de origem; `evolvedFrom` aparece quando o item passou por lineage.
- No modo random a resposta devolve a `seed`; reenviando a mesma seed, com o mesmo pool, o resultado e identico. `count` acima do pool e reduzido (`picked`).

Erros (`{ error, code, details }`):

| Status | code | Quando |
| --- | --- | --- |
| 400 | - | body invalido: nenhum ou mais de um modo, `title` ou `template` em `chat`, `count` fora de 1..50, `maxDepth` fora de 1..5 |
| 404 | `ITEM_NOT_FOUND` | item inexistente (`details.position`) |
| 404 | `SCOPE_NOT_FOUND` | scope inexistente, ou orfao (`details.orphaned: true`) |
| 409 | `ITEM_AMBIGUOUS` | item dividido pelo Lab 04 (`details.position`, `details.candidates`) |
| 409 | `ITEM_ORPHANED` | item superseded sem descendente ativo (`details.position`, `details.originalFcid`, `details.cause`, `details.candidates`) |
| 409 | `SCOPE_AMBIGUOUS` | scope dividido, ou nome compartilhado (`details.candidates`) |
| 422 | `INVALID_ITEM` | item que nao e FCID nem FCAS |
| 422 | `ITEM_TYPE_NOT_ALLOWED` | tipo fora do kind (`details.allowed`), inclusive DC, CH, WS, PJ e DR |
| 422 | `INVALID_SCOPE` | scope que nao e FCID nem FCAS |
| 422 | `EMPTY_POOL` | nenhum artefato ativo do tipo pedido |

Itens escolhidos explicitamente sao estritos (falham o pedido); referencias dentro de template ou do conteudo dos itens sao lenientes (ficam literais e geram `warnings`, como no Lab 05).
