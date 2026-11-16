// User settings, kept in this browser only. Wrapped in try/catch because storage can be
// blocked (private windows, strict sandboxes); the app still works with defaults.
import { DEFAULT_THRESHOLD } from './policy.js';

const KEY = 'tutei.settings.v1';

/** Demo personas, so one person can play both sides of the four-eyes check. */
export const PERSONAS = {
	junior: { name: 'Aroha', role: 'junior', title: 'Junior analyst' },
	senior: { name: 'Jason', role: 'senior', title: 'Senior analyst' }
};

const defaults = {
	role: /** @type {'junior'|'senior'} */ ('junior'),
	dataSource: /** @type {'mock'|'http'} */ ('mock'),
	apiBase: '/api',
	timeoutMs: 8000,
	threshold: DEFAULT_THRESHOLD,
	lightweight: false,
	speakSensitive: false,
	onCall: true,
	simulateFailures: false
};

function load() {
	try {
		if (typeof localStorage === 'undefined') return { ...defaults };
		const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
		const merged = { ...defaults, ...saved };
		// Turn on lightweight mode automatically for data-saver or slow connections, first run only.
		if (!('lightweight' in saved) && typeof navigator !== 'undefined') {
			const c = /** @type {any} */ (navigator).connection;
			if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) merged.lightweight = true;
		}
		return merged;
	} catch {
		return { ...defaults };
	}
}

export const settings = $state(load());

export function persistSettings() {
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		/* storage unavailable: settings last for this session only */
	}
}

export function me() {
	return PERSONAS[settings.role];
}
