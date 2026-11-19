Com os Labs 01 a 04 validados, o ForgeOS já sabe:

```txt
mapear recursos em FCIDs        (Lab 01)
projetar um FCID em conteúdo    (Lab 02)
endereçar FCIDs por FCAS        (Lab 03)
evoluir FCIDs e rastrear a      (Lab 04)
história
```

Mas toda projeção parte de **um** FCID e devolve **tudo** que está abaixo dele.

O Lab 05 valida o passo seguinte: formar uma view a partir de uma seleção, em ordem, resolvendo as referências que o próprio conteúdo contém.

```txt
Projeção
=
um FCID → seu conteúdo

Montagem (Assembly)
=
seleção + ordem + expansão de referências
→ conteúdo + a lista do que o compôs
```

---

# Lab 05 — Context Assembly

## Objetivo

Validar a montagem de projeções a partir de artefatos.

O Context Assembly é responsável por organizar artefatos em uma view completa ou parcial, expandir as referências FCAS presentes no conteúdo e registrar de quais artefatos cada trecho veio.

---

# Pergunta Principal

```txt
Como artefatos são organizados em uma view?
```

Desdobrada em:

```txt
Como montar um documento ou chat completo?

Como montar só uma parte?

Como uma referência dentro do conteúdo vira o conteúdo referenciado?

O que acontece quando a referência não pode ser resolvida?

Como saber de onde veio cada parte da view?
```

---

# Conceito Fundamental

A montagem é uma camada **sobre** a projeção, não um substituto.

```txt
Lab 03  FCAS Resolver      → onde está o alvo?
Lab 02  Projection Engine  → qual é o conteúdo dele?
Lab 05  Assembly           → como combinar, recortar e expandir?
```

---

Invariante central:

```txt
assemble(alvo, sem recorte e sem expansão)
=
project(alvo)
```

Se essa igualdade falhar, a montagem alterou o significado da projeção.

---

# Hipóteses Validadas

Ao final do laboratório deve ser possível afirmar:

```txt
✓ Documentos completos são montados sem perda de conteúdo

✓ Chats completos são montados sem perda de conteúdo

✓ Seções e conjuntos de mensagens podem ser montados isoladamente

✓ Referências FCAS no conteúdo são expandidas em conteúdo resolvido

✓ Expansão não altera os artefatos de origem

✓ Falhas de expansão nunca derrubam a montagem

✓ Toda view informa os artefatos que a compõem

✓ Montagem acompanha a evolução dos artefatos (Lab 04)
```

---

# Arquitetura Validada

```txt
Pedido de montagem

alvo + recorte + opções

↓
FCAS Resolver (Lab 03)

alvo → FCID
(segue lineage se o FCID foi substituído)

↓
Seleção

janela sobre os filhos ordenados
+ filtro de papel (chats)

↓
Projection Engine (Lab 02)

conteúdo de cada parte selecionada

↓
Expansão FCAS

[[...]] → conteúdo resolvido
(recursiva, com limites)

↓
View montada

conteúdo + manifest + warnings
```

---

# Conceitos Validados

## Pedido de Montagem

```txt
target    FCAS ou FCID do alvo
range     janela sobre os filhos (opcional)
roles     filtro de papel em chats (opcional)
expand    expandir referências (padrão: sim)
maxDepth  profundidade máxima de expansão (padrão: 3)
format    markdown | text
```

---

## Alvos suportados

Os mesmos tipos que o Lab 02 projeta:

```txt
SN  PG  SS  MS  DC  CH
```

`WS`, `PJ` e `DR` não são projetáveis e retornam 409.

---

## Manifest

Lista dos artefatos que compõem a view.

```txt
root       o alvo da montagem
selected   cada filho escolhido por um recorte
expanded   cada alvo trazido por uma referência
```

Cada entrada informa:

```txt
fcid
type
role
depth        0 = alvo; 1+ = nível de expansão
via          a referência FCAS que trouxe o artefato (expanded)
evolvedFrom  FCID original, se a referência passou por lineage
```

O manifest lista **unidades de montagem**, não cada sentença.

---

## Warning

Registro de algo que não pôde ser montado como pedido.

```txt
code      o que aconteceu
fcas      a referência envolvida
depth     nível em que ocorreu
message   texto legível
candidates  FCIDs possíveis (apenas AMBIGUOUS)
```

---

# Fronteira com os Labs vizinhos

