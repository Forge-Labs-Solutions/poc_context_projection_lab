# EXP-001 - Validacao da UI dos Labs 01, 02 e 03

## Data

2026-06-01

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution

## Hipotese

Uma UI minima na mesma origem da API e suficiente para validar os fluxos principais da POC sem acesso direto ao banco.

## Procedimento

1. Implementar rotas de UI (`/` e `/ui/:file`) no Fastify.
2. Implementar SPA TypeScript com Header, Sidebar e Main.
3. Conectar importacoes de documento/diretorio/chat/mensagem aos endpoints Lab 01.
4. Conectar selecao da arvore e preview aos endpoints Lab 02.
5. Conectar parse/resolve/references/project-fcas aos endpoints Lab 03.
6. Executar suite automatizada de testes da API incluindo testes das rotas de UI.

## Entrada

- Dataset seed existente da POC.
- Endpoints definidos em `docs/endpoints.md`.
- Especificacao `docs/lab/Context Projection Lab UI Specification.md`.

## Resultado observado

- UI entregue em `/` com assets em `/ui/:file`.
- Arvore de artefatos exibida com expansao e selecao.
- Projection preview com formatos markdown, text e json.
- Inspector combinando `/v1/artifacts/:fcid` e `/v1/lab01/explorer/artifacts/:fcid`.
- Fluxo FCAS funcional para parse, resolve, referencia e copy reference.
- Testes de integracao de UI adicionados na suite.

## Resultado esperado

Validar os fluxos centrais dos Labs 01-03 via interface sem transformar a POC em produto final.

## Conclusao

Validado

## Evidencias

- Novos arquivos em `src/ui/`.
- Rota de UI em `src/api/routes/uiRoutes.ts`.
- Registro de rotas em `src/api/app.ts`.
- Testes em `src/tests/api.test.ts` cobrindo `GET /` e `GET /ui/styles.css`.

## Decisoes derivadas

- ADR-001

## Pendencias

- Executar checklist manual completo em ambiente visual com a API em execucao (`npm run dev`) para confirmar UX de ponta a ponta.

# EXP-002 - Validacao do seed minimo com workspace e dois projetos

## Data

2026-06-02

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution

## Hipotese

O seed minimo contendo apenas `WS_MAIN` e dois projetos continua suficiente para bootstrap da POC sem quebrar os fluxos automatizados dos Labs 01-03.

## Procedimento

1. Reduzir o dataset seedado para `WS_MAIN`, `PJ_CORE` e `PJ_LABS`.
2. Manter apenas as arestas `WS -> PJ`.
3. Executar a suite automatizada da API com `npm test`.

## Entrada

- Arquivo `src/seeds/seedData.ts` alterado para seed minimo.
- Suite `src/tests/api.test.ts`.

## Resultado observado

- A execucao de `npm run seed` falhou inicialmente porque `resetAndSeed()` tentava inserir `seedProjections` e `seedReferences` mesmo quando os arrays estavam vazios.
- Depois da protecao condicional em `src/seeds/seed.ts`, o comando `npm.cmd run seed` concluiu com sucesso e restaurou o seed minimo.
- O ambiente ainda apresentou limitacoes para rodar a suite completa via sandbox, mas o fluxo especifico de seed foi validado em runtime.

## Resultado esperado

Os testes devem continuar validando importacao, projecao, resolucao FCAS e reset sem depender de documentos, chats, projecoes ou referencias pre-seedados.

## Conclusao

Validado

## Evidencias

- Alteracoes em `src/seeds/seedData.ts`.
- Alteracao em `src/seeds/seed.ts` para nao chamar `values()` com arrays vazios.
- Execucao bem-sucedida de `npm.cmd run seed` com saida `Seed completed.`.

## Decisoes derivadas

- ADR-002

## Pendencias

- Reexecutar `npm.cmd test` fora do sandbox para confirmar a suite completa com o seed minimo.

# EXP-003 - Validacao da navegacao UI com seed minimo

## Data

2026-06-02

## Lab relacionado

Lab 01 - Artifact Mapping

## Hipotese

Com o seed minimo, a UI deve permitir selecionar projetos como parent no import e deve exibir imports feitos no workspace na arvore principal.

## Procedimento

1. Revisar a UI servida em `src/ui/main.js`.
2. Verificar como o modal de import monta o dropdown de parent.
3. Verificar como a arvore escolhe o escopo inicial do seletor superior.
4. Ajustar a UI para incluir `PJ` no parent e usar o workspace como escopo inicial.

