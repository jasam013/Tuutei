export function timeAgo(/** @type {number} */ ms, now = Date.now()) {
	const s = Math.max(0, Math.round((now - ms) / 1000));
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	return `${Math.round(h / 24)} d ago`;
}

export function clock(/** @type {number} */ ms) {
	return new Date(ms).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

export function pct(/** @type {number} */ x) {
	return `${Math.round(x * 100)}%`;
}

export const STATUS_LABEL = {
	new: 'Open',
	awaiting_approval: 'Waiting for sign-off',
	resolved: 'Resolved',
	closed: 'Closed as false positive',
	escalated: 'Escalated'
};

export { OUTCOME_LABEL } from './mock/knowledge.js';

export function day(/** @type {number} */ ms) {
	return new Date(ms).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Where a resolution record is in the Gitea wiki, in words. */
export const WIKI_LABEL = {
	written: 'In the Gitea wiki',
	pending: 'Writing to the wiki…',
	failed: 'Wiki write failed',
	off: 'Saved in Tūtei only (wiki not set up)',
	history: 'Older record, not yet copied to the wiki'
};