```txt
Lab 02  projeta UM FCID, completo, sem olhar referências
Lab 05  recorta DENTRO de um alvo e expande referências do conteúdo
Lab 06  cria views a partir de artefatos de QUALQUER origem,
        escolhidos livremente (SN_*, PG_A + MS_C ...)
```

Regra prática:

```txt
Lab 05 tem sempre UM alvo raiz.

Outros artefatos entram apenas porque o conteúdo
os referencia por FCAS, nunca por seleção direta.

Seleção direta de artefatos de origens diferentes = Lab 06.
```

---

# Seleção Parcial

## Janela sobre os filhos

`range` é uma janela sobre os filhos ordenados do alvo.

```txt
range: { from: 2, to: 3 }
```

```txt
Índices começam em 1 e são inclusivos.

`to` é opcional; sem ele, vai até o último.

`to` acima do total é reduzido ao total.

`from` fora de 1..total, ou `to` menor que `from`,
retorna 422.
```

O que conta como filho:

```txt
DC   SS e PG
SS   SS e PG
MS   SS e PG
CH   MS
PG   SN
SN   (sem filhos: range retorna 422)
```

---

## Numeração de mensagens

Em um chat, o índice da janela é o mesmo do FCAS.

```txt
range: { from: 2, to: 2 }
=
[[::chat<2>]]
```

---

## Filtro de papel

Apenas para chats.

```txt
roles: ["assistant"]
```

O filtro age **dentro** da janela (interseção):

```txt
range 2–5 + roles assistant
→ as mensagens de assistant entre a 2ª e a 5ª
```

A numeração nunca é recontada após o filtro.

---

## Cabeçalho do alvo

Com `range` ou `roles`, o cabeçalho do alvo é omitido.

```txt
DC   sem "# título"
SS   sem o heading da seção
MS   sem o rótulo "role:"
```

O resultado é exatamente a janela pedida.

---

## Recorte de uma seção

Não precisa de `range`. O alvo já é a seção.

```txt
target: "[[architecture.md#Introduction]]"
```

O Lab 03 resolve para o `SS`, e o Lab 02 projeta a seção inteira.

---

# Expansão FCAS

## Token

```txt
[[ ... ]]
```

Qualquer trecho `[[texto]]` na saída renderizada, sem colchetes internos nem quebra de linha.

---

## Não destrutiva

A expansão acontece **na montagem**, sobre o texto já projetado.

O texto dos `SN` nunca é alterado.

```txt
SN_A  "Veja [[plain.md]] para detalhes."   (persistido, sempre assim)

View  "Veja <conteúdo de plain.md> ..."    (calculada a cada montagem)
```

---

## Bloco ou inline

```txt
Bloco   o token é o único conteúdo do parágrafo
        (parágrafo = trecho entre linhas em branco)

Inline  o token está no meio de um texto
```

```txt
Bloco   aceita qualquer alvo projetável
        o conteúdo substitui o parágrafo inteiro

Inline  aceita apenas SN e PG
        o conteúdo substitui só o token, em uma linha
```

Inline apontando para DC, SS, MS ou CH não é expandido: warning `BLOCK_REFERENCE_INLINE`.

Motivo: inserir um documento inteiro no meio de uma frase quebra o parágrafo de forma imprevisível.

---

## Recursão e limites

O conteúdo expandido também é expandido.

```txt
maxDepth  padrão 3, mínimo 1, máximo 5

Ciclo     alvo que já está sendo expandido na pilha atual
          (o alvo raiz conta)
```

```txt
A → B → C        expande até maxDepth
A → B → A        para no segundo A: CYCLE
A → A            CYCLE
```

---

## Resultado de cada token

```txt
Resolvido e projetável        expande

Não encontrado                literal + NOT_FOUND

Tipo não projetável           literal + UNSUPPORTED_TARGET
(WS, PJ, DR)

FCID substituído, 1 atual     expande o atual; manifest traz evolvedFrom
(Lab 04)

FCID substituído, N atuais    literal + AMBIGUOUS (com candidates)
(split)

Já está na pilha              literal + CYCLE

Acima de maxDepth             literal + DEPTH_EXCEEDED

Inline para contêiner         literal + BLOCK_REFERENCE_INLINE
```

"Literal" significa que o token `[[...]]` permanece no texto exatamente como estava.

---

## Princípio: nunca falhar por causa de uma referência

Uma referência ruim gera warning.

A montagem continua e devolve 200.

