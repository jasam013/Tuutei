// Remote study mode (HCI evaluation, Assessment 3). Opened with ?study=1 on the public demo copy.
// A participant works through T1 to T7 alone, guided by an on-screen task card, rates each task's
// ease (Single Ease Question), answers SUS, NASA-TLX and trust questions, then sends one results
// file back. Runs entirely on demo data in their browser; nothing is sent anywhere automatically.
import { untrack } from 'svelte';
import { evalPrefs, saveEvalPrefs, track, localRows, clearLocal } from './eval.svelte.js';
import { settings, persistSettings } from './settings.svelte.js';

const KEY = 'tutei.study.v1';

export const STUDY_TASKS = [
	{
		id: 'T1',
		title: 'Respond to a new alert',
		text: 'Tap “Send the alert”. A new alert will arrive with a sound. Open it and work out what happened.',
		done: 'When you can say in one sentence what happened, tap “I’ve done it”.',
		action: 'send'
	},
	{
		id: 'T2',
		title: 'Act on a Confident alert',
		text: 'Open “Impossible travel sign-in” (Kōwhai Health). Decide what should happen and submit your decision.',
		done: 'Tap “I’ve done it” once your decision is submitted.'
	},
	{
		id: 'T3',
		title: 'Act on an Unsure alert',
		text: 'Open “VPN brute force, then success” (Awanui District Council). Decide what should happen and submit your decision.',
		done: 'Tap “I’ve done it” once your decision is submitted.'
	},
	{
		id: 'T4',
		title: 'An alert the AI could not answer',
		text: 'Open “Traffic to newly registered domain”. Deal with it however you think best.',
		done: 'Tap “I’ve done it” when you have a verdict or have decided what to do.'
	},
	{
		id: 'T5',
		title: 'Listen to a briefing',
		text: 'Open any alert and play its spoken briefing. Try to listen without looking at the screen.',
		done: 'Then write in the box below what the briefing told you.',
		recall: true
	},
	{
		id: 'T6',
		title: 'Sign-off as a senior',
		text: 'You are now Jason, a senior analyst. A junior has asked you to approve a decision. Send it back with a comment explaining why.',
		done: 'Tap “I’ve done it” once it has been sent back.',
		action: 'senior'
	},
	{
		id: 'T7',
		title: 'Find a past resolution',
		text: 'On the alert “VPN brute force, then success”, find how this customer resolved a similar alert before, and open that record.',
		done: 'Tap “I’ve done it” once the record is open.'
	}
];

export const SUS_ITEMS = [
	'I think that I would like to use this system frequently.',
	'I found the system unnecessarily complex.',
	'I thought the system was easy to use.',
	'I think that I would need the support of a technical person to be able to use this system.',
	'I found the various functions in this system were well integrated.',
	'I thought there was too much inconsistency in this system.',
	'I would imagine that most people would learn to use this system very quickly.',
	'I found the system very cumbersome to use.',
	'I felt very confident using the system.',
	'I needed to learn a lot of things before I could get going with this system.'
];

export const TLX_ITEMS = [
	['mental', 'Mental demand', 'How mentally demanding were the tasks?', 'Very low', 'Very high'],
	['physical', 'Physical demand', 'How physically demanding were the tasks?', 'Very low', 'Very high'],
	['temporal', 'Temporal demand', 'How hurried or rushed was the pace?', 'Very low', 'Very high'],
	['performance', 'Performance', 'How successful were you at what you were asked to do?', 'Perfect', 'Failure'],
	['effort', 'Effort', 'How hard did you have to work to reach your level of performance?', 'Very low', 'Very high'],
	['frustration', 'Frustration', 'How insecure, discouraged, irritated, stressed or annoyed were you?', 'Very low', 'Very high']
];

export const TRUST_ITEMS = [
	'I could tell when to trust the AI’s suggestion and when to check it.',
	'The confidence label matched how reliable the AI seemed.',
	'I felt I had to re-check everything the AI said.'
];

const fresh = () => ({
	active: false,
	step: /** @type {'welcome'|'tasks'|'questions'|'done'} */ ('welcome'),
	code: '',
	consent: false,
	background: { role: '', years: '', oncall: '', device: '' },
	taskIndex: 0,
	collapsed: false,
	tasks: /** @type {Record<string, {outcome:string, ease:number|null, recall?:string, startedAt:string, endedAt:string}>} */ ({}),
	answers: {
		sus: /** @type {(number|null)[]} */ (Array(10).fill(null)),
		tlx: /** @type {Record<string, number|null>} */ ({ mental: null, physical: null, temporal: null, performance: null, effort: null, frustration: null }),
		trust: /** @type {(number|null)[]} */ ([null, null, null]),
		hardest: '',
		useful: '',
		change: ''
	},
	startedAt: '',
	finishedAt: ''
});

