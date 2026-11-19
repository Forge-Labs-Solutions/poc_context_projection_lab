Com os Labs 01, 02 e 03 validados, o ForgeOS já sabe:

```txt
mapear recursos em FCIDs        (Lab 01)
projetar FCIDs em views         (Lab 02)
endereçar FCIDs por FCAS        (Lab 03)
```

Mas até aqui todo artefato nasce e nunca muda.

O Lab 04 valida o que acontece quando o conteúdo evolui:

```txt
FCID
=
identidade persistente

Lineage
=
memória de como essa identidade mudou
```

---

# Lab 04 — Evolution & Lineage

## Objetivo

Validar identidade cognitiva e rastreabilidade.

O Evolution & Lineage é responsável por decidir, para cada mudança, se um artefato mantém sua identidade ou se dá origem a uma nova, e por registrar essa decisão de forma que a história de qualquer FCID possa ser reconstruída.

---

# Pergunta Principal

```txt
Como artefatos evoluem?
```

Desdobrada em:

```txt
Quando um FCID permanece?

Quando um novo FCID é criado?

Como a origem de um FCID é rastreada?

O que acontece com referências para um FCID que evoluiu?
```

---

# Conceito Fundamental

Identidade não é conteúdo.

Identidade é significado.

```txt
Mudou a forma, manteve o significado
↓
mesmo FCID

Mudou o significado
↓
novo FCID
+
lineage para o FCID anterior
```

---

Exemplo:

```txt
SN_A7K2M9
"FCIDs provide persistent identty."
```

Correção de digitação:

```txt
SN_A7K2M9
"FCIDs provide persistent identity."
```

Mesmo FCID.

---

Mudança de significado:

```txt
SN_A7K2M9
"FCIDs provide persistent identity."
```

↓

```txt
SN_Q3R8T1
"FCIDs provide versioned identity."

evolves_from: SN_A7K2M9
```

Novo FCID.

---

# Hipóteses Validadas

Ao final do laboratório deve ser possível afirmar:

```txt
✓ Edições de forma preservam o FCID

✓ Mudanças de significado criam um novo FCID

✓ Split e merge criam novos FCIDs rastreáveis

✓ Todo FCID não-original possui lineage até sua origem

✓ FCIDs substituídos nunca são apagados

✓ Projeções exibem apenas o estado atual

✓ Referências para FCIDs substituídos continuam resolvíveis

✓ As mesmas regras valem para documentos e chats
```

---

# Arquitetura Validada

```txt
Operação de evolução

edit / semantic change / split / merge

↓
Evolution Engine

↓
Regras de identidade

mantém FCID?  cria FCID?

↓
Artifact Graph          Lineage Graph

(estado atual)          (história)

↓
Projection Engine
```

---

# Conceitos Validados

## Operação de Evolução

Uma mudança explícita aplicada a um artefato ativo.

```txt
edit

semantic_change

split

merge
```

Toda operação gera um Evolution Event.

O identificador usa o prefixo `EVT_`, e não `EV_`, porque `EV` está reservado como tipo de artefato cognitivo futuro no modelo de FCID.

---

## Evolution Event

Registro persistente de uma operação.

Estrutura conceitual:

```txt
EVT_A
├─ operation
├─ inputs   (FCIDs de origem)
├─ outputs  (FCIDs resultantes)
├─ before   (conteúdo anterior)
├─ after    (conteúdo resultante)
└─ timestamp
```

---

## Lineage Relation

Relação dirigida entre dois FCIDs diferentes.

Sempre aponta do artefato novo para sua origem.

```txt
evolves_from

split_from

merged_from
```

---

## Estado do Artefato

```txt
active
→ participa do grafo estrutural e das projeções

superseded
→ foi substituído por um ou mais FCIDs
→ permanece persistido
→ é alcançável apenas pelo lineage
```

O motivo da substituição não é guardado no estado.

Ele é derivado da relação de lineage que aponta para o artefato.

---

## Current Resolution

Resolver um FCID substituído até seus descendentes ativos.

```txt
SN_A (superseded)
↓ evolves_from
SN_B (superseded)
↓ split_from
SN_C (active)
SN_D (active)
```

```txt
current(SN_A) = [SN_C, SN_D]
```

---

# Princípio de Aplicação por Categoria

O modelo de FCID divide artefatos em estruturais e cognitivos.

As regras de evolução respeitam essa divisão.

```txt
Cognitivos
SN

→ carregam conteúdo
→ sofrem edit e semantic change
→ sofrem split e merge
```

