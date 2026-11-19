# Recursos de teste: pão caseiro

Conteúdo de teste para a POC, todo sobre o mesmo assunto não técnico: assar pão em casa. Cinco documentos markdown e três chats.

## Documentos

| Arquivo | Estrutura | O que exercita |
| ------- | --------- | -------------- |
| `pao-caseiro-guia-iniciante.md` | texto antes do primeiro título, títulos até o nível 3 | texto introdutório (ADR-016), seções aninhadas, referência FCAS em bloco |
| `ingredientes-basicos.md` | títulos até o nível 3 | seções aninhadas, alvo de uma referência |
| `fermentacao-natural.md` | títulos até o nível 3 | seções aninhadas, referência FCAS em bloco |
| `erros-comuns-e-solucoes.md` | títulos de nível 1 e 2, parágrafos duplos | alvo de uma referência, recorte por janela (Lab 05) |
| `diario-de-fornada.md` | **sem nenhum título** | documento só com parágrafos, referência a uma mensagem de chat |

## Chats

Cada `.json` tem o formato que a API recebe: `resourceKey`, `title` e a lista `messages` com `role` e `text`.

| Arquivo | Chave | Mensagens | Observação |
| ------- | ----- | --------- | ---------- |
| `chat-duvidas-iniciante.json` | `::padaria-duvidas-iniciante` | 8 | a mensagem 2 tem texto antes de títulos e duas seções |
| `chat-fermento-natural.json` | `::padaria-fermento-natural` | 6 | só parágrafos |
| `chat-pao-nao-cresceu.json` | `::padaria-pao-nao-cresceu` | 7 | começa com uma mensagem `system`; a mensagem 3 tem seções |

## Como importar

**Documentos:** use `resourceKey` igual a `docs/<nome-do-arquivo>` (é o valor que o upload da UI preenche) e o nome do arquivo sem `.md` como título. As referências dentro dos arquivos usam essa chave.

**Chats:** crie o chat com a chave e o título do arquivo (`POST /v1/lab01/chat/create`) e envie as mensagens na ordem (`POST /v1/lab01/chat/:chatFcid/messages`, uma chamada por item de `messages`).

## Referências FCAS usadas

Três referências, todas sozinhas em um parágrafo (por isso são expandidas pelo Lab 05):

```txt
pao-caseiro-guia-iniciante.md   [[docs/ingredientes-basicos.md#Farinha]]
fermentacao-natural.md          [[docs/erros-comuns-e-solucoes.md#A massa não cresceu]]
diario-de-fornada.md            [[::padaria-duvidas-iniciante<4>]]
```

A última só expande se o chat `::padaria-duvidas-iniciante` tiver sido importado. Sem ele, a montagem devolve o aviso `NOT_FOUND` e mantém o texto como está, o que também serve de caso de teste.
