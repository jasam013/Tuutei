// The resolution knowledge base: how Tūtei and OpenClaw "learn" from closed alerts.
//
// Every resolved alert becomes a resolution record. When a new alert arrives, records
// with the same pattern are retrieved and handed to the triage step (retrieval, not
// retraining). MSSP rule: a customer's own history is shown in full, but another
// customer's history is only ever shared as an anonymised pattern.
//
// Plain JavaScript, no dependencies: runs in the browser mock and in the Node server.

export const CLIENTS = {
	KWH: { code: 'KWH', name: 'Kōwhai Health' },
	HBR: { code: 'HBR', name: 'Harbourside Logistics' },
	AWA: { code: 'AWA', name: 'Awanui District Council' }
};

// Alert patterns. The real agent would match on embeddings of the rule, entities and
// evidence; the prototype matches on this key, which the SIEM rule name maps to.
export const PATTERNS = {
	'impossible-travel': { title: 'Impossible travel sign-in', technique: 'T1078 Valid Accounts' },
	'encoded-powershell': { title: 'Encoded PowerShell execution', technique: 'T1059.001 PowerShell' },
	'vpn-bruteforce': { title: 'VPN brute force then success', technique: 'T1110 Brute Force' },
	'sandbox-block': { title: 'Malware download blocked by sandbox', technique: 'T1204 User Execution' },
	'new-domain': { title: 'Traffic to newly registered domain', technique: 'T1071 Application Layer Protocol' },
	'forwarder-gap': { title: 'Log forwarder stopped sending', technique: 'Data source health' },
	'priv-group-change': { title: 'Privileged group membership changed', technique: 'T1098 Account Manipulation' },
	'large-upload': { title: 'Large upload to personal cloud storage', technique: 'T1567 Exfiltration Over Web Service' }
};

// What an action looks like once names and hosts are taken out, for other customers.
export const GENERIC_ACTION = {
	'disable-account': 'Account disabled and sessions revoked',
	'isolate-host': 'Host isolated with EDR containment',
	'reset-password': 'Password reset and VPN session ended',
	'close-handled': 'Closed as handled by policy',
	'block-domain': 'Domain blocked at the DNS resolver',
	'restart-forwarder': 'Forwarder service restarted',
	'revert-membership': 'Group change reverted',
	'contact-user': 'User contacted for justification',
	'close-fp': 'Closed as a false positive',
	'close-no-action': 'Closed with no action',
	reimage: 'Host isolated and reimaged'
};

export const OUTCOME_LABEL = {
	true_positive: 'Confirmed threat',
	benign: 'Benign (expected behaviour)',
	false_positive: 'False positive'
};

const DAY = 86_400_000;