```txt
Estruturais
SS, PG, MS

→ não carregam conteúdo
→ sofrem edit apenas de metadados (ex.: título de SS)
→ sofrem split e merge (reorganização)
→ não sofrem semantic change direto
```

```txt
WS, PJ, DR, DC, CH

→ fora do escopo de evolução neste lab
→ renomear e mover já é coberto pelo Lab 03
```

---

Consequência importante:

```txt
Split de PG não altera nenhum SN.

Os SN são redistribuídos entre os novos PG
e mantêm seus FCIDs.
```

O significado mora nos SN.

O PG apenas organiza.

---

# Matriz de Regras

```txt
Operação         Tipo      FCID de origem   FCID resultante   Relação
--------------   -------   --------------   ---------------   ------------
edit             SN        mantém           o mesmo           nenhuma
edit (título)    SS        mantém           o mesmo           nenhuma
semantic_change  SN        superseded       novo              evolves_from
split            SN        superseded       N novos           split_from
split            PG        superseded       N novos           split_from
split            MS        superseded       N novos           split_from
merge            SN        superseded (N)   1 novo            merged_from
merge            PG        superseded (N)   1 novo            merged_from
merge            MS        superseded (N)   1 novo            merged_from
regenerate       MS        superseded       1 novo            evolves_from
```

---

Regra geral para split e merge:

```txt
Os resultados sempre recebem FCIDs novos.

Nenhuma das partes herda o FCID de origem,
mesmo que seja maior ou idêntica a ela.
```

Motivo: evita uma regra assimétrica ("a maior parte herda") que seria ambígua e mudaria silenciosamente o alvo de referências existentes.

---

# Critério Edit vs Semantic Change

Esta é a decisão central do laboratório.

---

## Fonte de verdade

A operação é declarada por quem a executa.

```txt
edit             → quem edita afirma que o significado é o mesmo

semantic_change  → quem edita afirma que o significado mudou
```

O sistema não decide sozinho nesta POC.

---

## Classificador sugestivo

O sistema oferece uma sugestão, que pode ser usada pela UI ou ignorada.

```txt
1. Normalizar ambos os textos
   (NFKC, minúsculas, pontuação e símbolos viram espaço,
    espaços colapsados)

2. Normalização idêntica
   → edit
   → reason: identical_after_normalization

3. Mesmo número de palavras, e cada palavra diferente
   está a no máximo 2 edições de distância
   (e a distância é menor que metade da palavra)
   → edit
   → reason: token_level_typos

4. Caso contrário
   → semantic_change
   → reason: content_changed
```

A resposta também traz `similarity` (0 a 1, distância de edição sobre o texto normalizado), apenas informativa.

Como a regra 3 exige o mesmo número de palavras, inserir uma negação ("not") já é classificado como semantic_change.

---

## Limitação conhecida

Similaridade textual não mede significado.

```txt
"FCIDs are now stable."
"FCIDs are not stable."
```

Uma letra de diferença, significado oposto: o classificador sugere edit.

Por isso a sugestão nunca substitui a declaração explícita.

Classificação semântica real (embeddings, LLM) fica para Partes futuras.

---

# Persistência

## Lineage separado do grafo estrutural

As relações de lineage não são gravadas em `artifact_edges`.

```txt
artifact_edges
→ contains
→ estrutura atual

artifact_lineage
→ evolves_from / split_from / merged_from
→ história

evolution_events
→ operações
```

---

Motivo:

O Projection Engine e o FCAS Resolver atuais percorrem `artifact_edges` sem filtrar por `relation_type`.

Gravar lineage ali faria um SN antigo aparecer como filho do novo nas projeções.

---

## Saída do grafo estrutural

Quando um artefato é substituído:

```txt
1. state → superseded

2. a aresta contains do pai para ele é removida

3. o(s) resultado(s) assumem a posição dele
   (mesmo pai, mesmo orderIndex)
```

O artefato substituído continua persistido.

Nada é apagado.

---

Consequência:

```txt
Projeções não precisam conhecer lineage.

Elas continuam percorrendo apenas o grafo estrutural,
que contém somente artefatos active.
```

---

# Sub-Lab 04.1 — Evolution Model

## Objetivo

Formalizar o modelo de evolução.

---

## Validações

Definir:

```txt
Quais operações existem

Quais tipos aceitam cada operação

Quando o FCID permanece

Quando um novo FCID é criado

Quais estados um artefato pode ter

Quais relações de lineage existem
```

---

## Resultado Esperado

Matriz de regras aprovada e registrada como ADR.

---

# Sub-Lab 04.2 — Edit

## Objetivo

Validar quando um FCID permanece.

---

## Entrada

