// In-browser mock of the agent, with realistic delays: alert lists are quick,
// AI triage takes seconds, and some calls fail, exactly like the real thing.
import { createBackend, ApiError } from '../mock/backend.js';

const KEY = 'tutei.mock.v1';

const backend = createBackend({
	load: () => {
		try {
			return JSON.parse(localStorage.getItem(KEY) || 'null');
		} catch {
			return null;
		}
	},
	save: (state) => {
		try {
			localStorage.setItem(KEY, JSON.stringify(state));
		} catch {
			/* demo data lasts for this session only */
		}
	}
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Run a backend call after a delay, returning plain copies like a network would. */
async function call(fn, lo = 120, hi = 350) {
	await wait(jitter(lo, hi));
	return clone(fn());
}

/** @param {{simulateFailures:boolean}} opts */
export function mockApi(opts) {
	return {
		listAlerts: () => call(() => backend.listAlerts()),
		getAlert: (id) => call(() => backend.getAlert(id)),
		getTriage: async (id) => {
			// The LLM is the slow part: 1.2 to 3 seconds normally.
			await wait(jitter(1200, 3000));
			if (opts.simulateFailures && Math.random() < 0.3) {
				await wait(1500);
				throw new ApiError('TRIAGE_TIMEOUT', 'The agent did not answer in time (simulated)', 504);
			}
			try {
				return clone(backend.getTriage(id));
			} catch (e) {
				if (/** @type {any} */ (e).code === 'TRIAGE_TIMEOUT') await wait(1500);
				throw e;
			}
		},
		postDecision: (id, body) => call(() => backend.postDecision(id, body), 300, 700),
		listApprovals: () => call(() => backend.listApprovals()),
		postApproval: (id, body) => call(() => backend.postApproval(id, body), 300, 700),
		listKb: () => call(() => backend.listKb()),
		getKb: (id) => call(() => backend.getKb(id)),
		getPlaybook: (key) => call(() => backend.getPlaybook(key)),
		syncWiki: () => call(() => backend.queueWikiSync()),
		simulateIncoming: () => call(() => backend.simulateIncoming()),
		reset: () => call(() => (backend.reset(), { ok: true }))
	};
}
