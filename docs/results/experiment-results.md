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

- Executar checklist manual completo em ambiente visual com a API em execucao (`npm run dev`) para confirmar UX de ponta a ponta. **Feito em 2026-11-19, ver EXP-016.**

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

- Validar visualmente no navegador se o novo comportamento atende o fluxo esperado de importacao. **Feito em 2026-11-19, ver EXP-016.**

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

# EXP-012 - Teste pela interface com recursos de pao caseiro (Labs 01 a 06)

## Data

2026-11-19

## Lab relacionado

Labs 01 a 06

## Hipotese

Cinco documentos markdown e tres chats sobre um assunto nao tecnico, importados e operados pela UI, mostram como recursos viram artefatos, como documentos e chats sao reconstruidos, como o FCAS acessa artefatos, como eles evoluem e como novas projecoes sao criadas.

## Procedimento

1. Importar os 5 documentos (`docs/<arquivo>`) e os 3 chats (`::padaria-...`) de `resources/` em um banco proprio (`data/resources-test.db`), pela UI e pela API.
2. Lab 02: projetar documentos, chats e mensagens em markdown, texto e json.
3. Lab 03: resolver FCAS e FCID, copiar referencias, criar referencias (resolvida, evoluida, ambigua, orfa).
4. Lab 04: editar, mudanca semantica, dividir, fundir e regenerar (pela API; a UI so tem o painel de lineage).
5. Lab 05: montar documento e chat inteiros, janela por `range` e `roles`, expandir texto com referencias (aba Assembly).
6. Lab 06: Items, Random com seed e escopo, Template, erros estritos (aba Synthesis, criada neste teste).

## Entrada

Ver `resources/README.md`.

## Resultado observado

- Cada fluxo funcionou como a especificacao do lab. Lab 05: evolucao seguida na expansao, `AMBIGUOUS` com candidatos, `BLOCK_REFERENCE_INLINE`, `NOT_FOUND`. Lab 06: mesma seed gera a mesma selecao; escopo reduziu o pool de 177 para 30; `ITEM_AMBIGUOUS` e `ITEM_TYPE_NOT_ALLOWED` com posicao; artefatos de origem inalterados.
- Achados: documento sem titulos nao gera SS (D3); sentencas de um paragrafo aparecem coladas; arvore ordena irmaos por tipo e FCID, nao por `orderIndex`; chats sem pai estrutural; `[[$PJ_LABS]]` resolve para PJ_CORE; `[[::chat<1-3>]]` nao suportado; texto do painel FCAS permanece apos trocar de artefato; ambiguidade sem candidatos na aba FCAS; ponto final do SN fica no meio da frase na expansao inline; no-orfao vira `NOT_FOUND` sem aviso proprio; referencias usam `RF_`, o plano previa `REF_`.
- Sem controles na UI para editar, dividir, fundir ou regenerar (Lab 04) e, ate este teste, nenhuma interface para o Lab 06.
- Incidentes do proprio teste: uma mensagem entrou como `user` por clique em select nativo (chat apagado com autorizacao do usuario e recriado); uma edicao indevida de `SN_KYYAM8` por um curl com corpo acentuado que falhou sem checagem (texto restaurado; o historico guarda 2 eventos `edit` a mais).

## Resultado esperado

Os seis labs operam sobre conteudo real sem corromper as fontes e respondem as perguntas da Parte 2.

## Conclusao

Validado com ressalvas

## Evidencias

- Banco `data/resources-test.db` (porta 3111), `resources/`, abas Assembly e Synthesis da UI.

## Decisoes derivadas

- Aba Synthesis implementada apenas em `main.js` (nota na ADR-006).

## Pendencias

- Defeitos D3 a D8; decisao sobre orfaos (ADR-015); itens do gate (Labs 03.5 e 01.5, `RF_` para `REF_`, sintaxe FCAS, `[[::chat]]`); decidir se o Lab 06 antecipado fica; `resources/` nao versionado.

# EXP-013 - Validacao das decisoes de sintaxe FCAS, REF_, orfaos e chat sob o workspace

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 03 - FCAS Resolution  
Lab 05 - Context Assembly  
Lab 06 - Synthetic Projection

## Hipotese

