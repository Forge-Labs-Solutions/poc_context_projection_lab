Com os Labs 01 a 05 validados, o ForgeOS já sabe:

```txt
mapear recursos em FCIDs         (Lab 01)
projetar um FCID em conteúdo     (Lab 02)
endereçar FCIDs por FCAS         (Lab 03)
evoluir FCIDs e rastrear a       (Lab 04)
história
montar e recortar views a        (Lab 05)
partir de UM alvo
```

Mas toda view vista até aqui tem a forma de algo que já existia: um documento, um chat, um trecho deles.

O Lab 06 valida a hipótese final da POC:

```txt
Documentos e chats são apenas
UMA das possíveis projeções
dos artefatos cognitivos.
```

Se os FCIDs são mesmo a fonte de verdade, deve ser possível formar views que nunca existiram como recurso, escolhendo artefatos de origens diferentes.

---

# Lab 06 — Synthetic Projection

## Objetivo

Validar a criação de projeções inéditas a partir de artefatos existentes.

A Synthetic Projection é responsável por compor, em uma nova view, artefatos de qualquer origem escolhidos explicitamente, sorteados ou referenciados por FCAS, sem copiar nem alterar nenhum deles.

---

# Pergunta Principal

```txt
FCIDs conseguem gerar novas projeções?
```

Desdobrada em:

```txt
Como compor uma view com artefatos de origens diferentes?

Como escolher: manualmente, ao acaso ou por referências FCAS?

O que garante que a view sintética é fiel às fontes?

O que acontece quando uma fonte evolui (Lab 04)?

Uma view sintética pode ser reproduzida?
```

---

# Conceito Fundamental

Uma projeção sintética é uma **view calculada**.

```txt
Não é um artefato.     (não recebe FCID)

Não é persistida.      (não grava nada)

Não copia conteúdo.    (lê as fontes a cada cálculo)

Não altera as fontes.
```

---

Isso decorre do princípio da arquitetura:

```txt
Projeção não é fonte de verdade.

A fonte de verdade são os FCIDs.
```

Uma view sintética é, por definição, descartável: o que a identifica é o **pedido** que a gerou.

---

Reprodutibilidade:

```txt
Seleção manual    o pedido lista os itens

Template FCAS     o pedido contém o template

Aleatória         o pedido (ou a resposta) traz a seed
```

O mesmo pedido, sobre as mesmas fontes, produz exatamente a mesma view.

---

# Hipóteses Validadas

Ao final do laboratório deve ser possível afirmar:

```txt
✓ Um documento novo pode ser composto por parágrafos existentes

✓ Uma conversa nova pode ser composta por mensagens existentes

✓ Uma view pode misturar sentenças, parágrafos, seções e mensagens

✓ A escolha aleatória é reproduzível por seed

✓ Referências FCAS bastam para descrever uma view

✓ A view informa de qual artefato veio cada parte

✓ Nenhum artefato de origem é alterado

✓ A view acompanha a evolução das fontes (Lab 04)

✓ Reconstruir um documento ou chat existente por seleção
  produz o mesmo conteúdo da projeção original
```

---

# Arquitetura Validada

```txt
Pedido de síntese

kind + (items | template | random)

↓
Resolução dos itens

FCID ou FCAS → FCID
(segue lineage se o FCID foi substituído)

↓
Assembly Engine (Lab 05)

conteúdo de cada item
(com expansão de referências do próprio conteúdo)

↓
Composição

blocos separados por linha em branco
+ título opcional

↓
View sintética

conteúdo + manifest + warnings
```

---

# Conceitos Validados

## Kind

O formato da view que se quer obter.

```txt
document   documento novo
chat       conversa nova
view       view livre, de tipos misturados
```

O kind define quais tipos de artefato são aceitos como item.

---

## Modo

Como os itens são obtidos. Exatamente um por pedido.

```txt
selection   lista explícita de itens
random      sorteio de artefatos de um tipo
template    texto com referências FCAS
```

---

## Item

Um artefato escolhido para a view, informado por FCID ou por FCAS.

```txt
"PG_A7K2M9"

"[[architecture.md#Introduction]]"

"[[::retrieval-chat<2>]]"
```

---

## Seed

