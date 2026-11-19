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
