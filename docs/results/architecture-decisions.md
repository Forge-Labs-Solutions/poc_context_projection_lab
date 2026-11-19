# ADR-001 - UI de validacao como SPA TypeScript servida pelo Fastify

## Data

2026-06-01

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution

## Contexto

A POC precisava de uma interface de validacao para executar importacoes, navegacao de artefatos, projecoes e fluxos FCAS sem ferramentas externas.

## Decisao

Implementar uma SPA leve em TypeScript sem framework, servida na mesma origem da API Fastify.

## Alternativas consideradas

- React + Vite + Mantine
- Templates server-rendered

## Motivo

A SPA leve reduz acoplamento e tempo de bootstrap, preserva o foco experimental dos Labs 01-03 e reutiliza diretamente os endpoints existentes.

## Impacto

- Artifact Mapping: validacao visual de import document/directory/chat/message.
- Projection Engine: projecao interativa por selecao de qualquer FCID suportado.
- FCAS Resolution: parse/resolve/reference/project-fcas no mesmo fluxo de UI.

## Status

Aceita

## Observacoes

A UI foi separada em modulos (`state`, `api`, `tree`, `preview`, `inspector`, `forms`, `fcas`) para manter evolucao incremental sem framework.

# ADR-002 - Seed base minimo com workspace e dois projetos

## Data

2026-06-02

## Lab relacionado

Lab 01 - Artifact Mapping

## Contexto

O dataset base estava inicializando a POC com documentos, secoes, paragrafos, sentencas, chat, mensagem, projecoes e referencias ja persistidos. Isso misturava bootstrap estrutural com evidencias de experimentos e fazia o estado inicial carregar decisoes de mapeamento e projecao antes de qualquer fluxo explicito do lab.

## Decisao

Reduzir o seed padrao para apenas um workspace persistente (`WS_MAIN`) e dois projetos (`PJ_CORE` e `PJ_LABS`) ligados por arestas `contains`.

## Alternativas consideradas

- Manter o seed completo com documento, chat, projecoes e referencias
- Remover todo o seed e iniciar com banco vazio

## Motivo

O seed minimo preserva um contexto estrutural inicial suficiente para os fluxos do Lab 01 sem antecipar artefatos cognitivos ou projeções que devem nascer dos experimentos. Ao mesmo tempo, evita a ambiguidade operacional de um banco totalmente vazio.

## Impacto

- Artifact Mapping: importacoes passam a criar os primeiros `DC`, `DR`, `CH`, `MS`, `SS`, `PG` e `SN` do ambiente.
- Projection Engine: nao depende mais de projecoes seedadas; passa a operar apenas sobre artefatos criados pelos fluxos de teste.
- FCAS Resolution: referencias seedadas deixam de existir e precisam ser geradas explicitamente nos cenarios de validacao.

## Status

Aceita

## Observacoes

O endpoint de reset continua valido, mas agora restaura apenas a estrutura basal do workspace.

# ADR-003 - Permitir hierarquia de secoes com `SS -> SS`

## Data

2026-06-02

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution

## Contexto

O mapeamento atual tratava todos os headings Markdown como secoes irmas diretamente sob `DC` ou `MS`, ignorando o nivel de heading (`#`, `##`, `###`). Isso impedia representar a hierarquia semantica do documento e fazia a projecao reconstruir uma estrutura achatada.

## Decisao

Permitir que artefatos `SS` tenham outros `SS` como filhos e armazenar o nivel do heading em `metadataJson.level` de cada secao.

## Alternativas consideradas

- Manter todas as secoes como irmas e ignorar nesting
- Criar um tipo novo exclusivo para subsecao

## Motivo

Reutilizar `SS` como no estrutural de secao preserva a semantica do markdown sem expandir desnecessariamente o modelo. O nivel do heading permite reconstruir a projecao com `#`, `##`, `###` de forma consistente.

## Impacto

- Artifact Mapping: headings passam a formar arvores `SS -> SS` com paragrafos `PG` intercalados por `orderIndex`.
- Projection Engine: projecao de documento e mensagem passa a percorrer secoes recursivamente e respeitar o nivel do heading.
- FCAS Resolution: busca por `document#Section` precisa considerar secoes aninhadas.

## Status

Aceita

## Observacoes