Apenas o **alvo** e o **recorte** podem causar erro (404, 409, 422).

---

## Ambiguidade

Um FCID dividido (Lab 04) poderia ser expandido concatenando suas partes, já que o split preserva o conteúdo.

Esta POC **não** faz isso.

```txt
Consistência com o resolver do Lab 03:
ambíguo é ambíguo, nas duas camadas.
```

Quem monta decide: o warning traz os candidatos.

---

# Sub-Lab 05.1 — Assembly Model

## Objetivo

Formalizar o modelo de montagem.

---

## Validações

Definir:

```txt
O que é um pedido de montagem

O que a montagem devolve

Onde termina a projeção e começa a montagem

Onde termina a montagem e começa a síntese (Lab 06)
```

---

## Resultado Esperado

Modelo aprovado e registrado como ADR.

---

# Sub-Lab 05.2 — Document Assembly

## Objetivo

Montar documentos completos.

---

## Fluxo

```txt
DC
↓
SS
↓
PG
↓
SN
```

e também, para documentos sem títulos:

```txt
DC
↓
PG
↓
SN
```

---

## Validações

```txt
Sem recorte e sem expansão,
a montagem é idêntica à projeção (invariante)

Hierarquia de seções preservada (SS → SS)

Ordem preservada

Documento sem títulos mantém todos os parágrafos
```

---

## Resultado Esperado

Documentos montados sem perda de conteúdo.

---

# Sub-Lab 05.3 — Chat Assembly

## Objetivo

Montar chats completos.

---

## Fluxo

```txt
CH
↓
MS
↓
SN
```

(e `MS → SS → PG → SN` para mensagens com títulos)

---

## Validações

```txt
Sem recorte e sem expansão,
a montagem é idêntica à projeção (invariante)

Ordem das mensagens preservada

Papel (role) preservado

Mensagem regenerada (Lab 04) aparece no lugar da anterior
```

---

## Resultado Esperado

Chats montados sem perda de conteúdo.

---

# Sub-Lab 05.4 — Partial Assembly

## Objetivo

Montar só uma parte.

---

## Exemplos

Somente uma seção:

```txt
target: "[[architecture.md#Introduction]]"
```

Somente algumas mensagens:

```txt
target: "[[::retrieval-chat]]"
range:  { from: 2, to: 3 }
```

Somente respostas do assistant:

```txt
target: "[[::retrieval-chat]]"
roles:  ["assistant"]
```

Somente as duas primeiras seções de um documento:

```txt
target: "[[architecture.md]]"
range:  { from: 1, to: 2 }
```

---

## Validações

```txt
Apenas a janela pedida aparece

Cabeçalho do alvo omitido

Numeração de mensagens igual à do FCAS

Janela inválida retorna 422

Alvo sem filhos (SN) com range retorna 422
```

---

## Resultado Esperado

Views parciais fiéis ao recorte pedido.

---

# Sub-Lab 05.5 — FCAS Expansion

## Objetivo

Expandir referências em conteúdo resolvido.

---

## Entrada

Texto de um documento:

```txt
# Resumo

[[architecture.md#Introduction]]

Como discutido em [[::retrieval-chat<2>]] ...
```

---

## Saída

O bloco `[[architecture.md#Introduction]]` é substituído pela seção projetada.

`[[::retrieval-chat<2>]]` está no meio de uma frase e aponta para uma mensagem (contêiner): não expande e gera `BLOCK_REFERENCE_INLINE`.

---

## Expansão isolada

Também disponível sem montar um alvo:

```txt
POST /v1/lab05/expand
{ text: "...[[architecture.md]]..." }
```

---

## Validações

```txt
Bloco expandido para DC, SS, CH e MS

Inline expandido para SN e PG

Inline para contêiner não expandido, com warning

Recursão respeita maxDepth

Ciclo termina com warning

Referência inexistente permanece literal

FCID substituído expande o descendente atual

FCID dividido gera AMBIGUOUS

Formato text expande em text

Texto dos SN não é alterado
```

---

## Resultado Esperado

Referências humanas transformadas em conteúdo, de forma previsível e sem efeitos colaterais.

---

# Sub-Lab 05.6 — Assembly & Evolution

## Objetivo

Conectar o Lab 05 ao Lab 04.

---

## Validações

