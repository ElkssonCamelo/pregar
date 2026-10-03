const V = 'pregar-v33';
const FILES = ['./', 'index.html', 'projetor.html', 'style.css', 'app.js', 'docx.js', 'importer.js', 'ajustes.js', 'assistentes.js', 'teleprompter.js', 'config.js', 'synccore.js', 'sync.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/supabase.js', 'vendor/fonts/fraunces.woff2', 'vendor/fonts/fraunces-italic.woff2', 'vendor/fonts/instrument-sans.woff2', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'data/acf.json', 'data/xref.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // Bíblia (API externa) é cacheada no IndexedDB pelo app
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
