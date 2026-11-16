<script>
	import { api, describeError } from '$lib/api/index.js';
	import { settings } from '$lib/settings.svelte.js';
	import { toast } from '$lib/state.svelte.js';
	import { day, OUTCOME_LABEL, WIKI_LABEL } from '$lib/format.js';

	let data = $state(/** @type {any} */ (null));
	let error = $state('');
	let client = $state('all');
	let syncing = $state(false);

	async function load() {
		error = '';
		try {
			data = await api.listKb();
		} catch (e) {
			error = describeError(e);
		}
	}

	$effect(() => {
		settings.dataSource;
		load();
		const t = setInterval(load, 15000);
		return () => clearInterval(t);
	});

	// Check back quickly while wiki writes are under way.
	const writing = $derived(data?.records?.some((/** @type {any} */ r) => r.wiki?.status === 'pending'));
	$effect(() => {
		if (!writing) return;
		const t = setTimeout(load, 2000);
		return () => clearTimeout(t);
	});

	const clients = $derived(
		data ? [...new Map(data.records.map((/** @type {any} */ r) => [r.client.code, r.client])).values()].sort((a, b) => a.name.localeCompare(b.name)) : []
	);
	const shown = $derived(data?.records?.filter((/** @type {any} */ r) => client === 'all' || r.client.code === client) ?? []);
	const unwritten = $derived(data?.records?.filter((/** @type {any} */ r) => !['written', 'pending'].includes(r.wiki?.status)).length ?? 0);

	async function sync() {
		syncing = true;
		try {
			const ids = await api.syncWiki();
			toast(`Writing ${ids.queued ?? ids.length} records to the wiki`, 'success');
			await load();
		} catch (e) {
			toast(describeError(e), 'error');
		} finally {
			syncing = false;
		}
	}
</script>

<section class="stack">
	<div>
		<p class="eyebrow">Knowledge base</p>
		<h1>Resolution records</h1>
	</div>
	<p class="small muted">Every closed alert becomes a record here. When a similar alert comes in, OpenClaw looks these up: full detail for the same customer, an anonymised pattern for everyone else.</p>

	{#if error}
		<div class="card err" role="alert">
			<p><b>Can’t load the knowledge base.</b> {error}</p>
			<button class="btn" onclick={load}>Try again</button>
		</div>
	{:else if !data}
		<p class="muted" role="status">Loading…</p>
	{:else}
		<div class="card stack wiki" class:on={data.wiki.enabled}>
			{#if data.wiki.enabled}
				<p><b>Writing to the {data.wiki.label}.</b> Each resolution updates its record page, the customer’s index and the shared playbook.</p>
				{#if unwritten}
					<button class="btn" onclick={sync} disabled={syncing}>{syncing ? 'Queuing…' : `Copy ${unwritten} ${unwritten === 1 ? 'record' : 'records'} to the wiki`}</button>
				{/if}
			{:else if settings.dataSource === 'mock'}
				<p><b>Demo data.</b> Records are kept on this device. Wiki pages are written only in OpenClaw API mode, by the server on your stack.</p>
			{:else}
				<p><b>Gitea wiki not set up.</b> Records are kept by the Tūtei server. Add the TUTEI_GITEA settings on CT 204 to also write wiki pages.</p>
			{/if}
		</div>

		<h2>Playbooks <span class="small muted">shared, anonymised</span></h2>
		<ul class="list">
			{#each data.playbooks as p (p.key)}
				<li>
					<a class="card row-link" href="#/kb/playbook/{p.key}">
						<span><b>{p.title}</b></span>
						<span class="small muted">{p.count} {p.count === 1 ? 'time' : 'times'} · {p.customers} {p.customers === 1 ? 'customer' : 'customers'}</span>
					</a>
				</li>
			{/each}
		</ul>

		<h2>Records <span class="small muted">customer-confidential</span></h2>
		<div class="filters" role="group" aria-label="Filter by customer">
			<button class="chip" aria-pressed={client === 'all'} onclick={() => (client = 'all')}>All</button>
			{#each clients as c (c.code)}
				<button class="chip" aria-pressed={client === c.code} onclick={() => (client = c.code)}>{c.name}</button>
			{/each}
		</div>
		<ul class="list">
			{#each shown as r (r.id)}
				<li>
					<a class="card rec" href="#/kb/{r.id}">
						<div class="row between">
							<span class="mono small">{r.id}{r.alertId ? ` · ${r.alertId}` : ''}</span>
							<span class="small muted">{day(r.resolvedAt)}</span>
						</div>
						<p><b>{r.title}</b></p>
						<p class="small"><b>{r.client.name}</b> <span class="muted">· {r.patternTitle}</span></p>
						<div class="row between">
							<span class="small outcome o-{r.outcome}">{OUTCOME_LABEL[r.outcome]}</span>
							<span class="small muted" class:errtext={r.wiki?.status === 'failed'}>{r.wiki?.status === 'written' ? 'In wiki ✓' : WIKI_LABEL[r.wiki?.status] || ''}</span>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	h2 .small {
		font-weight: 400;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row-link {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		text-decoration: none;
	}
	.rec {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-decoration: none;
	}
	.between {
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.filters {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.filters .chip {
		min-height: 40px;
		padding: 0 14px;
		cursor: pointer;
	}
	.filters .chip[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.wiki {
		border-left: 6px solid var(--muted);
	}
	.wiki.on {
		border-left-color: var(--good);
	}
	.outcome {
		font-weight: 600;
	}
	.o-true_positive {
		color: var(--bad);
	}
	.o-false_positive,
	.o-benign {
		color: var(--good);
	}
	.errtext {
		color: var(--bad);
	}
	.err {
		border-color: var(--bad);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