function load() {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
		return saved ? { ...fresh(), ...saved } : fresh();
	} catch {
		return fresh();
	}
}

export const study = $state(typeof window === 'undefined' ? fresh() : load());

export function saveStudy() {
	try {
		localStorage.setItem(KEY, JSON.stringify(study));
	} catch {
		/* private window: the study still works for this visit */
	}
}

/** Anonymous code such as R-7K3Q: easy to read out, never a name. */
function newCode() {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let s = 'R-';
	for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
}

export function deviceSummary() {
	const ua = navigator.userAgent;
	const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'Other';
	const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Other';
	return `${os}, ${browser}, ${window.innerWidth}x${window.innerHeight}`;
}

/** Called on load: ?study=1 starts (or resumes) a study on this device. */
export function initStudy() {
	if (typeof window === 'undefined') return;
	const wants = new URLSearchParams(location.search).has('study');
	if (!wants && !study.active) return;
	untrack(() => {
		if (!study.active) {
			Object.assign(study, fresh(), { active: true, code: newCode(), background: { ...fresh().background, device: deviceSummary() } });
			saveStudy();
		}
	});
}

/** Consent given: put the app in its test state and start recording. */
export function beginTasks(/** @type {() => Promise<any>} */ resetDemo) {
	settings.dataSource = 'mock';
	settings.role = 'junior';
	settings.onCall = true;
	settings.simulateFailures = false;
	persistSettings();
	clearLocal();
	evalPrefs.on = true;
	evalPrefs.participant = study.code;
	evalPrefs.task = STUDY_TASKS[0].id;
	saveEvalPrefs();
	study.step = 'tasks';
	study.taskIndex = 0;
	study.startedAt = new Date().toISOString();
	study.tasks[STUDY_TASKS[0].id] = { outcome: '', ease: null, startedAt: study.startedAt, endedAt: '' };
	saveStudy();
	track('session_started', { detail: `remote study; ${study.background.device}` });
	track('task_changed', { value: STUDY_TASKS[0].id });
	return resetDemo();
}

export function currentTask() {
	return STUDY_TASKS[study.taskIndex];
}

/** Record the outcome and ease of the current task, then move on. */
export function finishTask(/** @type {'done'|'failed'} */ outcome, /** @type {number} */ ease, recall = '') {
	const t = currentTask();
	const rec = study.tasks[t.id] || { outcome: '', ease: null, startedAt: new Date().toISOString(), endedAt: '' };
	Object.assign(rec, { outcome, ease, endedAt: new Date().toISOString() }, t.recall ? { recall: recall.slice(0, 500) } : {});
	study.tasks[t.id] = rec;
	track('study_task_done', { value: outcome, detail: `ease ${ease}` });
	if (study.taskIndex < STUDY_TASKS.length - 1) {
		study.taskIndex += 1;
		const next = currentTask();
		study.tasks[next.id] = { outcome: '', ease: null, startedAt: new Date().toISOString(), endedAt: '' };
		evalPrefs.task = next.id;
		saveEvalPrefs();
		track('task_changed', { value: next.id });
	} else {
		evalPrefs.task = '';
		saveEvalPrefs();
		study.step = 'questions';
	}
	study.collapsed = false;
	saveStudy();
}

export const susScore = (/** @type {(number|null)[]} */ a) =>
	a.every((v) => v != null) ? a.reduce((s, v, i) => s + (i % 2 === 0 ? /** @type {number} */ (v) - 1 : 5 - /** @type {number} */ (v)), 0) * 2.5 : null;

export function tlxMean() {
	const v = Object.values(study.answers.tlx);
	return v.every((x) => x != null) ? Math.round((v.reduce((a, b) => a + /** @type {number} */ (b), 0) / 6) * 10) / 10 : null;
}

export function finishStudy() {
	study.finishedAt = new Date().toISOString();
	study.step = 'done';
	evalPrefs.on = false;
	saveEvalPrefs();
	saveStudy();
}

/** Everything the participant sends back, as one JSON document. */
export function resultsJson() {
	const events = localRows().filter((r) => r.participant === study.code);
	return JSON.stringify(
		{
			format: 'tutei-study-v1',
			code: study.code,
			background: study.background,
			startedAt: study.startedAt,
			finishedAt: study.finishedAt,
			tasks: study.tasks,
			answers: study.answers,
			scores: { sus: susScore(study.answers.sus), tlxMean: tlxMean(), trust3Reversed: study.answers.trust[2] != null ? 8 - study.answers.trust[2] : null },
			events
		},
		null,
		1
	);
}

/** Leave study mode on this device (for whoever runs the study). */
export function endStudy() {
	Object.assign(study, fresh());
	evalPrefs.on = false;
	saveEvalPrefs();
	saveStudy();
}
