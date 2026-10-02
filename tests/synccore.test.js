'use strict';
// node tests/synccore.test.js — dois "aparelhos" falsos conversando com um "servidor" falso que imita o gatilho do banco (vale o updated_at mais novo).
const assert = require('assert'), { createSync } = require('../synccore.js');

function fakeServer() {
  const rows = new Map(); let tick = 0, online = true;
  let batchTs = null; const iso = () => batchTs || new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + (++tick) * 1000).toISOString();
  return {
    set online(v) { online = v; },
    rows,
    transport: {
      async push(batch) {
        if (!online) throw new Error('sem rede');
        batchTs = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + (++tick) * 1000).toISOString(); // todas as linhas do lote recebem o mesmo now()
        for (const r of batch) { const k = r.kind + '|' + r.id, old = rows.get(k); if (old && r.updated_at < old.updated_at) continue; rows.set(k, { ...r, server_ts: iso() }); }
        batchTs = null;
      },
      async pull(since, limit, offset = 0) {
        if (!online) throw new Error('sem rede');
        const key = r => r.server_ts + '|' + r.kind + '|' + r.id;
        return [...rows.values()].filter(r => !since || r.server_ts > since).sort((a, b) => key(a).localeCompare(key(b))).slice(offset, offset + limit).map(r => JSON.parse(JSON.stringify(r)));
      }
    }
  };
}
function device(server, opt = {}) {
  const items = new Map(), dirty = {}; let cursor = null, seq = 0;
  const d = {
    items, dirty,
    put(kind, id, fields, at) { const it = { id, ...(items.get(kind + '|' + id) || {}), ...fields, updatedAt: at }; items.set(kind + '|' + id, it); dirty[kind + '|' + id] = { kind, id, seq: ++seq }; },
    del(kind, id, at) { items.delete(kind + '|' + id); dirty[kind + '|' + id] = { kind, id, del: true, at, seq: ++seq }; },
    title: (kind, id) => (items.get(kind + '|' + id) || {}).title,
    has: (kind, id) => items.has(kind + '|' + id)
  };
  d.sync = createSync({
    transport: server.transport, windowMs: opt.windowMs, pageSize: opt.pageSize,
    store: {
      getDirty: () => dirty, dropDirty: k => delete dirty[k],
      clearDirty: sent => sent.forEach(([k, s]) => { if (dirty[k] && dirty[k].seq === s) delete dirty[k]; }),
      getCursor: () => cursor, setCursor: c => { cursor = c; },
      get: (kind, id) => items.get(kind + '|' + id),
      apply: async (kind, id, it) => { if (it === null) items.delete(kind + '|' + id); else items.set(kind + '|' + id, JSON.parse(JSON.stringify(it))); }
    }
  });
  return d;
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('um aparelho cria, o outro recebe', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('sermon', 's1', { title: 'Bom Pastor' }, 100); await A.sync.run(); await B.sync.run();
  assert.equal(B.title('sermon', 's1'), 'Bom Pastor'); assert.deepEqual(A.dirty, {});
});
test('edição mais recente vence (nos dois sentidos)', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('sermon', 's1', { title: 'v1' }, 100); await A.sync.run(); await B.sync.run();
  B.put('sermon', 's1', { title: 'v2 do B' }, 200); await B.sync.run(); await A.sync.run();
  assert.equal(A.title('sermon', 's1'), 'v2 do B');
});
test('edições simultâneas offline: converge para a mais nova', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('sermon', 's1', { title: 'base' }, 100); await A.sync.run(); await B.sync.run();
  A.put('sermon', 's1', { title: 'A offline' }, 300); B.put('sermon', 's1', { title: 'B offline' }, 400);
  await A.sync.run(); await B.sync.run(); await A.sync.run();
  assert.equal(A.title('sermon', 's1'), 'B offline'); assert.equal(B.title('sermon', 's1'), 'B offline');
});
test('a edição mais ANTIGA enviada depois não sobrescreve a nova', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  B.put('sermon', 's1', { title: 'nova' }, 500); await B.sync.run();
  A.put('sermon', 's1', { title: 'antiga' }, 200); await A.sync.run();
  assert.equal(S.rows.get('sermon|s1').data.title, 'nova'); assert.equal(A.title('sermon', 's1'), 'nova');
});
test('exclusão se propaga e não ressuscita', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('pray', 'p1', { title: 'pedido' }, 100); await A.sync.run(); await B.sync.run();
  A.del('pray', 'p1', 300); await A.sync.run(); await B.sync.run();
  assert.equal(B.has('pray', 'p1'), false); await A.sync.run(); assert.equal(A.has('pray', 'p1'), false);
});
test('edição depois da exclusão (mais nova) ressuscita o item', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('ilus', 'i1', { title: 'x' }, 100); await A.sync.run(); await B.sync.run();
  A.del('ilus', 'i1', 300); await A.sync.run();
  B.put('ilus', 'i1', { title: 'editado depois' }, 400); await B.sync.run(); await A.sync.run();
  assert.equal(A.title('ilus', 'i1'), 'editado depois');
});
test('edição ANTES da exclusão perde para a exclusão', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('sermon', 's1', { title: 'x' }, 100); await A.sync.run(); await B.sync.run();
  B.put('sermon', 's1', { title: 'edit antigo' }, 250); // offline
  A.del('sermon', 's1', 300); await A.sync.run();
  await B.sync.run(); assert.equal(B.has('sermon', 's1'), false);
});
test('apaguei aqui sem rede e o servidor ainda tem a versão antiga: não volta', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('sermon', 's1', { title: 'x' }, 100); await A.sync.run(); await B.sync.run();
  S.online = false; B.del('sermon', 's1', 300); await assert.rejects(B.sync.run()); assert.ok(B.dirty['sermon|s1']);
  S.online = true; await B.sync.run(); await A.sync.run();
  assert.equal(B.has('sermon', 's1'), false); assert.equal(A.has('sermon', 's1'), false);
});
test('sem rede: nada se perde, tudo vai quando voltar', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  S.online = false; A.put('sermon', 's1', { title: 'a' }, 10); A.put('sermon', 's2', { title: 'b' }, 11);
  await assert.rejects(A.sync.run()); assert.equal(Object.keys(A.dirty).length, 2);
  S.online = true; await A.sync.run(); await B.sync.run();
  assert.equal(B.title('sermon', 's1'), 'a'); assert.equal(B.title('sermon', 's2'), 'b'); assert.deepEqual(A.dirty, {});
});
test('alteração feita DURANTE o envio não é descartada', async () => {
  const S = fakeServer(), A = device(S); A.put('sermon', 's1', { title: 'v1' }, 10);
  const orig = S.transport.push; S.transport.push = async b => { await orig(b); A.put('sermon', 's1', { title: 'v2' }, 20); };
  await A.sync.run(); assert.ok(A.dirty['sermon|s1'], 'continua pendente');
  S.transport.push = orig; await A.sync.run(); assert.equal(S.rows.get('sermon|s1').data.title, 'v2');
});
test('aparelho novo recebe tudo; várias páginas', async () => {
  const S = fakeServer(), A = device(S), B = device(S, { pageSize: 7 });
  for (let i = 0; i < 40; i++) A.put(i % 2 ? 'sermon' : 'ilus', 'x' + i, { title: 't' + i }, 100 + i);
  await A.sync.run(); await B.sync.run(); assert.equal(B.items.size, 40); assert.equal(B.title('ilus', 'x38'), 't38');
});
test('sincronizar de novo não muda nada (idempotente) e é rápido', async () => {
  const S = fakeServer(), A = device(S); A.put('sermon', 's1', { title: 'a' }, 1); await A.sync.run();
  const r1 = await A.sync.run(), r2 = await A.sync.run(); assert.equal(r1.pushed, 0); assert.equal(r2.pulled, 0);
});
test('duas chamadas ao mesmo tempo viram uma só', async () => {
  const S = fakeServer(), A = device(S); A.put('sermon', 's1', { title: 'a' }, 1);
  const p1 = A.sync.run(), p2 = A.sync.run(); assert.strictEqual(p1, p2); await p1;
});
test('dois tipos de item com o mesmo id não se misturam', async () => {
  const S = fakeServer(), A = device(S), B = device(S);
  A.put('sermon', 'z', { title: 'pregação' }, 1); A.put('pray', 'z', { title: 'oração' }, 2); await A.sync.run(); await B.sync.run();
  assert.equal(B.title('sermon', 'z'), 'pregação'); assert.equal(B.title('pray', 'z'), 'oração');
});

(async () => {
  let ok = 0;
  for (const [name, fn] of tests) { try { await fn(); console.log('  ✔', name); ok++; } catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; } }
  console.log(`\n${ok}/${tests.length} testes passaram`);
})();
