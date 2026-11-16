<script>
	/** Tūtei mark: a radar scope inside a shield. */
	let { size = 32, label = 'Tūtei' } = $props();
</script>

<!-- Decorative when label is empty (the name is already written beside it). -->
<svg width={size} height={size} viewBox="40 24 240 280" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
	<path d="M160 36 L262 76 V160 Q262 242 160 288 Q58 242 58 160 V76 Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linejoin="round" />
	<path d="M160 165 L160 95 A70 70 0 0 1 209.5 115.5 Z" fill="var(--accent)" fill-opacity="0.45" />
	<circle cx="160" cy="165" r="70" fill="none" stroke="currentColor" stroke-width="12" />
	<path d="M160 165 L209.5 115.5" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" />
	<circle cx="191" cy="131" r="12" fill="var(--accent)" />
</svg>
