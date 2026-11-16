<script>
	import { track } from '$lib/eval.svelte.js';
	import { page } from '$app/state';
	import { api, describeError } from '$lib/api/index.js';
	import { OUTCOME_LABEL } from '$lib/format.js';

	const key = $derived(page.params.key);
	let p = $state(/** @type {any} */ (null));
	let error = $state('');

	$effect(() => {
		const cur = key;
		p = null;
		track('kb_opened', { detail: `playbook ${cur}` });
		error = '';
		api.getPlaybook(cur).then(
			(out) => cur === key && (p = out),
			(e) => (error = describeError(e))
		);
	});

	const count = (/** @type {string} */ o) => p?.entries.filter((/** @type {any} */ e) => e.outcome === o).length ?? 0;
</script>

<a class="back" href="#/kb">‹ Knowledge base</a>

{#if error}
	<div class="card err" role="alert"><p><b>Can’t open this playbook.</b> {error}</p></div>
{:else if !p}
	<p class="muted" role="status">Loading…</p>
{:else}
	<article class="stack">
		<header class="stack tight">
			<p class="eyebrow">Playbook · shared across customers</p>
			<h1>{p.title}</h1>
			<p class="small muted">{p.technique}</p>
			<p class="banner small">Anonymised. Built only from outcomes, generic actions and redacted lessons: no customer, user, host or address appears here.</p>
		</header>

		<section class="card stats">
			<div><b>{p.count}</b><span class="small muted">times</span></div>
			<div><b>{p.customers}</b><span class="small muted">{p.customers === 1 ? 'customer' : 'customers'}</span></div>
			<div><b class="o-true_positive">{count('true_positive')}</b><span class="small muted">threats</span></div>
			<div><b class="o-benign">{count('false_positive') + count('benign')}</b><span class="small muted">not a threat</span></div>
		</section>

		<section class="card stack">
			<h2>Lessons and what fixed it</h2>
			<ul class="entries">
				{#each p.entries as e}
					<li>
						<div class="row between">
							<span class="small muted">{e.month}</span>
							<span class="small outcome o-{e.outcome}">{OUTCOME_LABEL[e.outcome]}</span>
						</div>
						<p><b>{e.resolution}</b></p>
						{#if e.lesson}<p class="small">{e.lesson}</p>{/if}
					</li>
				{/each}
			</ul>
		</section>

		<details class="card">
			<summary class="small">Markdown written to the wiki</summary>
			<pre class="mono small">{p.markdown}</pre>
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
	.banner {
		border: 1px solid var(--good);
		background: color-mix(in srgb, var(--good) 12%, transparent);
		border-radius: 12px;
		padding: 10px 12px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		text-align: center;
		gap: 8px;
	}
	.stats div {
		display: flex;
		flex-direction: column;
	}
	.stats b {
		font-size: 1.4rem;
	}
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.entries li + li {
		border-top: 1px solid var(--line);
		padding-top: 12px;
	}
	.between {
		justify-content: space-between;
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
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 8px 0 0;
	}
	.err {
		border-color: var(--bad);
	}
</style>
