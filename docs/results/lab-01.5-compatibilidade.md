# Lab 01.5 - Relatorio de compatibilidade e estrategia de migracao

Data: 2026-11-19. Fonte: copia de `forgeos/.forgeos/forgeos.db` (aberta somente para leitura; o original nunca foi aberto). Destino: banco novo da POC. Este relatorio traz contagens, nunca texto de mensagem. Os comandos e os relatorios brutos estao em `data/lab015-report/` (fora do git).

**Nota sobre os dados (informada pelo usuario em 2026-11-19):** o ForgeOS ainda nao tem usuarios, e esse banco so tem dados de teste. O que o lab prova com isso e a **compatibilidade de forma** (schema, formato de FCID, posicao, referencias, lineage, idempotencia, preservacao de FCID). Os numeros que dependem do conteudo (36% das mensagens com mudanca de estrutura, o tamanho dos `SN`, os 15,8 artefatos por mensagem) descrevem conversas de teste e **nao devem ser lidos como previsao** de conversas de uso real. Reavaliar quando houver conversas reais.

Legenda: **[E]** medido por execucao, **[L]** lido do codigo ou do schema, **[I]** inferencia que ainda precisa de confirmacao.

## 1. Resultado em uma tabela

| Pergunta | Resultado |
| -------- | --------- |
| Os FCIDs de `CH` e `MS` sobrevivem? | Sim [E]: 24 de 24 chats e 165 de 165 mensagens. As 20 referencias migradas mantiveram o `REF_` |
| A migracao e repetivel? | Sim [E]: a segunda execucao leu os mesmos 24 chats e nao mudou nada (2.805 artefatos, 2.804 arestas, 0 eventos, 24 projecoes, 20 referencias, antes e depois; 2.778 elementos mantidos) |
| Perde texto? | Nao [E]: 0 de 165 mensagens na classe `loss` |
| Preserva a estrutura? | Em parte [E]: 104 `exact`, 2 `whitespace`, 59 `structure` (36% das mensagens) |
| O que nao cabe no modelo? | 5 referencias a conceito, 4 linhas de `chat_lineage`, o projeto dos 17 chats que tem um (ver secao 4) |
| Existem `SN` e `PH` no ForgeOS? | Nao [L]: o banco nao tem tabela nem prefixo de FCID para eles; o `SS`, o `PG` e o `SN` foram gerados pela migracao |

## 2. O que foi migrado [E]

| Item | Valor |
| ---- | ----- |
| Chats lidos | 35 (11 `deleted` omitidos por padrao, 24 migrados) |
| Mensagens | 204 lidas; 165 nos chats migrados; 0 vazias |
| Chats recusados | 0 |
| Artefatos criados | CH 24, MS 165, SS 184, PG 810, SN 1.619 (15,8 por mensagem) |
| Tamanho do banco | de 122.880 B para 872.448 B (+749.568 B, cerca de 4,5 KB por mensagem; a mensagem media da fonte tem 890 caracteres) |
| Tempo | 0,8 s |
| Chaves dos chats | 21 pelo `reference_name`, 3 pelo FCID (chats sem nome); nenhum nome repetido ou inseguro |

## 3. Fidelidade do texto [E]

Cada mensagem foi reconstruida a partir de `SS`, `PG` e `SN` e comparada com `messages.content`.

| Classe | Mensagens |
| ------ | --------- |
| `exact` | 104 |
| `whitespace` | 2 |
| `structure` | 59 |
| `loss` | 0 |

Nas 59 de `structure` o texto esta inteiro (todas as letras e numeros, na ordem), mas a forma mudou. Categorias (uma mensagem pode ter varias): lista 58, enfase 57, regua horizontal 40, tabela 13, citacao 3, bloco de codigo 1, codigo em linha 1.

O que isso mostra sobre o modelo [E]:

- O mapeamento `SS > PG > SN` representa titulos e paragrafos. **Nao representa item de lista, linha de tabela, bloco de codigo, citacao nem enfase**: tudo isso vira texto corrido dentro de um `PG`.
- A segmentacao em `SN` e por pontuacao. Dos 1.619 `SN`, 410 (25%) tem menos de 15 caracteres, 63 tem quebra de linha dentro (tabelas e codigo), 30 passam de 300 caracteres e 4 passam de 1.000. Sao itens de lista, linhas de tabela e blocos que nao sao frases.
- O mapeamento depende de a mensagem ter titulo. Com titulo, as linhas de um paragrafo sao unidas por espaco. Sem titulo, uma quebra de linha so sobrevive dentro de uma sentenca (a quebra que vem depois de um ponto final e consumida pela segmentacao). Uma lista sem pontuacao volta identica numa mensagem sem titulo e achatada numa com titulo (visto no teste C33b).
- Ha 45 mensagens com `SS`. Dos 184 `SS`, 171 sao de nivel 3, 9 de nivel 4 e 4 de nivel 2; nenhum de nivel 1. A hierarquia nao tem um nivel acima do 3 na maioria dos casos.

