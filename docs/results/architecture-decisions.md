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

Em 2026-11-19 a aba Synthesis (Lab 06) seguiu a mesma regra, a pedido do usuario, para acompanhar o teste com os recursos de pao caseiro. Tres modos (Items, Random, Template), `kind`, titulo, seed, escopo, `maxDepth`, formato e expansao; o clique na arvore monta a entrada (acrescenta um item, define o escopo ou acrescenta ao template). O painel so consome `POST /v1/lab06/synthesize` e nao grava nada.

Ainda em 2026-11-19, os dois campos da aba FCAS passaram a ficar em variaveis do modulo (`fcasText`, `fcasSourceText`), como Assembly e Synthesis: a tela se redesenhava depois do Parse e esvaziava o campo (EXP-016).

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

Correcao de 2026-11-19 (ADR-015, EXP-011): a afirmacao "artefatos substituidos nunca entram no pool" valia apenas para o MS. Os filhos de um MS regenerado continuavam `active` e eram sorteados (defeito D1 da revisao de conformidade). Corrigido na ADR-015 e coberto pelo teste C23 para SN, PG e MS.

# ADR-015 - Regenerate substitui toda a subarvore da mensagem

## Data

2026-11-19

## Lab relacionado

Lab 04 - Evolution & Lineage  
Lab 06 - Synthetic Projection

## Contexto

A revisao de conformidade (`docs/06. evolucao-e-roadmap/revisao_poc_2026-11-19.md`, D1) mostrou que `POST /v1/lab04/regenerate` marcava como `superseded` apenas o MS. O PG e o SN dele continuavam `active` e ligados a ele. Verificado executando: o sorteio do Lab 06 sorteou "Stale answer sentence." de uma mensagem ja substituida, e esses artefatos ainda podiam ser editados. Split e merge nao tem o problema, porque esvaziam o artefato antigo (`rewriteChildren`).

## Decisao

- Ao regenerar, o MS e todos os seus descendentes (pelas arestas `contains`) passam a `superseded` na mesma transacao.
- As arestas do MS antigo para os seus filhos sao mantidas: a projecao do MS antigo por FCID continua mostrando o conteudo antigo, como historico.
- O evento `regenerate` guarda a lista `descendants` em `before`.
- Invariante: um artefato `active` nunca esta abaixo de um ancestral `superseded`.

## Alternativas consideradas

- Esvaziar o MS antigo, como split e merge fazem (perderia a leitura do historico por FCID)
- Manter o estado como estava e excluir os descendentes de substituidos apenas no pool do Lab 06 (deixaria o estado inconsistente e exigiria o mesmo filtro em cada consumidor futuro)

## Motivo

Corrige a causa, nao um sintoma: o estado do conteudo passa a refletir o estado do container, e todos os consumidores (pool do Lab 06, bloqueio de edicao do Lab 04, resolucao de referencias) herdam o comportamento correto.

## Impacto

- Evolution & Lineage: operar sobre um SN ou PG de uma mensagem regenerada retorna 409 `SUPERSEDED`.
- FCAS Resolution: uma referencia para um SN ou PG dentro de uma mensagem regenerada nao tem descendente ativo e passa a `orphaned` (antes resolvia para o texto antigo). `[[SN_antigo]]` deixa de resolver.
- Synthetic Projection: o pool aleatorio volta a conter apenas conteudo atual.
- Projection Engine e Context Assembly: nenhuma mudanca.

## Status

Aceita

## Observacoes

Complementa a ADR-004 e a ADR-005 (o que e `superseded` sai do grafo e dos consumidores) e corrige o alcance da afirmacao da ADR-014. Coberta pelos testes C17 (Lab 04) e C23 (Lab 06). Dados ja gravados antes da correcao nao sao reparados: mensagens regeneradas antes dela ainda tem filhos `active`.

# ADR-016 - Texto antes do primeiro titulo vira PG do documento ou da mensagem

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 02 - Projection Engine