```txt
SN_A7K2M9
"FCIDs provide persistent identty."

edit →
"FCIDs provide persistent identity."
```

---

## Saída

```txt
SN_A7K2M9
"FCIDs provide persistent identity."

revision: 2
```

```txt
EVT_X
operation: edit
inputs:  [SN_A7K2M9]
outputs: [SN_A7K2M9]
before:  "FCIDs provide persistent identty."
after:   "FCIDs provide persistent identity."
```

---

## Validações

```txt
FCID não muda

Pai e orderIndex não mudam

Referências existentes continuam apontando para o mesmo FCID

Projeção mostra o texto novo

Evento guarda o texto anterior
```

---

## Cenário estrutural

Renomear título de seção:

```txt
SS_R1C9K2
Introduction
↓
Overview
```

Mesmo FCID.

`[[architecture.md#Introduction]]` deixa de resolver por título.

Reference Artifacts já criados continuam válidos, pois apontam para o FCID (comportamento do Lab 03).

---

## Resultado Esperado

Edições de forma preservam identidade.

---

# Sub-Lab 04.3 — Semantic Change

## Objetivo

Validar quando um novo FCID é criado.

---

## Entrada

```txt
SN_A7K2M9
"FCIDs provide persistent identity."

semantic_change →
"FCIDs provide versioned identity."
```

---

## Saída

```txt
SN_A7K2M9
state: superseded

SN_Q3R8T1
state: active
"FCIDs provide versioned identity."
evolves_from: SN_A7K2M9
```

---

## Validações

```txt
Novo FCID ocupa a posição do anterior no PG

FCID anterior continua persistido com state superseded

FCID anterior não aparece mais na projeção

Lineage SN_Q3R8T1 → SN_A7K2M9 registrado

Operar sobre um FCID superseded é rejeitado
```

---

## Resultado Esperado

Mudanças de significado criam identidades novas rastreáveis.

---

# Sub-Lab 04.4 — Split

## Objetivo

Validar a divisão de um artefato em vários.

---

## Split de SN

```txt
SN_A
"FCIDs are persistent; FCAS is human readable."
```

↓

```txt
SN_B  "FCIDs are persistent."
SN_C  "FCAS is human readable."

split_from: SN_A
```

Regra:

```txt
A concatenação normalizada das partes
deve ser igual ao texto normalizado de origem.

Normalização: ignora caixa, espaços e pontuação.
```

Se o split exigir remover ou trocar palavras (ex.: um "and" entre as orações), o conteúdo mudou e isso deve ser feito com uma operação adicional.

Split não muda conteúdo.

Split com mudança de conteúdo = split seguido de edit ou semantic change.

---

## Split de PG

```txt
PG_A
├─ SN_1
├─ SN_2
├─ SN_3
└─ SN_4
```

split em 2 →

```txt
PG_B
├─ SN_1
└─ SN_2

PG_C
├─ SN_3
└─ SN_4

split_from: PG_A
```

Os SN mantêm seus FCIDs.

---

## Validações

```txt
Partes ocupam a posição da origem, em ordem

Origem fica superseded

Cada parte possui lineage split_from para a origem

Projeção reconstrói o mesmo texto
(com quebra de parágrafo no ponto do split, no caso de PG)
```

---

## Resultado Esperado

Divisões preservam conteúdo e rastreabilidade.

---

# Sub-Lab 04.5 — Merge

## Objetivo

Validar a junção de vários artefatos em um.

---

## Merge de PG

```txt
PG_A           PG_B
├─ SN_1        ├─ SN_3
└─ SN_2        └─ SN_4
```

↓

```txt
PG_C
├─ SN_1
├─ SN_2
├─ SN_3
└─ SN_4

merged_from: PG_A, PG_B
```

---

## Merge de SN

```txt
SN_1  "FCIDs are persistent."
SN_2  "They survive renames."
```

↓

```txt
SN_3  "FCIDs are persistent. They survive renames."

merged_from: SN_1, SN_2
```

---

## Restrições da POC

```txt
Mesmo tipo

Mesmo pai

Adjacentes (orderIndex consecutivos)

Todos active
```

Merge entre pais diferentes fica fora do escopo.

---

## Validações

```txt
Resultado ocupa a posição do primeiro artefato

Todas as origens ficam superseded

Resultado possui uma relação merged_from para cada origem

Projeção reconstrói o mesmo conteúdo
```

---

## Resultado Esperado

Junções preservam conteúdo e rastreabilidade.

---

# Sub-Lab 04.6 — Chat Evolution

## Objetivo

Aplicar as mesmas regras a chats.

---