// History that existed before the demo starts. Every name, host and address is invented.
const SEED_RECORDS = [
	{ id: 'INC-2231', client: 'KWH', pattern: 'impossible-travel', title: 'MFA fatigue takeover, finance user', outcome: 'true_positive', actionId: 'disable-account', actionTaken: 'Disabled h.ngata, removed forwarding rule, reset password', entity: { user: 'h.ngata@example.co.nz', host: '—', ip: '45.137.21.9' }, note: 'User admitted approving a push prompt at 2am. Forwarding rule sent invoices to an external Gmail.', lesson: 'An MFA approval straight after a foreign sign-in plus a new mailbox rule is a takeover. Disable first, then ask.', analyst: 'Jarvis', approver: 'Cerebro', daysAgo: 41 },
	{ id: 'INC-1987', client: 'HBR', pattern: 'impossible-travel', title: 'Impossible travel via VPN exit node', outcome: 'benign', actionId: 'close-handled', actionTaken: 'Closed: corporate VPN egress in Sydney', entity: { user: 'p.morgan@example.com', host: '—', ip: '103.21.244.10' }, note: 'Harbourside routes staff through a Sydney VPN concentrator. Added to known egress list.', lesson: 'Check whether the second location is the customer’s own VPN egress before acting.', analyst: 'Cerebro', approver: null, daysAgo: 96 },
	{ id: 'INC-2310', client: 'AWA', pattern: 'encoded-powershell', title: 'Qakbot-style macro dropper', outcome: 'true_positive', actionId: 'reimage', actionTaken: 'Isolated WS-0077, reimaged, reset j.smith credentials', entity: { user: 'j.smith', host: 'WS-0077', ip: '10.40.3.77' }, note: 'Second stage pulled from a compromised WordPress site. Blocked at proxy.', lesson: 'Macro document, then encoded PowerShell, then a scheduled task: contain the host before investigating.', analyst: 'Jarvis', approver: 'Cerebro', daysAgo: 18 },
	{ id: 'INC-2104', client: 'AWA', pattern: 'vpn-bruteforce', title: 'User lockout after password change', outcome: 'false_positive', actionId: 'close-fp', actionTaken: 'Closed: m.williams’ phone retrying the old password', entity: { user: 'm.williams', host: 'vpn-gw-01', ip: '203.0.113.88' }, note: 'Phoned m.williams. Old password saved on phone VPN client. Updated it together.', lesson: 'Repeated failures from one residential address right after a password change are usually a stale saved password.', analyst: 'Jarvis', approver: 'Cerebro', daysAgo: 63 },
	{ id: 'INC-1876', client: 'HBR', pattern: 'vpn-bruteforce', title: 'Credential stuffing on VPN', outcome: 'true_positive', actionId: 'reset-password', actionTaken: 'Reset t.ali password, blocked 198.51.100.0/24', entity: { user: 't.ali', host: 'fw-akl-01', ip: '198.51.100.23' }, note: 'Source range hit 40 accounts. Password found in a public breach list.', lesson: 'Many accounts from one hosting range is stuffing; reset and block the range.', analyst: 'Cerebro', approver: null, daysAgo: 120 },
	{ id: 'INC-2290', client: 'KWH', pattern: 'sandbox-block', title: 'Sandbox block on zip attachment', outcome: 'benign', actionId: 'close-handled', actionTaken: 'Closed as handled by policy', entity: { user: 'l.brown', host: 'LT-0291', ip: '10.10.7.91' }, note: 'Blocked before download. No follow-on activity.', lesson: 'A sandbox block with no follow-on activity needs no action.', analyst: 'Jarvis', approver: null, daysAgo: 9 },
	{ id: 'INC-2251', client: 'HBR', pattern: 'new-domain', title: 'Beaconing to new domain', outcome: 'true_positive', actionId: 'isolate-host', actionTaken: 'Isolated SRV-APP-01, malware confirmed, host rebuilt', entity: { user: '—', host: 'SRV-APP-01', ip: '10.30.1.11' }, note: 'Five-minute beacon interval matched a Cobalt Strike profile.', lesson: 'A fixed interval to a days-old domain is beaconing until the app owner proves otherwise.', analyst: 'Cerebro', approver: null, daysAgo: 27 },
	{ id: 'INC-2277', client: 'AWA', pattern: 'forwarder-gap', title: 'UF not started after patching', outcome: 'benign', actionId: 'restart-forwarder', actionTaken: 'Restarted SplunkForwarder on uf-dc-01, set start type to Automatic', entity: { user: '—', host: 'uf-dc-01', ip: '10.40.0.21' }, note: 'Delayed start timed out after patch-night reboot.', lesson: 'Data gaps right after patch night are usually a forwarder that failed delayed start.', analyst: 'Jarvis', approver: 'Cerebro', daysAgo: 33 },
	{ id: 'INC-2015', client: 'AWA', pattern: 'priv-group-change', title: 'Unapproved privileged group change', outcome: 'true_positive', actionId: 'revert-membership', actionTaken: 'Removed d.kaur from Domain Admins, reviewed helpdesk-svc', entity: { user: 'd.kaur', host: 'DC-02', ip: '10.40.0.10' }, note: 'Helpdesk script had a typo in the group name.', lesson: 'Revert first, then find the change ticket. Service accounts should never add admins.', analyst: 'Cerebro', approver: null, daysAgo: 150 },
	{ id: 'INC-2198', client: 'KWH', pattern: 'large-upload', title: 'Video files to personal storage', outcome: 'benign', actionId: 'contact-user', actionTaken: 'Contacted a.rangi: agency hand-off of campaign video', entity: { user: 'a.rangi', host: 'LT-0180', ip: '10.10.7.180' }, note: 'Manager confirmed. Suggested the sanctioned file-share next time.', lesson: 'Marketing staff moving large video files is common; confirm with the manager.', analyst: 'Jarvis', approver: null, daysAgo: 22 }
];

export function seedRecords(now) {
	return SEED_RECORDS.map(({ daysAgo, ...r }) => ({
		...r,
		alertId: null,
		resolvedAt: now - daysAgo * DAY,
		wiki: { status: 'history' }
	}));
}

// ---------- Redaction ----------
const CLIENT_WORDS = Object.values(CLIENTS).flatMap((c) => [c.name, c.name.split(' ')[0], c.code]);

/** Strips names, hosts and addresses from text before it can be shared across customers. */
export function redact(text, entity = {}) {
	if (!text) return '';
	let out = String(text);
	for (const v of [entity.user, entity.host, entity.ip]) {
		if (!v || v === '—') continue;
		const local = v.split('@')[0];
		for (const s of new Set([v, local])) if (s.length > 2) out = out.split(s).join(s === entity.ip ? '[ip]' : s === entity.host ? '[host]' : '[user]');
	}
	for (const w of CLIENT_WORDS) out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[customer]');
	return out
		.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[user]')
		.replace(/\b\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?\b/g, '[ip]')
		.replace(/\b[a-z]{1,8}(-[a-z0-9]{1,8})*-\d{1,5}\b/gi, '[host]')
		.replace(/\b[a-z]\.[a-z]{2,}\b/gi, '[user]');
}

