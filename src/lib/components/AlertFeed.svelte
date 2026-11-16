<script>
	import SeverityTag from '$lib/components/SeverityTag.svelte';
	import { app, refreshAlerts } from '$lib/state.svelte.js';
	import { SEVERITY_ORDER } from '$lib/policy.js';
	import { timeAgo, STATUS_LABEL, clock } from '$lib/format.js';

	/** The alert feed. On tablets it sits in the left pane, with the open alert highlighted. */
	let { selectedId = null } = $props();

	let filter = $state('open');
	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 30000);
		return () => clearInterval(t);
	});

	const OPEN = ['new', 'awaiting_approval'];
	const shown = $derived(
		app.alerts
			.filter((a) => (filter === 'open' ? OPEN.includes(a.status) : filter === 'done' ? !OPEN.includes(a.status) : true))
			.sort((a, b) => (OPEN.includes(a.status) && OPEN.includes(b.status) ? SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt - a.createdAt : b.createdAt - a.createdAt))
	);
	const openCount = $derived(app.alerts.filter((a) => OPEN.includes(a.status)).length);
</script>

<section class="stack">
	<div class="head">
		<div>
			<p class="eyebrow">On-call queue</p>
			<h1>{app.updatedAt ? `${openCount} open ${openCount === 1 ? 'alert' : 'alerts'}` : 'Loading alerts…'}</h1>
		</div>
		<button class="btn ghost" onclick={refreshAlerts} disabled={app.loading} aria-label="Refresh alerts">
			<span class:spin={app.loading} aria-hidden="true">↻</span>
		</button>
	</div>

	<div class="filters" role="group" aria-label="Filter alerts">
		{#each [['open', 'Open'], ['all', 'All'], ['done', 'Done']] as [key, label]}
			<button class="chip" aria-pressed={filter === key} onclick={() => (filter = key)}>{label}</button>
		{/each}
	</div>

	{#if app.error}
		<div class="card err" role="alert">
			<h2>Can’t reach the agent</h2>
			<p class="muted">{app.error}</p>
			<button class="btn" onclick={refreshAlerts}>Try again</button>
		</div>
	{/if}

	{#if !app.updatedAt && app.loading}
		{#each [1, 2, 3] as _}
			<div class="card skeleton" aria-hidden="true"></div>
		{/each}
		<p class="sr-only" role="status">Loading alerts</p>
	{:else if shown.length === 0 && !app.error}
		<div class="card empty">
			<p><b>All clear.</b> No {filter === 'open' ? 'open ' : ''}alerts right now.</p>
		</div>
	{:else}
		<ul class="list">
			{#each shown as a (a.id)}
				<li>
					<a
						class="card alert"
						class:selected={a.id === selectedId}
						aria-current={a.id === selectedId ? 'true' : undefined}
						href="#/alerts/{a.id}"
						style:--c={`var(--sev-${a.severity})`}
					>
						<div class="row between">
							<SeverityTag severity={a.severity} />
							<span class="small muted">{timeAgo(a.createdAt, now)}</span>
						</div>
						<h2>{a.title}</h2>
						<p class="small"><b>{a.client?.name || ''}</b> <span class="muted">· {a.source}</span></p>
						<p class="small mono muted">
							{a.entity.user !== '—' ? a.entity.user : a.entity.host}
						</p>
						{#if a.returnedComment}
							<p class="chip warn">Sent back by senior</p>
						{:else if a.status !== 'new'}
							<p class="chip status-{a.status}">{STATUS_LABEL[a.status]}</p>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if app.updatedAt}
		<p class="small muted center">Updated {clock(app.updatedAt)} · checks every 15 seconds</p>
	{/if}
</section>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: end;
	}
	.filters {
		display: flex;
		gap: 8px;
	}
	.filters .chip {
		min-height: 40px;
		padding: 0 16px;
		cursor: pointer;
	}
	.filters .chip[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.alert {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-decoration: none;
		border-left: 6px solid var(--c);
	}
	.alert:active {
		transform: scale(0.99);
	}
	.alert.selected {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}
	.between {
		justify-content: space-between;
	}
	.alert .chip {
		align-self: flex-start;
		margin-top: 4px;
	}
	.chip.warn {
		color: var(--warn);
		border-color: var(--warn);
	}
	.status-resolved,
	.status-closed {
		color: var(--good);
	}
	.status-awaiting_approval {
		color: var(--warn);
	}
	.err {
		border-color: var(--bad);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.skeleton {
		height: 116px;
		background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%);
		background-size: 200% 100%;
		animation: shimmer 1.2s infinite;
	}
	.center {
		text-align: center;
	}
	.spin {
		display: inline-block;
		animation: spin 1s linear infinite;
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