## Contexto

A revisao de conformidade (D2) mostrou que `parseMarkdownSections` descartava em silencio o texto que vem antes do primeiro titulo quando o documento tem algum titulo: importar "Preface before any heading.\n\n# Heading\n\nBody text." guardava apenas "Body text.". O mesmo vale para mensagens de chat. Alem disso, `projectMS` so renderizava os PG quando a mensagem nao tinha nenhuma SS.

## Decisao

- O texto antes do primeiro titulo e persistido como PG filhos diretos do DC ou do MS, em ordem (`orderIndex` 0 a n-1), seguidos das SS (a partir de n).
- `projectMS` passa a renderizar SS e PG na ordem das arestas. Para mensagens so com PG ou so com SS, a saida e a mesma de antes. O `projectDC` ja fazia isso (ADR-010).
- Documentos e mensagens sem nenhum titulo continuam no caminho existente (DC ou MS com PG diretos).
- O Lab 05 conta o texto introdutorio como o primeiro filho da janela (`range`).

## Alternativas consideradas

- Uma SS implicita para o texto introdutorio (inventaria um titulo e mudaria a resolucao de `[[doc#Secao]]`)
- Manter o descarte e documentar a limitacao
- Rejeitar a importacao de texto com conteudo antes do primeiro titulo

## Motivo

Descartar conteudo em silencio contradiz o Lab 01 (conteudo cognitivo independente da projecao). PG direto reaproveita um formato que o Lab 01 ja gera para texto sem titulos e que o `projectDC` ja projeta, sem inventar artefato nem titulo.

## Impacto

- Artifact Mapping: documentos e mensagens importados a partir de agora ganham PG antes das SS. O que ja foi importado nao muda.
- Projection Engine: mudanca aditiva em `projectMS`.
- FCAS Resolution: nenhuma mudanca; PG direto nao tem titulo e nao e alvo de `[[doc#Secao]]`.

## Status

Aceita

## Observacoes

Coberta pelos testes de api.test.ts ("text before the first heading"). Nao corrige dados ja importados: o texto descartado antes nao volta, e reimportar o mesmo `resourceKey` duplica a arvore (D7). O defeito D3 (documento sem nenhum titulo nao gera SS) segue aberto.


# ADR-017 - Sintaxe FCAS unificada (intervalo de chat, conceito, referencia nomeada, projeto e diretorio por nome)

## Data

2026-11-19

## Lab relacionado

Lab 03 - FCAS Resolution  
Lab 05 - Context Assembly

## Contexto

A revisao de conformidade (D5, D6) e o plano (P1, P4) deixaram a sintaxe FCAS sem decisao:

- `[[$PJ_LABS]]` resolvia para `PJ_CORE`: projeto e diretorio devolviam "o primeiro" do tipo, e a reconstrucao de FCAS perdia o nome.
- `[[::chat<1-3>]]` caia no caso de diretorio e gerava aviso enganoso.
- O ForgeOS ja implementa `[[#slug]]` (conceito) e `[[@nome]]` (referencia nomeada), que a POC nao reconhecia.

## Decisao

A POC reconhece uma sintaxe unica:

| Forma | Significado |
| --- | --- |
| `[[FCID]]` | forma canonica e estavel |
| `[[doc.md]]`, `[[doc.md#Secao]]` | documento e secao |
| `[[::chat]]` | chat inteiro (expansao em bloco usa o chat inteiro) |
| `[[::chat<N>]]` | mensagem N |
| `[[::chat<A-B>]]` | intervalo fechado de mensagens, a partir de 1 |
| `[[$workspace]]`, `[[$Nome]]` | workspace; projeto pelo nome ou pelo FCID do projeto |
| `[[Nome]]` | diretorio pelo nome |
| `[[#slug]]`, `[[#slug#Secao]]` | conceito (mantida, como no ForgeOS; so reconhecida) |
| `[[@nome]]` | referencia nomeada (so reconhecida) |

