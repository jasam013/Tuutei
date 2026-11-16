<script>
	/** Record an optional spoken note (up to 60 s) to attach to a decision. */
	let { value = $bindable(null) } = $props();
	let recording = $state(false);
	let error = $state('');
	let seconds = $state(0);
	/** @type {MediaRecorder|null} */
	let rec = null;
	let timer;

	const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

	async function start() {
		error = '';
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const chunks = [];
			rec = new MediaRecorder(stream);
			rec.ondataavailable = (e) => chunks.push(e.data);
			rec.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				const blob = new Blob(chunks, { type: rec?.mimeType || 'audio/webm' });
				const reader = new FileReader();
				reader.onload = () => (value = /** @type {string} */ (reader.result));
				reader.readAsDataURL(blob);
			};
			rec.start();
			recording = true;
			seconds = 0;
			timer = setInterval(() => {
				seconds++;
				if (seconds >= 60) stop();
			}, 1000);
		} catch {
			error = 'Microphone not available. Allow microphone access, or type a note instead.';
		}
	}

	function stop() {
		clearInterval(timer);
		recording = false;
		rec?.stop();
	}
</script>

<div class="vn">
	{#if !supported}
		<p class="small muted">Voice notes are not supported in this browser. Type a note instead.</p>
	{:else if value}
		<div class="row">
			<audio controls src={value}></audio>
			<button class="btn ghost" onclick={() => (value = null)} aria-label="Delete voice note">✕</button>
		</div>
	{:else if recording}
		<button class="btn danger block" onclick={stop}>
			<span class="rec" aria-hidden="true"></span> Stop recording ({seconds}s)
		</button>
	{:else}
		<button class="btn block" onclick={start}>🎙 Record a voice note (optional)</button>
	{/if}
	{#if error}<p class="small err" role="alert">{error}</p>{/if}
</div>

<style>
	audio {
		flex: 1;
		min-width: 0;
		height: 40px;
	}
	.rec {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--bad);
		animation: blink 1s infinite;
	}
	.err {
		color: var(--bad);
		margin-top: 6px;
	}
	@keyframes blink {
		50% {
			opacity: 0.3;
		}
	}
</style>
