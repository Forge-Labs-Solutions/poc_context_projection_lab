## 2. Experiment Results

Arquivo recomendado:

```txt
/docs/lab/experiment-results.md
```

### Objetivo

Registrar os resultados dos experimentos executados durante a POC.

### Quando registrar

O Codex deve registrar um experimento quando:

```txt
- validar um fluxo
- executar um teste manual
- confirmar uma hipótese
- invalidar uma hipótese
- encontrar comportamento inesperado
- descobrir limitação técnica
- produzir evidência para mudar a arquitetura
```

### Template

```md
# EXP-000 — Título do experimento

## Data

YYYY-MM-DD

## Lab relacionado

Lab 01 — Artifact Mapping  
Lab 02 — Projection Engine  
Lab 03 — FCAS Resolution

## Hipótese

O que este experimento tentou validar?

## Procedimento

Passos executados.

## Entrada

Dados usados no teste.

## Resultado observado

O que aconteceu.

## Resultado esperado

O que deveria acontecer.

## Conclusão

Validado | Parcialmente validado | Não validado

## Evidências

Logs, prints, arquivos, outputs ou exemplos.

## Decisões derivadas

Referenciar ADRs relacionadas, se houver.

## Pendências

O que precisa ser ajustado ou testado depois.
```