Número inteiro que torna o sorteio reproduzível.

---

## Manifest

Lista dos artefatos que compõem a view.

```txt
item       artefato escolhido (selection e random)
expanded   artefato trazido por uma referência dentro do conteúdo
```

Cada entrada informa:

```txt
fcid
type
role
depth        0 = item; 1+ = nível de expansão
position     posição do item na view (1, 2, 3 ...)
via          referência FCAS que trouxe o artefato (expanded)
evolvedFrom  FCID original, se passou por lineage
```

---

# Fronteira com os Labs vizinhos

```txt
Lab 05  UM alvo raiz; recorta dentro dele e expande referências

Lab 06  VÁRIOS itens de origens diferentes, escolhidos livremente;
        o Lab 05 é o mecanismo que renderiza cada item
```

Regra prática:

```txt
Lab 05  "monte este documento, só as seções 2 e 3"

Lab 06  "monte uma view com este parágrafo, aquela mensagem
         e aquela sentença"
```

---

# Tipos aceitos por kind

```txt
Kind       Tipos aceitos
--------   ----------------
document   SN  PG  SS
chat       MS
view       SN  PG  SS  MS
```

`DC` e `CH` não são aceitos como item.

Um documento ou chat inteiro já é montado pelo Lab 05, e repetir seu cabeçalho no meio de uma view sintética duplicaria títulos.

---

Item de outro tipo (incluindo `WS`, `PJ`, `DR`) retorna 422.

---

# Composição

```txt
Cada item é renderizado como um bloco.

Os blocos são separados por uma linha em branco.

Os itens aparecem na ordem informada
(no modo random, na ordem do sorteio).

Itens repetidos são permitidos.
```

---

## Título

```txt
document, view   markdown: "# título"   text: "título"
chat             não aceita título
```

O título é a única parte da view que não vem de um artefato.

---

# Modo selection

```txt
items: ["PG_A", "PG_B", "PG_C"]
```

Cada item é resolvido e renderizado pelo Assembly Engine do Lab 05, com a expansão de referências do próprio conteúdo ligada por padrão.

---

## Estrito para o que foi escolhido

Os itens foram escolhidos explicitamente.

Descartar um em silêncio mudaria o significado da view.

```txt
Item inexistente            404  ITEM_NOT_FOUND
Item inválido               422  INVALID_ITEM
Tipo fora do kind           422  ITEM_TYPE_NOT_ALLOWED
Item dividido (Lab 04)      409  ITEM_AMBIGUOUS
```

Todo erro traz a `position` do item.

---

## Evolução

```txt
Item substituído, 1 atual   usa o atual (evolvedFrom no manifest)

Item dividido, N atuais     409 ITEM_AMBIGUOUS com candidates
```

Mesma regra do resolver (ADR-005) e do Lab 05.

---

# Modo template

```txt
template: "[[PG_A]]\n\n[[PG_B]]\n\n[[MS_C]]"
```

O template é um texto com referências FCAS.

A síntese é a expansão desse texto pelo Lab 05, com as mesmas regras:

```txt
Referência sozinha no parágrafo   expande qualquer alvo

Referência no meio do texto       expande apenas SN e PG
```

O texto escrito fora das referências faz parte da view.

---

## Leniente para o que está no conteúdo

```txt
Referência inválida   fica literal + warning
                      (NOT_FOUND, UNSUPPORTED_TARGET, AMBIGUOUS,
                       CYCLE, DEPTH_EXCEEDED, BLOCK_REFERENCE_INLINE)
```

O template não falha por causa de uma referência.

---

`template` aceita os kinds `document` e `view`. Um chat sintético exige itens `MS` explícitos.

---

# Modo random

```txt
random: { type: "SN", count: 5, seed: 42, scope: "[[architecture.md]]" }
```

---

## Pool

```txt
Artefatos do tipo pedido, em estado active.

Com scope: apenas os descendentes do alvo do scope.
```

Artefatos substituídos (Lab 04) nunca entram: saem do grafo estrutural.

---

## Sorteio

```txt
O pool é ordenado por FCID.

O sorteio é uma embaralhada parcial determinada pela seed.

A view segue a ordem do sorteio.

Sem seed, o servidor gera uma e a devolve na resposta.
```