## Editar mensagem

Editar o texto de uma mensagem é evolução dos SN dela.

```txt
MS_A
└─ PG
   └─ SN_1  → edit ou semantic_change
```

O MS mantém seu FCID.

---

## Regenerar mensagem

Substituir a resposta inteira (ex.: nova resposta do assistant).

```txt
MS_A (superseded)
↓
MS_B (active)
evolves_from: MS_A
```

O MS_B ocupa a posição do MS_A no chat.

O conteúdo do MS_A (seus PG e SN) também passa a `superseded` (ADR-015): continua legível pelo FCID do MS_A, mas deixa de poder ser editado e de entrar em qualquer sorteio ou montagem.

`[[::chat<2>]]` passa a resolver para MS_B.

---

## Split e merge de mensagens

```txt
split de MS  → por fronteira de PG/SS

merge de MS  → mensagens adjacentes do mesmo role
```

---

## Validações

```txt
Regras idênticas às de documentos

Ordem do chat preservada

Role preservado
```

---

## Resultado Esperado

Documentos e chats compartilham o mesmo modelo de evolução.

---

# Sub-Lab 04.7 — Lineage Tracking

## Objetivo

Consultar a história de qualquer FCID.

---

## Consultas

```txt
ancestors(FCID)
→ de onde veio

descendants(FCID)
→ no que se transformou

current(FCID)
→ quais descendentes estão active hoje

events(FCID)
→ todas as operações que o envolveram
(incluindo edits, que não geram relação)
```

---

## Exemplo

```txt
lineage(SN_C)

SN_C (active)
└─ split_from SN_B (superseded)
   └─ evolves_from SN_A (superseded)
```

---

## Resultado Esperado

Todo FCID não-original pode ser rastreado até sua origem.

---

# Sub-Lab 04.8 — Reference Continuity

## Objetivo

Validar o comportamento de referências para FCIDs substituídos.

Este sub-lab conecta o Lab 04 ao Lab 03.

---

## Regra

```txt
Reference Artifacts nunca são reescritos.

RF_A
└─ target: SN_A   (continua apontando para SN_A)
```

A resolução acompanha o lineage:

```txt
target active
→ resolve normalmente

target superseded, current com 1 descendente
→ resolve para o descendente
→ sinaliza evolved: true

target superseded, current com N descendentes (split)
→ resolução ambígua
→ retorna a lista de candidatos
```

---

## FCAS de um FCID substituído

Um FCID superseded não possui pai estrutural.

Sua FCAS é projetada na forma de identificador direto:

```txt
[[SN_A]]
```

---

## Resultado Esperado

Referências nunca quebram silenciosamente por evolução.

---

# Contrato de API

Implementado em `src/api/routes/lab04Routes.ts`. Detalhes em `docs/endpoints.md`.

```txt
POST /v1/lab04/edit
{ fcid, text }          SN
{ fcid, title }         SS

POST /v1/lab04/semantic-change
{ fcid, text }

POST /v1/lab04/classify
{ fcid, text }
→ { suggestion: "edit" | "semantic_change", reason, similarity }

POST /v1/lab04/split
{ fcid, parts: string[] }        SN
{ fcid, boundaries: number[] }   PG, MS

POST /v1/lab04/merge
{ fcids: string[] }

POST /v1/lab04/regenerate
{ fcid, text }          MS

GET /v1/lab04/lineage/:fcid
→ ancestors, descendants, events

GET /v1/lab04/current/:fcid
→ FCIDs active atuais

GET /v1/lab04/references/:referenceId
→ status: resolved | evolved | ambiguous | orphaned
→ currentFcids
```

Mudança no Lab 03:

```txt
POST /v1/lab03/resolve com [[FCID]] superseded
→ 1 descendente:  200, targetFcid = descendente, evolvedFrom = original
→ N descendentes: 409, details.candidates
```

---

Erros:

```txt
400  body inválido

404  FCID ou referência não encontrado     NOT_FOUND

409  FCID superseded                        SUPERSEDED
     (details.current traz os FCIDs atuais)

422  operação inválida para o tipo          INVALID_OPERATION
     valor idêntico ao atual                NO_CHANGE
     split que altera conteúdo              CONTENT_CHANGED
     artefato sem pai estrutural            NO_PARENT
     merge entre pais diferentes            DIFFERENT_PARENTS
     merge de não adjacentes                NOT_ADJACENT
```

---

# Relação com o Código Atual

## O que já existe

```txt
artifacts.state         → hoje sempre "active"
artifacts.updatedAt     → pode marcar edits
artifact_edges          → grafo estrutural (contains)
references              → target por FCID (Lab 03)
lineageMeta             → placeholder fixo no Projection Engine
```