O identificador FCAS de secao continua baseado no titulo (`document.md#Section`), sem codificar o caminho hierarquico completo nesta iteracao.

# ADR-004 - Regras de identidade na evolucao de artefatos

## Data

2026-11-19

## Lab relacionado

Lab 04 - Evolution & Lineage

## Contexto

O Lab 04 precisa definir quando uma mudanca preserva o FCID e quando cria um novo. A especificacao (`docs/spec.md`) cita edit, semantic change, split e merge, mas nao define o criterio. O modelo de FCID diz que apenas `SN` e cognitivo; `PG`, `SS` e `MS` sao estruturais e nao carregam conteudo.

## Decisao

- `edit` preserva o FCID; `semantic_change` cria novo FCID com `evolves_from`.
- A distincao entre edit e semantic change e declarada por quem executa a operacao. O sistema oferece apenas uma sugestao por similaridade textual.
- Semantic change se aplica somente a `SN`. Estruturais (`SS`, `PG`, `MS`) aceitam edit de metadados, split e merge.
- Split e merge sempre geram FCIDs novos; nenhuma parte herda o FCID de origem.
- Split nao pode alterar conteudo (concatenacao normalizada das partes = origem).
- Merge restrito a artefatos do mesmo tipo, mesmo pai, adjacentes e ativos.
- Estados possiveis: `active` e `superseded`. O motivo da substituicao e derivado da relacao de lineage.
- Regenerar uma mensagem cria novo `MS` com `evolves_from`.

## Alternativas consideradas

- Classificacao automatica por similaridade textual como fonte de verdade
- Classificacao por embeddings/LLM
- Parte maior do split herdar o FCID de origem
- Estados especificos por operacao (`split`, `merged`, `revised`)

## Motivo

Similaridade textual nao mede significado (ex.: insercao de uma negacao). Declaracao explicita mantem a regra deterministica e testavel na POC. FCIDs novos em split/merge evitam uma regra assimetrica que mudaria silenciosamente o alvo de referencias. Restringir semantic change a `SN` respeita a separacao entre conteudo (cognitivo) e organizacao (estrutural).

## Impacto

- Artifact Mapping: introduz o primeiro uso de `artifacts.state` diferente de `active`.
- Projection Engine: projecoes passam a refletir apenas artefatos ativos.
- FCAS Resolution: referencias para FCIDs substituidos precisam acompanhar o lineage (ver ADR-005).

## Status

Aceita

## Observacoes

Detalhamento em `docs/lab 04.md`. Classificacao semantica real fica para Partes futuras.

Aprovada e implementada em 2026-11-19 (EXP-006). O classificador sugestivo compara palavra a palavra: mesmo numero de palavras e cada diferenca com distancia de edicao <= 2 resulta em sugestao de edit. Eventos usam o prefixo `EVT_`, pois `EV` esta reservado como tipo cognitivo futuro.

# ADR-005 - Lineage em tabelas separadas do grafo estrutural

## Data

2026-11-19

## Lab relacionado

Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution  
Lab 04 - Evolution & Lineage

## Contexto

`artifact_edges` ja possui `relation_type`, mas o Projection Engine (`loadArtifactWithGraph`) e o FCAS Resolver carregam todas as arestas sem filtrar por tipo. Gravar `evolves_from`/`split_from`/`merged_from` ali faria artefatos antigos aparecerem como filhos nas projecoes e quebraria a busca de pai em `projectFcidToFcas`.

## Decisao

- Criar `artifact_lineage` (descendente, ancestral, relacao, evento) e `evolution_events` (operacao, entradas, saidas, conteudo antes/depois, data).
- Ao substituir um artefato: marcar `superseded`, remover a aresta `contains` do pai e colocar o(s) resultado(s) na mesma posicao (mesmo pai e `orderIndex`).
- Artefatos substituidos nunca sao apagados; ficam alcancaveis apenas pelo lineage.
- Reference Artifacts nunca sao reescritos. O resolver segue o lineage ate os descendentes ativos: um descendente resolve com `evolved: true`; varios (split) retornam candidatos.
- FCAS de um FCID substituido e projetada como identificador direto (`[[SN_X]]`).

## Alternativas consideradas

- Gravar lineage em `artifact_edges` e filtrar `relation_type = contains` em todos os consumidores
- Manter a aresta `contains` do artefato substituido e filtrar por `state` nas projecoes

## Motivo