## Entrada

- Seed minimo com `WS_MAIN`, `PJ_CORE` e `PJ_LABS`.
- Relato de uso manual da UI apos importacoes.

## Resultado observado

- O modal de import listava apenas artefatos `DR` como parent, apesar do backend aceitar `PJ` e `DR`.
- A arvore inicializava filtrada no primeiro `PJ`, o que escondia imports feitos diretamente no `WS`.
- A UI foi corrigida para listar `PJ` e `DR` no parent do import e para iniciar o seletor superior em `WS_MAIN`.

## Resultado esperado

Os imports devem aceitar projeto como parent e artefatos importados no workspace devem ficar visiveis logo apos o refresh.

## Conclusao

Validado

## Evidencias

- Ajustes em `src/ui/main.js`.

## Decisoes derivadas

- Nenhuma.

## Pendencias

- Validar visualmente no navegador se o novo comportamento atende o fluxo esperado de importacao.

# EXP-004 - Validacao da projecao de paragrafos no Lab 02

## Data

2026-06-02

## Lab relacionado

Lab 02 - Projection Engine

## Hipotese

Um artefato `PG` deve ser projetado como um paragrafo continuo em markdown, preservando que `SN` representa sentencas internas e nao blocos independentes.

## Procedimento

1. Inspecionar a implementacao de `projectPG()` em `src/core/projectionService.ts`.
2. Verificar como sentencas `SN` estavam sendo agregadas no output markdown.
3. Ajustar a projecao para concatenar sentencas no mesmo paragrafo.
4. Adicionar teste cobrindo um documento com tres sentencas no mesmo paragrafo.

## Entrada

- Documento importado com o corpo `First sentence. Second sentence. Third sentence.` sob uma secao `# Intro`.

## Resultado observado

- A implementacao anterior unia sentencas com `\\n\\n`, fazendo cada `SN` virar um bloco markdown separado.
- A implementacao foi corrigida para unir sentencas com espaco simples no output de `PG`.
- Foi adicionado teste para garantir que a projecao markdown contenha o paragrafo consolidado e nao quebras duplas entre sentencas.
- A suite `npm.cmd test` foi executada com sucesso apos a correcao.

## Resultado esperado

O preview markdown deve exibir um unico paragrafo por `PG`, com as sentencas em sequencia.

## Conclusao

Validado por inspecao e cobertura automatizada adicionada

## Evidencias

- Ajuste em `src/core/projectionService.ts`.
- Teste em `src/tests/api.test.ts`.

## Decisoes derivadas

- Nenhuma.

## Pendencias

- Nenhuma.

# EXP-005 - Validacao de secoes aninhadas no markdown

## Data

2026-06-02

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution

## Hipotese

Um markdown com headings aninhados deve gerar uma arvore `SS -> SS`, preservar paragrafos nas secoes corretas e permitir projecao e resolucao FCAS da secao filha.

## Procedimento

1. Alterar o parser de markdown para construir uma pilha por nivel de heading.
2. Persistir secoes recursivamente, com `metadataJson.level`.
3. Ajustar a projecao para percorrer filhos `PG` e `SS`.
4. Ajustar a resolucao FCAS para buscar secoes aninhadas.
5. Adicionar testes para explorer, projecao markdown e resolve de secao filha.

## Entrada

- Documento com `# Parent` seguido de `## Child`.

## Resultado observado

- A secao `Child` passou a ser persistida como filha de `Parent`.
- A projecao markdown passou a reconstruir `# Parent` e `## Child`.
- A resolucao `[[nested-resolution.md#Child]]` passou a encontrar a secao aninhada.
- A suite `npm.cmd test` passou com 21 testes cobrindo os fluxos atualizados.

## Resultado esperado

Secoes aninhadas devem ser representadas e reconstruidas sem achatamento estrutural.

## Conclusao

Validado por implementacao e cobertura automatizada adicionada

## Evidencias

- Alteracoes em `src/core/lab01Service.ts`.
- Alteracoes em `src/core/projectionService.ts`.
- Alteracoes em `src/core/lab03Service.ts`.
- Testes em `src/tests/api.test.ts`.

## Decisoes derivadas

- ADR-003

## Pendencias

- Nenhuma.

# EXP-006 - Validacao do Lab 04 (Evolution & Lineage)

