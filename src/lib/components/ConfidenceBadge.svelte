<script>
	import { pct } from '$lib/format.js';
	/** One clear badge per alert: the state in words, plus the score. */
	let { state, confidence = null } = $props();
	const text = $derived(
		state === 'confident' ? `Confident · ${pct(confidence)}` : state === 'unsure' ? `Unsure · ${pct(confidence)}` : 'No answer'
	);
	const icon = $derived(state === 'confident' ? '✓' : state === 'unsure' ? '?' : '!');
</script>

<span class="badge {state}" role="status">
	<span class="icon" aria-hidden="true">{icon}</span>
	{text}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px 4px 4px;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.9rem;
		border: 2px solid var(--c);
		color: var(--c);
	}
	.icon {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--c);
		color: var(--bg);
		font-size: 0.8rem;
	}
	.confident {
		--c: var(--good);
	}
	.unsure {
		--c: var(--warn);
	}
	.failed {
		--c: var(--bad);
	}
</style>