Regras:

- **Intervalo:** `<A-B>` exige `A >= 1` e `B >= A`, senao a FCAS e invalida (400). O resolver devolve o chat e `range`, e quem chama aplica a janela. `B` acima do total e reduzido ao total; `A` acima do total e `INVALID_RANGE` (aviso na expansao, erro 422 na montagem). Na montagem, `[[::chat<A-B>]]` como alvo equivale a `range`; informar os dois retorna 400.
- **Nome:** projeto e diretorio sao encontrados pelo `title` do artefato, sem diferenciar maiusculas nem espacos nas pontas. Projeto tambem pode ser encontrado pelo FCID. Nenhum caso volta ao "primeiro". Nome compartilhado retorna 409 `AMBIGUOUS_NAME` com os candidatos; nome inexistente retorna 404. Os projetos do seed ganharam `title` (`ForgeOS`, `Labs`).
- **Reconstrucao:** FCID para FCAS devolve o nome so quando ele ainda e lido como o mesmo tipo e e unico; caso contrario devolve o FCID (`[[$PJ_X]]` para projeto, `[[DR_X]]` para diretorio). Isso cobre um diretorio chamado `#x` ou `colisao.md`.
- **Conceito e referencia nomeada:** sao parte da sintaxe e ficam reservadas. A POC nao tem conceitos nem nomes de referencia, entao responde 422 `UNSUPPORTED_SYNTAX` (aviso `UNSUPPORTED_TARGET` na expansao) em vez de interpretar errado. Alias nao e um artefato a parte: e uma referencia (`REF_*`) com nome que aponta para uma estrutura FCAS ou um FCID.
- **Formas em linha:** `#slug` e `@@nome` soltos no texto nao sao lidos; a POC so le o que esta entre `[[ ]]`.

## Alternativas consideradas

- Remover `[[#conceito]]` da sintaxe da POC (rejeitada: ja esta implementada no ForgeOS).
- Tratar alias como um tipo de artefato proprio (rejeitada: e uma referencia nomeada).
- Manter projeto e diretorio devolvendo o primeiro (rejeitada: D5).
- Resolver `[[::chat]]` como ultimas N, resumo ou ranking (adiada para o EPIC 23).

## Motivo

Fecha D5 e D6 e a decisao do `[[::chat]]` pedida pelo P4 sem criar nada que a POC nao possa provar. Os formatos de conceito e referencia nomeada seguem o ForgeOS.

## Impacto

- FCAS Resolution: `parseFcas` ganhou `concept`, `alias` e `messageRange`; `resolveFcasToFcid` devolve `range` e novos erros.
- Context Assembly: janela de chat na expansao (`selection` no manifesto) e na montagem.
- Synthetic Projection: um item `[[::chat<A-B>]]` e recusado em `view`, `document` e `chat`, porque o alvo e um CH (`ITEM_TYPE_NOT_ALLOWED`). Itens de chat por intervalo ficam fora do Lab 06.
- Referencia criada com intervalo grava o chat como alvo e o intervalo em `fcas_raw`.
- Bancos criados antes desta decisao tem projetos sem `title`: so o endereco por FCID (`[[$PJ_LABS]]`) resolve neles.

## Status

Aceita

## Observacoes

Testes F01 a F12b e F16 a F21 (`src/tests/fcas.test.ts`). O ADR da sintaxe unificada do P1 fica fechado por este registro, exceto o alinhamento de `[[#conceito]]` e referencia nomeada com um resolvedor real, que depende do EPIC 24.

# ADR-018 - Prefixo REF_ para Reference Artifacts

## Data

2026-11-19

## Lab relacionado

Lab 03 - FCAS Resolution

## Contexto