// ---------- Retrieval ----------
const sameEntity = (a, b) =>
	['user', 'host'].some((k) => a?.[k] && a[k] !== '—' && a[k] === b?.[k]);

/**
 * Past resolutions for an alert. Same customer: the full record. Other customers:
 * the pattern only, with every identifying detail removed.
 * @param {any[]} kb @param {{id:string, client:string, pattern:string, entity:any}} alert @param {number} now
 */
export function retrieve(kb, alert, now, limit = 5) {
	return kb
		.filter((r) => r.pattern === alert.pattern && r.alertId !== alert.id)
		.map((r) => {
			const same = r.client === alert.client;
			const ageDays = (now - r.resolvedAt) / DAY;
			let score = 0.7 + (same ? 0.12 : 0) + (same && sameEntity(r.entity, alert.entity) ? 0.1 : 0) - Math.min(0.08, ageDays / 1500);
			score = Math.round(Math.min(0.99, score) * 100) / 100;
			return { r, same, score };
		})
		.sort((x, y) => Number(y.same) - Number(x.same) || y.score - x.score)
		.slice(0, limit)
		.map(({ r, same, score }) =>
			same
				? {
						scope: 'same',
						id: r.id,
						title: r.title,
						outcome: r.outcome,
						resolution: r.actionTaken,
						note: r.note,
						lesson: r.lesson,
						entity: r.entity,
						analyst: r.analyst,
						approver: r.approver,
						resolvedAt: r.resolvedAt,
						similarity: score,
						wiki: r.wiki
					}
				: {
						scope: 'other',
						title: PATTERNS[r.pattern]?.title || r.pattern,
						technique: PATTERNS[r.pattern]?.technique,
						outcome: r.outcome,
						resolution: GENERIC_ACTION[r.actionId] || 'Resolved',
						lesson: redact(r.lesson, r.entity),
						resolvedMonth: monthOf(r.resolvedAt),
						similarity: score
					}
		);
}

const isThreat = (o) => o === 'true_positive';

/**
 * The learning step: nudge the model's confidence by how past resolutions turned out.
 * Agreeing history raises it, contradicting history lowers it, at most ±0.12.
 */
export function learn(triage, matches) {
	const base = triage.confidence;
	if (!matches.length) return { ...triage, similar: [], learning: { baseConfidence: base, adjustment: 0, sameCount: 0, otherCount: 0, summary: 'No past resolutions for this pattern yet.' } };
	const aiThreat = triage.verdict === 'true_positive';
	let num = 0;
	let den = 0;
	for (const m of matches) {
		const w = m.similarity * (m.scope === 'same' ? 1 : 0.5);
		num += w * (isThreat(m.outcome) === aiThreat ? 1 : -1);
		den += w;
	}
	const adjustment = Math.round(0.12 * (num / den) * Math.min(1, den / 2) * 100) / 100;
	const confidence = Math.round(Math.min(0.99, Math.max(0.05, base + adjustment)) * 100) / 100;
	const same = matches.filter((m) => m.scope === 'same');
	const other = matches.filter((m) => m.scope === 'other');
	const describe = (list) => {
		const n = { true_positive: 0, benign: 0, false_positive: 0 };
		for (const m of list) n[m.outcome]++;
		return [n.true_positive && `${n.true_positive} confirmed threat`, n.false_positive && `${n.false_positive} false positive`, n.benign && `${n.benign} benign`].filter(Boolean).join(', ');
	};
	const parts = [];
	if (same.length) parts.push(`At this customer, ${same.length} similar ${same.length === 1 ? 'alert was' : 'alerts were'} resolved before (${describe(same)}).`);
	if (other.length) parts.push(`At other customers, ${other.length} ${other.length === 1 ? 'was' : 'were'} (${describe(other)}).`);
	return {
		...triage,
		confidence,
		similar: matches,
		learning: { baseConfidence: base, adjustment: Math.round((confidence - base) * 100) / 100, sameCount: same.length, otherCount: other.length, summary: parts.join(' ') }
	};
}

// ---------- Wiki pages (Markdown) ----------
export const monthOf = (t) => new Date(t).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' });
const dateOf = (t) => new Date(t).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland' });

export const recordPageTitle = (r) => `${r.id} ${r.client} ${PATTERNS[r.pattern]?.title || r.title}`;
export const clientPageTitle = (code) => `Customer ${code}`;
export const playbookPageTitle = (key) => `Playbook ${PATTERNS[key]?.title || key}`;