Mesma seed, mesmo pool, mesmo tipo e mesmo count produzem o mesmo resultado.

---

## Limites

```txt
count    1 a 50

count maior que o pool   reduzido ao tamanho do pool
                         (random.picked informa o total)

pool vazio               422  EMPTY_POOL

tipo fora do kind        422  ITEM_TYPE_NOT_ALLOWED
```

---

# Invariantes

Garantias que dispensam conferir o conteúdo "a olho".

```txt
I1  Chat reconstruído

    síntese(kind chat, todas as MS do chat, em ordem)
    =
    projeção do CH

I2  Documento reconstruído

    síntese(kind document, todos os PG de uma seção, em ordem,
            sem título)
    =
    montagem do SS com range cobrindo os PG

I3  Reprodutível

    mesmo pedido (com seed) duas vezes
    =
    mesmo resultado

I4  Fontes intactas

    nenhuma linha de artifacts, artifact_edges, artifact_lineage
    ou evolution_events muda por causa de uma síntese
```

---

# Sub-Lab 06.1 — Synthesis Model

## Objetivo

Formalizar o modelo de síntese.

---

## Validações

Definir:

```txt
O que é uma projeção sintética

Onde ela existe (e onde não existe)

Quais tipos cada kind aceita

Como a síntese se distingue da montagem

Como garantir reprodutibilidade
```

---

## Resultado Esperado

Modelo aprovado e registrado como ADR.

---

# Sub-Lab 06.2 — Document Synthesis

## Objetivo

Criar um documento novo a partir de parágrafos existentes.

---

## Entrada

```txt
kind:  document
title: "Resumo"
items: ["PG_A", "PG_B", "PG_C"]
```

com PG_A e PG_B de um documento e PG_C de outro.

---

## Saída

```txt
# Resumo

<PG_A>

<PG_B>

<PG_C>
```

---

## Validações

```txt
Ordem preservada

Origens diferentes na mesma view

SS e SN também aceitos

MS recusado (422)

Invariante I2
```

---

## Resultado Esperado

Documentos novos compostos sem copiar conteúdo.

---

# Sub-Lab 06.3 — Chat Synthesis

## Objetivo

Criar uma conversa nova a partir de mensagens existentes.

---

## Entrada

```txt
kind:  chat
items: ["MS_A", "MS_B", "MS_C"]
```

com MS_A de um chat e MS_B, MS_C de outro.

---

## Validações

```txt
Papel (role) de cada mensagem preservado

Ordem preservada

Apenas MS aceito (PG recusado)

Título recusado

Invariante I1
```

---

## Resultado Esperado

Conversas novas compostas sem copiar conteúdo.

---

# Sub-Lab 06.4 — Selection Projection

## Objetivo

Formar uma view livre escolhendo manualmente artefatos de tipos diferentes.

---

## Entrada

```txt
kind:  view
items: ["SN_X", "PG_Y", "MS_Z", "[[architecture.md#Introduction]]"]
```

---

## Validações

```txt
SN, PG, SS e MS na mesma view

Itens por FCID e por FCAS

Item repetido permitido

Erros estritos com position

DC e CH recusados
```

---

## Resultado Esperado

Views livres a partir de seleção manual.

---

# Sub-Lab 06.5 — Random Projection

## Objetivo

Gerar uma view a partir de artefatos sorteados.

---

## Entrada

```txt
kind:   view
random: { type: "SN", count: 5, seed: 42 }
```

---

## Validações

```txt
Itens vêm do pool do tipo pedido

Mesma seed produz o mesmo resultado (I3)

Seeds diferentes produzem sorteios diferentes

scope restringe o pool

Artefatos substituídos nunca são sorteados

count acima do pool é reduzido

Pool vazio retorna 422
```

---

## Resultado Esperado

Views aleatórias reproduzíveis.

---

# Sub-Lab 06.6 — FCAS-Based Projection

## Objetivo

Descrever uma view apenas com referências FCAS.

---

## Entrada

```txt
kind: view
template:

[[PG_A]]

[[PG_B]]

[[MS_C]]
```

---

## Validações