A POC gerava `RF_xxxxxxxx`; o ForgeOS usa `REF_*` (EPIC 20). O plano decidiu `REF_*` (decisao 5) e deixou a troca para o P1.

## Decisao

`createReferenceArtifact` gera `REF_` mais 8 caracteres. **Atualizado em 2026-11-19 (Lab 01.5):** passa a gerar `REF_` mais 6 caracteres, o tamanho do `fcid` das referencias do ForgeOS (`REF_xxxxxx`, 10 caracteres no total), para a migracao preservar os ids sem tratamento especial. Os exemplos de `docs/lab 03.md` e `docs/lab 04.md` passam a usar `REF_A`.

## Alternativas consideradas

- Manter `RF_` e mapear na fronteira com o ForgeOS.
- Migrar ids ja gravados.

## Motivo

Os dados da POC sao descartaveis e a troca antes do EPIC 21 evita uma migracao depois.

## Impacto

- FCAS Resolution: so o gerador do id. A tabela `references` guarda o id como texto, sem mudanca de schema.
- Referencias ja gravadas continuam com `RF_`; nada as le pelo prefixo.
- `docs/lab/fcid-fcas-architecture.md` e o documento de origem e mantem o exemplo `RF_A`.

## Status

Aceita

## Observacoes

Teste F13.

# ADR-019 - Alvo orfao retorna ORPHANED, com causa e substituto do conteiner

## Data

2026-11-19

## Lab relacionado

Lab 03 - FCAS Resolution  
Lab 04 - Evolution & Lineage  
Lab 05 - Context Assembly  
Lab 06 - Synthetic Projection

## Contexto

A ADR-015 faz o `regenerate` superseder a subarvore da mensagem. Uma referencia a uma sentenca dessa subarvore fica sem descendente ativo (`orphaned` no Lab 04), mas o Lab 03, o Lab 05 e o Lab 06 respondiam `NOT_FOUND`, igual a um erro de digitacao.

## Decisao

Um FCID `superseded` sem descendente ativo passa a ser um estado proprio:

- **Lab 03:** `resolve` e `references` retornam 409 `ORPHANED` com `details.originalFcid`, `details.cause` (`eventId`, `operation`, `supersededRoot`) e `details.candidates`.
- **Lab 05:** na expansao, aviso `ORPHANED` (token literal) com `cause` e `candidates`; na montagem, erro 409 `ORPHANED`.
- **Lab 06:** item retorna 409 `ITEM_ORPHANED` com a posicao; scope orfao retorna 404 `SCOPE_NOT_FOUND` com `details.orphaned: true`.
- **Causa:** o ultimo evento de evolucao que tem o FCID em `inputs` ou em `before` (o `regenerate` guarda a subarvore em `before.descendants`). `candidates` sao as saidas desse evento: o contêiner que substituiu (por exemplo a nova `MS`), nao um mapeamento sentenca a sentenca.
- **Sem religacao automatica.** A referencia nao e reescrita; religar e uma acao explicita de quem escreveu. A continuidade automatica continua so por `evolves_from`, como na ADR-005.

## Alternativas consideradas

- Reescrever a referencia para o contêiner novo (rejeitada: mudanca de sentido gera FCID novo).
- Manter `NOT_FOUND` (rejeitada: esconde um caso que o usuario precisa distinguir).
- Casar a sentenca antiga com a nova por similaridade (adiada: heuristica fora do escopo da POC).

## Motivo

O usuario precisa saber que a referencia existia, por que parou de resolver e onde esta o contêiner que a substituiu.

## Impacto

- FCAS Resolution: tres classes de erro novas (`FcasOrphanedError`, `FcasNameAmbiguousError`, `FcasUnsupportedError`).
- Lineage: `findSupersession(fcid)` em `lab04Service.ts`.
- UI: o painel de manifesto mostra a causa e o substituto do contêiner.

## Status

Aceita

## Observacoes

Testes F22 a F27. Fecha a decisao pendente da ADR-015 sobre referencias orfas. Dados antigos nao sao reparados.