As decisoes da ADR-017 a ADR-021 fecham D4, D5 e D6, o prefixo `REF_` e o estado `ORPHANED` sem alterar o comportamento dos demais fluxos.

## Procedimento

1. Escrever primeiro `src/tests/fcas.test.ts` (F01 a F27) e confirmar que falham: 22 de 27 falharam; os 5 que passavam cobriam comportamento que ja existia ou passavam por acidente (F21).
2. Implementar o parser (`messageRange`, `concept`, `alias`), `resolveByName`, as tres classes de erro, `REF_`, `findSupersession`, a janela de chat no Lab 05, os codigos novos no Lab 06, o `WS > CH` e os nomes do seed.
3. Rodar `npx vitest run` contra uma copia do banco, `tsc --noEmit` e `npm run build`.
4. Teste de mutacao com oito mutacoes (MA a MH).
5. Conferir no banco real de recursos (porta 3111) e, em uma copia do banco na porta 3112, a aba Chat e a aba Document com um chat sob o WS.

## Entrada

- Testes sinteticos (`fcas.test.ts`).
- Banco `data/resources-test.db`: chat `::padaria-duvidas-iniciante` (8 mensagens), `SN_2EZYSB` orfao, projetos sem `title`.

## Resultado observado

- Antes: 22 de 27 testes novos falhavam. Depois: 28 de 28 (inclui o F12b, escrito depois da mutacao ME), 119 de 119 no total, `tsc --noEmit` e build sem erro.
- Mutacao: MA (janela ignorada) falhou F16 e F17; MB (orfao volta a `NOT_FOUND`) falhou F22 a F25 e F27; MC (projeto cai no primeiro) falhou F09 e F10; MD (chat sem pai) falhou F14 e F15; MF (alias lido como diretorio) falhou F05, F06 e F21; MG (os dois intervalos aceitos) falhou F19; MH (causa descartada) falhou F22.
- Mutacao ME (condicao `targetFcid === artifact.fcid` na reconstrucao de nomes) **nao foi detectada**: a condicao nunca e falsa, porque um nome unico resolve para o proprio artefato. Foi removida como codigo morto. Uma segunda mutacao, a remocao do guard de tipo, so e detectada pelo F12b (diretorio chamado `colisao.md` ao lado de um documento de mesma chave), escrito para isso.
- Banco real: `[[::padaria-duvidas-iniciante<2-3>]]` expande as mensagens 2 e 3 (`selection` 2 a 3 de 8); `<20-30>` vira `INVALID_RANGE`; `SN_2EZYSB` vira `ORPHANED` com `cause` = `regenerate` (`EVT_36A0MT7I`, raiz `MS_0OLX7A`) e `candidates` = `MS_Z3BEZV`; `[[$PJ_LABS]]` resolve pelo FCID; `[[#farinha]]` retorna 422 `UNSUPPORTED_SYNTAX`.
- Efeito colateral: `[[$ForgeOS]]` retorna 404 nesse banco, porque os projetos criados antes nao tem `title`. Antes devolvia o primeiro projeto, que era o defeito D5.
- UI (copia do banco): o chat novo aparece sob o WS na aba Chat e mostra as mensagens; a aba Document nao mostra chats.

## Resultado esperado

Nenhum teste anterior quebra; cada decisao tem pelo menos um teste que falha quando ela e desfeita.

## Conclusao

Validado por implementacao e cobertura automatizada

## Evidencias

- `src/tests/fcas.test.ts`; `src/core/lab03Service.ts`, `lab04Service.ts` (`findSupersession`), `lab05Service.ts`, `lab06Service.ts`, `lab01Service.ts` (`createChat`), `src/seeds/seedData.ts`; `src/ui/main.js`.

## Decisoes derivadas

- ADR-017, ADR-018, ADR-019, ADR-020, ADR-021

## Pendencias

- D7 (reimportar duplica a arvore; `projection/remove` apaga o binding) e D8 seguem abertos; D7 e o escopo do Lab 01.5.
- Nao ha resolvedor para conceito (`[[#slug]]`) nem para referencia nomeada (`[[@nome]]`); dependem do EPIC 24.
- Dados anteriores nao sao reparados (projetos sem `title`, chats sem pai).
- Nada foi commitado.


