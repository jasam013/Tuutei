<script>
	/** Related events per 5-minute window over the last 40 minutes. The busiest bar is highlighted. */
	let { values = [], animate = true } = $props();
	const W = 320,
		H = 130,
		PAD = 22;
	const max = $derived(Math.max(1, ...values));
	const peak = $derived(values.indexOf(Math.max(...values)));
	const bw = $derived((W - PAD) / Math.max(1, values.length));
	const total = $derived(values.reduce((a, b) => a + b, 0));
	const summary = $derived(
		`${total} related events in the last ${values.length * 5} minutes; busiest window ${(values.length - peak) * 5} to ${(values.length - peak - 1) * 5} minutes ago with ${values[peak] ?? 0} events.`
	);
</script>

<figure>
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={summary} class:animate>
		<line x1={PAD} x2={W} y1={H - 22} y2={H - 22} stroke="var(--line)" />
		{#each values as v, i}
			{@const h = (v / max) * (H - 40)}
			<rect
				x={PAD + i * bw + 4}
				y={H - 22 - h}
				width={bw - 8}
				height={Math.max(h, v > 0 ? 2 : 0)}
				rx="3"
				fill={i === peak && v > 0 ? 'var(--accent)' : 'var(--muted)'}
				fill-opacity={i === peak && v > 0 ? 1 : 0.45}
				style:--i={i}
			/>
			{#if v > 0}
				<text x={PAD + i * bw + bw / 2} y={H - 26 - h} text-anchor="middle" font-size="11" fill="var(--muted)">{v}</text>
			{/if}
		{/each}
		<text x={PAD} y={H - 6} font-size="11" fill="var(--muted)">40 min ago</text>
		<text x={W} y={H - 6} font-size="11" fill="var(--muted)" text-anchor="end">now</text>
	</svg>
	<figcaption class="small muted">{summary}</figcaption>
</figure>

<style>
	figure {
		margin: 0;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.animate rect {
		transform-box: fill-box;
		transform-origin: bottom;
		animation: rise 0.5s ease-out both;
		animation-delay: calc(var(--i) * 0.06s);
	}
	@keyframes rise {
		from {
			transform: scaleY(0);
		}
	}
</style>
