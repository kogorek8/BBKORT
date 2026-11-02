// Minimalny service worker – pozwala "zainstalować" BBKORT na telefonie.
// Nie cache'uje niczego, więc nowa wersja jest widoczna od razu.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