Isolar a historia do grafo estrutural mantem Projection Engine e FCAS Resolver corretos sem mudancas, e evita que um filtro esquecido exiba conteudo obsoleto. Retirar o artefato substituido da estrutura torna "apenas ativos no grafo" uma invariante, em vez de uma regra que cada consumidor precisa lembrar.

## Impacto

- Projection Engine: sem alteracao necessaria.
- FCAS Resolution: resolver e projecao de FCAS precisam tratar FCIDs `superseded`.
- Artifact Mapping: nova migration Drizzle com as duas tabelas.

## Status

Aceita

## Observacoes

Projecao historica (reconstruir um documento como era antes) nao e suportada por este modelo sem percorrer eventos; fica fora do escopo do Lab 04.

Aprovada e implementada em 2026-11-19 (EXP-006). Migration: `drizzle/0002_living_ghost_rider.sql`. O explorer tree (Lab 01) passou a ignorar artefatos `superseded` como raizes, ja que eles ficam sem pai estrutural.

# ADR-006 - Painel de lineage implementado apenas no runtime da UI (main.js)

## Data

2026-11-19

## Lab relacionado

Lab 04 - Evolution & Lineage

## Contexto

`uiRoutes` serve `src/ui/index.html`, que carrega `/ui/main.js`. Esse arquivo e uma versao unica e independente da UI. Os modulos `src/ui/*.ts` (`state`, `api`, `inspector`, ...) compilam para `dist/`, mas nao sao servidos e ja divergiram do `main.js` (por exemplo `state.explorer` contra `treeRoots`).

## Decisao

Implementar o painel de lineage somente em `src/ui/main.js` e nao replicar nos modulos `.ts`.

## Alternativas consideradas

- Replicar o painel em `inspector.ts` e `api.ts`
- Fazer o `main.js` ser gerado a partir dos modulos `.ts`

## Motivo

O `main.js` e o que executa no navegador. Replicar em codigo que nao roda criaria mais uma copia a manter sincronizada, sem efeito observavel.

## Impacto

- Artifact Mapping, Projection Engine e FCAS Resolution: nenhum.
- UI: os modulos `.ts` continuam sem o painel e podem induzir a erro em quem os editar esperando efeito.

## Status

Revisar depois

## Observacoes

Debito tecnico consciente: unificar a UI em uma unica fonte (gerar o `main.js` dos modulos ou remover os modulos).

Em 2026-11-19 a aba Assembly (Lab 05) tambem foi implementada apenas em `main.js`, ampliando a divergencia com os modulos `.ts`.

# ADR-007 - Assembly como camada sobre Projection Engine e FCAS Resolver

## Data

2026-11-19

## Lab relacionado

Lab 05 - Context Assembly  
Lab 02 - Projection Engine  
Lab 03 - FCAS Resolution

## Contexto

O spec do Lab 05 (Document Assembly, Chat Assembly, Partial Assembly, FCAS Expansion) se sobrepoe ao Lab 02, que ja projeta qualquer FCID de SN a CH, e ao Lab 06 (Synthetic Projection), que compoe views a partir de artefatos escolhidos livremente.

## Decisao

- A montagem e uma camada nova (`lab05Service`) que resolve o alvo pelo Lab 03, obtem o conteudo pelo Lab 02 e aplica recorte e expansao. Nao substitui nem altera `/v1/lab02/project`.
- Toda montagem tem exatamente um alvo raiz. Outros artefatos entram apenas por referencia FCAS presente no conteudo, nunca por selecao direta. Selecao direta de artefatos de origens diferentes pertence ao Lab 06.
- Invariante: `assemble(alvo, sem range, roles ou expansao)` produz o mesmo conteudo que `project(alvo)`.
- Toda montagem devolve um manifest (root, selected, expanded) e uma lista de warnings.

## Alternativas consideradas

- Estender `/v1/lab02/project` com recorte e expansao
- Permitir varios alvos raiz ja no Lab 05

## Motivo

Manter o Lab 02 como "um FCID, completo" preserva a projecao como primitiva testavel e permite verificar a montagem contra ela (invariante). Um unico alvo raiz traca a fronteira com o Lab 06 sem sobreposicao.

## Impacto

- Projection Engine: reutilizado sem mudanca de contrato (ver ADR-010 para uma correcao).
- FCAS Resolution: reutilizado, inclusive a resolucao via lineage (ADR-005).