# ADR-020 - Documento sem titulos mantem DC > PG > SN

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping

## Contexto

O defeito D3 apontava que um documento sem titulos gera `DC > PG > SN`, e nao `DC > SS > PG > SN` como a especificacao descreve. A ADR-016 ja fez o texto antes do primeiro titulo virar PG filho direto do DC.

## Decisao

A especificacao muda, o codigo nao: um DC pode ter PG como filho direto. Isso vale para o texto antes do primeiro titulo (ADR-016) e para o documento que so tem esse texto, isto e, sem nenhum titulo. `DC > SS > PG > SN` descreve o documento com titulos.

## Alternativas consideradas

- Criar uma SS sem nome para o documento sem titulos (rejeitada: nao teria como ser endereçada por `[[doc#Secao]]` e seria uma segunda excecao ao mapeamento).

## Motivo

E o que a ADR-016 ja faz para o texto introdutorio; uma unica regra cobre os dois casos.

## Impacto

- Artifact Mapping: nenhum codigo muda. `docs/lab 01.md` descreve a hierarquia para documentos com titulos.
- Projection Engine: ja projeta PG direto do DC (ADR-010).
- FCAS Resolution: PG direto nao tem titulo e nao e alvo de `[[doc#Secao]]`.

## Status

Aceita

## Observacoes

Fecha D3. Decisao do usuario, que e dono da especificacao.

# ADR-021 - Chat criado entra como filho do workspace

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping

## Contexto

O defeito D4: `createChat` nao ligava o chat a nenhum pai e ele aparecia como raiz da arvore. Documentos importados sem pai ja ficam sob o workspace.

## Decisao

`createChat` cria a aresta `WS > CH`. Nao ha parametro de pai. Criar de novo o mesmo `resourceKey` nao duplica a aresta.

## Alternativas consideradas

- Aceitar `parentFcid` (PJ ou DR), como o import de documentos.
- Pendurar o chat em um DR "chats" do projeto padrao.

## Motivo

Decisao do usuario: o pai do chat e o workspace. Fica igual ao pai padrao de um documento importado sem pai.

## Impacto

- Artifact Mapping: nova aresta `WS > CH` a cada chat criado.
- UI: o painel Chat mostra o chat sob o WS; a aba Document continua sem chats, porque o filtro da aba ignora CH.
- Chats criados antes continuam sem pai; nada os repara.

## Status

Aceita

## Observacoes

Testes F14 e F15.


# ADR-022 - Reimportacao idempotente por alinhamento da arvore

## Data

2026-11-19

## Lab relacionado

Lab 01 - Artifact Mapping  
Lab 04 - Evolution & Lineage

## Contexto

O defeito D7: importar de novo o mesmo `resourceKey` reaproveitava o DC e duplicava `SS`, `PG` e `SN` abaixo dele; importar um diretorio de novo criava outro `DR` e deixava o DC com dois pais; `projection/remove` apagava o binding, e a proxima importacao criava um DC com FCID novo.

## Decisao

Uma `resourceKey` que ja tem binding e trazida ao texto novo, em uma transacao, sem recriar o que nao mudou:

