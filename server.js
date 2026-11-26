'use strict';

/**
 * Dev Coffee API (AP2 - Desenvolvimento Back-End)
 * -----------------------------------------------
 * API RESTful de pedidos, em memória, construída exclusivamente
 * com módulos nativos do Node.js (node:http). Sem dependências externas.
 */

const http = require('node:http');

const PORT = process.env.PORT || 3000;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB: protege contra corpos gigantes

// ---------------------------------------------------------------------------
// "Banco de dados" em memória
// ---------------------------------------------------------------------------
const VALID_STATUS = ['pendente', 'pronto', 'cancelado'];
let orders = [];
let nextId = 1; // ID sequencial; não é reutilizado após DELETE

// ---------------------------------------------------------------------------
// Helpers de resposta
// ---------------------------------------------------------------------------

/** Envia resposta JSON com o Content-Type exigido. */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  });
  res.end(body);
}

/** Envia 204 No Content: corpo vazio e sem Content-Type. */
function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

// ---------------------------------------------------------------------------
// Leitura do body via eventos de stream (data / end)
// ---------------------------------------------------------------------------

/**
 * Lê o corpo da requisição consumindo req.on('data') e req.on('end').
 * Resolve com o JSON já desserializado; rejeita com { code, message }.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        reject({ code: 413, message: 'Corpo da requisição excede o limite permitido.' });
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim() === '') {
        reject({ code: 400, message: 'Corpo da requisição vazio.' });
        return;
      }
      // JSON.parse protegido: entrada malformada nunca derruba o servidor
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject({ code: 400, message: 'JSON inválido ou malformado.' });
      }
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      reject({ code: 400, message: 'Erro ao ler o corpo da requisição.' });
    });
  });
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

// ---------------------------------------------------------------------------
// Handlers das rotas
// ---------------------------------------------------------------------------

function listOrders(res, query) {
  const status = query.get('status');
  const result = status === null ? orders : orders.filter((o) => o.status === status);
  sendJson(res, 200, result);
}

function getOrder(res, id) {
  const order = orders.find((o) => o.id === id);
  if (!order) return sendError(res, 404, `Pedido ${id} não encontrado.`);
  sendJson(res, 200, order);
}

async function createOrder(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendError(res, e.code, e.message);
  }

  if (!isPlainObject(body) || !isNonEmptyString(body.client) || !isNonEmptyString(body.item)) {
    return sendError(res, 400, 'Campos obrigatórios: "client" e "item" (strings não vazias).');
  }

  const order = {
    id: nextId++,
    client: body.client.trim(),
    item: body.item.trim(),
    status: 'pendente',
  };
  orders.push(order);

  res.setHeader('Location', `/orders/${order.id}`);
  sendJson(res, 201, order);
}

async function updateOrderStatus(req, res, id) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendError(res, e.code, e.message);
  }

  // Ordem das validações: corpo/status inválido (400) antes de existência (404)
  // conforme a especificação lista 400 antes de 404; ambos são tratados.
  if (!isPlainObject(body) || !VALID_STATUS.includes(body.status)) {
    return sendError(res, 400, `Status inválido. Valores aceitos: ${VALID_STATUS.join(', ')}.`);
  }

  const order = orders.find((o) => o.id === id);
  if (!order) return sendError(res, 404, `Pedido ${id} não encontrado.`);

  order.status = body.status;
  sendJson(res, 200, order);
}

function deleteOrder(res, id) {
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) return sendError(res, 404, `Pedido ${id} não encontrado.`);
  orders.splice(index, 1);
  sendNoContent(res);
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const segments = url.pathname.split('/').filter(Boolean); // "/orders/1/status" -> ["orders","1","status"]
  const method = req.method;

  if (segments[0] === 'orders') {
    // /orders
    if (segments.length === 1) {
      if (method === 'GET') return listOrders(res, url.searchParams);
      if (method === 'POST') return createOrder(req, res);
    }

    // /orders/:id  e  /orders/:id/status
    const rawId = segments[1];
    const isValidId = rawId !== undefined && /^\d+$/.test(rawId);

    if (isValidId) {
      const id = Number(rawId);

      if (segments.length === 2) {
        if (method === 'GET') return getOrder(res, id);
        if (method === 'DELETE') return deleteOrder(res, id);
      }

      if (segments.length === 3 && segments[2] === 'status' && method === 'PATCH') {
        return updateOrderStatus(req, res, id);
      }
    } else if (segments.length === 3 && segments[2] === 'status' && method === 'PATCH') {
      // PATCH com ID não numérico: o recurso não existe
      return sendError(res, 404, `Pedido "${rawId}" não encontrado.`);
    } else if (segments.length === 2 && (method === 'GET' || method === 'DELETE')) {
      return sendError(res, 404, `Pedido "${rawId}" não encontrado.`);
    }
  }

  // ANY /*: rota ou verbo não previsto
  sendError(res, 404, `Rota não encontrada: ${method} ${url.pathname}`);
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  router(req, res).catch((err) => {
    console.error('Erro inesperado:', err);
    if (!res.headersSent) sendError(res, 500, 'Erro interno do servidor.');
    else res.end();
  });
});

server.listen(PORT, () => {
  console.log(`Dev Coffee API rodando em http://localhost:${PORT}`);
});