## Status

Aceita

## Observacoes

Detalhamento em `docs/lab 05.md`.

Aprovada e implementada em 2026-11-19 (EXP-008) em `src/core/lab05Service.ts`. Para reutilizar o renderizador, `projectionService` passou a exportar `loadArtifactWithGraph` e `renderArtifactNode`; o contrato de `/v1/lab02/project` nao mudou.

# ADR-008 - Selecao parcial por janela sobre filhos e filtro de papel

## Data

2026-11-19

## Lab relacionado

Lab 05 - Context Assembly

## Contexto

O spec pede montagem parcial ("somente uma secao", "somente algumas mensagens") sem definir como recortar nem como numerar.

## Decisao

- Uma secao isolada e obtida pelo proprio alvo (`[[doc.md#Secao]]` resolve para o SS); nao exige parametro.
- `range { from, to? }` e uma janela de indices 1-based e inclusivos sobre os filhos ordenados do alvo. `to` acima do total e reduzido; `from` invalido ou `to < from` retorna 422.
- Em chats, o indice da janela e o mesmo do FCAS (`range 2..2` equivale a `[[::chat<2>]]`).
- `roles` (somente chats) age como interseccao dentro da janela; a numeracao nao e recontada.
- Com range ou roles, o cabecalho do alvo (titulo do DC, heading do SS, rotulo de role do MS) e omitido.
- SN com range retorna 422; roles em alvo que nao e chat retorna 422.

## Alternativas consideradas

- Filtrar por papel primeiro e numerar apenas as mensagens filtradas
- Manter o cabecalho do alvo no recorte
- Parametros distintos por tipo (`sections`, `messages`)

## Motivo

Uma janela unica serve a DC, SS, MS e CH com o mesmo codigo. Usar a numeracao do FCAS evita duas numeracoes concorrentes para a mesma mensagem. Interseccao e deterministica e nao altera a identidade posicional das mensagens.

## Impacto

- FCAS Resolution: nenhuma mudanca; apenas reutiliza a numeracao `<n>`.
- Projection Engine: o recorte projeta cada filho selecionado pelo mesmo renderizador.

## Status

Aceita

## Observacoes

Filtros por conteudo ou por profundidade de heading ficam fora do Lab 05.

Aprovada e implementada em 2026-11-19 (EXP-008). `range` e validado no servico (nao no schema) para que janelas invalidas retornem 422 `INVALID_RANGE` em vez de 400.

# ADR-009 - Regras de expansao de referencias FCAS

## Data

2026-11-19

## Lab relacionado

Lab 05 - Context Assembly  
Lab 03 - FCAS Resolution

## Contexto

Referencias `[[...]]` ficam persistidas dentro do texto dos SN. Expandir uma referencia pode inserir um documento inteiro no meio de uma frase, formar ciclos ou apontar para artefatos inexistentes, substituidos ou divididos.

## Decisao

- A expansao e nao destrutiva: ocorre na montagem, sobre o texto projetado; o texto dos SN nunca e alterado.
- Referencia em bloco (unico conteudo do paragrafo) aceita qualquer alvo projetavel. Referencia inline aceita apenas SN e PG; inline para DC, SS, MS ou CH nao e expandida (warning `BLOCK_REFERENCE_INLINE`).
- A expansao e recursiva, com `maxDepth` padrao 3 (1 a 5). Ciclo e detectado pela pilha de FCIDs em expansao, incluindo o alvo raiz.
- Qualquer falha deixa o token literal e registra warning (`NOT_FOUND`, `UNSUPPORTED_TARGET`, `AMBIGUOUS`, `CYCLE`, `DEPTH_EXCEEDED`, `BLOCK_REFERENCE_INLINE`). Apenas o alvo e o recorte podem causar erro HTTP.
- FCID substituido com um unico descendente ativo e expandido pelo descendente, com `evolvedFrom` no manifest. FCID dividido (varios ativos) nao e expandido: `AMBIGUOUS` com candidatos.

## Alternativas consideradas

- Expandir sempre inline, achatando o conteudo em uma linha
- Falhar a montagem inteira ao primeiro token invalido
- Expandir um FCID dividido concatenando as partes (o split preserva o conteudo)
- Gravar o conteudo expandido nos SN

## Motivo

