# Lab 01.5 — Chat Migration & Idempotent Import

## Objetivo

Provar que os chats reais do ForgeOS, e qualquer recurso importado mais de uma vez, entram no modelo cognitivo **sem perder conteúdo, sem duplicar a árvore e sem mudar os FCIDs que já existem**. O resultado é um relatório de compatibilidade e uma estratégia de migração recomendada, incremental e reversível, que é o que o EPIC 21 precisa para decidir.

O lab tem duas partes que se apoiam:

- **Parte A — importação idempotente** (defeito D7). É o mecanismo: importar de novo o mesmo recurso atualiza a árvore existente em vez de criar outra.
- **Parte B — migração de chats do ForgeOS.** É a medição: o mesmo mecanismo, aplicado a uma **cópia** do banco real, com o relatório de lacunas.

---

# Pergunta Principal

```txt
Dá para trazer o que o ForgeOS já guarda
(Chat → Message) para CH → MS → PG → SN,
repetidas vezes, preservando os FCIDs existentes
e dizendo com exatidão o que não cabe no modelo?
```

---

# O que já se sabe

Verificado em 2026-11-19 numa **cópia** de `forgeos/.forgeos/forgeos.db` (somente agregados; nenhum conteúdo foi lido). O ForgeOS ainda não tem usuários: o banco só tem dados de teste, então os números que dependem do conteúdo são de conversas de teste.

| Fato | Valor |
| ---- | ----- |
| Tabelas relevantes | `chats`, `messages`, `chat_lineage`, `cognitive_references`, `concepts`, `aliases`, `context_blocks`, `projects`, `workspaces` |
| Chats | 35 (24 `active`, 11 `deleted`), em 3 workspaces; 17 com `project_id` |
| Mensagens | 204 (114 `user`, 90 `assistant`, nenhuma `system`); 1 a 25 por chat, média 6,4; 3 chats sem mensagem |
| FCID | `CH_xxxxxx` e `MS_xxxxxx` (9 caracteres), únicos, mesmo formato que o da POC. Toda mensagem tem `fcid` |
| Posição | `messages.position` começa em 0 e não tem lacunas. O `<N>` da referência é de base 1 (o resolvedor faz `N - 1`), igual ao `<N>` da POC |
| `context_blocks` | 204, um por mensagem, com o mesmo `fcid` (`MS_`) e `content_hash`; nenhum órfão |
| Conteúdo | 50 mensagens com título markdown, 79 com parágrafos separados por linha em branco, 54 com `[[ ]]`; tamanho médio 890 caracteres, máximo 4.665 |
| Referências | 25 em `cognitive_references` (`REF_xxxxxx`, 10 caracteres): 22 `resolved`, 3 `stale`; alvo `message` (20) ou `concept` (5) |
| Lineage de chat | 4 linhas em `chat_lineage`: 2 `message` e 2 `range`, todas com mensagem inicial e final |
| Metadados por mensagem | `author_user_id`, `recipient`, `ai_provider`, `ai_model`, `created_at` |
| SN e PH | Não existem no ForgeOS: nenhuma tabela, nenhum prefixo de FCID |

O que isso já indica, antes de rodar qualquer coisa:

- O `SN`, o `PG` e o `SS` **terão de ser gerados** na migração (o plano da Parte 2 supunha que existiam).
- Referência com alvo `concept` (5) não cabe em `references` da POC, cujo alvo é um artefato.
- A POC só tem o estado de referência `resolved` (e `orphaned` pelo Lab 04); o ForgeOS tem `stale`.
- O `chat_lineage` descreve **derivação de chat**, que não é evolução de artefato (Lab 04).

---

# Hipóteses

| # | Hipótese |
| - | -------- |
| H1 | Importar de novo o mesmo recurso, sem mudança, não cria nem altera nada |
| H2 | Os FCIDs de `CH` e `MS` do ForgeOS sobrevivem à migração, e os FCIDs da POC não mudam em reimportações |
| H3 | O texto de cada mensagem pode ser reconstruído a partir de `SS`, `PG` e `SN`, e as perdas se classificam sem ambiguidade |
| H4 | A migração pode rodar várias vezes (incremental): só entra o que mudou na origem |
| H5 | Os itens que não cabem no modelo atual podem ser listados completos, com a contagem de cada um |

