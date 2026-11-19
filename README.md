# Context Projection Lab - Bootstrap

Bootstrap tecnico da POC da Parte 2 do ForgeOS com Node.js, TypeScript, Fastify, Drizzle e SQLite.

## Setup em 5 passos

1. Instale dependencias:
```bash
npm install
```

2. Crie o arquivo de ambiente:
```bash
cp .env.example .env
```

3. Gere as migrations:
```bash
npm run db:generate
```

4. Aplique migrations e popule dados:
```bash
npm run db:migrate
npm run seed
```

5. Suba a API:
```bash
npm run dev
```

## Scripts

- `npm run dev`: sobe API em modo desenvolvimento.
- `npm run build`: compila TypeScript para `dist/`.
- `npm run start`: executa build compilado.
- `npm run test`: roda testes automatizados.
- `npm run db:generate`: gera migration com Drizzle.
- `npm run db:migrate`: aplica migrations no SQLite.
- `npm run seed`: reseta e popula dataset base (`WS_MAIN` + 2 projetos).

## Endpoints

- `GET /health`
- `GET /v1/artifacts`
- `GET /v1/artifacts/:fcid`
- `GET /v1/graph`
- `POST /v1/seeds/reset`
- `POST /v1/lab01/import/document`
- `POST /v1/lab01/chat/create`
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
