<script>
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { api, describeError } from '$lib/api/index.js';
	import { settings, me } from '$lib/settings.svelte.js';
	import { refreshAlerts, refreshApprovals, toast } from '$lib/state.svelte.js';
	import { confidenceState, approvalRequirement, VERDICT_LABEL } from '$lib/policy.js';
	import { timeAgo, clock, pct, day, STATUS_LABEL, OUTCOME_LABEL, WIKI_LABEL } from '$lib/format.js';
	import { canBrief, speak, stopSpeaking, buzz } from '$lib/media.js';
	import SeverityTag from '$lib/components/SeverityTag.svelte';
	import ConfidenceBadge from '$lib/components/ConfidenceBadge.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import ActivityChart from '$lib/components/ActivityChart.svelte';
	import VoiceNote from '$lib/components/VoiceNote.svelte';
	import { viewport } from '$lib/viewport.svelte.js';
	import { track, seen } from '$lib/eval.svelte.js';

	const id = $derived(page.params.id);

	let alert = $state(/** @type {any} */ (null));
	let loadError = $state('');
	let triage = $state(/** @type {any} */ (null));
	let triageStatus = $state(/** @type {'loading'|'done'|'error'} */ ('loading'));
	let triageError = $state('');
	let elapsed = $state(0);
	let revealed = $state(false);
	let speaking = $state(false);

	let choice = $state(/** @type {null|'approve'|'reject'|'escalate'} */ (null));
	let note = $state('');
	let lesson = $state('');
	let voice = $state(/** @type {string|null} */ (null));
	let submitting = $state(false);
	let submitError = $state('');

	$effect(() => {
		const cur = id;
		untrack(() => load(cur));
		return () => stopSpeaking();
	});

	async function load(/** @type {string} */ cur) {
		alert = null;
		loadError = '';
		triage = null;
		revealed = false;
		choice = null;
		try {
			alert = await api.getAlert(cur);
			track('alert_opened', { alertId: cur, detail: alert.severity });
			loadTriage(cur);
		} catch (e) {
			loadError = describeError(e);
		}
	}

	async function loadTriage(/** @type {string} */ cur) {
		triageStatus = 'loading';
		triageError = '';
		elapsed = 0;
		const timer = setInterval(() => elapsed++, 1000);
		const started = Date.now();
		try {
			const t = await api.getTriage(cur);
			if (cur !== id) return;
			triage = t;
			triageStatus = 'done';
			const st = confidenceState(t, settings.threshold);
			track('triage_shown', { alertId: cur, state: st, value: Date.now() - started, detail: `confidence ${Math.round(t.confidence * 100)}%` });
			track('state_shown', { alertId: cur, state: st });
		} catch (e) {
			if (cur !== id) return;
			triageStatus = 'error';
			triageError = describeError(e);
			track('triage_shown', { alertId: cur, state: 'no_answer', value: Date.now() - started, detail: /** @type {any} */ (e)?.code || 'error' });
			track('state_shown', { alertId: cur, state: 'no_answer' });
		} finally {
			clearInterval(timer);
		}
	}

	async function reloadAlert() {
		try {
			alert = await api.getAlert(id);
		} catch {
			/* keep what we have */
		}
	}

	// The wiki is written in the background after a resolution: check back until it lands.
	$effect(() => {
		if (alert?.record?.wiki?.status !== 'pending') return;
		const t = setTimeout(reloadAlert, 2000);
		return () => clearTimeout(t);
	});

	const sameHistory = $derived(triage?.similar?.filter((/** @type {any} */ s) => s.scope === 'same') ?? []);
	const otherHistory = $derived(triage?.similar?.filter((/** @type {any} */ s) => s.scope === 'other') ?? []);

	const cstate = $derived(
		triageStatus === 'done' ? confidenceState(triage, settings.threshold) : triageStatus === 'error' ? 'failed' : null
	);
	const showSuggestion = $derived(cstate === 'confident' || (cstate === 'unsure' && revealed));
	const canDecide = $derived(alert?.status === 'new' && triageStatus !== 'loading');
	const requirement = $derived(
		choice ? approvalRequirement({ decision: choice, action: triage?.action, role: settings.role }) : null
	);

	function briefing() {
		const parts = [`${alert.severity} severity alert. ${alert.title}.`];
		if (settings.speakSensitive) {
			const who = [alert.entity.user, alert.entity.host].filter((x) => x && x !== '—').join(' on ');
			if (who) parts.push(`Affecting ${who}.`);
		}
		if (triageStatus === 'done') {
			parts.push(`The AI's verdict: ${VERDICT_LABEL[triage.verdict] || triage.verdict}, ${pct(triage.confidence)} confident.`);
			if (cstate === 'unsure') parts.push('That is below the threshold, so this alert needs your review.');
			parts.push(triage.diagnosis);
			if (showSuggestion) parts.push(`Suggested action: ${triage.action.label}.`);
		} else if (triageStatus === 'error') {
			parts.push('The agent did not answer. Work this alert manually from the raw event.');
		}
		return parts.join(' ');
	}

	function toggleSpeech() {
		if (speaking) {
			stopSpeaking();
			speaking = false;
			track('briefing_stopped', { alertId: id, state: evalState(), detail: 'stopped by user' });
		} else {
			const text = briefing();
			speaking = speak(text, () => {
				if (speaking) track('briefing_stopped', { alertId: id, state: evalState(), detail: 'finished' });
				speaking = false;
			});
			if (speaking) track('briefing_played', { alertId: id, state: evalState(), value: text.length });
		}
	}

	/** The confidence state as the evaluation log names it. */
	const evalState = () => (cstate === 'failed' ? 'no_answer' : cstate || '');

	async function submit() {
		if (!choice) return;
		submitting = true;
		submitError = '';
		try {
			const res = await api.postDecision(id, { decision: choice, note: note.trim(), lesson: lesson.trim(), voiceNote: voice, analyst: me() });
			track('decision_made', {
				alertId: id,
				state: evalState(),
				value: choice,
				detail: [res.status, cstate === 'unsure' ? (revealed ? 'suggestion revealed' : 'suggestion hidden') : '', voice ? 'voice note' : ''].filter(Boolean).join('; ')
			});
			buzz('success');
			toast(
				res.status === 'awaiting_approval' ? 'Sent to a senior for sign-off' : `Done: ${STATUS_LABEL[res.status]}`,
				'success'
			);
			choice = null;
			note = '';
			lesson = '';
			voice = null;
			await reloadAlert();
			refreshAlerts();
			refreshApprovals();
		} catch (e) {
			submitError = describeError(e);
		} finally {
			submitting = false;
		}
	}

	const DECISIONS = {
		approve: { label: 'Approve suggested action', short: 'Approve' },
		reject: { label: 'Reject as false positive', short: 'Reject' },
		escalate: { label: 'Escalate to a colleague', short: 'Escalate' }
	};
