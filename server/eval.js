// Evaluation mode: collects the HCI test events every participant's phone sends,
// so one CSV holds a whole test round. See "Tūtei HCI Evaluation Tool", Part D.
//
// Stored as JSON lines in TUTEI_DATA_DIR/eval-events.jsonl when that is set,
// otherwise in memory until the server restarts.
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const EVAL_FIELDS = ['ts', 'participant', 'task', 'role', 'event', 'alert_id', 'state', 'value', 'detail'];
const EVENTS = new Set([
	'session_started', 'task_changed', 'alert_notified', 'alert_opened', 'triage_shown', 'state_shown',
	'evidence_viewed', 'briefing_played', 'briefing_stopped', 'decision_made', 'signoff_decided',
	'retry_clicked', 'kb_opened', 'suggestion_revealed'
]);
const MAX_ROWS = 50_000;

export function createEvalStore(dataDir) {
	const file = dataDir ? join(dataDir, 'eval-events.jsonl') : '';
	/** @type {Record<string,string>[]} */
	let rows = [];
	if (file) {
		try {
			rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
		} catch {
			rows = [];
		}
	}

	/** Keep only known fields, as short strings: the log never holds free text from alerts. */
	const clean = (r) => {
		const out = {};
		for (const f of EVAL_FIELDS) out[f] = String(r?.[f] ?? '').slice(0, f === 'detail' ? 200 : 64);
		return out;
	};

	return {
		add(batch) {
			if (!Array.isArray(batch)) return { added: 0 };
			const good = batch.slice(0, 500).filter((r) => EVENTS.has(r?.event)).map(clean);
			if (!good.length) return { added: 0 };
			rows.push(...good);
			if (rows.length > MAX_ROWS) rows = rows.slice(-MAX_ROWS);
			if (file) {
				try {
					mkdirSync(dataDir, { recursive: true });
					appendFileSync(file, good.map((r) => JSON.stringify(r)).join('\n') + '\n');
				} catch (e) {
					console.error(`eval: cannot write ${file}: ${/** @type {any} */ (e).message}`);
				}
			}
			return { added: good.length };
		},
		summary() {
			const participants = [...new Set(rows.map((r) => r.participant))].filter(Boolean).sort();
			return { events: rows.length, participants, storedIn: file || 'memory' };
		},
		csv() {
			return toCsv(rows);
		},
		clear() {
			rows = [];
			if (file) {
				try {
					writeFileSync(file, '');
				} catch {
					/* nothing to clear */
				}
			}
			return { cleared: true };
		}
	};
}

export function toCsv(rows) {
	const esc = (v) => {
		const s = String(v ?? '');
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return [EVAL_FIELDS.join(','), ...rows.map((r) => EVAL_FIELDS.map((f) => esc(r[f])).join(','))].join('\n') + '\n';
}