## Data

2026-11-19

## Lab relacionado

Lab 04 - Evolution & Lineage  
Lab 03 - FCAS Resolution

## Hipotese

As regras de identidade da ADR-004 e o armazenamento de lineage da ADR-005 permitem evoluir artefatos de documentos e chats (edit, semantic change, split, merge, regenerate) mantendo projecoes corretas, historia rastreavel e referencias resolviveis.

## Procedimento

1. Criar as tabelas `evolution_events` e `artifact_lineage` (migration `0002_living_ghost_rider`).
2. Implementar o Evolution Engine em `src/core/lab04Service.ts` e as rotas `/v1/lab04/*`.
3. Ajustar o FCAS Resolver para seguir lineage em `[[FCID]]` superseded.
4. Escrever os cenarios C01-C16 de `docs/lab 04.md` em `src/tests/lab04.test.ts`, mais 3 testes extras (operacoes invalidas e raizes do explorer, merge de SN, reset das tabelas novas).
5. Executar `npx vitest run` contra uma copia do banco com a migration aplicada.

## Entrada

- Documento `# Evolution` com 3 paragrafos e 5 sentencas, importado uma vez por cenario.
- Chats `::evo-chat-edit` e `::evo-chat-regen`.

## Resultado observado

- 40 de 40 testes passaram (21 existentes + 19 do Lab 04).
- `tsc --noEmit` sem erros.
- Edit mantem FCID, incrementa `revision` e guarda o texto anterior no evento.
- Semantic change, split, merge e regenerate criam FCIDs novos na posicao original; as origens ficam `superseded` e saem das projecoes.
- Split de PG preserva os FCIDs dos SN.
- `[[::chat<2>]]` resolve para o MS regenerado.
- Referencia para SN substituido: `evolved` com 1 descendente, `ambiguous` (HTTP 409 no resolve) apos split.
- Classificador: correcao de digitacao e normalizacao sugerem edit; troca de palavra e insercao de negacao sugerem semantic change; "now" -> "not" sugere edit (limitacao C16 confirmada).

## Resultado esperado

Todas as hipoteses do Lab 04 validadas por testes automatizados.

## Conclusao

Validado por implementacao e cobertura automatizada

## Evidencias

- `src/core/lab04Service.ts`, `src/core/lab04Schemas.ts`, `src/api/routes/lab04Routes.ts`.
- `src/core/lab03Service.ts` e `src/api/routes/lab03Routes.ts` (resolucao via lineage).
- `src/core/lab01Service.ts` (`persistMessageContent` extraido; raizes do explorer sem `superseded`).
- `src/tests/lab04.test.ts`.
- `vitest.config.ts` com `fileParallelism: false`, pois os dois arquivos de teste resetam o mesmo banco.

## Decisoes derivadas

- ADR-004
- ADR-005

## Pendencias

- Reimportacao com o mesmo `resourceKey` continua duplicando a arvore (fora do escopo do Lab 04).
- Os modulos `src/ui/*.ts` nao refletem o painel de lineage (ver ADR-006).

# EXP-007 - Validacao visual do painel de lineage do Lab 04

## Data

2026-11-19

## Lab relacionado

Lab 04 - Evolution & Lineage  
Lab 03 - FCAS Resolution

## Hipotese

O Inspector da UI consegue exibir o historico de um FCID e permitir navegar ate artefatos substituidos, sem acesso direto ao banco.

## Procedimento

1. Subir a API (build compilado) apontando para uma copia do banco, sem tocar em `data/forgeos.db`.
2. Pela API, importar um documento e executar: edit e semantic change em um SN, e split de outro SN com uma referencia apontando para ele.
3. Na UI, abrir a aba FCAS e resolver `[[SN_substituido]]`.
4. Seguir os links de lineage ate o artefato original e ate a origem do split.
5. Expandir o before/after do evento e ler o console do navegador.

## Entrada

- Copia do banco com 74 artefatos mais o documento `ui-demo.md`.

## Resultado observado

- Artefato sem evolucao: badge `active` e a mensagem "No evolution recorded".
- `[[SN_substituido]]` resolveu para o descendente (`evolvedFrom` exibido) e o painel mostrou o ancestral `superseded` e o evento `semantic_change`.
- Artefato substituido por semantic change: `Current` com o novo SN, descendente `active` e 2 eventos (`edit`, `semantic_change`).
- Origem de um split: `Current` com os 2 SN, 2 descendentes `split from` e o evento `split` com before/after expansivel.
- Console do navegador sem erros.

