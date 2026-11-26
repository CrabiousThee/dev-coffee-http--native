# ☕ Dev Coffee API

API RESTful de gerenciamento de fila de pedidos da cafeteria **Dev Coffee**, desenvolvida para a Atividade Prática AP2 (Desenvolvimento Back-End).

**Autor:** Yuri de Souza Dias —  2026001065 - Desenvolvimento back end

## Como executar

Requisitos: Node.js 18 ou superior.

```bash
git clone https://github.com/<seu-usuario>/dev-coffee-http-native.git
cd dev-coffee-http-native
npm start
```

O servidor sobe em `http://localhost:3000` (use `PORT=4000 npm start` para mudar a porta).

## Modelo do recurso

```json
{ "id": 1, "client": "Nome do Cliente", "item": "Nome do Café/Produto", "status": "pendente" }
```

`status` aceita apenas: `"pendente"`, `"pronto"` ou `"cancelado"`.

## Endpoints

| Método | Rota | Sucesso | Erros |
|---|---|---|---|
| GET | `/orders` (filtro: `?status=pendente`) | 200 | — |
| GET | `/orders/:id` | 200 | 404 |
| POST | `/orders` | 201 | 400 |
| PATCH | `/orders/:id/status` | 200 | 400, 404 |
| DELETE | `/orders/:id` | 204 (sem corpo) | 404 |
| ANY | `/*` (rota/verbo não previsto) | — | 404 (JSON descritivo) |

## Exemplos (cURL)

**Criar pedido**
```bash
curl -i -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"client":"Ana","item":"Espresso"}'
# 201 -> {"id":1,"client":"Ana","item":"Espresso","status":"pendente"}
```

**Pedido inválido (campo faltando ou JSON malformado)**
```bash
curl -i -X POST http://localhost:3000/orders -d '{"client":"Ana"}'
# 400 -> {"error":"Campos obrigatórios: \"client\" e \"item\" (strings não vazias)."}
```

**Listar todos / filtrar por status**
```bash
curl -i http://localhost:3000/orders
curl -i "http://localhost:3000/orders?status=pendente"
```

**Buscar por ID**
```bash
curl -i http://localhost:3000/orders/1     # 200
curl -i http://localhost:3000/orders/99    # 404
```

**Atualizar status**
```bash
curl -i -X PATCH http://localhost:3000/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"pronto"}'                 # 200
curl -i -X PATCH http://localhost:3000/orders/1/status \
  -d '{"status":"entregue"}'               # 400
curl -i -X PATCH http://localhost:3000/orders/99/status \
  -d '{"status":"pronto"}'                 # 404
```

**Remover pedido**
```bash
curl -i -X DELETE http://localhost:3000/orders/1   # 204, corpo vazio
curl -i -X DELETE http://localhost:3000/orders/1   # 404
```

**Rota inexistente**
```bash
curl -i -X PUT http://localhost:3000/orders
# 404 -> {"error":"Rota não encontrada: PUT /orders"}
```

## Decisões de implementação

- **Body via streams:** `POST` e `PATCH` leem o corpo com `req.on('data')` e `req.on('end')`, com limite de 1 MB.
- **Tolerância a falhas:** `JSON.parse` fica dentro de `try/catch`; JSON malformado retorna 400 sem derrubar o processo.
- **Headers:** toda resposta com corpo envia `Content-Type: application/json; charset=utf-8`; a 204 não envia corpo nem `Content-Type`.
- **IDs:** sequenciais e nunca reutilizados após `DELETE`.
- **Roteamento:** feito manualmente sobre `URL` e `req.method`, sem bibliotecas.
