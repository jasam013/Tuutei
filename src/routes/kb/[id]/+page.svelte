<script>
	import { track } from '$lib/eval.svelte.js';
	import { page } from '$app/state';
	import { api, describeError } from '$lib/api/index.js';
	import { day, pct, OUTCOME_LABEL, WIKI_LABEL } from '$lib/format.js';

	const id = $derived(page.params.id);
	let r = $state(/** @type {any} */ (null));
	let error = $state('');

	async function load(/** @type {string} */ cur) {
		error = '';
		try {
			const out = await api.getKb(cur);
			if (cur === id) r = out;
		} catch (e) {
			error = describeError(e);
		}
	}
	$effect(() => {
		r = null;
		load(id);
		track('kb_opened', { detail: `record ${id}` });
	});
	$effect(() => {
		if (r?.wiki?.status !== 'pending') return;
		const t = setTimeout(() => load(id), 2000);
		return () => clearTimeout(t);
	});
</script>

<a class="back" href="#/kb">‹ Knowledge base</a>

{#if error}
	<div class="card err" role="alert"><p><b>Can’t open this record.</b> {error}</p></div>
{:else if !r}
	<p class="muted" role="status">Loading…</p>
{:else}
	<article class="stack">
		<header class="stack tight">
			<p class="eyebrow">Resolution record · {r.id}</p>
			<h1>{r.title}</h1>
			<p class="small"><b>{r.client.name}</b> <span class="muted">· {day(r.resolvedAt)}</span></p>
			<p class="banner small">Customer-confidential. Other customers only ever see this as the anonymised <a href="#/kb/playbook/{r.pattern}">{r.patternTitle} playbook</a>.</p>
		</header>

		<section class="card stack">
			<dl class="facts">
				<div><dt>Outcome</dt><dd class="outcome o-{r.outcome}">{OUTCOME_LABEL[r.outcome]}</dd></div>
				<div><dt>Pattern</dt><dd>{r.patternTitle}</dd></div>
				<div><dt>Technique</dt><dd>{r.technique || '—'}</dd></div>
				{#if r.alertId}<div><dt>Alert</dt><dd><a class="mono" href="#/alerts/{r.alertId}">{r.alertId}</a></dd></div>{/if}
				<div><dt>Analyst</dt><dd>{r.analyst || '—'}</dd></div>
				<div><dt>Signed off</dt><dd>{r.approver || 'Not required'}</dd></div>
				{#if r.aiVerdict}<div><dt>AI said</dt><dd>{OUTCOME_LABEL[r.aiVerdict] || r.aiVerdict} at {pct(r.aiConfidence)}</dd></div>{/if}
				{#each [['User', r.entity?.user], ['Host', r.entity?.host], ['IP', r.entity?.ip]] as [k, v]}
					{#if v && v !== '—'}<div><dt>{k}</dt><dd class="mono">{v}</dd></div>{/if}
				{/each}
			</dl>
		</section>

		<section class="card stack">
			<h2>What was done</h2>
			<p>{r.actionTaken}</p>
			{#if r.note}<h2>Analyst note</h2><p>{r.note}</p>{/if}
		</section>

		<section class="card stack">
			<h2>Lesson for the playbook</h2>
			{#if r.lesson}
				<p>{r.lesson}</p>
				<p class="small muted">Other customers see: “{r.sharedLesson}”</p>
			{:else}
				<p class="muted">None given.</p>
			{/if}
		</section>

		<section class="card stack">
			<h2>Wiki</h2>
			{#if r.wiki?.status === 'written' && r.wiki.url}
				<p><a href={r.wiki.url} target="_blank" rel="noopener">Open the page in Gitea ↗</a></p>
			{:else}
				<p class:errtext={r.wiki?.status === 'failed'}>{WIKI_LABEL[r.wiki?.status] || '—'}</p>
				{#if r.wiki?.error}<p class="small muted">{r.wiki.error}</p>{/if}
			{/if}
			<details>
				<summary class="small">Markdown written to the wiki</summary>
				<pre class="mono small">{r.markdown}</pre>
			</details>
		</section>
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
		border: 1px solid var(--warn);
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		border-radius: 12px;
		padding: 10px 12px;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 16px;
		margin: 0;
	}
	.facts div {
		display: contents;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.outcome {
		font-weight: 700;
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
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 8px 0 0;
	}
	.err {
		border-color: var(--bad);
	}
</style>