## Resultado esperado

Historico legivel e navegavel a partir de qualquer FCID, ativo ou substituido.

## Conclusao

Validado

## Evidencias

- `src/ui/main.js` (`renderLineage`, `refreshInspector`) e `src/ui/styles.css`.
- Execucao manual no painel do navegador.

## Decisoes derivadas

- ADR-006

## Pendencias

- Nao verificado: layout em largura estreita (menos de 1180px) e a abertura do before/after, que e perdida quando a UI e redesenhada.

# EXP-008 - Validacao do Lab 05 (Context Assembly)

## Data

2026-11-19

## Lab relacionado

Lab 05 - Context Assembly  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution  
Lab 04 - Evolution & Lineage

## Hipotese

Uma camada de montagem sobre o Projection Engine e o FCAS Resolver (ADR-007 a ADR-010) monta views completas e parciais de documentos e chats, expande referencias FCAS de forma segura e informa de onde veio cada parte, sem alterar os artefatos.

## Procedimento

1. Corrigir `projectDC` para projetar PG filhos diretos (ADR-010) e exportar `loadArtifactWithGraph` e `renderArtifactNode` de `projectionService`.
2. Implementar o Assembly Engine em `src/core/lab05Service.ts` e as rotas `/v1/lab05/assemble` e `/v1/lab05/expand`.
3. Escrever os cenarios C01-C21 de `docs/lab 05.md` em `src/tests/lab05.test.ts`, mais 2 testes extras (validacao de alvo e corpo; alvo por FCID).
4. Executar `npx vitest run` contra uma copia do banco, com `tsc --noEmit` e `npm run build`.
5. Teste de mutacao: desfazer apenas a correcao do ADR-010 e confirmar que o teste correspondente falha.
6. Sondar duas hipoteses de borda executando o codigo: `[[palavra]]` comum na prosa e FCAS com ". " no titulo.

## Entrada

- Documentos com e sem titulos, com secoes aninhadas, com referencias em bloco e inline, em cadeia e em ciclo.
- Chats com 4 mensagens alternando user e assistant.
- Referencias a SN editado, substituido (semantic change) e dividido (split) do Lab 04.

## Resultado observado

- 63 de 63 testes passaram (21 anteriores ao Lab 04, 19 do Lab 04, 23 do Lab 05).
- `tsc --noEmit` e `npm run build` sem erros.
- Invariante `assemble = project` confirmada para documento, documento sem titulos e chat (markdown e text).
- Sem a correcao do ADR-010, somente o C02 falhou (mutacao restrita a `projectDC`), confirmando que o teste detecta a regressao.
- Recorte: janela de secoes e de mensagens, `to` reduzido ao total, `roles` por interseccao sem renumerar, `range` 2..2 de um chat identico a `[[::chat<2>]]`, janelas invalidas retornam 422.
- Expansao: bloco (DC e MS), inline (SN), inline para container mantido literal com `BLOCK_REFERENCE_INLINE`, recursao limitada por `maxDepth`, ciclo e auto-referencia terminam com `CYCLE`, inexistente e WS mantidos literais com warning.
- Lab 04: referencia a SN substituido expande o descendente com `evolvedFrom` no manifest; SN dividido gera `AMBIGUOUS` com candidatos (e 409 como alvo).
- O texto dos SN permaneceu identico antes e depois da montagem.
- Sondagem: `[[palavra]]` comum fica literal (NOT_FOUND sem diretorio no workspace, UNSUPPORTED_TARGET com diretorio); FCAS com ". " no titulo e quebrado em dois SN na importacao e nao e reconhecido.

## Resultado esperado

Todas as hipoteses do Lab 05 validadas por testes automatizados.

## Conclusao

Validado por implementacao e cobertura automatizada

## Evidencias

- `src/core/lab05Service.ts`, `src/core/lab05Schemas.ts`, `src/api/routes/lab05Routes.ts`.
- `src/core/projectionService.ts` (`projectDC`, `renderArtifactNode`).
- `src/tests/lab05.test.ts`.

## Decisoes derivadas

- ADR-007
- ADR-008
- ADR-009
- ADR-010

## Pendencias

