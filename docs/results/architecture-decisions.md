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
