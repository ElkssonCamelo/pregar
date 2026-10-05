/* Modo demonstração: abra index.html?demo. Dados fictícios, guardados só na memória desta aba (somem ao recarregar),
   banco separado do seu e SEM sincronização. Precisa rodar antes dos outros scripts. */
(() => {
  if (!/[?&]demo(=|&|$|#)/.test(location.search)) return;
  const mem = {};
  const shim = {
    getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; },
    clear: () => { for (const k in mem) delete mem[k]; }, key: i => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; }
  };
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  const open = indexedDB.open.bind(indexedDB);
  indexedDB.open = (name, v) => open(name === 'pregar' ? 'pregar-demo' : name, v);
  indexedDB.deleteDatabase('pregar-demo'); // a demonstração sempre recomeça limpa
  Object.defineProperty(window, 'PREGAR_CONFIG', { get: () => ({ supabaseUrl: '', supabaseKey: '', minPassword: 10, requireLogin: false }), set() {}, configurable: true });
  window.__demo = {
    async seed() { await applyBackup(JSON.parse(JSON.stringify(window.__DEMO_DATA))); sermons.length = 0; ilus.length = 0; pray.length = 0; sermons.push(...await dbAll('sermons')); ilus.push(...await dbAll('ilus')); pray.push(...await dbAll('pray')); }
  };
  addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('demo');
    const b = document.createElement('div'); b.id = 'demobar'; b.setAttribute('role', 'note');
    b.innerHTML = '<span><b>Modo demonstração</b> — dados fictícios, nada é salvo nem enviado.</span><a href="./">Sair e voltar ao meu Pregar</a>';
    document.body.prepend(b);
  });
})();