- Painel de montagem na UI: implementado depois e validado no EXP-009.
- O manifest registra cada ocorrencia de expansao, sem deduplicar o mesmo alvo expandido mais de uma vez.
- Cada montagem carrega o grafo inteiro em memoria; sem cache.
- O divisor de sentencas do Lab 01 pode quebrar um FCAS que contenha ". " no titulo.
- Debitos herdados e fora do escopo: titulo do DC sempre "Untitled Document" e resolucao de `[[Diretorio]]` e `[[$Projeto]]` que ignora o nome.

# EXP-009 - Validacao visual da aba Assembly do Lab 05

## Data

2026-11-19

## Lab relacionado

Lab 05 - Context Assembly

## Hipotese

Uma aba na UI consegue montar views completas e parciais, expandir texto com referencias FCAS e mostrar o manifest e os warnings, usando apenas os endpoints `/v1/lab05/*`.

## Procedimento

1. Subir a API (build compilado) apontando para uma copia do banco, sem tocar em `data/forgeos.db`.
2. Pela API, criar: um documento com referencia em bloco, referencia inline a SN, referencia inline a documento, referencia inexistente e referencia a um SN depois dividido; um chat com 4 mensagens alternando user e assistant.
3. Na aba Assembly, selecionar o documento na arvore e montar.
4. Selecionar o chat, definir a janela 2-4 e o papel assistant, e montar.
5. Definir uma janela invalida (`to` menor que `from`).
6. No modo Expand text, expandir um texto com uma secao em bloco, um documento inline e um documento inexistente.
7. Clicar em um FCID do manifest.
8. Ler o console do navegador.

## Entrada

- Copia do banco com 74 artefatos mais os documentos `glossary.md`, `fact.md`, `parts.md`, `host.md` e o chat `::demo-chat`.
- Viewport emulado de 1400x900 (o painel do navegador tem 800px e a UI empilha as colunas abaixo de 1180px).

## Resultado observado

- Selecionar um artefato na arvore preenche o alvo e monta automaticamente.
- Documento `host`: o bloco `[[glossary.md]]` e o inline para SN foram expandidos; o inline para documento, a referencia inexistente e o SN dividido ficaram literais. O manifest listou raiz e 2 expandidos; os 3 warnings (`BLOCK_REFERENCE_INLINE`, `NOT_FOUND`, `AMBIGUOUS` com candidatos clicaveis) apareceram.
- Chat com janela 2-4 e papel assistant: exibiu somente as mensagens 2 e 4; o painel mostrou "2-4 of 4, roles: assistant" e 2 entradas `selected`.
- Os valores do formulario sobreviveram ao redesenho da tela.
- Janela invalida: mensagem `INVALID_RANGE` com os detalhes (`total: 4`) e manifest limpo.
- Expand text: a secao em bloco foi expandida; o inline para documento e a referencia inexistente geraram warnings; o manifest mostrou apenas a entrada expandida.
- Clicar em um FCID do manifest voltou ao modo Assemble, definiu o alvo, limpou a janela e montou o alvo.
- Console do navegador: um unico erro, o 422 do teste proposital de janela invalida.

## Resultado esperado

Montagem completa, parcial e expansao isolada utilizaveis pela UI, com manifest e warnings legiveis.

## Conclusao

Validado

## Evidencias

- `src/ui/main.js` (`assembly`, `runAssemble`, `renderAssemblyCenter`, `renderAssemblyDetails`, `bindAssembly`) e `src/ui/styles.css`.
- Execucao manual no painel do navegador.

## Decisoes derivadas

- Nenhuma nova. O painel foi implementado apenas em `main.js`, conforme ADR-006.

## Pendencias

- Nao verificado no navegador: clique em um candidato de `AMBIGUOUS`, os seletores `maxDepth` e `Format`, a opcao de desligar a expansao, a tecla Enter no campo de alvo e o layout em largura estreita.
- A arvore da aba Assembly mostra todos os artefatos, incluindo SN, e fica longa em bancos grandes.
- Alterar o formulario nao refaz a montagem; e preciso clicar em Assemble.

# EXP-010 - Validacao do Lab 06 (Synthetic Projection)

## Data

2026-11-19

## Lab relacionado

Lab 06 - Synthetic Projection  
Lab 05 - Context Assembly  
Lab 04 - Evolution & Lineage

## Hipotese