---

# Parte A — Importação Idempotente

## Regra geral

Importar um recurso cuja `resourceKey` já tem binding **reaproveita o DC** (ou o CH) e compara a estrutura nova com a existente. Nada é recriado quando o texto não mudou.

## Alinhamento

Os filhos de um mesmo pai, antigos e novos, são alinhados por uma **chave normalizada**:

```txt
SS   título normalizado (minúsculas, espaços compactados) e nível
PG   texto normalizado do parágrafo
SN   texto normalizado da sentença
```

1. O que tem chave igual nos dois lados fica: mesmo FCID. Se o texto cru é idêntico, nenhum evento; se só a forma mudou (maiúscula, pontuação), `edit`.
2. Entre dois alinhados, o que sobra é pareado na ordem, desde que seja do mesmo tipo:
   - `SN` com `SN`: o Lab 04 classifica a mudança (`classifyChange`). Mudança leve é `edit` (mesmo FCID); mudança de sentido é `semantic_change` (FCID novo, `evolves_from`).
   - `PG` com `PG`: desce para as sentenças.
   - `SS` com `SS`: título diferente com o mesmo conteúdo é `edit` do título; desce para os filhos.
3. O que sobrou do lado antigo fica `superseded`: removido (evento `remove`).
4. O que sobrou do lado novo é criado, ativo, na posição certa.

Antes de pareados, os que sobraram nos intervalos podem ser casados por chave em qualquer posição: são os **movidos** (mesmo FCID, nova ordem).

A ordem dos filhos é gravada de novo em `orderIndex`, de modo que mover um bloco não muda o FCID de quem ficou.

## Eventos

Um registro `reimport` por chamada que mudou algo, com o resumo (`kept`, `edited`, `replaced`, `removed`, `added`, `moved`, `metadata`) e, por elemento alterado, o texto anterior. Os eventos de `edit`, `semantic_change` e `remove` são os do Lab 04 (`remove` é novo: entrada `[fcid]`, saída `[]`).

## Remover projeção

`projection/remove` marca a projeção como `removed` e **mantém o binding**. Importar de novo a mesma `resourceKey` reativa a projeção e reaproveita o DC, com o mesmo FCID. O artefato nunca é apagado.

## Atomicidade

A reimportação inteira roda em uma transação. Se algo falhar no meio, nada fica gravado.

## Referências

Uma referência a um elemento que ficou igual continua `resolved`. A um elemento removido, `orphaned`, e o Lab 03 devolve `ORPHANED` com a causa `remove` (ADR-019).

---

# Parte B — Migração de Chats do ForgeOS

## Fonte

- A migração lê uma **cópia** do banco do ForgeOS, aberta somente para leitura. O executável recusa o caminho do banco original e exige `--source` e `--target` explícitos.
- Nada do banco real entra no git. O relatório traz **agregados**, nunca o texto das mensagens.

## Mapeamento

| ForgeOS | POC |
| ------- | --- |
| `chats.fcid` | FCID do `CH`, preservado |
| `chats.reference_name`, ou o `fcid` quando não há | `resourceKey` do binding: `::<nome>` |
| `messages.fcid` | FCID do `MS`, preservado |
| `messages.position` (base 0) | ordem das mensagens; `<N>` = `position + 1` |
| `messages.role` | `metadata.role` |
| `messages.content` | `SS`, `PG` e `SN`, pelo mesmo parser do Lab 01 |
| `author_user_id`, `recipient`, `ai_provider`, `ai_model`, `created_at`, `project_id`, `status` | `metadata.source` do CH ou do MS, para nada se perder |
| `cognitive_references` (alvo `message`) | `references`, com o `fcid` `REF_` preservado |

O `CH` entra como filho do workspace (ADR-021); o `project_id` fica só em `metadata.source`.

## O que não é migrado por padrão

| Item | Motivo |
| ---- | ------ |
| Chats `deleted` | ficam fora, e a contagem vai para o relatório (`--include-deleted` os traz, marcados) |
| Referência com alvo `concept` | a POC não tem conceito; vai para o relatório |
| `chat_lineage` | é derivação de chat, não evolução de artefato; vai para o relatório |
| `aliases`, `concepts` | fora do escopo |

## Reimportação de mensagem

A migração usa o mesmo motor da Parte A, no nível da mensagem:

