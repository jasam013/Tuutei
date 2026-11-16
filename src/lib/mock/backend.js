// A stand-in for the OpenClaw agent's API. Plain JavaScript with no browser or Node
// dependencies, so the same logic runs in the browser (mock mode) and in
// server/mock-api.js (HTTP mode). Swap it for the real agent without touching the UI.

import { SEED_ALERTS, INCOMING_POOL } from './data.js';
import { approvalRequirement } from '../policy.js';
import { CLIENTS, PATTERNS, seedRecords, retrieve, learn, redact, recordMarkdown, playbookData, OUTCOME_LABEL } from './knowledge.js';

const STATE_VERSION = 2;

const MIN = 60_000;

export class ApiError extends Error {
	/** @param {string} code @param {string} message @param {number} status */
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

// Recovery triage for ALR-1038, returned on the third attempt so "Retry" can be demonstrated.
const RECOVERED_1038 = {
	verdict: 'true_positive',
	confidence: 0.61,
	diagnosis:
		'The server looks up a five-day-old domain every five minutes, which looks like beaconing. But the domain name resembles a vendor update service the app team trialled last week. Check with the app owner before acting.',
	action: {
		id: 'block-domain',
		label: 'Block kia-ora-update[.]net at the DNS resolver',
		impact: 'high',
		detail: 'Adds a block entry to the production DNS resolver.'
	},
};

// Always offered to the live agent besides the playbook action: the low-impact option.
const CONTACT_USER = { id: 'contact-user', label: 'Contact the user and ask for justification', impact: 'low', detail: 'No system change.' };
// Offered so a "not a threat" verdict has a matching action instead of a containment step.
const CLOSE_NO_ACTION = { id: 'close-no-action', label: 'Close with no action', impact: 'low', detail: 'No system change. Recorded in the knowledge base.' };

function seedState(now = Date.now()) {
	return {
		version: STATE_VERSION,
		seq: 1043,
		approvalSeq: 1,
		kbSeq: 2400,
		alerts: SEED_ALERTS.map((a) => toStored(a, now)),
		approvals: [],
		audit: {},
		kb: seedRecords(now)
	};
}

function toStored(a, now) {
	const createdAt = now - (a.minutesAgo ?? 0) * MIN;
	return {
		id: a.id,
		title: a.title,
		client: a.client,
		pattern: a.pattern,
		rule: a.rule,
		source: a.source,
		severity: a.severity,
		createdAt,
		status: 'new',
		entity: a.entity,
		activity: a.activity,
		events: a.events.map((e) => ({ at: now + e.t * MIN, label: e.label, kind: e.kind })),
		triage: a.triage,
		failTriage: !!a.failTriage,
		triageAttempts: 0,
		lastTriage: null,
		returnedComment: null
	};
}

/**
 * @param {{load?:() => any, save?:(state:any) => void, now?:() => number, wiki?:{enabled:boolean, label?:string}, onRecord?:(record:any) => void}} [opts]
 */
export function createBackend(opts = {}) {
	const now = opts.now ?? (() => Date.now());
	const loaded = opts.load && opts.load();
	let state = loaded?.version === STATE_VERSION ? loaded : seedState(now());
	const wikiOn = !!opts.wiki?.enabled;
	const save = () => opts.save && opts.save(state);
	let poolIndex = 0;

	const find = (id) => {
		const a = state.alerts.find((x) => x.id === id);
		if (!a) throw new ApiError('NOT_FOUND', `No alert ${id}`, 404);
		return a;
	};

	const summary = (a) => ({
		id: a.id,
		title: a.title,
		client: CLIENTS[a.client] || { code: a.client, name: a.client },
		source: a.source,
		severity: a.severity,
		createdAt: a.createdAt,
		status: a.status,
		entity: a.entity,
		returnedComment: a.returnedComment
	});

	const log = (alertId, entry) => {
		(state.audit[alertId] ||= []).push({ at: now(), ...entry });
	};

	// The live agent may recommend a different offered action than the playbook's; use what it said.
	const actionOf = (a) => a.lastTriage?.action || a.triage?.action || (a.id === 'ALR-1038' ? RECOVERED_1038.action : undefined);

	/** Closing an alert writes a resolution record: the "learning" happens on retrieval. */
	function recordResolution(a, { decision, note, lesson, analyst, approver }) {
		if (decision === 'escalate') return null;
		const action = actionOf(a);
		// Approving means agreeing with the AI's verdict; rejecting means it was a false positive.
		const verdict = a.lastTriage?.verdict || a.triage?.verdict;
		const outcome = decision === 'reject' ? 'false_positive' : verdict === 'benign' || verdict === 'false_positive' ? verdict : 'true_positive';
		const record = {
			id: `INC-${state.kbSeq++}`,
			alertId: a.id,
			client: a.client,
			pattern: a.pattern,
			title: a.title,
			outcome,
			actionId: decision === 'reject' ? 'close-fp' : action?.id || 'close-handled',
			actionTaken: decision === 'reject' ? 'Closed as a false positive' : action?.label || 'Resolved',
			entity: a.entity,
			note: note || '',
			lesson: (lesson || '').trim().slice(0, 500),
			analyst: analyst?.name || '',
			approver: approver?.name || null,
			aiVerdict: a.lastTriage?.verdict || null,
			aiConfidence: a.lastTriage?.confidence ?? null,
			resolvedAt: now(),
			wiki: { status: wikiOn ? 'pending' : 'off' }
		};
		state.kb.push(record);
		log(a.id, { who: 'OpenClaw', what: `resolution saved to the knowledge base as ${record.id}`, note: OUTCOME_LABEL[outcome] });
		if (wikiOn) log(a.id, { who: 'OpenClaw', what: 'writing the Gitea wiki page' });
		opts.onRecord?.(record);
		return record;
	}

	const kbSummary = (r) => ({
		id: r.id,
		alertId: r.alertId,
		client: CLIENTS[r.client] || { code: r.client, name: r.client },
		pattern: r.pattern,
		patternTitle: PATTERNS[r.pattern]?.title || r.pattern,
		title: r.title,
		outcome: r.outcome,
		resolvedAt: r.resolvedAt,
		analyst: r.analyst,
		wiki: r.wiki
	});

	return {
		listAlerts() {
			return state.alerts.map(summary).sort((x, y) => y.createdAt - x.createdAt);
		},

		getAlert(id) {
			const a = find(id);
			return {
				...summary(a),
				rule: a.rule,
				activity: a.activity,
				events: a.events,
				raw: {
					rule: a.rule,
					source: a.source,
					severity: a.severity,
					time: new Date(a.createdAt).toISOString(),
					...a.entity
				},
				audit: state.audit[id] || [],
				record: (() => {
					const r = state.kb.find((x) => x.alertId === id);
					return r ? { id: r.id, outcome: r.outcome, wiki: r.wiki } : null;
				})()
			};
		},

		/** The slow AI call. Throws TRIAGE_TIMEOUT to exercise the failure state. */
		getTriage(id) {
			const a = find(id);
			a.triageAttempts += 1;
			let base = a.triage;
			if (a.failTriage) {
				if (a.id === 'ALR-1038' && a.triageAttempts >= 3) base = RECOVERED_1038;
				else {
					save();
					throw new ApiError('TRIAGE_TIMEOUT', 'The agent did not answer in time', 504);
				}
			}
			// Retrieval step: past resolutions for this pattern shape the answer.
			const out = learn(base, retrieve(state.kb, a, now()));
			a.lastTriage = { verdict: out.verdict, confidence: out.confidence };
			save();
			return { alertId: id, ...out };
		},

		/**
		 * Live triage: the same retrieval step, but the verdict, confidence and diagnosis come
		 * from the OpenClaw agent. ALR-1038 still fails twice (when scriptedFailure is on) so
		 * usability task T4 always meets the failure state.
		 * @param {string} id
		 * @param {{triage:(ctx:any) => Promise<any>}} agent
		 * @param {{scriptedFailure?:boolean}} [o]
		 */
		async getTriageLive(id, agent, o = {}) {
			const a = find(id);
			a.triageAttempts += 1;
			if (a.failTriage && o.scriptedFailure !== false && a.triageAttempts < 3) {
				save();
				throw new ApiError('TRIAGE_TIMEOUT', 'The agent did not answer in time (scripted for test task T4)', 504);
			}
			const matches = retrieve(state.kb, a, now());
			const planned = actionOf({ ...a, lastTriage: null });
			const actions = [planned, CONTACT_USER, CLOSE_NO_ACTION].filter((x, i, all) => x && all.findIndex((y) => y?.id === x.id) === i);
			const t = now();
			const ctx = {
				alert: {
					id: a.id,
					customer: CLIENTS[a.client]?.name || a.client,
					title: a.title,
					rule: a.rule,
					source: a.source,
					severity: a.severity,
					entity: a.entity,
					activity: a.activity,
					events: a.events.map((e) => ({ t: Math.round((e.at - t) / MIN), label: e.label }))
				},
				matches,
				actions
			};
			let res;
			try {
				res = await agent.triage(ctx);
			} catch (e) {
				const err = /** @type {any} */ (e);
				save();
				throw new ApiError(err.code || 'AGENT_ERROR', err.message || String(err), err.code === 'TRIAGE_TIMEOUT' ? 504 : 502);
			}
			const out = learn({ verdict: res.verdict, confidence: res.confidence, diagnosis: res.diagnosis, action: res.action }, matches);
			a.lastTriage = { verdict: out.verdict, confidence: out.confidence, action: res.action };
			save();
			return { alertId: id, ...out, source: 'openclaw', agentMs: res.ms, actionReason: res.reason };
		},

		/**
		 * @param {string} id
		 * @param {{decision:'approve'|'reject'|'escalate', note?:string, lesson?:string, voiceNote?:string|null, analyst:{name:string, role:'junior'|'senior'}, actionLabel?:string, actionImpact?:string}} body
		 */
		postDecision(id, body) {
			const a = find(id);
			if (!['approve', 'reject', 'escalate'].includes(body?.decision)) {
				throw new ApiError('BAD_DECISION', 'decision must be approve, reject or escalate');
			}
			if (a.status === 'awaiting_approval') throw new ApiError('PENDING', 'Already waiting for sign-off', 409);
			const action = actionOf(a);
			const req = approvalRequirement({ decision: body.decision, action, role: body.analyst?.role });
			log(id, { who: body.analyst?.name, role: body.analyst?.role, what: body.decision, note: body.note || '', voiceNote: !!body.voiceNote });

			if (req.required) {
				const approval = {
					id: `APR-${state.approvalSeq++}`,
					alertId: id,
					alertTitle: a.title,
					client: CLIENTS[a.client] || { code: a.client, name: a.client },
					severity: a.severity,
					decision: body.decision,
					actionLabel: body.decision === 'approve' ? action?.label : body.decision === 'reject' ? 'Close as false positive' : 'Escalate',
					note: body.note || '',
					lesson: body.lesson || '',
					voiceNote: body.voiceNote || null,
					requestedBy: body.analyst,
					reasons: req.reasons,
					createdAt: now(),
					status: 'pending'
				};
				state.approvals.push(approval);
				a.status = 'awaiting_approval';
				a.returnedComment = null;
				log(id, { who: 'Tūtei', what: 'sent for senior sign-off', note: req.reasons.join('; ') });
				save();
				return { status: a.status, approvalId: approval.id, reasons: req.reasons };
			}

			a.status = { approve: 'resolved', reject: 'closed', escalate: 'escalated' }[body.decision];
			a.returnedComment = null;
			const record = recordResolution(a, { decision: body.decision, note: body.note, lesson: body.lesson, analyst: body.analyst, approver: null });
			if (record) log(id, { who: 'OpenClaw', what: 'alert closed in SIEM' });
			save();
			return { status: a.status, recordId: record?.id ?? null };
		},

		listApprovals() {
			return state.approvals.filter((p) => p.status === 'pending').sort((x, y) => y.createdAt - x.createdAt);
		},

		/** @param {string} approvalId @param {{approve:boolean, comment?:string, approver:{name:string, role:string}}} body */
		postApproval(approvalId, body) {
			const p = state.approvals.find((x) => x.id === approvalId);
			if (!p) throw new ApiError('NOT_FOUND', `No approval ${approvalId}`, 404);
			if (p.status !== 'pending') throw new ApiError('DONE', 'Already decided', 409);
			if (body.approver?.role !== 'senior') throw new ApiError('FORBIDDEN', 'Only a senior analyst can sign off', 403);
			if (body.approver?.name && body.approver.name === p.requestedBy?.name) {
				throw new ApiError('SAME_PERSON', 'You cannot approve your own decision (separation of duties)', 403);
			}
			const a = find(p.alertId);
			p.status = body.approve ? 'approved' : 'returned';
			p.decidedBy = body.approver;
			p.comment = body.comment || '';
			log(a.id, { who: body.approver?.name, role: 'senior', what: body.approve ? 'approved' : 'sent back', note: p.comment });
			if (body.approve) {
				a.status = { approve: 'resolved', reject: 'closed', escalate: 'escalated' }[p.decision];
				const record = recordResolution(a, { decision: p.decision, note: p.note, lesson: p.lesson, analyst: p.requestedBy, approver: body.approver });
				if (record) log(a.id, { who: 'OpenClaw', what: 'alert closed in SIEM' });
			} else {
				a.status = 'new';
				a.returnedComment = `${body.approver?.name || 'A senior'}: ${p.comment || 'Please take another look.'}`;
			}
			save();
			return { status: p.status, alertStatus: a.status };
		},

		// ---------- Knowledge base ----------
		listKb() {
			const patterns = [...new Set(state.kb.map((r) => r.pattern))];
			return {
				wiki: { enabled: wikiOn, label: opts.wiki?.label || '' },
				records: state.kb.map(kbSummary).sort((x, y) => y.resolvedAt - x.resolvedAt),
				playbooks: patterns
					.map((k) => {
						const rows = state.kb.filter((r) => r.pattern === k);
						return { key: k, title: PATTERNS[k]?.title || k, count: rows.length, customers: new Set(rows.map((r) => r.client)).size };
					})
					.sort((x, y) => y.count - x.count || x.title.localeCompare(y.title))
			};
		},

		/** The full record. In a real deployment this is limited to staff entitled to that customer. */
		getKb(recordId) {
			const r = state.kb.find((x) => x.id === recordId);
			if (!r) throw new ApiError('NOT_FOUND', `No record ${recordId}`, 404);
			return { ...kbSummary(r), actionTaken: r.actionTaken, entity: r.entity, note: r.note, lesson: r.lesson, sharedLesson: redact(r.lesson, r.entity), approver: r.approver, aiVerdict: r.aiVerdict, aiConfidence: r.aiConfidence, technique: PATTERNS[r.pattern]?.technique, markdown: recordMarkdown(r) };
		},

		getPlaybook(key) {
			if (!state.kb.some((r) => r.pattern === key)) throw new ApiError('NOT_FOUND', `No playbook ${key}`, 404);
			return playbookData(key, state.kb);
		},

		/** Called by the wiki writer (server only). */
		setWiki(recordId, wiki) {
			const r = state.kb.find((x) => x.id === recordId);
			if (!r) return;
			r.wiki = wiki;
			if (r.alertId) {
				if (wiki.status === 'written') log(r.alertId, { who: 'OpenClaw', what: 'Gitea wiki updated', note: `${r.id}, customer index and playbook pages` });
				if (wiki.status === 'failed') log(r.alertId, { who: 'OpenClaw', what: 'Gitea wiki write failed', note: wiki.error || '' });
			}
			save();
		},

		/** Everything not yet in the wiki (history and failed writes), marked pending. */
		queueWikiSync() {
			if (!wikiOn) throw new ApiError('WIKI_OFF', 'The Gitea wiki is not configured on the server', 503);
			const todo = state.kb.filter((r) => r.wiki?.status !== 'written' && r.wiki?.status !== 'pending');
			for (const r of todo) r.wiki = { status: 'pending' };
			save();
			return todo.map((r) => r.id);
		},

		kbState: () => state.kb,

		simulateIncoming() {
			const tpl = INCOMING_POOL[poolIndex++ % INCOMING_POOL.length];
			const id = `ALR-${state.seq++}`;
			const alert = toStored({ ...tpl, id, minutesAgo: 0 }, now());
			state.alerts.push(alert);
			save();
			return summary(alert);
		},

		reset() {
			state = seedState(now());
			poolIndex = 0;
			save();
		}
	};
}
