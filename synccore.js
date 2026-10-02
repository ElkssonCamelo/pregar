'use strict';
/* Núcleo da sincronização (puro: sem navegador, sem rede). Funciona em Node para testes e no navegador.
   Estratégia: o aparelho é a fonte da verdade (offline-first); cada item tem updatedAt (ms) e vale a edição mais recente.
   Exclusões viajam como "lápides" (deleted=true) para não ressuscitar itens apagados em outro aparelho. */
(function (root) {
  function createSync(o) {
    const { transport, store } = o, windowMs = o.windowMs ?? 10000, pageSize = o.pageSize ?? 1000;
    let running = null;

    async function pushAll() {
      const dirty = store.getDirty(), keys = Object.keys(dirty); if (!keys.length) return 0;
      const rows = [], sent = [];
      for (const k of keys) {
        const d = dirty[k];
        if (d.del) rows.push({ kind: d.kind, id: d.id, deleted: true, updated_at: d.at, data: null });
        else { const it = store.get(d.kind, d.id); if (it) rows.push({ kind: d.kind, id: d.id, deleted: false, updated_at: it.updatedAt || d.at, data: it }); }
        sent.push([k, d.seq]);
      }
      for (let i = 0; i < rows.length; i += 50) await transport.push(rows.slice(i, i + 50));
      store.clearDirty(sent); // só limpa o que não foi alterado de novo durante o envio
      return rows.length;
    }

    async function pullAll() {
      const cursor = store.getCursor(), since = cursor ? new Date(Date.parse(cursor) - windowMs).toISOString() : null; // janela de segurança: reaplicar é inofensivo
      let max = cursor, changed = 0;
      for (let offset = 0; ; offset += pageSize) { // `since` fixo na rodada + ordem estável (server_ts, kind, id) => paginação por deslocamento
        const rows = await transport.pull(since, pageSize, offset);
        for (const r of rows) {
          const key = r.kind + '|' + r.id, d = store.getDirty()[key], local = store.get(r.kind, r.id);
          if (d && d.del) { // apaguei aqui e ainda não enviei: só um item mais novo que a exclusão a desfaz
            if (r.updated_at > d.at && !r.deleted) { store.dropDirty(key); await store.apply(r.kind, r.id, r.data); changed++; }
          } else if (r.deleted) {
            if (local && (local.updatedAt || 0) <= r.updated_at) { await store.apply(r.kind, r.id, null); changed++; }
          } else if (!local || (local.updatedAt || 0) < r.updated_at) { await store.apply(r.kind, r.id, r.data); changed++; }
          if (!max || r.server_ts > max) max = r.server_ts;
        }
        if (rows.length < pageSize) break;
      }
      store.setCursor(max); return changed;
    }

    const run = () => running || (running = (async () => { try { const pushed = await pushAll(), pulled = await pullAll(); return { pushed, pulled }; } finally { running = null; } })());
    return { run, pushAll, pullAll };
  }
  const api = { createSync };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SyncCore = api;
})(typeof self !== 'undefined' ? self : this);