</script>

{#if !viewport.wide}<a class="back" href="#/">‹ All alerts</a>{/if}

{#if loadError}
	<div class="card err" role="alert">
		<h1>Couldn’t open this alert</h1>
		<p class="muted">{loadError}</p>
		<button class="btn" onclick={() => load(id)}>Try again</button>
	</div>
{:else if !alert}
	<p class="muted" role="status">Loading alert…</p>
{:else}
	<article class="stack">
		<header class="stack tight">
			<div class="row between">
				<SeverityTag severity={alert.severity} />
				<span class="small muted mono">{alert.id} · {timeAgo(alert.createdAt)}</span>
			</div>
			<h1>{alert.title}</h1>
			<p class="small"><b>{alert.client?.name || 'Unknown customer'}</b> <span class="muted">· {alert.source}</span></p>
			<dl class="entity small">
				{#each [['User', alert.entity.user], ['Host', alert.entity.host], ['IP', alert.entity.ip]] as [k, v]}
					{#if v && v !== '—'}<div><dt>{k}</dt><dd class="mono">{v}</dd></div>{/if}
				{/each}
			</dl>
		</header>

		{#if alert.returnedComment}
			<div class="banner warn" role="status"><b>Sent back for another look.</b> {alert.returnedComment}</div>
		{/if}
		{#if alert.status === 'awaiting_approval'}
			<div class="banner warn" role="status"><b>Waiting for senior sign-off.</b> You’ll see the outcome here.</div>
		{:else if alert.status !== 'new'}
			<div class="banner good" role="status">
				<b>{STATUS_LABEL[alert.status]}.</b>
				{#if alert.status === 'escalated'}
					A colleague now owns this alert.
				{:else if alert.record}
					Saved to the knowledge base as <a href="#/kb/{alert.record.id}"><b>{alert.record.id}</b></a>, so the next similar alert learns from it.
					<span class="wiki-line small">
						{#if alert.record.wiki?.status === 'written' && alert.record.wiki.url}
							<a href={alert.record.wiki.url} target="_blank" rel="noopener">{WIKI_LABEL.written} ↗</a>
						{:else}
							<span class:errtext={alert.record.wiki?.status === 'failed'}>{WIKI_LABEL[alert.record.wiki?.status] || ''}</span>
							{#if alert.record.wiki?.status === 'failed'}<span class="muted"> · retry from the Wiki tab</span>{/if}
						{/if}
					</span>
				{/if}
			</div>
		{/if}

		<!-- AI triage -->
		<section class="card stack triage {cstate || 'loading'}" aria-labelledby="ai-h" aria-busy={triageStatus === 'loading'}>
			<div class="row between">
				<h2 id="ai-h">AI triage</h2>
				{#if cstate}<ConfidenceBadge state={cstate} confidence={triage?.confidence} />{/if}
			</div>

			{#if triageStatus === 'loading'}
				<div class="thinking" role="status">
					<span class="pulse" aria-hidden="true"></span>
					<p>Asking the OpenClaw agent… <span class="muted">{elapsed}s</span></p>
				</div>
			{:else if triageStatus === 'error'}
				<p><b>No answer from the agent.</b> {triageError}</p>
				<p class="small muted">Nothing has been guessed. Retry, or work the alert manually from the raw event below.</p>
				<button class="btn" onclick={() => { track('retry_clicked', { alertId: id, state: 'no_answer' }); loadTriage(id); }}>↻ Retry</button>
			{:else}
				<p class="verdict">{VERDICT_LABEL[triage.verdict] || triage.verdict}</p>
				{#if cstate === 'unsure'}
					<p class="small"><b>Needs human review.</b> The AI is below the {pct(settings.threshold)} confidence threshold, so it isn’t recommending an action.</p>
				{/if}
				<p>{triage.diagnosis}</p>
				{#if triage.source === 'openclaw'}
					<p class="small muted">Live answer from the OpenClaw agent in {((triage.agentMs || 0) / 1000).toFixed(1)} s.{#if triage.actionReason}{' '}{triage.actionReason}{/if}</p>
				{/if}
				{#if triage.learning}
					<div class="learned small" class:none={!triage.learning.sameCount && !triage.learning.otherCount}>
						<p><b>From past resolutions.</b> {triage.learning.summary}</p>
						{#if triage.learning.adjustment}
							<p class="muted">Confidence {pct(triage.learning.baseConfidence)} → <b>{pct(triage.confidence)}</b> ({triage.learning.adjustment > 0 ? 'history agrees with the AI' : 'history disagrees with the AI'}).</p>
						{/if}
					</div>
				{/if}

				{#if cstate === 'unsure' && !revealed}
					<button class="btn ghost small" onclick={() => { revealed = true; track('suggestion_revealed', { alertId: id, state: 'unsure' }); }}>Show the AI’s suggestion anyway</button>
				{/if}
				{#if showSuggestion}
					<div class="suggest">
						<p class="eyebrow">Suggested action</p>
						<p><b>{triage.action.label}</b></p>
						<p class="small muted">{triage.action.detail}</p>
						{#if triage.action.impact === 'high'}<span class="chip impact">Changes production · needs sign-off</span>{/if}
					</div>
				{/if}
			{/if}

			{#if canBrief() && triageStatus !== 'loading'}
				<button class="btn block" onclick={toggleSpeech} aria-pressed={speaking}>
					{speaking ? '■ Stop briefing' : '🔊 Listen to briefing'}
				</button>
				<p class="small muted">{settings.speakSensitive ? 'Briefings include user and host names. Use headphones in public.' : 'User and host names are left out of spoken briefings. Change this in Settings.'}</p>
			{/if}
		</section>

		<!-- Decision -->
		{#if canDecide}
			<section class="card stack" aria-labelledby="decide-h">
				<h2 id="decide-h">Your decision</h2>
				<div class="choices" role="radiogroup" aria-label="Decision">
					{#each Object.entries(DECISIONS) as [key, d]}
						<button
							class="btn choice"
							class:sel={choice === key}
							role="radio"
							aria-checked={choice === key}
							disabled={key === 'approve' && !showSuggestion}
							onclick={() => (choice = /** @type {any} */ (key))}
						>
							{d.label}
						</button>
					{/each}
				</div>
				{#if !showSuggestion && triageStatus !== 'loading'}
					<p class="small muted">Approve is unavailable because the AI has no confident suggestion. You can still reject or escalate.</p>
				{/if}

				{#if choice}
					<label class="stack tight">
						<span class="small"><b>Note</b> <span class="muted">(why, for the audit trail)</span></span>
						<textarea rows="3" bind:value={note} placeholder="e.g. Confirmed with the user by phone"></textarea>
					</label>
					<VoiceNote bind:value={voice} />
					{#if choice !== 'escalate'}
						<label class="stack tight">
							<span class="small"><b>Lesson for other customers</b> <span class="muted">(optional)</span></span>
							<textarea rows="2" bind:value={lesson} maxlength="500" placeholder="e.g. Check for a saved old password on the phone first"></textarea>
							<span class="small muted">Goes into the shared playbook with names, hosts, addresses and the customer removed.</span>
						</label>
					{/if}

					{#if requirement?.required}
						<div class="banner warn">
							<b>This will go to a senior for sign-off.</b>
							<ul>{#each requirement.reasons as r}<li>{r}</li>{/each}</ul>
						</div>
					{/if}

					{#if submitError}<p class="small errtext" role="alert">{submitError}</p>{/if}
					<button class="btn primary block" onclick={submit} disabled={submitting}>
						{submitting ? 'Sending…' : requirement?.required ? 'Send for sign-off' : `Confirm: ${DECISIONS[choice].short}`}
					</button>
				{/if}
			</section>
		{/if}

		<!-- Evidence: stacked on phones, side by side when the pane is wide enough -->
		<div class="evidence">
			<section class="card stack" aria-labelledby="ev-h" use:seen={{ alertId: id, what: 'timeline', active: triageStatus !== 'loading' }}>
				<h2 id="ev-h">What happened</h2>
				<Timeline events={alert.events} animate={!settings.lightweight} />
			</section>

			{#if !settings.lightweight}
				<section class="card stack" aria-labelledby="act-h" use:seen={{ alertId: id, what: 'activity chart', active: triageStatus !== 'loading' }}>
					<h2 id="act-h">Related activity</h2>
					<ActivityChart values={alert.activity} />
				</section>
			{:else}
				<p class="small muted">Activity chart hidden in lightweight mode.</p>
			{/if}
		</div>

		{#if triageStatus === 'done'}
			<section class="card stack" aria-labelledby="sim-h" use:seen={{ alertId: id, what: 'past resolutions' }}>
				<h2 id="sim-h">Past resolutions</h2>
				{#if !triage.similar?.length}
					<p class="small muted">Nothing similar has been resolved before. This one will be the first record for the pattern.</p>
				{/if}
				{#if sameHistory.length}
					<p class="eyebrow">This customer · {alert.client?.name}</p>
					<ul class="sim">
						{#each sameHistory as s}
							<li>
								<div class="row between">
									<a class="mono small" href="#/kb/{s.id}">{s.id}</a>
									<span class="chip">{pct(s.similarity)} match</span>
								</div>
								<p><b>{s.title}</b> <span class="small outcome o-{s.outcome}">{OUTCOME_LABEL[s.outcome]}</span></p>
								<p class="small">{s.resolution}</p>
								{#if s.note}<p class="small muted">“{s.note}”</p>{/if}
								<p class="small muted">{s.analyst}{s.approver ? `, signed off by ${s.approver}` : ''} · {day(s.resolvedAt)}</p>
								<a class="btn small open-rec" href="#/kb/{s.id}">Open full record ›</a>
							</li>
						{/each}
					</ul>
				{/if}
				{#if otherHistory.length}
					<p class="eyebrow">Other customers · anonymised</p>
					<ul class="sim">
						{#each otherHistory as s}
							<li>
								<div class="row between">
									<span class="small muted">Seen at another customer · {s.resolvedMonth}</span>
									<span class="chip">{pct(s.similarity)} match</span>
								</div>
								<p><b>{s.title}</b> <span class="small outcome o-{s.outcome}">{OUTCOME_LABEL[s.outcome]}</span></p>
								<p class="small">{s.resolution}</p>
								{#if s.lesson}<p class="small muted">Lesson: {s.lesson}</p>{/if}
							</li>
						{/each}
					</ul>
					<p class="small muted">Customer names, users, hosts and addresses from other customers are never shown.</p>
				{/if}
			</section>
		{/if}

		{#if alert.audit?.length}
			<section class="card stack" aria-labelledby="aud-h">
				<h2 id="aud-h">Audit trail</h2>
				<ol class="audit small">
					{#each alert.audit as e}
						<li>
							<span class="mono muted">{clock(e.at)}</span>
							<span><b>{e.who || 'Unknown'}</b>{e.role ? ` (${e.role})` : ''} {e.what}{e.note ? `: “${e.note}”` : ''}{e.voiceNote ? ' 🎙' : ''}</span>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<!-- Logged only when the analyst opens it: Tūtei opens it by itself when the AI fails, and that is not the analyst looking. -->
		<details class="card" open={triageStatus === 'error'}>
			<summary onclick={(e) => !e.currentTarget.parentElement?.hasAttribute('open') && track('evidence_viewed', { alertId: id, detail: 'raw event' })}>Raw alert from the SIEM</summary>
			<pre class="mono">{JSON.stringify(alert.raw, null, 2)}</pre>
		</details>
	</article>
{/if}

<style>
	.back {
		display: inline-flex;
		min-height: 40px;
		align-items: center;
		text-decoration: none;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.tight {
		gap: 6px;
	}
	.evidence {
		display: grid;
		gap: 12px;
		align-items: start;
	}
	/* Tablet detail pane wide enough: timeline and chart side by side. */
	@container (min-width: 620px) {
		.evidence {
			grid-template-columns: 1fr 1fr;
		}
		.choices {
			grid-template-columns: repeat(3, 1fr);
		}
		.choice {
			justify-content: center;
			text-align: center;
		}
	}
	.between {
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.entity {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin: 0;
	}
	.entity div {
		display: flex;
		gap: 6px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	.banner {
		border-radius: 12px;
		padding: 12px 14px;
		border: 1px solid var(--c);
		background: color-mix(in srgb, var(--c) 12%, transparent);
	}
	.banner ul {
		margin: 6px 0 0;
		padding-left: 20px;
	}
	.banner.warn {
		--c: var(--warn);
	}
	.banner.good {
		--c: var(--good);
	}
	.triage {
		border-width: 2px;
	}
	.triage.confident {
		border-color: var(--good);
	}
	.triage.unsure {
		border-color: var(--warn);
	}
	.triage.failed {
		border-color: var(--bad);
	}
	.verdict {
		font-size: 1.2rem;
		font-weight: 700;
	}
	.thinking {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.pulse {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 1.1s ease-in-out infinite;
		flex: none;
	}
	.suggest {
		border-top: 1px solid var(--line);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.impact {
		align-self: flex-start;
		color: var(--warn);
		border-color: var(--warn);
		margin-top: 4px;
	}
	.choices {
		display: grid;
		gap: 8px;
	}
	.choice {
		justify-content: flex-start;
		text-align: left;
		padding: 10px 16px;
	}
	.choice.sel {
		border: 2px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
	}
	.choice.sel::before {
		content: '●';
		color: var(--accent);
	}
	.sim,
	.audit {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sim li + li {
		border-top: 1px solid var(--line);
		padding-top: 12px;
	}
	.learned {
		border-left: 3px solid var(--accent);
		padding: 4px 0 4px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.learned.none {
		border-left-color: var(--line);
		color: var(--muted);
	}
	.wiki-line {
		display: block;
		margin-top: 4px;
	}
	.outcome {
		white-space: nowrap;
		font-weight: 600;
	}
	.o-true_positive {
		color: var(--bad);
	}
	.o-false_positive,
	.o-benign {
		color: var(--good);
	}
	.audit li {
		display: grid;
		grid-template-columns: 52px 1fr;
		gap: 8px;
	}
	.err {
		border-color: var(--bad);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.errtext {
		color: var(--bad);
	}
	@keyframes pulse {
		50% {
			transform: scale(0.6);
			opacity: 0.5;
		}
	}
	.open-rec {
		align-self: flex-start;
		margin-top: 4px;
	}
</style>
