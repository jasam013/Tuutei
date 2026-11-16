<script>
	/** Severity is always shown as a word, never by colour alone. */
	let { severity } = $props();
	const label = $derived(severity.charAt(0).toUpperCase() + severity.slice(1));
</script>

<span class="sev" style:--c={`var(--sev-${severity})`}>
	<span class="dot" aria-hidden="true"></span>{label}
</span>

<style>
	.sev {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 0.8rem;
		color: var(--c);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
</style>