```txt
Cada referência em bloco vira o conteúdo do artefato

Texto fora das referências é mantido

Referência inline para MS: literal + BLOCK_REFERENCE_INLINE

expand: false devolve o template como escrito

Referência inexistente: literal + NOT_FOUND
```

---

## Resultado Esperado

FCAS como linguagem de composição de views.

---

# Sub-Lab 06.7 — Synthesis & Evolution

## Objetivo

Conectar o Lab 06 ao Lab 04.

---

## Validações

```txt
Item editado mostra o texto novo

Item com semantic change usa o atual (evolvedFrom)

Item dividido retorna 409 ITEM_AMBIGUOUS

Expansão dentro do conteúdo de um item é registrada
com a position do item

Invariante I4: nada nas fontes muda
```

---

## Resultado Esperado

A view sintética acompanha o estado atual dos artefatos.

---

# Contrato de API

```txt
POST /v1/lab06/synthesize
{
  kind?:     "document" | "chat" | "view"       padrão "view"
  title?:    string                             document e view

  items?:    string[]                           1 a 200
  template?: string
  random?:   {
               type:   "SN" | "PG" | "SS" | "MS"
               count:  1..50
               seed?:  inteiro 0..4294967295
               scope?: string                   FCAS ou FCID
             }

  expand?:   boolean                            padrão true
  maxDepth?: 1..5                               padrão 3
  format?:   "markdown" | "text"                padrão markdown
}
```

Exatamente um entre `items`, `template` e `random`.

---

Resposta:

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

`random` é `null` fora do modo random. `position` aparece nas entradas e warnings que vêm de um item.

---

Erros:

```txt
400  body inválido
     (nenhum ou mais de um modo, title em chat, template em chat,
      count fora de 1..50, maxDepth fora de 1..5)

404  ITEM_NOT_FOUND
     SCOPE_NOT_FOUND

409  ITEM_AMBIGUOUS     details.candidates
     SCOPE_AMBIGUOUS    details.candidates

422  INVALID_ITEM
     ITEM_TYPE_NOT_ALLOWED   details.allowed
     INVALID_SCOPE
     EMPTY_POOL
```

---

# Relação com o Código Atual

## O que já existe

```txt
assemble()               renderiza um alvo, com expansão (Lab 05)

expandReferences()       expande um texto com referências (Lab 05)

resolveFcasToFcid()      resolve FCAS e segue lineage (Lab 03 + 04)

loadArtifactWithGraph()  carrega o grafo estrutural

artifacts.state          active | superseded (Lab 04)
```

---

## O que foi criado (2026-11-19)

```txt
✓ Synthesis Engine (src/core/lab06Service.ts)

✓ Schemas (src/core/lab06Schemas.ts)

✓ Rota POST /v1/lab06/synthesize

✓ Testes C01–C22 (src/tests/lab06.test.ts)
```

---

## Limitações da implementação

```txt
Cada item chama o Assembly Engine, que carrega o grafo inteiro:
N itens carregam o grafo N vezes. Sem cache.

A reprodução por seed vale enquanto o pool não muda. Depois de uma
evolução (Lab 04) a mesma seed pode sortear diferente.

A montagem segue o lineage: um item substituído aparece no manifest
como o seu substituto. O filtro de estado do pool aleatório é o que
impede que um substituído seja sorteado e depois trocado em silêncio.

O tipo de cada item é conferido depois de resolvê-lo, pois depende
do tipo atual (após o lineage). O primeiro erro interrompe o pedido.
```

Nenhuma tabela nova e nenhuma alteração nos Labs anteriores além de exportar `normalizeTarget` do Lab 05.

---

## Pontos de atenção encontrados

Confirmados em 2026-11-19 executando o código contra uma cópia do banco.

```txt
1. Compartilhar filhos entre pais corrompe a view após o Lab 04.

   A alternativa óbvia para "documento sintético" seria criar um
   novo DC com arestas contains para PG que já existem.
   O schema permite (a chave inclui o pai), mas o Lab 04 assume
   um único pai por artefato.

   Teste: um DC novo contendo os PG de um documento. Depois de
   dividir um desses PG (Lab 04):

     documento original   correto
     "documento sintético" perdeu a primeira frase, sem erro

   A divisão trocou o PG apenas no primeiro pai encontrado; o outro
   pai ficou apontando para um PG substituído e vazio.

   → motivo para a síntese NÃO criar arestas estruturais
     (ADR-011).
   → o Lab 03 (projectFcidToFcas) também escolhe só o primeiro pai
     (lido no código, não executado).

2. Cada item chama o Assembly Engine, que carrega o grafo inteiro.

   Uma síntese de N itens carrega o grafo N vezes.
   Aceito na POC (limite de 200 itens); sem cache, como no Lab 05.
```

