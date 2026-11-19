# Context Projection Lab - Bootstrap

Bootstrap tecnico da POC da Parte 2 do ForgeOS com Node.js, TypeScript, Fastify, Drizzle e SQLite.

## Setup em 5 passos

A POC usa **pnpm** (igual ao `forgeos` e ao `forge-hub`), na versao 11 ou superior: o `pnpm-workspace.yaml` usa `allowBuilds` para liberar o build nativo do `better-sqlite3` e do `esbuild`. Nao use `npm install`; o `package-lock.json` foi removido.

1. Instale dependencias:
```bash
pnpm install
```

2. Crie o arquivo de ambiente:
```bash
cp .env.example .env
```

3. Gere as migrations:
```bash
pnpm run db:generate
```

4. Aplique migrations e popule dados:
```bash
pnpm run db:migrate
pnpm run seed
```

5. Suba a API:
```bash
pnpm run dev
```

## Scripts

- `pnpm run dev`: sobe API em modo desenvolvimento.
- `pnpm run build`: compila TypeScript para `dist/`.
- `pnpm run start`: executa build compilado.
- `pnpm run test`: roda testes automatizados.
- `pnpm run db:generate`: gera migration com Drizzle.
- `pnpm run db:migrate`: aplica migrations no SQLite.
- `pnpm run seed`: reseta e popula dataset base (`WS_MAIN` + 2 projetos).
- `pnpm run lab015:migrate --source <copia de forgeos.db>`: migra os chats de uma **copia** do banco do ForgeOS para o banco da POC (`DATABASE_URL`), em modo somente leitura; gera o relatorio em `data/lab015-report/`. O caminho do banco original (`.forgeos/forgeos.db`) e recusado.

## Endpoints

- `GET /health`
- `GET /v1/artifacts`
- `GET /v1/artifacts/:fcid`
- `GET /v1/graph`
- `POST /v1/seeds/reset`
- `POST /v1/lab01/import/document`
- `POST /v1/lab01/chat/create`
- `POST /v1/lab01/chat/import`
- `POST /v1/lab01/chat/:chatFcid/messages`
- `POST /v1/lab01/projection/remove`
- `GET /v1/lab01/explorer/artifacts`
- `GET /v1/lab01/explorer/artifacts/:fcid`
- `GET /v1/lab01/validation/:projectionId`
- `POST /v1/lab02/project`
- `POST /v1/lab03/parse`
- `POST /v1/lab03/resolve`
- `POST /v1/lab03/references`
- `POST /v1/lab03/project-fcas`
- `POST /v1/lab04/edit`
- `POST /v1/lab04/semantic-change`
- `POST /v1/lab04/classify`
- `POST /v1/lab04/split`
- `POST /v1/lab04/merge`
- `POST /v1/lab04/regenerate`
- `GET /v1/lab04/lineage/:fcid`
- `GET /v1/lab04/current/:fcid`
- `GET /v1/lab04/references/:referenceId`
- `POST /v1/lab05/assemble`
- `POST /v1/lab05/expand`
- `POST /v1/lab06/synthesize`

Documentacao basica:
- `docs/endpoints.md`

## Exemplos de chamadas

```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1/artifacts
curl http://localhost:3000/v1/artifacts/DC_ARCH
curl http://localhost:3000/v1/graph
curl -X POST http://localhost:3000/v1/seeds/reset
```