1. **Alinhamento.** Os filhos de um mesmo pai, antigos e novos, sao alinhados por uma chave normalizada (`SS`: nivel e titulo; `PG`: texto; `SN`: texto, com a normalizacao do Lab 04). Primeiro a maior subsequencia comum (LCS, depois de tirar o prefixo e o sufixo iguais); o que sobra entre duas ancoras e pareado por posicao e tipo; o que ainda sobra e casado por chave em qualquer posicao (movido); o resto e removido ou criado.
2. **Regra de identidade do Lab 04.** Texto identico: nada. Mesma chave com texto cru diferente (maiuscula, pontuacao): `edit`. Dois `SN` pareados: `classifyChange` decide, `edit` (mesmo FCID) ou `semantic_change` (FCID novo, `evolves_from`). `SS` pareados: `edit` do titulo e do nivel. Elementos pareados do mesmo tipo, `PG` e `SS`, mantem o FCID e descem para os filhos.
3. **Dois eventos novos.** `remove` (entrada `[fcid]`, saida `[]`; `before` guarda o tipo, os metadados e a subarvore) deixa o elemento e a subarvore `superseded`, sem sucessor: uma referencia a eles passa a `orphaned`, com causa `remove` (ADR-019). `reimport` e um resumo por chamada que mudou algo (`kept`, `edited`, `replaced`, `removed`, `added`, `moved`, `metadata`, mais a lista de mudancas com o valor anterior). E a ultima escrita: se falhar, a transacao desfaz tudo.
4. **`projection/remove` mantem o binding.** O recurso removido nao resolve por nome (FCAS, `findBinding`) nem volta como nome em `FCID para FCAS`; importar de novo reativa a mesma projecao e reaproveita o mesmo DC.
5. **Diretorio:** identificado pelo pai e pelo titulo exato; importar de novo o reaproveita. **Documento:** um pai explicito move o documento; sem pai, ele fica onde esta.
6. **Chat:** `POST /v1/lab01/chat/import` cria o chat ou o leva a uma conversa. Mensagens com `fcid` sao casadas por ele; sem, por posicao e papel (papel diferente na mesma posicao substitui a mensagem). O chat fica sob o workspace (ADR-021). Criar o mesmo chat de novo reaproveita a projecao.

## Alternativas consideradas

- Substituir a subarvore inteira a cada reimportacao, como o `regenerate` (rejeitada: troca todos os FCIDs e orfa todas as referencias).
- Comparar so por posicao, sem LCS (rejeitada: inserir um paragrafo no meio trocaria o texto de todos os seguintes).
- Continuar apagando o binding no `remove` (rejeitada: o FCID do recurso mudaria na reimportacao).

## Motivo

E o mecanismo que a migracao incremental e reversivel precisa: a mesma entrada, repetida, nao muda nada; uma mudanca na entrada muda so o que ela tocou, pela regra de identidade ja aceita.

## Impacto

- Artifact Mapping: `importDocument` e `importDirectory` passam a reimportar; a resposta traz `reimport` (resumo, ou `null` na primeira importacao).
- Lineage: `EvolutionOperation` ganha `remove` e `reimport`; `applyEdit` e `applySemanticChange` foram extraidos do Lab 04 para rodar dentro de uma transacao.
- FCAS Resolution: recurso removido deixa de resolver por nome.
- Dados criados antes desta mudanca nao sao reparados.

## Status

Aceita

## Observacoes

Testes C01 a C20. Limites conhecidos: o pareamento por posicao dentro de um intervalo pode juntar dois paragrafos sem relacao (o `PG` mantem o FCID; as sentencas registram a evolucao); um bloco movido e alterado ao mesmo tempo vira remocao mais criacao; acima de 4 milhoes de celulas a parte do meio nao usa LCS e cai no pareamento por posicao.

# ADR-023 - Migracao dos chats do ForgeOS: FCIDs adotados, fonte somente leitura, relatorio com contagens

## Data

2026-11-19

## Lab relacionado

Lab 01.5 - Chat Migration & Idempotent Import

## Contexto

O plano (P2) pede a migracao Chat > Message do ForgeOS para `CH > MS > SS/PG > SN` numa copia do banco real, com a lista do que se perde e uma estrategia recomendada. O ForgeOS ja tem FCID em `chats`, `messages` e `cognitive_references`, no mesmo formato da POC.

## Decisao