## 4. Lacunas [E] e o que o EPIC 21 precisa decidir

| Lacuna | Contagem | O que decidir |
| ------ | -------- | ------------- |
| Referencia com alvo `concept` | 5 | A POC so referencia artefato. Ou o conceito vira artefato, ou a referencia aceita alvo fora do grafo |
| Referencia `stale` | 3, migradas como `stale` | A POC grava o status, mas nada o recalcula. Definir quando uma referencia fica `stale` |
| `chat_lineage` | 4 (2 `message`, 2 `range`) | E derivacao de chat, nao evolucao de artefato. Precisa de uma relacao propria (por exemplo `branched_from`, de CH para CH, com mensagem inicial e final) |
| Projeto do chat | 17 chats com `project_id` | A ADR-021 pendura o chat no workspace. O projeto fica so em `metadata.source`. Decidir se o chat tambem tem de aparecer sob o projeto |
| Chats `deleted` | 11 (39 mensagens) | Omitidos por padrao; `--include-deleted` os traz marcados. Decidir se o estado `deleted` vira estado de artefato |
| Metadados da mensagem | autor em 7, provedor ou modelo em 5 | Guardados em `metadata.source`. Decidir se merecem campo proprio |
| Estrutura de lista, tabela, codigo, enfase | 59 mensagens | Ver secao 3 |
| `context_blocks` e `embeddings` do ForgeOS | 204 blocos, um por mensagem, com o mesmo `fcid` do `MS` | Nao foram tocados. [I] Se a recuperacao continuar por mensagem, `SN` e `PG` nao entram nela; falta definir a relacao |
| Edicao de mensagem no ForgeOS | nao medido | [I] O banco nao mostra se uma mensagem e editada no lugar. O motor trata a edicao (`edit` ou `semantic_change`), mas nao ha caso real para testar |

Compatibilidades confirmadas [L][E]: a `position` do ForgeOS comeca em 0 e o `<N>` da referencia e de base 1 (o resolvedor faz `N - 1`), igual ao `<N>` da POC; os FCIDs `CH_xxxxxx` e `MS_xxxxxx` tem o mesmo formato dos da POC; o `REF_xxxxxx` do ForgeOS tem 6 caracteres, e a POC passou a gerar o mesmo tamanho (ADR-018).

## 5. Estrategia recomendada

Incremental e reversivel, nesta ordem:

1. **Sombra somente leitura.** Rodar o migrador sobre a copia (ou sobre uma replica) num armazem cognitivo separado, repetidamente. A fonte nunca e escrita; o resultado e idempotente (provado).
2. **A fonte continua sendo a verdade.** `messages.content` segue como fonte; `SS`, `PG` e `SN` sao uma projecao derivada, como o modelo ja declara. A medicao de fidelidade roda a cada migracao e `loss` precisa ser zero.
3. **Identidade.** Adotar os FCIDs de `CH`, `MS` e `REF` do ForgeOS. `SS`, `PG` e `SN` recebem FCID na primeira migracao e passam a seguir a regra do Lab 04 (edicao mantem; mudanca de sentido gera um novo, com `evolves_from`).
4. **Reversao.** Descartar o armazem cognitivo nao afeta o ForgeOS. Por chat, `projection/remove` preserva o vinculo e a reimportacao reaproveita o FCID.
5. **Antes de qualquer escrita no sentido contrario** (do modelo cognitivo para o ForgeOS), decidir: estrutura de bloco (seguir a opcao A ou B abaixo), `chat_lineage`, referencia a conceito, pai do chat e estado `deleted`.

Duas formas de tratar a estrutura que a medicao mostrou faltar (decisao do EPIC 21):

- **A. Ampliar o modelo** com tipos de bloco (item de lista, linha de tabela, bloco de codigo) e segmentar por bloco antes de segmentar por sentenca. Preserva a estrutura e melhora o `SN`, ao custo de mais tipos de artefato.
- **B. Manter o markdown original na `MS`** e usar `SN` e `PG` apenas como indice de recuperacao. Menor custo; a projecao deixa de reconstruir o texto, e a fidelidade passa a ser garantida pelo original.

## 6. O que este lab nao provou

- Um unico banco de desenvolvimento, so com dados de teste e sem usuarios, com 24 chats e 165 mensagens. O custo (cerca de 16 artefatos e 4,5 KB por mensagem) e a proporcao de estrutura nao representam conversas reais, e nada foi medido em volume maior.
- A migracao do sentido contrario, a edicao de mensagem pelo ForgeOS e o comportamento com chats ainda ativos (a copia e de um instante).
- A relacao com `context_blocks`, `embeddings` e recuperacao.