# EXP-014 - Lab 01.5: reimportacao idempotente e migracao dos chats do ForgeOS

## Data

2026-11-19

## Lab relacionado

Lab 01.5 - Chat Migration & Idempotent Import (com Lab 01, Lab 03 e Lab 04)

## Hipotese

H1 a H5 do `docs/lab 01.5.md`: reimportar sem mudanca nao altera nada; os FCIDs de `CH` e `MS` sobrevivem; o texto e reconstruivel e as perdas se classificam; a migracao e repetivel; as lacunas se listam completas.

## Procedimento

1. Inspecionar, numa copia do banco do ForgeOS, so o schema e agregados (nenhum conteudo lido).
2. Escrever os testes antes do codigo: `lab015.test.ts` (Parte A, C01 a C20, mais R01, C15b, C15c, C16b, C18b) e `lab015Migration.test.ts` (Parte B, C21 a C33, mais C23b, C31b, C33b e dois de relatorio e de chave), com um banco sintetico no formato do ForgeOS. Os testes da Parte A falharam todos (20 de 22) antes do motor.
3. Implementar `lab015Service.ts` (alinhamento LCS), `forgeosMigration.ts` e o comando `lab015:migrate`; extrair `applyEdit` e `applySemanticChange` do Lab 04.
4. Teste de mutacao com 20 mutacoes (M01 a M20).
5. Rodar o migrador na copia real, duas vezes, num banco novo da POC.

## Entrada

- Copia de `forgeos/.forgeos/forgeos.db`: 35 chats (24 ativos, 11 `deleted`), 204 mensagens, 25 referencias, 4 linhas de `chat_lineage`. **Banco de desenvolvimento: so dados de teste, o ForgeOS ainda nao tem usuarios** (informado depois da execucao). A compatibilidade de forma vale; os percentuais que dependem do conteudo sao de conversas de teste.

## Resultado observado

- Testes: 25 em `lab015.test.ts` e 18 em `lab015Migration.test.ts`; suite completa **162 de 162**, `tsc --noEmit` e build sem erro. Nenhum teste anterior quebrou; o F13 foi atualizado de 8 para 6 caracteres do `REF_` (decisao do usuario).
- Mutacao: as 20 foram detectadas. M20 (casamento por posicao ignorando o papel) so foi detectada depois do C18b; as mutacoes M13 a M20 so rodaram de verdade depois que um erro de sintaxe que eu havia introduzido no arquivo de testes do migrador foi corrigido: a primeira rodada as marcou como erro de compilacao, e os "23 passaram" de uma rodada anterior eram so os testes da Parte A, porque meu filtro nao mostrava a linha "Test Files".
- Execucao real, 1a vez: 24 chats e 165 mensagens migrados, 0 recusados; CH 24, MS 165, SS 184, PG 810, SN 1.619; FCIDs preservados 24 de 24 e 165 de 165; fidelidade `exact` 104, `whitespace` 2, `structure` 59, `loss` 0; referencias: 20 migradas (3 `stale`), 5 com alvo conceito; banco de 122.880 B para 872.448 B; 0,8 s.
- Execucao real, 2a vez: nenhuma mudanca (2.805 artefatos, 2.804 arestas, 0 eventos, 24 projecoes e 20 referencias, antes e depois; 2.778 elementos mantidos; 20 referencias sem mudanca).
- A copia nao foi alterada (data de modificacao igual a da copia). O banco original nao foi aberto pelo migrador.
- Um achado do proprio teste: o mapeamento muda com a presenca de titulo (com titulo, as linhas do paragrafo sao unidas por espaco; sem titulo, a quebra de linha so sobrevive dentro de uma sentenca). O C33b foi escrito de novo por causa disso.

## Resultado esperado

Nenhuma duplicacao, nenhum FCID trocado sem evento, `loss` igual a zero, segunda execucao sem mudanca, relatorio com as lacunas e suas contagens.

## Conclusao

Validado por implementacao e cobertura automatizada, e por execucao sobre uma copia dos dados reais, com a ressalva da estrutura: 59 de 165 mensagens (36%) mudam de forma (lista, enfase, regua, tabela, citacao, codigo).