- **Fonte.** Uma copia do banco do ForgeOS, aberta somente para leitura. O executavel recusa o caminho do banco original (`.forgeos/forgeos.db`) e o destino igual a fonte ou dentro de `.forgeos`. O relatorio traz agregados e nunca texto de mensagem; o banco de destino e o relatorio ficam em `data/` (fora do git).
- **Identidade.** `CH`, `MS` e `REF_` sao criados com o FCID da fonte. `SS`, `PG` e `SN` recebem FCID novo na primeira migracao e passam a seguir a ADR-022. Um FCID que ja existe fora do chat recusa o chat inteiro (uma transacao por chat) e entra no relatorio.
- **Chave do chat.** `::reference_name` quando o nome e unico entre todos os chats da fonte e seguro (sem `<`, `>`, `[`, `]`, quebra de linha); senao `::<fcid>`. A contagem usa todos os chats, para a chave nao mudar com `--include-deleted`.
- **Ordem.** `position` da fonte (base 0); `<N>` da POC e `position + 1`.
- **Metadados.** Os campos de origem (autor, destinatario, provedor, modelo, datas, projeto, estado, visibilidade) ficam em `metadata.source` do `CH` e da `MS`; mudanca neles na fonte e aplicada na proxima execucao.
- **Nao migrado por padrao:** chats `deleted` (`--include-deleted` os traz, marcados), referencias com alvo `concept`, `chat_lineage`, `aliases` e `concepts`. Tudo isso e contado no relatorio.
- **Referencias com alvo `message`** migram com o `REF_` preservado e o status da fonte (`resolved` ou `stale`), se a origem e o alvo foram migrados.
- **Fidelidade.** Cada mensagem e reconstruida e classificada: `exact`, `whitespace`, `structure` (todas as letras e numeros presentes, forma diferente: lista, tabela, codigo, citacao, enfase, regua) ou `loss`. Quebra de linha dentro de lista, tabela ou codigo conta como estrutura, nao como espaco.

## Alternativas consideradas

- Gerar FCIDs novos e guardar uma tabela de correspondencia (rejeitada: o ForgeOS e a POC ja usam o mesmo formato; a correspondencia seria uma segunda fonte de verdade).
- Criar artefatos para os conceitos e migrar as referencias a eles (adiada: e decisao do EPIC 21).
- Mapear `chat_lineage` para `evolves_from` (rejeitada: derivar um chat nao e evoluir um artefato).

## Motivo

O mesmo FCID dos dois lados permite comparar, repetir e reverter sem tabela de mapeamento. A fonte somente leitura e o relatorio sem texto tornam a execucao segura sobre dados reais.

## Impacto

- Novo modulo `forgeosMigration.ts`, o comando `npm run lab015:migrate` e `ChatMessageInput` com `fcid` e `metadata`.
- Atualiza a ADR-018: o `REF_` passa a ter 6 caracteres.
- Nao escreve no ForgeOS; nao migra de volta.

## Status

Aceita

## Observacoes

Testes C21 a C33 (com um banco sintetico no formato do ForgeOS) e a execucao real em EXP-014. Resultados e lacunas em `docs/results/lab-01.5-compatibilidade.md`.


# ADR-024 - Estabilidade da referencia: valida pelo FCID, `stale` quando o texto fica velho

## Data

2026-11-19

## Lab relacionado

Lab 03 - FCAS Resolution (Sub-Lab 03.5, Reference Stability)

## Contexto

O Sub-Lab 03.5 pede que a referencia continue valida ao renomear um documento, mover um diretorio e reorganizar a estrutura. A POC nao tinha nenhuma dessas operacoes, o status gravado da referencia era sempre `resolved` (D8), e o plano pede reconciliar os estados com os do ForgeOS (`resolved`, `unresolved`, `stale`, `broken`).

## Decisao