- mensagem nova na origem: entra só ela;
- texto alterado na origem: o `MS` mantém o FCID e o conteúdo é atualizado por `edit` ou `semantic_change`;
- mensagem que sumiu da origem: fica `superseded`.

## Fidelidade

Cada mensagem migrada é projetada de volta (markdown) e comparada com `messages.content`. A comparação cai em uma classe:

| Classe | Significado |
| ------ | ----------- |
| `exact` | idêntico |
| `whitespace` | só espaços, quebras de linha e linhas em branco |
| `structure` | o texto está inteiro, mas a estrutura mudou (lista, bloco de código, tabela, citação, ênfase) |
| `loss` | falta conteúdo |

`loss` é falha. `structure` não é falha, mas entra no relatório por categoria e com a contagem.

---

# Fronteira com os Labs vizinhos

```txt
Lab 01    mapeia o recurso uma vez
Lab 01.5  mapeia o mesmo recurso muitas vezes, e o que vem de fora
Lab 04    decide quando o FCID muda; o Lab 01.5 usa essa regra
```

O Lab 01.5 não define a regra de identidade: aplica a do Lab 04 (ADR-004, ADR-005).

---

# Invariantes

1. Reimportar um texto igual não cria artefato, aresta, projeção nem evento.
2. Um FCID existente nunca muda por reimportação.
3. Nenhum artefato é apagado; o que sai fica `superseded`.
4. O banco de origem nunca é escrito, e o original nunca é aberto.
5. O relatório não contém texto de mensagem.
6. A reimportação é atômica.
7. Uma `resourceKey` tem no máximo um DC (ou CH) ativo.

---

# Sub-Lab 01.5.1 — Reimportação de Documento

## Objetivo

Validar a Parte A em documentos.

## Validações

```txt
C01  texto igual: nenhuma mudança (H1)
C02  uma sentença com ajuste leve: mesmo SN, evento edit
C03  uma sentença com sentido novo: SN novo, evolves_from, evento semantic_change
C04  parágrafo novo no meio: criado; os vizinhos mantêm o FCID
C05  parágrafo removido: superseded, evento remove
C06  seção renomeada: mesmo SS, título atualizado
C07  seções trocadas de ordem: FCIDs mantidos, orderIndex novo
C08  documento sem títulos reimportado: sem duplicar PG e SN
C09  texto antes do primeiro título reimportado: sem duplicar
C10  remover a projeção e importar de novo: mesmo FCID do DC, projeção reativada
C11  falha no meio: nada fica gravado
C12  referência a elemento que ficou igual continua resolved
C13  referência a elemento removido vira ORPHANED, causa remove
C14  duas chaves diferentes não se afetam
C15  reimportação por importDirectory mantém os FCIDs de cada documento
```

## Resultado Esperado

Nenhuma duplicação, nenhum FCID trocado sem evento.

---

# Sub-Lab 01.5.2 — Reimportação de Chat

## Objetivo

Validar a Parte A no nível de mensagem.

## Validações

```txt
C16  mesma conversa: nenhuma mudança
C17  mensagens novas no fim: só elas entram
C18  texto de uma mensagem alterado: mesmo MS, edit ou semantic_change
C19  mensagem que sumiu: superseded
C20  `<N>` continua apontando para a mesma mensagem depois de acrescentar mensagens
```

---

# Sub-Lab 01.5.3 — Migrador sobre Dados no Formato do ForgeOS

## Objetivo

Validar o migrador com um banco **sintético** que tem as colunas do ForgeOS (`chats`, `messages`, `cognitive_references`, `chat_lineage`, `context_blocks`), para que os testes automáticos não dependam de dados reais.

## Validações

```txt
C21  CH e MS recebem exatamente os FCIDs da origem (H2)
C22  a ordem das mensagens segue position, e <N> = position + 1
C23  metadata.source guarda os campos de origem
C24  chat deleted fica de fora; --include-deleted o traz marcado
C25  chat sem mensagem vira CH sem filhos
C26  conflito: o mesmo FCID já existe com outro conteúdo: o chat é recusado e vai para o relatório
C27  referência com alvo message migra com o REF_ preservado
C28  referência com alvo concept não migra e é contada
C29  chat_lineage não migra e é contado
C30  segunda execução: nenhuma mudança (H4)
C31  mensagem nova na origem: só ela entra
C32  a origem nunca é escrita; o caminho do banco original é recusado
C33  as 4 classes de fidelidade são detectadas: exact, whitespace, structure, loss
```

