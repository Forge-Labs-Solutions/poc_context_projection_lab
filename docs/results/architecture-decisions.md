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

