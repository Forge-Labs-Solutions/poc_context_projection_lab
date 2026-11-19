## 3. Regra para o Codex

Adicionar ao `AGENTS.md` ou instruções do projeto:

```md
# Lab Development Recording Rules

Durante o desenvolvimento do Context Projection Lab, o agente deve manter registros arquiteturais e experimentais.

## Architectural Decisions

Sempre que uma decisão técnica ou arquitetural relevante for tomada, atualizar:

/docs/results/architecture-decisions.md

Usar o formato ADR.
Leia /docs/lab/architecture-decisions-instructions.md

## Experiment Results

Sempre que um experimento ou validação for executado, atualizar:

/docs/results/experiment-results.md

Usar o formato EXP.
Leia /docs/lab/experiment-results-instructions.md

## Regra importante

Não tomar decisões arquiteturais silenciosas.

Se uma decisão impactar FCID, FCAS, Artifact Mapping, Projection Engine ou Reference Resolution, ela deve ser registrada.

## Escopo inicial

Registrar decisões e experimentos relacionados a:

- Lab 01 — Artifact Mapping
- Lab 02 — Projection Engine
- Lab 03 — FCAS Resolution
- Lab 04 — Evolution & Lineage
- Lab 05 — Context Assembly
- Lab 06 — Synthetic Projection
```