```txt
Montar depois de edit mostra o texto novo

Montar depois de semantic change mostra só o SN atual

Montar depois de split e merge reconstrói o mesmo conteúdo

Referência a SN substituído é expandida pelo descendente,
e o manifest registra evolvedFrom
```

---

## Resultado Esperado

A montagem sempre reflete o estado atual dos artefatos.

---

# Contrato de API

```txt
POST /v1/lab05/assemble
{
  target:   string            FCAS "[[...]]" ou FCID
  range?:   { from, to? }
  roles?:   ("user" | "assistant" | "system")[]
  expand?:  boolean           padrão true
  maxDepth?: 1..5             padrão 3
  format?:  "markdown" | "text"   padrão markdown
}

POST /v1/lab05/expand
{
  text:      string
  maxDepth?: 1..5
  format?:   "markdown" | "text"
}
```

---

Resposta de `assemble`:

```json
{
  "data": {
    "target": { "raw": "[[architecture.md#Intro]]", "fcid": "SS_R1C9K2", "type": "SS", "evolvedFrom": null },
    "format": "markdown",
    "selection": { "from": 1, "to": 2, "total": 5, "roles": null },
    "content": "...",
    "manifest": [
      { "fcid": "SS_R1C9K2", "type": "SS", "role": "root", "depth": 0 },
      { "fcid": "PG_A", "type": "PG", "role": "selected", "depth": 0 },
      { "fcid": "DC_X", "type": "DC", "role": "expanded", "depth": 1, "via": "[[plain.md]]" }
    ],
    "warnings": [
      { "code": "NOT_FOUND", "fcas": "[[missing.md]]", "depth": 0, "message": "..." }
    ],
    "stats": { "expanded": 1, "warnings": 1 }
  }
}
```

`selection` é `null` sem recorte.

Resposta de `expand`: `content`, `manifest` (só `expanded`), `warnings`, `stats`.

---

Erros:

```txt
400  body inválido

404  alvo não encontrado

409  alvo não projetável (WS, PJ, DR)
     alvo ambíguo (FCID dividido): details.candidates

422  janela inválida (INVALID_RANGE)
     range em alvo sem filhos
     roles em alvo que não é chat
```

---

Códigos de warning:

```txt
NOT_FOUND
UNSUPPORTED_TARGET
AMBIGUOUS
CYCLE
DEPTH_EXCEEDED
BLOCK_REFERENCE_INLINE
```

---

# Relação com o Código Atual

## O que já existe

```txt
projectArtifact()        projeta SN, PG, SS, MS, DC, CH (Lab 02)

resolveFcasToFcid()      resolve FCAS, segue lineage (Lab 03 + 04)

artifact_edges           filhos ordenados por orderIndex

[[...]] em SN            sobrevive à importação intacto
```

---

## O que foi criado (2026-11-19)

```txt
✓ Assembly Engine (src/core/lab05Service.ts)

✓ Schemas (src/core/lab05Schemas.ts)

✓ Rotas /v1/lab05/assemble e /v1/lab05/expand

✓ Correção em projectDC para filhos PG diretos (ADR-010)

✓ projectionService exporta loadArtifactWithGraph e
  renderArtifactNode; o contrato do Lab 02 não mudou

✓ Testes C01–C21 (src/tests/lab05.test.ts)

✓ Aba Assembly na UI (src/ui/main.js): formulário de montagem,
  modo Expand text, manifest e warnings; validada no EXP-009
```

---

## Limitações da implementação

```txt
O manifest registra cada ocorrência de expansão;
o mesmo alvo expandido duas vezes aparece duas vezes.

Cada montagem carrega o grafo inteiro em memória.
Sem cache.

Um [[texto]] comum na prosa é tratado como referência:
fica literal e gera NOT_FOUND (sem diretório no workspace)
ou UNSUPPORTED_TARGET (com diretório), pela regra
do resolver do Lab 03.

O divisor de sentenças do Lab 01 quebra um FCAS que contenha
". " no título, como [[a.md#Part. Two]]. O token vira dois SN
e deixa de ser reconhecido na montagem.

range é validado no serviço, não no schema, para que janelas
inválidas retornem 422 em vez de 400.
```

---

## Pontos de atenção encontrados

Confirmados em 2026-11-19 executando o código contra uma cópia do banco.