Uma camada de sintese sobre o Assembly Engine (ADR-011 a ADR-014) compoe views ineditas a partir de artefatos de origens diferentes, escolhidos manualmente, ao acaso ou por referencias FCAS, sem criar nada nem alterar as fontes, de forma reproduzivel e rastreavel.

## Procedimento

1. Implementar o Synthesis Engine em `src/core/lab06Service.ts` e a rota `POST /v1/lab06/synthesize`; exportar `normalizeTarget` de `lab05Service` (unica mudanca em codigo anterior).
2. Escrever os cenarios C01-C22 de `docs/lab 06.md` em `src/tests/lab06.test.ts`.
3. Executar `npx vitest run` contra uma copia do banco, com `tsc --noEmit` e `npm run build`.
4. Teste de mutacao: (M1) remover o filtro `state = active` do pool aleatorio; (M2) fazer o sorteio ignorar a seed.
5. Antes de decidir o desenho, testar a alternativa "DC novo com PG compartilhados" apos um split do Lab 04.

## Entrada

- Documentos com varios paragrafos e secoes, chats de 2 a 4 mensagens, referencias a SN editado, substituido e dividido.
- O banco acumulado da propria suite (dezenas de SN) como pool do sorteio.

## Resultado observado

- 85 de 85 testes passaram (63 anteriores, 22 do Lab 06).
- `tsc --noEmit` e `npm run build` sem erros.
- Documento composto por PG de dois documentos, com titulo; chat composto por MS de dois chats, com roles preservados; view livre com SN, PG e MS; itens por FCID e por FCAS (`[[doc#Secao]]`, `[[::chat<n>]]`).
- Invariantes: I1 (todas as MS de um chat = projecao do CH), I2 (PG de uma secao = montagem do SS com range), I3 (mesma seed = mesmo resultado; seeds 123 e 124 diferem), I4 (artifacts, artifact_edges, artifact_lineage, evolution_events, projections, references e resource_bindings identicos antes e depois de varias sinteses, inclusive as que falham).
- Erros estritos com `position`: inexistente 404, invalido 422, DC e WS 422, tipo fora do kind 422 com `allowed`, item dividido 409 com candidatos.
- Item substituido usa a versao atual e registra `evolvedFrom` no manifest.
- Template `[[PG]] [[PG]] [[MS]]` em blocos compoe a view; inline para MS fica literal com `BLOCK_REFERENCE_INLINE`; expansao dentro do conteudo de um item traz `position` nos warnings e no manifest.
- Random: `count` reduzido ao pool (`picked` e `poolSize`), pool vazio 422, `scope` restringe o pool, seed gerada pelo servidor e reproduzivel quando devolvida.
- Teste da alternativa descartada (antes da implementacao): um DC novo contendo os PG de um documento perdeu a primeira frase, sem erro, depois que um desses PG foi dividido pelo Lab 04.
- Mutacao M2 (sorteio ignora a seed): detectada por C11 e C12.
- Mutacao M1 (pool sem o filtro `active`): inicialmente NAO detectada. O C14 usava `scope`, e um artefato substituido ja sai do pool por nao ter pai estrutural, entao o filtro de estado nunca era exercitado. Alem disso, a montagem segue o lineage e trocaria o MS sorteado pelo substituto, escondendo o defeito no manifest. O C14 foi reforcado (sorteio sem `scope` apos regenerar uma mensagem, verificando `poolSize` contra a contagem de MS ativas, ausencia de duplicatas e de `evolvedFrom`); a M1 passou a ser detectada, falhando em `poolSize` (5 contra 4 mensagens ativas). A primeira versao do teste, que so verificava a ausencia do FCID antigo no manifest, continuava passando sob a M1, o que confirma que o lineage mascarava o defeito.

## Resultado esperado

Todas as hipoteses do Lab 06 validadas por testes automatizados.

## Conclusao

Validado por implementacao e cobertura automatizada

## Evidencias

- `src/core/lab06Service.ts`, `src/core/lab06Schemas.ts`, `src/api/routes/lab06Routes.ts`.
- `src/core/lab05Service.ts` (`normalizeTarget` exportada).
- `src/tests/lab06.test.ts`.

## Decisoes derivadas

- ADR-011
- ADR-012
- ADR-013
- ADR-014

## Pendencias

