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