/** Full incident record. Lives under the customer: never shown to other customers. */
export function recordMarkdown(r) {
	const c = CLIENTS[r.client]?.name || r.client;
	const ent = Object.entries(r.entity || {}).filter(([, v]) => v && v !== '—');
	return [
		`# ${r.id}: ${r.title}`,
		'',
		`> Customer-confidential (${c}). Written by Tūtei when the alert was resolved. Do not share outside this customer.`,
		'',
		'| | |',
		'|---|---|',
		`| Customer | ${c} (${r.client}) |`,
		`| Alert | ${r.alertId || 'n/a (historical)'} |`,
		`| Pattern | ${PATTERNS[r.pattern]?.title || r.pattern} |`,
		`| Technique | ${PATTERNS[r.pattern]?.technique || '—'} |`,
		`| Outcome | ${OUTCOME_LABEL[r.outcome]} |`,
		`| Resolved | ${dateOf(r.resolvedAt)} |`,
		`| Analyst | ${r.analyst || '—'} |`,
		`| Signed off by | ${r.approver || 'not required'} |`,
		...(r.aiVerdict ? [`| AI verdict | ${r.aiVerdict} at ${Math.round((r.aiConfidence || 0) * 100)}% |`] : []),
		'',
		'## Affected',
		'',
		...(ent.length ? ent.map(([k, v]) => `- ${k}: \`${v}\``) : ['- none recorded']),
		'',
		'## What was done',
		'',
		r.actionTaken || '—',
		'',
		'## Analyst note',
		'',
		r.note || '_No note._',
		'',
		'## Lesson for the playbook',
		'',
		r.lesson ? `${r.lesson}\n\nShared with other customers only as: “${redact(r.lesson, r.entity)}”` : '_None given._',
		'',
		`See also: [[${clientPageTitle(r.client)}]] · [[${playbookPageTitle(r.pattern)}]]`
	].join('\n');
}

/** The customer's index page: every record for that customer. */
export function clientMarkdown(code, kb) {
	const rows = kb.filter((r) => r.client === code).sort((a, b) => b.resolvedAt - a.resolvedAt);
	return [
		`# ${CLIENTS[code]?.name || code} (${code})`,
		'',
		'> Customer-confidential. Resolution history kept by Tūtei and OpenClaw.',
		'',
		'| Record | Pattern | Outcome | Resolved |',
		'|---|---|---|---|',
		...rows.map((r) => `| [[${recordPageTitle(r)}]] | ${PATTERNS[r.pattern]?.title || r.pattern} | ${OUTCOME_LABEL[r.outcome]} | ${dateOf(r.resolvedAt)} |`)
	].join('\n');
}

/** Cross-customer playbook. Built only from structured, redacted fields. */
export function playbookMarkdown(key, kb) {
	const rows = kb.filter((r) => r.pattern === key).sort((a, b) => b.resolvedAt - a.resolvedAt);
	const customers = new Set(rows.map((r) => r.client)).size;
	const n = (o) => rows.filter((r) => r.outcome === o).length;
	return [
		`# Playbook: ${PATTERNS[key]?.title || key}`,
		'',
		'> Shared across all customers. Anonymised: no customer, user, host or address appears here.',
		'',
		`- Technique: ${PATTERNS[key]?.technique || '—'}`,
		`- Seen ${rows.length} ${rows.length === 1 ? 'time' : 'times'} across ${customers} ${customers === 1 ? 'customer' : 'customers'}`,
		`- Confirmed threat ${n('true_positive')} · benign ${n('benign')} · false positive ${n('false_positive')}`,
		'',
		'## Lessons',
		'',
		...rows.filter((r) => r.lesson).map((r) => `- ${redact(r.lesson, r.entity)} _(${monthOf(r.resolvedAt)}, ${OUTCOME_LABEL[r.outcome].toLowerCase()})_`),
		'',
		'## What fixed it',
		'',
		'| When | Outcome | Action |',
		'|---|---|---|',
		...rows.map((r) => `| ${monthOf(r.resolvedAt)} | ${OUTCOME_LABEL[r.outcome]} | ${GENERIC_ACTION[r.actionId] || 'Resolved'} |`)
	].join('\n');
}

/** The anonymised playbook as data, for the app. */
export function playbookData(key, kb) {
	const rows = kb.filter((r) => r.pattern === key).sort((a, b) => b.resolvedAt - a.resolvedAt);
	return {
		key,
		title: PATTERNS[key]?.title || key,
		technique: PATTERNS[key]?.technique,
		count: rows.length,
		customers: new Set(rows.map((r) => r.client)).size,
		entries: rows.map((r) => ({ month: monthOf(r.resolvedAt), outcome: r.outcome, resolution: GENERIC_ACTION[r.actionId] || 'Resolved', lesson: redact(r.lesson, r.entity) })),
		markdown: playbookMarkdown(key, kb)
	};
}
