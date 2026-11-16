<script>
	import { track } from '$lib/eval.svelte.js';
	import { api, describeError } from '$lib/api/index.js';
	import { settings, me, PERSONAS } from '$lib/settings.svelte.js';
	import { app, refreshAlerts, refreshApprovals, toast } from '$lib/state.svelte.js';
	import { timeAgo } from '$lib/format.js';
	import { buzz } from '$lib/media.js';
	import SeverityTag from '$lib/components/SeverityTag.svelte';

	/** @type {Record<string, string>} */
	let comments = $state({});
	/** @type {Record<string, string>} */
	let errors = $state({});
	let busy = $state('');

	$effect(() => {
		refreshApprovals();
	});

	const mine = $derived(app.approvals.filter((p) => p.requestedBy?.name === me().name));

	async function decide(/** @type {any} */ p, /** @type {boolean} */ approve) {
		busy = p.id;
		errors[p.id] = '';
		try {
			await api.postApproval(p.id, { approve, comment: (comments[p.id] || '').trim(), approver: me() });
			track('signoff_decided', { alertId: p.alertId, value: approve ? 'approve' : 'send_back', detail: (comments[p.id] || '').trim() ? 'with comment' : '' });
			buzz('success');
			toast(approve ? `Approved: ${p.actionLabel}` : 'Sent back to the analyst', 'success');
			await refreshApprovals();
			refreshAlerts();
		} catch (e) {
			errors[p.id] = describeError(e);
		} finally {
			busy = '';
		}
	}
</script>

<section class="stack">
	<div>
		<p class="eyebrow">Four-eyes check</p>
		<h1>Senior sign-off</h1>
	</div>

	{#if settings.role !== 'senior'}
		<div class="card stack">
			<p>Sign-off is done by a senior analyst. Decisions you send for sign-off appear here until a senior acts on them.</p>
			<button class="btn" onclick={() => (settings.role = 'senior')}>Switch to {PERSONAS.senior.name} (senior) to try it</button>
		</div>
		<h2>Your requests ({mine.length})</h2>
		{#if mine.length === 0}
			<p class="muted">Nothing waiting.</p>
		{/if}
		{#each mine as p (p.id)}
			<a class="card req" href="#/alerts/{p.alertId}">
				<SeverityTag severity={p.severity} />
				<p><b>{p.alertTitle}</b>{#if p.client} <span class="small muted">· {p.client.name}</span>{/if}</p>
				<p class="small muted">{p.actionLabel} · sent {timeAgo(p.createdAt)}</p>
			</a>
		{/each}
	{:else if app.approvals.length === 0}
		<div class="card"><p><b>Nothing to sign off.</b> Requests from analysts will appear here with a notification.</p></div>
	{:else}
		{#each app.approvals as p (p.id)}
			<article class="card stack" aria-labelledby="h-{p.id}">
				<div class="row between">
					<SeverityTag severity={p.severity} />
					<span class="small muted mono">{p.id} · {timeAgo(p.createdAt)}</span>
				</div>
				<h2 id="h-{p.id}">{p.actionLabel}</h2>
				<p class="small">
					On <a href="#/alerts/{p.alertId}">{p.alertTitle}</a>{p.client ? ` (${p.client.name})` : ''}, requested by <b>{p.requestedBy?.name}</b> ({p.requestedBy?.role})
				</p>
				<ul class="reasons small">
					{#each p.reasons as r}<li>{r}</li>{/each}
				</ul>
				{#if p.note}<blockquote>“{p.note}”</blockquote>{/if}
				{#if p.lesson}<p class="small"><b>Proposed playbook lesson:</b> {p.lesson} <span class="muted">(shared anonymised once you approve)</span></p>{/if}
				{#if p.voiceNote}
					<div class="stack tight">
						<span class="small muted">Voice note from {p.requestedBy?.name}</span>
						<audio controls src={p.voiceNote}></audio>
					</div>
				{/if}
				<label class="stack tight">
					<span class="small"><b>Comment</b> <span class="muted">(required when sending back)</span></span>
					<textarea rows="2" bind:value={comments[p.id]} placeholder="Feedback for the analyst"></textarea>
				</label>
				{#if errors[p.id]}<p class="small errtext" role="alert">{errors[p.id]}</p>{/if}
				<div class="actions">
					<button class="btn" disabled={busy === p.id || !(comments[p.id] || '').trim()} onclick={() => decide(p, false)}>Send back</button>
					<button class="btn primary" disabled={busy === p.id} onclick={() => decide(p, true)}>Approve</button>
				</div>
			</article>
		{/each}
	{/if}
</section>

<style>
	.between {
		justify-content: space-between;
	}
	.tight {
		gap: 6px;
	}
	.req {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-decoration: none;
	}
	.reasons {
		margin: 0;
		padding-left: 20px;
		color: var(--warn);
	}
	blockquote {
		margin: 0;
		padding: 8px 12px;
		border-left: 4px solid var(--line);
		background: var(--surface-2);
		border-radius: 0 8px 8px 0;
	}
	audio {
		width: 100%;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.errtext {
		color: var(--bad);
	}
</style>
