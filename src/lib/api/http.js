// HTTP client for the orchestration layer (Tūtei's server on CT 204, reached over the tailnet).
// The contract is in API.md. Every call has a timeout so a slow or silent agent
// becomes a clear error state instead of a spinner that never ends.
import { ApiError } from '../mock/backend.js';

const TRIAGE_WAIT_MS = 200_000;

/** @param {string} base @param {number} timeoutMs */
export function httpApi(base, timeoutMs) {
	const root = base.replace(/\/$/, '');

	/** @param {string} method @param {string} path @param {any} [body] @param {number} [limit] */
	async function req(method, path, body, limit = timeoutMs) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), limit);
		try {
			const res = await fetch(root + path, {
				method,
				headers: body ? { 'content-type': 'application/json' } : {},
				body: body ? JSON.stringify(body) : undefined,
				signal: ctrl.signal,
				credentials: 'include' // lets the browser present the mTLS client certificate
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new ApiError(data?.error?.code || `HTTP_${res.status}`, data?.error?.message || res.statusText, res.status);
			}
			return data;
		} catch (e) {
			if (e instanceof ApiError) throw e;
			if (/** @type {any} */ (e)?.name === 'AbortError') {
				throw new ApiError('TIMEOUT', `No answer from the agent within ${Math.round(limit / 1000)} seconds`, 504);
			}
			throw new ApiError('NETWORK', 'Cannot reach Tūtei’s server. Check your connection and that Tailscale is on.', 0);
		} finally {
			clearTimeout(timer);
		}
	}

	const enc = encodeURIComponent;
	return {
		listAlerts: () => req('GET', '/alerts'),
		getAlert: (/** @type {string} */ id) => req('GET', `/alerts/${enc(id)}`),
		// A live LLM can take far longer than the other calls. The server enforces the agent's own
		// timeout (TUTEI_OPENCLAW_TIMEOUT_MS, up to 180 s) and answers TRIAGE_TIMEOUT, so wait a little longer.
		getTriage: (/** @type {string} */ id) => req('GET', `/alerts/${enc(id)}/triage`, undefined, Math.max(timeoutMs, TRIAGE_WAIT_MS)),
		postDecision: (/** @type {string} */ id, /** @type {any} */ b) => req('POST', `/alerts/${enc(id)}/decision`, b),
		listApprovals: () => req('GET', '/approvals'),
		postApproval: (/** @type {string} */ id, /** @type {any} */ b) => req('POST', `/approvals/${enc(id)}`, b),
		listKb: () => req('GET', '/kb'),
		getKb: (/** @type {string} */ id) => req('GET', `/kb/${enc(id)}`),
		getPlaybook: (/** @type {string} */ key) => req('GET', `/kb/playbook/${enc(key)}`),
		syncWiki: () => req('POST', '/kb/sync'),
		simulateIncoming: () => req('POST', '/dev/simulate'),
		reset: () => req('POST', '/dev/reset')
	};
}
