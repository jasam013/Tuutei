// Shared app state: the alert feed, pending approvals and in-app toasts.
import { track } from './eval.svelte.js';
import { api, describeError } from './api/index.js';
import { settings } from './settings.svelte.js';
import { buzz, chime, systemNotify, speak } from './media.js';
import { soundPrefs } from './sound.svelte.js';

export const app = $state({
	alerts: /** @type {any[]} */ ([]),
	approvals: /** @type {any[]} */ ([]),
	loading: false,
	error: /** @type {string|null} */ (null),
	updatedAt: 0
});

export async function refreshAlerts() {
	app.loading = true;
	try {
		const list = await api.listAlerts();
		// After the first load, anything we have not seen before is a new alert: announce it.
		if (app.updatedAt) {
			const known = new Set(app.alerts.map((a) => a.id));
			list.filter((a) => !known.has(a.id)).forEach((a) => announce(a));
		}
		app.alerts = list;
		app.error = null;
		app.updatedAt = Date.now();
	} catch (e) {
		app.error = describeError(e);
	} finally {
		app.loading = false;
	}
}

export async function refreshApprovals() {
	try {
		app.approvals = await api.listApprovals();
	} catch {
		/* the approvals badge just stays as it was */
	}
}

// ---------- Toasts ----------
export const toasts = $state(/** @type {{id:number, text:string, href?:string, kind:string}[]} */ ([]));
let toastId = 0;
export function toast(/** @type {string} */ text, kind = 'info', href = undefined, ms = 5000) {
	const id = ++toastId;
	toasts.push({ id, text, href, kind });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i >= 0) toasts.splice(i, 1);
	}, ms);
}

/** Tell the analyst about a new alert: sound, vibration and a notification, if on call. */
export async function announce(/** @type {any} */ alert) {
	const href = `#/alerts/${alert.id}`;
	track('alert_notified', { alertId: alert.id, detail: `${alert.severity}${settings.onCall ? '' : ', off call'}` });
	if (!settings.onCall) {
		toast(`New ${alert.severity} alert (you are off call, so no sound): ${alert.title}`, 'info', href);
		return;
	}
	const soundLength = chime(alert.severity);
	buzz(alert.severity);
	if (soundPrefs.speakAlerts) {
		// Read the alert out after the sound finishes. Only the severity and title, never names.
		setTimeout(() => speak(`New ${alert.severity} alert. ${alert.title}.`), (soundLength + 0.3) * 1000);
	}
	const shown = await systemNotify(`${cap(alert.severity)} alert: ${alert.title}`, alert.source, href, alert.id);
	toast(`${cap(alert.severity)} alert: ${alert.title}`, alert.severity, href, 8000);
	return shown;
}

const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