Nao destrutiva preserva os artefatos como fonte de verdade. A distincao bloco/inline evita quebrar paragrafos. Falhas como warning tornam a montagem robusta a conteudo mal escrito. Tratar ambiguidade como no resolver do Lab 03 mantem a mesma regra nas duas camadas; concatenar partes ficaria como evolucao futura.

## Impacto

- FCAS Resolution: a expansao consome `resolveFcasToFcid`, herdando lineage e ambiguidade.
- Projection Engine: nenhum.

## Status

Aceita

## Observacoes

O resolver do Lab 03 ignora o nome em `[[Diretorio]]` e `[[$Projeto]]` (resolve para o primeiro DR/PJ). Nao afeta a expansao, pois DR e PJ nao sao projetaveis, mas o warning apontara o alvo errado. Registrado como debito do Lab 03.

Aprovada e implementada em 2026-11-19 (EXP-008). Observado na execucao: um `[[palavra]]` comum na prosa fica literal; gera `NOT_FOUND` quando nao ha nenhum diretorio no workspace e `UNSUPPORTED_TARGET` quando ha (o resolver devolve o primeiro DR). Um FCAS cujo titulo contem ". " (ex.: `[[a.md#Part. Two]]`) e quebrado em dois SN pelo divisor de sentencas do Lab 01 e deixa de ser reconhecido.

# ADR-010 - Projecao de DC passa a incluir PG filhos diretos

## Data

2026-11-19

## Lab relacionado

Lab 02 - Projection Engine  
Lab 05 - Context Assembly

## Contexto

Documentos importados sem titulos markdown geram `DC -> PG -> SN`. `projectDC` so percorre filhos `SS`, entao esses documentos projetam apenas o cabecalho, perdendo todo o conteudo. Confirmado em 2026-11-19: importar "Primeiro.\n\nSegundo." e projetar o DC retorna "# Untitled Document".

## Decisao

`projectDC` passa a projetar tambem filhos `PG` diretos, na ordem de `orderIndex`, junto com os `SS`. O JSON do DC ganha o campo `paragraphs` (mesmo formato de MS), mantendo `sections`.

## Alternativas consideradas

- Forcar o Lab 01 a criar uma secao implicita para documentos sem titulo
- Corrigir apenas na montagem, mantendo a projecao com perda

## Motivo

A perda esta na projecao, que e a fonte do conteudo; corrigir so na montagem violaria a invariante `assemble = project`. Criar secao implicita alteraria o mapeamento e os FCIDs de documentos existentes.

## Impacto

- Projection Engine: documentos sem titulos passam a projetar o conteudo; mudanca aditiva no JSON.
- Artifact Mapping: nenhuma mudanca.

## Status

Aceita

## Observacoes

O titulo do DC continua saindo como "Untitled Document", pois o DC guarda apenas `resourceKey` no metadata. Fora do escopo do Lab 05.

Aprovada e implementada em 2026-11-19 (EXP-008); coberta pelo teste C02.

# ADR-011 - Projecao sintetica como view calculada, sem persistencia e sem arestas

## Data

2026-11-19

## Lab relacionado

Lab 06 - Synthetic Projection  
Lab 04 - Evolution & Lineage  
Lab 05 - Context Assembly

## Contexto

O Lab 06 precisa criar views ineditas (documento, conversa, selecao livre) a partir de artefatos de origens diferentes. A forma mais direta seria criar um novo DC ou CH com arestas `contains` para PG/MS que ja existem, ou persistir uma definicao em tabelas novas.

## Decisao

- Uma projecao sintetica e uma view calculada a cada pedido: nao recebe FCID, nao e persistida, nao cria arestas em `artifact_edges` e nao altera nenhuma fonte.
- O que identifica a view e o pedido que a gerou. Selecao manual e template sao reproduziveis pelo proprio pedido; a selecao aleatoria devolve a seed e e reproduzivel por ela.
- Reaproveitar o Assembly Engine do Lab 05 para renderizar cada item e expandir as referencias do conteudo.
- Invariantes verificaveis: sintese de todas as MS de um chat = projecao do CH; sintese dos PG de uma secao = montagem do SS com range; nenhuma linha dos artefatos, arestas, lineage ou eventos muda.

## Alternativas consideradas