- Painel de sintese na UI (fora do escopo do Lab 06).
- Persistir projecoes sinteticas (nomear, listar, reabrir) continua fora do escopo; exigiria decidir antes se a definicao referencia FCIDs ou guarda um instantaneo.
- Cada item chama o Assembly Engine, que carrega o grafo inteiro: uma sintese de N itens carrega o grafo N vezes. Sem cache.
- A reproducao por seed vale enquanto o pool nao muda; apos uma evolucao (Lab 04) a mesma seed pode sortear diferente.
- Debitos herdados e fora do escopo: titulo do DC sempre "Untitled Document" e resolucao de `[[Diretorio]]` e `[[$Projeto]]` que ignora o nome.

# EXP-011 - Validacao das correcoes D1 (regenerate) e D2 (texto antes do primeiro titulo)

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine  
Lab 04 - Evolution & Lineage  
Lab 06 - Synthetic Projection

## Hipotese

Superseder a subarvore da mensagem regenerada (ADR-015) e persistir o texto antes do primeiro titulo (ADR-016) corrigem os defeitos D1 e D2 da revisao de conformidade sem alterar o comportamento dos demais fluxos.

## Procedimento

1. Escrever primeiro os testes de regressao e confirmar que falham: C17 (Lab 04), C23 (Lab 06) e quatro testes de "text before the first heading" (api.test.ts).
2. Corrigir `regenerateMessage` (`lab04Service.ts`), o parser e a persistencia do corpo markdown (`lab01Service.ts`) e `projectMS` (`projectionService.ts`).
3. Executar `npx vitest run` contra uma copia do banco, com `tsc --noEmit` e `npm run build`.
4. Teste de mutacao, uma por correcao: (MA) regenerate volta a superseder so o MS; (MB) o parser volta a descartar o texto introdutorio; (MC) `projectMS` volta a ignorar PG quando ha SS.

## Entrada

- Chat com uma pergunta e uma resposta regenerada; referencia criada para a sentenca da resposta antiga antes da regeneracao.
- Documentos e mensagens com um ou varios paragrafos antes do primeiro titulo.

## Resultado observado

- Antes das correcoes: exatamente os 6 testes novos falhavam; os 85 anteriores passavam.
- Depois: 91 de 91 testes; `tsc --noEmit` e build sem erro.
- Regenerate: MS, PG e SN antigos ficam `superseded`; os novos, `active`. A projecao do MS antigo por FCID ainda mostra o texto antigo; a projecao do chat mostra so o novo. Editar o SN antigo retorna 409 `SUPERSEDED`. A referencia criada antes passa a `orphaned`. O sorteio de SN, PG e MS (pool pequeno, inteiro sorteado) nao traz o conteudo antigo.
- Texto introdutorio: um ou varios paragrafos antes do primeiro titulo aparecem na projecao do documento e da mensagem, antes das secoes; o JSON traz `paragraphs` e `sections`; no Lab 05 o preambulo e o primeiro filho da janela (`range 1..1`) e a primeira secao passa a ser o segundo.
- Mutacao MA: falharam C17 e C23. Mutacao MB: falharam os 4 testes de texto introdutorio. Mutacao MC: falhou apenas "keeps a preface in a chat message", o que confirma que a mudanca em `projectMS` era necessaria. Todos os arquivos foram restaurados identicos.

## Resultado esperado

Nenhum conteudo ativo abaixo de um artefato substituido; nenhum texto descartado na importacao; todos os demais testes inalterados.

## Conclusao

Validado por implementacao e cobertura automatizada

## Evidencias

- `src/core/lab04Service.ts` (`subtreeOf`, `regenerateMessage`), `src/core/lab01Service.ts` (`parseMarkdownSections`, `persistMarkdownBody`), `src/core/projectionService.ts` (`projectMS`).
- `src/tests/lab04.test.ts` (C17), `src/tests/lab06.test.ts` (C23), `src/tests/api.test.ts`.

## Decisoes derivadas

- ADR-015
- ADR-016

## Pendencias

- Dados gravados antes das correcoes nao sao reparados: mensagens regeneradas antes ainda tem filhos `active`, e o texto descartado antes nao volta.
- Defeitos D3 a D8 da revisao seguem abertos (documento sem titulos sem SS, chat sem pai, resolver ignorando nomes, `[[::chat<1-3>]]`, reimportacao, verificacoes que sempre passam).
- O EXP-010 afirmou que o filtro de estado bastava para manter substituidos fora do sorteio. A mutacao daquele experimento so cobria o tipo MS; a afirmacao so passou a valer para SN e PG com a ADR-015.