## Evidencias

- `src/core/lab015Service.ts`, `forgeosMigration.ts`, `src/scripts/migrateForgeos.ts`, `lab04Service.ts` (`applyEdit`, `applySemanticChange`), `lab01Service.ts`, `lab03Service.ts`.
- `src/tests/lab015.test.ts`, `lab015Migration.test.ts`.
- `docs/results/lab-01.5-compatibilidade.md`; relatorios brutos em `data/lab015-report/` (fora do git).

## Decisoes derivadas

- ADR-022, ADR-023; atualizacao da ADR-018.

## Pendencias

- A decisao do EPIC 21 sobre a estrutura de bloco (ampliar o modelo ou manter o markdown original), `chat_lineage`, referencia a conceito, pai do chat e estado `deleted`.
- Um unico banco de dados de teste, sem usuarios; custo em volume maior, proporcao de estrutura em conversas reais, edicao de mensagem pelo ForgeOS e relacao com `context_blocks` e `embeddings` nao foram medidos.
- Dados criados antes desta mudanca nao sao reparados.
- Nada foi commitado.


# EXP-015 - Lab 03.5: estabilidade da referencia ao renomear, mover e reorganizar

## Data

2026-11-19

## Lab relacionado

Lab 03 - FCAS Resolution (Sub-Lab 03.5)

## Hipotese

Uma referencia continua valida ao renomear um documento, mover um diretorio e reorganizar a estrutura, porque e guardada pelo FCID do alvo; o que pode ficar velho e o texto FCAS guardado.

## Procedimento

1. Escrever primeiro `lab035.test.ts` (S01 a S20) e confirmar que falham: 20 de 20.
2. Implementar `lab035Service.ts` (`rename`, `move`, `reorder`, `referenceStatus`, `refresh`) e as rotas.
3. Rodar a suite inteira contra uma copia do banco, `tsc --noEmit` e `npm run build`.
4. Teste de mutacao com 16 mutacoes (M01 a M16).

## Entrada

Documentos, diretorios e chats criados pela propria API de teste; referencias por nome, por secao, por FCID, por `<N>` e por nome de diretorio.

## Resultado observado

- Antes: 20 de 20 falhavam. Depois: 20 de 20; suite completa **182 de 182**; `tsc --noEmit` e build sem erro.
- Renomear (S01 a S09): o FCID do documento, do chat ou do diretorio nao muda; o nome novo resolve para o mesmo artefato e o antigo retorna 404; a referencia criada com o nome antigo continua apontando para o mesmo alvo e passa a `stale`, com o FCAS canonico novo; `refresh` volta para `resolved`; a referencia escrita com o FCID nao e afetada; a chave repetida retorna 409 e a invalida, 422; dois diretorios com o mesmo titulo deixam a referencia `stale` e o FCID vira o endereco canonico.
- Mover (S10 a S13): mover um diretorio ou um documento nao muda nenhuma referencia (continuam `resolved`, com o mesmo texto, porque o endereco e o nome e nao o caminho); mover para dentro de si ou de um descendente retorna 409 `CYCLE`; tipos nao movimentaveis ou pais invalidos retornam 422.
- Reorganizar (S14 a S17): reordenar secoes ou documentos nao muda nenhuma referencia; reordenar mensagens mantem o alvo e deixa o `<2>` posicional `stale` (aponta para outra mensagem) com o canonico `<3>`; uma lista que nao e permutacao retorna 422 e nada muda.
- Estados (S18 a S20): `evolved` com o FCID novo e o FCAS canonico, `orphaned` apos `regenerate`, e `refresh` recusado (409) quando o alvo nao esta ativo.
- Mutacao: as 16 foram detectadas (M01 a M16, cada uma por pelo menos um teste). Nenhuma passou sem deteccao.

## Resultado esperado

A referencia continua valida nos tres cenarios; o que muda e o estado do texto guardado.

## Conclusao

Validado por implementacao e cobertura automatizada

## Evidencias

- `src/core/lab035Service.ts`, `src/api/routes/lab03Routes.ts`, `src/core/lab03Schemas.ts`; `src/tests/lab035.test.ts`.

## Decisoes derivadas

- ADR-024

## Pendencias

