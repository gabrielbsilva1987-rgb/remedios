// Service worker: notificações com o app fechado + funcionamento básico offline
const CACHE = "remedios-v9";
const ARQUIVOS = ["./", "./index.html", "./app.js", "./styles.css", "./config.js", "./manifest.json", "./icon-192.png", "./vendor/html2canvas.min.js", "./vendor/jspdf.umd.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Sempre tenta a internet primeiro (para pegar atualizações); se falhar, usa o que está guardado
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: "Remédios", corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Remédios", {
      body: d.corpo || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: "./" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
});