---

# Fora do Escopo

```txt
Persistir projeções sintéticas (tabela, listar, reabrir, nomear)

Dar FCID a uma projeção sintética

DC e CH como item

Sorteio ponderado ou filtrado por conteúdo

Ordenação ou agrupamento automático dos itens

Saída JSON estruturada

Expandir um item dividido concatenando as partes

Interface (painel de síntese)
```

---

# Cenários de Validação

Base para os registros EXP.

```txt
C01  documento a partir de PG de dois documentos, com título
C02  documento reconstruído por seleção = montagem do SS (I2)
C03  document aceita SS e SN e recusa MS (422 com position)
C04  chat a partir de MS de dois chats, role preservado
C05  chat reconstruído por seleção = projeção do CH (I1)
C06  chat recusa PG (422) e título (400)
C07  view mistura SN, PG e MS
C08  itens por FCAS: [[documento#Seção]] e [[::chat<n>]]
C09  erros estritos: inexistente 404, inválido 422, DC e WS 422
C10  item repetido permitido
C11  random: itens do pool, manifest e seed devolvida
C12  random reproduzível pela seed; seeds diferentes diferem (I3)
C13  random: count reduzido ao pool; pool vazio 422
C14  random: scope restringe o pool; substituídos nunca sorteados
C15  random: tipo fora do kind retorna 422
C16  template [[PG_A]] [[PG_B]] [[MS_C]] em blocos
C17  template: inline para MS fica literal com BLOCK_REFERENCE_INLINE
C18  template com título; expand false devolve o texto como escrito
C19  item substituído usa o atual; item dividido retorna 409
C20  expansão dentro do conteúdo do item, com position nos warnings
C21  fontes intactas após a síntese (I4)
C22  validação do body: modos, ranges, formato text sem marcadores
C23  o sorteio nunca traz conteúdo de mensagem regenerada (ADR-015)
```

---

# Artefatos Produzidos

Ao final do Lab 06 o sistema deve possuir:

```txt
Synthesis Engine

Seleção aleatória reproduzível

Synthesis Manifest

Synthesis Warnings
```

---

# Resultado Final

O Synthetic Projection será considerado validado quando for possível compor views inéditas, com artefatos de origens diferentes escolhidos manualmente, ao acaso ou por referências FCAS, sem alterar nenhuma fonte, de forma reproduzível e rastreável até cada artefato.

Fluxo validado:

```txt
Artefatos existentes

PG_A (documento 1)   PG_C (documento 2)   MS_E (chat 3)

↓ Pedido de síntese

kind:  view
items: [PG_A, PG_C, MS_E]

↓ Assembly Engine (Lab 05)

conteúdo de cada item

↓

View sintética
+ manifest   [PG_A item 1, PG_C item 2, MS_E item 3]
+ warnings   []

Nenhum artefato criado.
Nenhuma aresta criada.
Nenhuma fonte alterada.
```

provando que documentos e chats são apenas uma das possíveis projeções dos artefatos cognitivos, e fechando a hipótese final da Parte 2 do ForgeOS: o contexto é um conjunto de artefatos persistentes, e toda view é uma projeção calculada sobre ele.

---

# Atualização de 2026-11-19

- Item substituído sem descendente ativo retorna 409 `ITEM_ORPHANED` com a posição, a causa e os candidatos; scope órfão retorna 404 `SCOPE_NOT_FOUND` com `details.orphaned: true` (ADR-019).
- Um item `[[::chat<A-B>]]` aponta para um CH e é recusado com `ITEM_TYPE_NOT_ALLOWED`; itens de chat por intervalo ficam fora do Lab 06 (ADR-017).
- A interface ganhou a aba Synthesis (Items, Random, Template) em `src/ui/main.js` (nota na ADR-006).