---

# Sub-Lab 01.5.4 — Execução na Cópia Real

## Objetivo

Rodar o migrador sobre a cópia do banco real do ForgeOS e produzir o relatório. **Não é teste automático**: depende de dados que não entram no repositório.

## Passos

1. Copiar `forgeos/.forgeos/forgeos.db` para fora do repositório.
2. Rodar o migrador contra um banco novo da POC.
3. Rodar de novo, e conferir que nada mudou.
4. Gerar o relatório.

## O que o relatório traz

- Contagens: chats e mensagens lidos, migrados, recusados e omitidos; artefatos gerados por tipo (`SS`, `PG`, `SN`); crescimento do banco; tempo.
- Preservação: quantos FCIDs de `CH` e `MS` sobreviveram (esperado: todos os migrados).
- Fidelidade: mensagens por classe e, para `structure`, a contagem por categoria.
- Lacunas, cada uma com a contagem: `concept`, `stale`, `chat_lineage`, chats `deleted`, `project_id`, metadados sem lugar próprio, colisões de `reference_name`, tamanho do `REF_` (10 caracteres nos dois, desde que a POC passou a gerar `REF_` mais 6).
- A estratégia recomendada.

---

# Sub-Lab 01.5.5 — Compatibilidade e Estratégia

## Objetivo

Transformar o relatório em decisão.

## Saída

Um documento de compatibilidade com:

- a lista de lacunas e, para cada uma, o que o EPIC 21 precisa decidir;
- a estratégia de migração (incremental: o motor da Parte A; reversível: a origem é só leitura e cada chat é um binding removível);
- a lista de mudanças que o modelo cognitivo precisa para receber o que hoje não cabe.

---

# Critérios de Aceite

O lab termina quando:

1. C01 a C33 passam, e os testes de mutação mostram que cada regra tem pelo menos um teste que falha quando ela é desfeita.
2. O D7 está fechado: reimportar não duplica e `projection/remove` mantém o binding.
3. O migrador rodou na cópia real duas vezes, com a segunda sem mudanças.
4. Existe o relatório de compatibilidade, com a estratégia recomendada.
5. As decisões estão em ADR e os experimentos em EXP.

---

# Fora do Escopo

- Escrever no banco do ForgeOS ou migrar de volta.
- Migrar `aliases`, `concepts`, usuários, permissões ou workspaces.
- Reparar dados que a POC criou antes desta mudança.
- Mapear `chat_lineage` para o modelo de linhagem do Lab 04.
- Preservar a formatação que o parser do Lab 01 não representa (lista, bloco de código, tabela): o lab mede essa perda, não a corrige.

---

# Resultado Esperado

```txt
FCIDs de CH e MS do ForgeOS preservados
Reimportação sem duplicar nem trocar FCID
Relatório com as lacunas e suas contagens
Estratégia incremental e reversível para o EPIC 21
```

---

# Resultado (2026-11-19)

O lab foi implementado e executado. Os C01 a C33, mais os casos acrescentados durante a implementação (R01, C15b, C15c, C16b, C18b, C23b, C31b e C33b), passam; a suíte inteira tem 162 testes; 20 mutações são detectadas.

| Hipótese | Resultado |
| -------- | --------- |
| H1 reimportar sem mudança não altera nada | Confirmada (C01, C08, C09, C16; 2ª execução real sem mudança) |
| H2 FCIDs de CH e MS preservados | Confirmada: 24 de 24 chats, 165 de 165 mensagens, 20 de 20 referências |
| H3 texto reconstruível, perdas classificáveis | Confirmada: 0 `loss`; 104 `exact`, 2 `whitespace`, 59 `structure` |
| H4 migração repetível | Confirmada |
| H5 lacunas listadas com contagem | Confirmada: ver `docs/results/lab-01.5-compatibilidade.md` |

Decisões: ADR-022 e ADR-023. Experimento: EXP-014. O que a medição mostrou faltar no modelo (estrutura de lista, tabela, código e ênfase; segmentação por pontuação) está no relatório de compatibilidade, com a estratégia recomendada.