```txt
1. Documento sem títulos perde o conteúdo na projeção.

   Importar "Primeiro.\n\nSegundo." gera DC → PG → PG,
   mas projectDC só percorre filhos SS.
   A projeção devolve apenas "# Untitled Document".

   → afeta Document Assembly (05.2).
   → proposta: projectDC passa a projetar PG filhos diretos
     (correção no Projection Engine, registrada como ADR).

2. O título do documento nunca aparece na projeção.

   O DC guarda só { resourceKey } no metadata;
   o título informado na importação vai para a projeção.
   A projeção de um DC chamado "Plain" sai como
   "# Untitled Document".

   → fora do escopo: corrigir exige mudar a importação
     e migrar DCs existentes.
   → a montagem herda o comportamento do Lab 02.

3. O resolver do Lab 03 ignora o nome em diretórios e projetos.

   [[Alpha]] e [[Beta]] resolvem para o mesmo DR;
   [[$PJ_CORE]] e [[$PJ_LABS]] resolvem para PJ_CORE.

   → não afeta a expansão (DR e PJ não são projetáveis),
     mas o warning dirá UNSUPPORTED_TARGET para o alvo errado.
   → fora do escopo; registrado como débito do Lab 03.
```

---

# Fora do Escopo

```txt
Seleção direta de artefatos de origens diferentes
(Lab 06)

Montagem em JSON estruturado

Expansão de DR, PJ e WS

Expandir um FCID dividido concatenando as partes

Cache de montagens

Corrigir o título do DC e o resolver de diretório/projeto
```

---

# Cenários de Validação

Base para os registros EXP.

```txt
C01  documento: montagem sem recorte e sem expansão = projeção
C02  documento sem títulos mantém todos os parágrafos
C03  seções aninhadas preservadas
C04  chat: montagem sem recorte e sem expansão = projeção
C05  seção isolada via [[documento#Seção]]
C06  range sobre as seções de um documento
C07  range sobre mensagens; numeração igual a <n>; sem cabeçalho
C08  roles filtra dentro da janela
C09  range inválido retorna 422
C10  range em SN retorna 422; roles em documento retorna 422
C11  bloco: referência a DC expandida
C12  inline: referência a SN expandida na frase
C13  inline para contêiner: literal + BLOCK_REFERENCE_INLINE
C14  recursão A → B → C; maxDepth gera DEPTH_EXCEEDED
C15  ciclo A ↔ B termina com CYCLE
C16  inexistente: NOT_FOUND; WS: UNSUPPORTED_TARGET
C17  bloco: referência [[::chat<n>]] expandida
C18  referência a SN substituído expande o atual (evolvedFrom no manifest)
C19  referência a SN dividido: AMBIGUOUS com candidates
C20  expansão não altera o texto dos SN
C21  /expand isolado e formato text
```

---

# Artefatos Produzidos

Ao final do Lab 05 o sistema deve possuir:

```txt
Assembly Engine

FCAS Expander

Assembly Manifest

Assembly Warnings
```

---

# Resultado Final

O Context Assembly será considerado validado quando for possível montar, a partir de um único alvo, views completas ou parciais de documentos e chats, com as referências FCAS do conteúdo expandidas de forma segura, e saber exatamente quais artefatos compõem cada view.

Fluxo validado:

```txt
Pedido

target: [[summary.md]]
range:  { from: 1, to: 2 }

↓ FCAS Resolver

DC_S

↓ Seleção

SS_1, SS_2

↓ Projection Engine

conteúdo das duas seções
(contendo [[architecture.md#Introduction]])

↓ Expansão

SS_R1C9K2 projetado no lugar da referência

↓

View
+ manifest   [DC_S root, SS_1 selected, SS_2 selected, SS_R1C9K2 expanded]
+ warnings   []
```

estabelecendo a montagem como a camada que transforma artefatos persistentes em views completas ou parciais, sem alterar a fonte de verdade.

---

# Atualização de 2026-11-19

- `[[::chat<A-B>]]` expande a janela de mensagens de A a B (intervalo fechado, a partir de 1); no manifesto a entrada traz `selection`. Janela fora da conversa vira o aviso `INVALID_RANGE` e o texto fica literal. Como alvo da montagem, equivale a `range`; informar os dois retorna 400 (ADR-017).
- Alvo substituído sem descendente ativo vira o aviso `ORPHANED` (token literal), com `cause` e `candidates`; na montagem, erro 409 `ORPHANED` (ADR-019).
- `[[#slug]]` e `[[@nome]]` ficam literais com `UNSUPPORTED_TARGET`; nome de diretório repetido vira `AMBIGUOUS` (ADR-017).
