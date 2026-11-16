/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
// Caches the app shell so Tūtei opens instantly and offline, and handles notifications.
// API calls are never cached: alert data must always be live.
import { build, files, prerendered, version } from '$service-worker';

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const CACHE = `tutei-${version}`;
const ASSETS = [...build, ...files, ...prerendered];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const hit = await cache.match(req, { ignoreSearch: true });
			if (hit) return hit;
			try {
				return await fetch(req);
			} catch {
				// Offline navigation: fall back to the cached app shell.
				if (req.mode === 'navigate') {
					const shell = await cache.match(new URL('./', sw.registration.scope).href);
					if (shell) return shell;
				}
				return new Response('Offline', { status: 503 });
			}
		})()
	);
});

// Real web push from the agent (payload: {title, body, url}). Ready for when OpenClaw sends pushes.
sw.addEventListener('push', (event) => {
	let data = { title: 'Tūtei', body: 'New alert', url: './#/' };
	try {
		data = { ...data, ...event.data?.json() };
	} catch {
		/* plain text or empty payload */
	}
	event.waitUntil(sw.registration.showNotification(data.title, { body: data.body, icon: 'icon-192.png', data: { url: data.url } }));
});

// Tapping a notification opens (or focuses) the app on that alert.
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || './', sw.registration.scope).href;
	event.waitUntil(
		(async () => {
			const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const c of clients) {
				if ('focus' in c) {
					await c.focus();
					return c.navigate(target);
				}
			}
			return sw.clients.openWindow(target);
		})()
	);
});