1. **Valida pelo FCID.** Uma referencia guarda o FCID do alvo e e valida enquanto o alvo esta ativo. Renomear, mover e reordenar nao trocam FCID, nao criam evento de evolucao (nao sao mudanca de conteudo, ADR-004 e ADR-005) e por isso nao invalidam referencia nenhuma.
2. **Tres operacoes explicitas:** `rename` (a chave de um documento ou chat; o titulo de um diretorio ou projeto), `move` (documento ou diretorio para o workspace, um projeto ou um diretorio, sem ciclo) e `reorder` (uma permutacao dos filhos de um pai: secoes, documentos, mensagens).
3. **Estados.**
   - `resolved`: o alvo esta ativo e o texto FCAS guardado ainda resolve para ele.
   - `stale`: o alvo esta ativo e valido pelo FCID, mas o texto guardado nao resolve mais para ele. Acontece ao renomear, ao reordenar mensagens (o `<N>` posicional aponta para outra) e quando dois diretorios passam a ter o mesmo nome.
   - `evolved`, `ambiguous` e `orphaned` continuam vindo da linhagem (ADR-005 e ADR-019) e sao calculados, nao gravados.
4. **O status gravado so guarda `resolved` e `stale`** e e sincronizado para todas as referencias depois de cada operacao estrutural. `GET /v1/lab03/references/:id` calcula na hora e devolve tambem o FCAS canonico do alvo.
5. **`refresh`** reescreve o texto guardado para o FCAS canonico e volta o estado a `resolved`. So vale com o alvo ativo (409 `TARGET_NOT_ACTIVE` nos outros casos) e nunca muda o alvo.
6. **Nomes.** Chave de documento: termina em `.md`, sem `#`, `[`, `]` ou quebra de linha, e nao comeca com `::`, `$`, `@` ou `#`. Chave de chat: comeca com `::`, sem `<`, `>`, `[`, `]`. A chave e unica por tipo (409 `CONFLICT`). Titulo de diretorio e de projeto nao e unico: o nome repetido e reportado como ambiguidade (ADR-017) e a referencia fica `stale`, com o FCID como endereco canonico.
7. **O nome antigo nao vira alias.** Depois de renomear, `[[nome-antigo.md]]` retorna 404.

## Mapeamento com o ForgeOS

| ForgeOS | POC |
| ------- | --- |
| `resolved` | `resolved` |
| `stale` | `stale`, com a definicao acima. [I] O significado exato do `stale` no ForgeOS nao foi verificado; ha 3 referencias `stale` no banco de teste |
| `unresolved` | nao existe: criar a referencia exige que ela resolva |
| `broken` | nao existe: o alvo nao pode sumir (a chave estrangeira o impede); o que perde o alvo ativo e `orphaned` |

## Alternativas consideradas

- Manter o nome antigo como alias (rejeitada: a referencia ja nao depende do nome e o alias esconderia o `stale`).
- Reescrever o texto guardado sozinho a cada operacao (rejeitada: o texto escrito por quem criou a referencia muda sem aviso; o `refresh` e explicito).
- Registrar evento de evolucao para renomear, mover e reordenar (rejeitada: o evento do Lab 04 descreve evolucao de conteudo).

## Motivo

A estabilidade da referencia vem de ela ser guardada por FCID; o que precisava ser decidido era o que significa o texto ficar velho, e quem corrige.

## Impacto

- FCAS Resolution: `lab035Service.ts`; rotas `POST /v1/lab03/rename`, `/move`, `/reorder`, `GET /v1/lab03/references/:id` e `POST /v1/lab03/references/:id/refresh`.
- Fecha o defeito D8 na parte do `references.status` que era sempre `resolved`. As verificacoes do Lab 01 (`projectionIsNotSourceOfTruth`, `separatesStructureAndContent`) seguem abertas.
- As referencias migradas do ForgeOS com status `stale` (ADR-023) passam a ter o status recalculado na proxima operacao estrutural.

## Status

Aceita

## Observacoes

Testes S01 a S20. Um `<N>` posicional e fragil por natureza: inserir no fim nao o muda, reordenar muda. A referencia por FCID nao tem esse problema.
