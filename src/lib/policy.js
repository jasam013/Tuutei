// Business rules shared by the app and the mock backend.
// In production the orchestration layer must enforce these too; the app only previews them.

export const DEFAULT_THRESHOLD = 0.75;

/**
 * Which of the three states a triage result is in (slide 11 of the deck).
 * @param {{confidence:number}|null} triage
 * @param {number} threshold
 * @returns {'confident'|'unsure'|'failed'}
 */
export function confidenceState(triage, threshold = DEFAULT_THRESHOLD) {
	if (!triage) return 'failed';
	return triage.confidence >= threshold ? 'confident' : 'unsure';
}

/**
 * Does this decision need a second, senior approver?
 * Two triggers: a high-impact action is being approved, or the analyst is a junior.
 * Escalating never needs sign-off (it already hands the alert to someone else).
 * @param {{decision:'approve'|'reject'|'escalate', action?:{impact:string}, role:'junior'|'senior'}} input
 * @returns {{required:boolean, reasons:string[]}}
 */
export function approvalRequirement({ decision, action, role }) {
	const reasons = [];
	if (decision === 'escalate') return { required: false, reasons };
	if (decision === 'approve' && action?.impact === 'high') {
		reasons.push('This action changes a production system');
	}
	if (role === 'junior') {
		reasons.push('Junior analyst decisions are reviewed by a senior');
	}
	return { required: reasons.length > 0, reasons };
}

export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export const VERDICT_LABEL = {
	true_positive: 'Likely malicious',
	false_positive: 'Likely false alarm',
	benign: 'Benign'
};