- Novo DC/CH com arestas `contains` para artefatos existentes (filhos compartilhados)
- Persistir a definicao da sintese em tabelas novas (listar, reabrir, nomear)
- Copiar o conteudo para artefatos novos

## Motivo

Filhos compartilhados corrompem a view: o Lab 04 assume um unico pai por artefato. Verificado em 2026-11-19: um DC novo contendo os PG de um documento perdeu a primeira frase, sem erro, depois que um desses PG foi dividido pelo Lab 04 (a divisao trocou o PG apenas no primeiro pai; o outro ficou apontando para um PG substituido e vazio). Copiar conteudo duplicaria a fonte de verdade. Persistir uma definicao adiciona CRUD e migration sem ser necessario para responder a pergunta do lab; a view e descartavel por principio (projecao nao e fonte de verdade).

## Impacto

- Artifact Mapping: nenhuma mudanca de schema.
- Projection Engine e FCAS Resolution: nenhuma mudanca; o Lab 06 apenas consome o Lab 05.
- Evolution & Lineage: itens substituidos seguem a regra da ADR-005.

## Status

Aceita

## Observacoes

Persistir projecoes sinteticas fica como evolucao futura e deve decidir antes se a definicao referencia FCIDs (acompanha a evolucao) ou guarda um instantaneo. Detalhamento em `docs/lab 06.md`.

Aprovada e implementada em 2026-11-19 (EXP-010) em `src/core/lab06Service.ts`. A unica mudanca em codigo anterior foi exportar `normalizeTarget` de `lab05Service`. Achado por teste de mutacao: a montagem segue o lineage, entao um artefato substituido que fosse sorteado seria trocado em silencio pelo atual no manifest; so o filtro de estado do pool impede isso (ver ADR-014).

# ADR-012 - Kinds, tipos aceitos e modos da sintese

## Data

2026-11-19

## Lab relacionado

Lab 06 - Synthetic Projection

## Contexto

O spec lista cinco funcionalidades (Document Synthesis, Chat Synthesis, Random Projection, Selection Projection, FCAS-Based Projection) sem definir quais tipos cada uma aceita nem como os itens sao combinados.

## Decisao

- `kind` define a forma da view e valida os tipos dos itens: `document` aceita SN, PG e SS; `chat` aceita MS; `view` aceita SN, PG, SS e MS. DC, CH, WS, PJ e DR nao sao aceitos como item.
- Tres modos mutuamente exclusivos por pedido: `items` (selecao), `random` e `template`. `template` aceita apenas `document` e `view`.
- Cada item vira um bloco; os blocos sao separados por uma linha em branco, na ordem informada (no random, na ordem do sorteio). Itens repetidos sao permitidos.
- `title` e aceito em `document` e `view` (`# titulo` em markdown, titulo simples em text) e recusado em `chat`.
- Modo template reutiliza as regras de expansao da ADR-009: referencia sozinha no paragrafo expande qualquer alvo; no meio do texto, apenas SN e PG.

## Alternativas consideradas

- Aceitar DC e CH como item
- Combinar SN consecutivos no mesmo paragrafo
- Um endpoint por funcionalidade do spec
- Permitir titulo em chat

## Motivo

Documento e chat inteiros ja sao montados pelo Lab 05; como item duplicariam cabecalhos. Cada item como bloco e previsivel e independe do tipo vizinho. Um unico endpoint com `kind` e modo cobre as cinco funcionalidades sem sobreposicao. Chats nao tem titulo na projecao do Lab 02.

## Impacto

- Projection Engine: nenhum.
- FCAS Resolution: itens por FCAS reutilizam o resolver (inclusive `[[::chat<n>]]` e `[[doc#Secao]]`).

## Status

Aceita

## Observacoes

Um chat sintetico exige itens MS explicitos; o modo template nao o cobre.

Aprovada e implementada em 2026-11-19 (EXP-010). As regras de modo unico, titulo e template em chat sao validadas no schema (400); o tipo dos itens e validado no servico (422), depois de resolver o item, pois depende do tipo atual apos o lineage.

# ADR-013 - Selecao explicita e estrita, referencias no conteudo sao lenientes

## Data

2026-11-19

## Lab relacionado

Lab 06 - Synthetic Projection  
Lab 05 - Context Assembly

## Contexto

