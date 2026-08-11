// Service Worker para PWA y Notificaciones Web Push (VAPID) — Clínica Montalvo CRM
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Recepción de Notificaciones Push en segundo plano (incluso con la PWA/navegador cerrado)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = { titulo: 'Clínica Montalvo', mensaje: 'Tienes un nuevo mensaje', url: '/conversaciones' };
  try {
    payload = event.data.json();
  } catch {
    payload.mensaje = event.data.text();
  }

  const options = {
    body: payload.mensaje,
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    tag: payload.tag || 'crm-montalvo-push',
    renotify: true,
    data: {
      url: payload.url || '/conversaciones',
    },
  };

  const tasks = [];

  // 1. Mostrar la notificación flotante nativa
  tasks.push(self.registration.showNotification(payload.titulo || 'Clínica Montalvo CRM', options));

  // 2. Dibujar el número en el icono de la PWA (App Badging API)
  if ('setAppBadge' in navigator) {
    const count = payload.count ?? 1;
    if (count > 0) {
      tasks.push(navigator.setAppBadge(count).catch(() => undefined));
    }
  }

  event.waitUntil(Promise.all(tasks));
});

// Al hacer clic en la notificación, enfocar o abrir la PWA
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/conversaciones';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si la app ya está abierta, la enfoca y navega
      for (const client of windowClients) {
        if ('focus' in client) {
          void client.focus();
          if ('navigate' in client && targetUrl) {
            void client.navigate(targetUrl);
          }
          return;
        }
      }
      // Si está cerrada, abre una nueva ventana con la PWA
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
