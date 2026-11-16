// One entry point for the UI. Settings decide whether calls go to the built-in mock
// or to the real orchestration layer over HTTP; the screens never know the difference.
import { settings } from '../settings.svelte.js';
import { mockApi } from './mock.js';
import { httpApi } from './http.js';

export { ApiError } from '../mock/backend.js';

function impl() {
	return settings.dataSource === 'http'
		? httpApi(settings.apiBase, settings.timeoutMs)
		: mockApi({ simulateFailures: settings.simulateFailures });
}

export const api = {
	listAlerts: () => impl().listAlerts(),
	getAlert: (/** @type {string} */ id) => impl().getAlert(id),
	getTriage: (/** @type {string} */ id) => impl().getTriage(id),
	postDecision: (/** @type {string} */ id, /** @type {any} */ body) => impl().postDecision(id, body),
	listApprovals: () => impl().listApprovals(),
	postApproval: (/** @type {string} */ id, /** @type {any} */ body) => impl().postApproval(id, body),
	listKb: () => impl().listKb(),
	getKb: (/** @type {string} */ id) => impl().getKb(id),
	getPlaybook: (/** @type {string} */ key) => impl().getPlaybook(key),
	syncWiki: () => impl().syncWiki(),
	simulateIncoming: () => impl().simulateIncoming(),
	reset: () => impl().reset()
};

/** A plain-English message for any error, for showing to the analyst. */
export function describeError(/** @type {any} */ e) {
	if (!e) return 'Something went wrong.';
	return e.message || String(e);
}
