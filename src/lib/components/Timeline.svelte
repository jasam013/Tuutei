<script>
	import { clock } from '$lib/format.js';
	/** Animated replay of the events behind an alert, oldest first. */
	let { events = [], animate = true } = $props();
	let run = $state(0);
	const KIND = { info: 'Info', warn: 'Suspicious', bad: 'Malicious sign', alert: 'Alert fired' };
	const sorted = $derived([...events].sort((a, b) => a.at - b.at));
</script>

<div class="wrap">
	{#key run}
		<ol class="tl" class:animate>
			{#each sorted as e, i}
				<li class={e.kind} style:--i={i}>
					<span class="node" aria-hidden="true"></span>
					<div>
						<p class="mono small muted">{clock(e.at)} · <span class="kind">{KIND[e.kind] || e.kind}</span></p>
						<p>{e.label}</p>
					</div>
				</li>
			{/each}
		</ol>
	{/key}
	{#if animate}
		<button class="btn ghost small replay" onclick={() => run++}>↻ Replay timeline</button>
	{/if}
</div>

<style>
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
		position: relative;
	}
	.tl::before {
		content: '';
		position: absolute;
		left: 9px;
		top: 6px;
		bottom: 6px;
		width: 2px;
		background: var(--line);
	}
	.animate::before {
		transform-origin: top;
		animation: grow 0.9s ease-out both;
	}
	li {
		display: grid;
		grid-template-columns: 20px 1fr;
		gap: 12px;
		padding: 6px 0;
		position: relative;
	}
	.animate li {
		animation: pop 0.45s ease-out both;
		animation-delay: calc(var(--i) * 0.45s + 0.15s);
	}
	.node {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 3px solid var(--c, var(--muted));
		background: var(--bg);
		margin-top: 2px;
		position: relative;
		z-index: 1;
	}
	.info {
		--c: var(--muted);
	}
	.warn {
		--c: var(--warn);
	}
	.bad {
		--c: var(--bad);
	}
	.alert {
		--c: var(--accent);
	}
	.alert .node {
		background: var(--accent);
	}
	.kind {
		color: var(--c);
		font-weight: 600;
	}
	.replay {
		margin-top: 8px;
		min-height: 40px;
		padding: 0 12px;
	}
	@keyframes grow {
		from {
			transform: scaleY(0);
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
</style>