- O significado do `stale` no ForgeOS nao foi verificado; a definicao da POC e uma proposta de reconciliacao.
- Nao ha operacao de mover mensagem entre chats, mover secao entre documentos nem renomear projeto pela UI; as operacoes so existem na API.
- As verificacoes do Lab 01 (D8) seguem abertas.
- Nada foi commitado.


# EXP-016 - Checklist manual da UI (fecha as pendencias do EXP-001 e do EXP-003)

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping
Lab 02 - Projection Engine
Lab 03 - FCAS Resolution

## Hipotese

Os fluxos que o EXP-001 e o EXP-003 deixaram para uma verificacao manual funcionam de ponta a ponta na interface, com o codigo atual.

## Procedimento

Passagem pela interface no navegador (viewport de 923 px), num banco novo e descartavel com o seed (porta 3112, removido depois): abrir a tela, importar documento pelo modal, importar diretorio, criar chat, enviar mensagens como `user` e `assistant`, selecionar na arvore, ver a projecao nos tres formatos, ver o inspector, usar a aba FCAS (parse, resolve, criar referencia), copiar o FCAS pela arvore e resetar o seed. Campos preenchidos com a ferramenta de formulario do navegador e botoes clicados; dois passos foram feitos por script na pagina (o JSON de documentos do diretorio, porque a ferramenta recusa texto em JSON, e a troca do formato `json`).

## Entrada

Seed minimo (`WS_MAIN`, `PJ_CORE`, `PJ_LABS`) e conteudo digitado na hora (um documento com duas secoes, um diretorio com dois documentos, um chat de duas mensagens).

## Resultado observado

- EXP-003: a arvore abre no workspace; o seletor de pai do import lista o workspace e os projetos (`PJ_CORE`, `PJ_LABS`); o documento importado no workspace aparece na arvore logo depois do envio.
- EXP-001: importar documento, diretorio (`DR` na arvore) e chat (sob o workspace, ADR-021); mensagens como `user` e `assistant` aparecem nas duas bolhas com o FCID de cada; a selecao na arvore mostra a projecao em markdown, text e json (o JSON e valido) e o inspector (FCID, tipo, pai, filhos, referencias, metadados); na aba FCAS, parse, resolve com projecao (seleciona o alvo e mostra `## Descanso`) e criacao de referencia (`REF_` de 6 caracteres, `resolved`); o Reset Seeds volta a arvore para o workspace e os dois projetos.
- Defeito achado e corrigido: depois de **Parse**, o campo FCAS ficava vazio (a tela se redesenha e perdia o valor), e o **Resolve** seguinte enviava texto vazio e falhava com "Request failed". Os dois campos da aba FCAS agora ficam em variaveis do modulo (`fcasText`, `fcasSourceText`), como os paineis Assembly e Synthesis; repetido depois da correcao, o Parse mantem os campos e o Resolve funciona sem redigitar.
- Achado aberto: a projecao do documento mostra "Untitled Document" mesmo com o nome "Receita" digitado no import; o titulo fica na projecao e nao no DC (ja listado nos achados do EXP-012).
- Nao verificado: o botao Copy da arvore. Nesta aba o navegador negou a escrita na area de transferencia (`Write permission denied`); o codigo chegou a pedir o FCAS e a escrever, e na sessao do EXP-012 o mesmo botao mostrou "Reference copied".
- Nao exercitado: os campos de upload de arquivo (`Uploader (.md/.txt)` do documento e do diretorio); a passagem preencheu os campos de texto.

## Resultado esperado

Os fluxos centrais dos Labs 01 a 03 funcionam pela interface sem ajuste.

## Conclusao

Validado com ressalvas (defeito do FCAS corrigido; Copy e uploads de arquivo nao verificados)

## Evidencias

- `src/ui/main.js` (`fcasText`, `fcasSourceText`); passagem no navegador descrita acima.

## Decisoes derivadas

- Nenhuma. A correcao segue a ADR-006 (so no `main.js`).

## Pendencias

- Titulo do documento nao aparece na projecao ("Untitled Document").
- Copy e uploads de arquivo, por falta de permissao do navegador e de automacao do seletor de arquivo.
- Nada foi commitado.
