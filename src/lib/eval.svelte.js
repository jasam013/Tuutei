// Evaluation mode (HCI tool, Part D). Off by default. When on, Tūtei records what the
// analyst does and when, tagged with a participant code (never a name) and the current
// test task. In OpenClaw API mode events go to the server, so one CSV holds every
// participant; in demo-data mode they stay on this device.
import { untrack } from 'svelte';
import { settings } from './settings.svelte.js';

const PREFS_KEY = 'tutei.eval.v1';
const LOCAL_KEY = 'tutei.evallog.v1';
export const EVAL_FIELDS = ['ts', 'participant', 'task', 'role', 'event', 'alert_id', 'state', 'value', 'detail'];
export const TASKS = [
	['', 'No task (free use)'],
	['T1', 'T1 Respond to a critical alert'],
	['T2', 'T2 Act on a Confident alert'],
	['T3', 'T3 Act on an Unsure alert'],
	['T4', 'T4 Alert the AI could not answer'],
	['T5', 'T5 Hear the briefing'],
	['T6', 'T6 Senior sends a request back'],
	['T7', 'T7 Find a past resolution']
];

const read = (k, d) => {
	try {
		return JSON.parse(localStorage.getItem(k) || '') ?? d;
	} catch {
		return d;
	}
};
const write = (k, v) => {
	try {
		localStorage.setItem(k, JSON.stringify(v));
	} catch {
		/* private mode: keep in memory */
	}
};

export const evalPrefs = $state({ on: false, participant: 'P1', task: '' });
export const evalState = $state({ pending: 0, sent: 0, lastError: '' });

if (typeof window !== 'undefined') Object.assign(evalPrefs, read(PREFS_KEY, {}));

export function saveEvalPrefs() {
	write(PREFS_KEY, { on: evalPrefs.on, participant: evalPrefs.participant, task: evalPrefs.task });
}

/** Participant codes only: letters, digits and dashes, so a name cannot slip in by accident. */
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'P1';

let queue = [];
let timer = null;

/**
 * Record one event. Does nothing unless Evaluation mode is on.
 * @param {string} event
 * @param {{alertId?:string, state?:string, value?:string|number, detail?:string}} [f]
 */
export function track(event, f = {}) {
	// untrack: logging must never make a component re-run when the task or participant changes.
	untrack(() => record(event, f));
}

function record(event, f) {
	if (!evalPrefs.on) return;
	const row = {
		ts: new Date().toISOString(),
		participant: evalPrefs.participant,
		task: evalPrefs.task,
		role: settings.role,
		event,
		alert_id: f.alertId || '',
		state: f.state || '',
		value: f.value ?? '',
		detail: f.detail || ''
	};
	if (settings.dataSource === 'http') {
		queue.push(row);
		evalState.pending = queue.length;
		clearTimeout(timer);
		timer = setTimeout(flush, 1000);
	} else {
		const rows = read(LOCAL_KEY, []);
		rows.push(row);
		write(LOCAL_KEY, rows.slice(-20000));
		evalState.sent++;
	}
}

export async function flush() {
	if (!queue.length) return;
	const batch = queue;
	queue = [];
	try {
		const res = await fetch(`${settings.apiBase}/eval/events`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(batch),
			keepalive: true
		});
		if (!res.ok) throw new Error(`server answered ${res.status}`);
		evalState.sent += batch.length;
		evalState.lastError = '';
	} catch (e) {
		queue = batch.concat(queue); // try again with the next event
		evalState.lastError = String(/** @type {any} */ (e)?.message || e);
	}
	evalState.pending = queue.length;
}

if (typeof window !== 'undefined') {
	// Send what is waiting when the analyst switches away from the app.
	document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export const localRows = () => read(LOCAL_KEY, []);
export const clearLocal = () => write(LOCAL_KEY, []);

export function toCsv(rows) {
	const esc = (v) => {
		const s = String(v ?? '');
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return [EVAL_FIELDS.join(','), ...rows.map((r) => EVAL_FIELDS.map((k) => esc(r[k])).join(','))].join('\n') + '\n';
}

/** How long a section must stay on screen before it counts as looked at (pilot P0: 0.15 s was being counted). */
export const DWELL_MS = 2000;

/**
 * Svelte action: records evidence_viewed once at least half of a section has stayed on screen for
 * DWELL_MS while `active` is true. Sections on screen while the AI is still thinking are not counted,
 * and a section that only flashes past while scrolling is not counted either, so "evidence checked
 * before deciding" means the analyst had the section in view after seeing the verdict.
 * @param {HTMLElement} node
 * @param {{alertId:string, what:string, active?:boolean}} p
 */
export function seen(node, p) {
	if (typeof IntersectionObserver === 'undefined') return;
	let params = p;
	let done = false;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let wait = null;
	const stop = () => {
		if (wait) clearTimeout(wait);
		wait = null;
	};
	const fire = () => {
		wait = null;
		if (done || params.active === false) return;
		done = true;
		track('evidence_viewed', { alertId: params.alertId, detail: params.what, value: DWELL_MS });
		io.disconnect();
	};
	const io = new IntersectionObserver(
		(entries) => {
			const visible = entries.some((e) => e.isIntersecting);
			if (!visible || params.active === false) return stop();
			if (!wait && !done) wait = setTimeout(fire, DWELL_MS);
		},
		{ threshold: 0.5 }
	);
	io.observe(node);
	return {
		update(next) {
			const wasActive = params.active !== false;
			params = next;
			if (params.active === false) stop();
			// Just became active: measure again after this render, as the layout may have moved.
			if (!wasActive && params.active !== false && !done) {
				io.unobserve(node);
				io.observe(node);
			}
		},
		destroy() {
			stop();
			io.disconnect();
		}
	};
}