A ADR-009 definiu que uma referencia invalida dentro do conteudo vira warning e nunca derruba a montagem. O Lab 06 tem dois tipos de entrada: referencias dentro de um template e itens escolhidos explicitamente.

## Decisao

- Itens escolhidos explicitamente (modo selection) sao estritos e falham o pedido, sempre com a `position` do item: inexistente 404 `ITEM_NOT_FOUND`, invalido 422 `INVALID_ITEM`, tipo fora do kind 422 `ITEM_TYPE_NOT_ALLOWED` (com `allowed`), dividido 409 `ITEM_AMBIGUOUS` (com `candidates`).
- Referencias dentro de template ou do conteudo dos itens continuam lenientes: ficam literais e geram warning, conforme a ADR-009. Warnings vindos de um item trazem sua `position`.
- Item substituido com um unico descendente ativo usa o atual, com `evolvedFrom` no manifest; dividido nao e resolvido (ADR-005).

## Alternativas consideradas

- Descartar itens invalidos e registrar warning
- Falhar tambem por referencias invalidas no template
- Expandir um item dividido concatenando as partes

## Motivo

O usuario escolheu cada item; omitir um em silencio mudaria o significado da view sem aviso. Referencias dentro de texto sao incidentais e ja seguem a regra do Lab 05. Manter a ambiguidade como erro replica o resolver do Lab 03 e a ADR-009.

## Impacto

- FCAS Resolution: nenhuma mudanca.
- Evolution & Lineage: consome `current` como o Lab 05.

## Status

Aceita

## Observacoes

Mapeamento a partir dos erros do Lab 05: NOT_FOUND vira ITEM_NOT_FOUND, INVALID_TARGET vira INVALID_ITEM, UNSUPPORTED_SCOPE vira ITEM_TYPE_NOT_ALLOWED, AMBIGUOUS vira ITEM_AMBIGUOUS.

Aprovada e implementada em 2026-11-19 (EXP-010). Itens sao processados em ordem e o primeiro erro interrompe o pedido; nenhuma fonte e alterada, inclusive nos pedidos que falham (invariante I4).

# ADR-014 - Selecao aleatoria reproduzivel por seed

## Data

2026-11-19

## Lab relacionado

Lab 06 - Synthetic Projection

## Contexto

A Random Projection precisa sortear artefatos. Um sorteio nao reproduzivel impediria reabrir uma view sintetica sem persisti-la (ADR-011).

## Decisao

- O pool e formado pelos artefatos do tipo pedido (SN, PG, SS ou MS) em estado `active`; com `scope`, apenas os descendentes do alvo do scope (resolvido pelo Lab 03).
- O pool e ordenado por FCID e o sorteio e uma embaralhada parcial (Fisher-Yates) com PRNG mulberry32 inicializado pela `seed`. A ordem da view e a ordem do sorteio.
- Sem `seed`, o servidor gera uma de 32 bits e a devolve; com a mesma seed, tipo, count e pool, o resultado e identico.
- `count` vai de 1 a 50; acima do tamanho do pool e reduzido (`random.picked` informa); pool vazio retorna 422 `EMPTY_POOL`.

## Alternativas consideradas

- `Math.random` sem seed
- Persistir os FCIDs sorteados
- Reduzir o count silenciosamente sem informar o total sorteado
- Sorteio ponderado ou filtrado por conteudo

## Motivo

Seed devolvida dispensa persistencia e torna o resultado verificavel por teste. Ordenar o pool por FCID remove a dependencia da ordem de insercao do banco. Informar `picked` e `poolSize` evita surpresa quando o pedido excede o pool.

## Impacto

- Artifact Mapping: nenhum.
- Evolution & Lineage: artefatos substituidos nao fazem parte do grafo estrutural e nunca entram no pool; a mesma seed pode sortear diferente depois de uma evolucao, pois o pool mudou.

## Status

Aceita

## Observacoes

A reproducao e garantida enquanto o pool nao mudar. mulberry32 nao e criptografico e serve apenas a reproducao.

Aprovada e implementada em 2026-11-19 (EXP-010). `random.poolSize` e o tamanho do pool depois do filtro de `scope`. O filtro de estado `active` e necessario mesmo com a montagem seguindo o lineage: sem ele um artefato substituido seria sorteado e aparece no manifest como o seu substituto, possivelmente duplicado. Um artefato substituido ja sai de qualquer `scope`, pois nao tem pai estrutural.