---

## O que foi criado (2026-11-19)

```txt
✓ Tabelas evolution_events e artifact_lineage
  (migration drizzle/0002_living_ghost_rider.sql)

✓ Evolution Engine (src/core/lab04Service.ts)

✓ Rotas /v1/lab04/* (src/api/routes/lab04Routes.ts)

✓ FCAS Resolver segue lineage para [[FCID]] superseded

✓ FCAS projection de FCID sem pai → [[FCID]]
  (já era o comportamento padrão do Lab 03)

✓ Explorer tree ignora artefatos superseded como raiz

✓ Testes C01–C16 (src/tests/lab04.test.ts)

✓ Painel de lineage no Inspector da UI (src/ui/main.js)
  mostra estado, atual, ancestrais, descendentes e eventos
  (before/after); os FCIDs são clicáveis e navegam até
  artefatos substituídos
```

---

## Limitações da implementação

```txt
regenerate cria o novo MS fora da transação
(o mapper do Lab 01 é assíncrono) e só depois troca
os artefatos de forma atômica. Se a troca falhar,
o novo MS fica órfão.

Eventos de um FCID são buscados por LIKE no JSON
de inputs/outputs. Suficiente para a POC.
```

---

## Pontos de atenção encontrados

```txt
1. Projection Engine e FCAS Resolver carregam todas as
   arestas sem filtrar relation_type.
   → motivo para manter lineage em tabela separada.

2. Reimportar um documento com o mesmo resourceKey
   reaproveita o DC mas cria uma árvore nova inteira
   abaixo dele, duplicando SS/PG/SN.
   → confirmado em 2026-11-19: importar "# A\n\nOne. Two."
     duas vezes com o mesmo resourceKey gera 2 SS
     com orderIndex 0 sob o mesmo DC e 4 SN.
   → reconciliação automática fica fora deste lab,
     mas o comportamento atual deve ser registrado.

3. Nenhum fluxo hoje altera artifacts.state.
   → Lab 04 é o primeiro a introduzir superseded.
```

---

# Fora do Escopo

```txt
Reconciliação automática
(detectar edits ao reimportar um documento alterado)

Classificação semântica por embeddings ou LLM

Projeção histórica
(reconstruir um documento como era em uma data)

Evolução de WS, PJ, DR, DC e CH

Split e merge de SS

Merge entre pais diferentes

Desfazer operações
```

---

# Cenários de Validação

Base para os registros EXP.

```txt
C01  edit de SN mantém FCID e atualiza projeção
C02  edit de título de SS mantém FCID; FCAS por título antigo deixa de resolver
C03  semantic change cria novo SN na mesma posição
C04  operação sobre SN superseded retorna 409
C05  split de SN preserva texto da projeção
C06  split de SN com conteúdo alterado retorna 422
C07  split de PG mantém FCIDs dos SN
C08  merge de PG adjacentes
C09  merge de PG não adjacentes retorna 422
C10  editar mensagem de chat mantém FCID do MS
C11  regenerar mensagem: [[::chat<n>]] resolve para o novo MS
C12  lineage de SN após semantic change + split
C13  referência para SN superseded resolve para o descendente (evolved: true)
C14  referência para SN dividido retorna candidatos
C15  classificador: correção de digitação → edit
C16  classificador: "now" → "not" sugere edit (limitação registrada)
C17  regenerate substitui toda a subárvore da mensagem (ADR-015)
```

---

# Artefatos Produzidos

Ao final do Lab 04 o sistema deve possuir:

```txt
Evolution Rules

Evolution Engine

Evolution Events

Lineage Registry

Lineage Graph

Current Resolver
```

---

# Resultado Final

O Evolution & Lineage será considerado validado quando for possível alterar artefatos de documentos e chats, decidir de forma explícita e consistente quando a identidade é preservada ou substituída, e reconstruir a história completa de qualquer FCID sem quebrar projeções nem referências.

Fluxo validado:

```txt
SN_A
"FCIDs provide persistent identty."

↓ edit

SN_A
"FCIDs provide persistent identity."

↓ semantic_change

SN_B
"FCIDs provide versioned identity; FCAS stays readable."
evolves_from: SN_A

↓ split

SN_C  "FCIDs provide versioned identity."
SN_D  "FCAS stays readable."
split_from: SN_B

↓ current(SN_A)

[SN_C, SN_D]

↓ Projection Engine

Document View
(apenas SN_C e SN_D)
```

definindo o modelo oficial de evolução cognitiva do ForgeOS.
