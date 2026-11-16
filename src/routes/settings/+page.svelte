<script>
	import { api, describeError } from '$lib/api/index.js';
	import { httpApi } from '$lib/api/http.js';
	import { settings, PERSONAS } from '$lib/settings.svelte.js';
	import { refreshAlerts, refreshApprovals, toast } from '$lib/state.svelte.js';
	import { askNotificationPermission, notificationState, chime, unlockAudio, canSpeak, speak, stopSpeaking, watchVoices, PIPER_PREFIX } from '$lib/media.js';
	import { fetchNaturalVoices } from '$lib/api/tts.js';
	import { soundPrefs, saveSoundPrefs, SOUND_STYLES } from '$lib/sound.svelte.js';
	import { theme, THEMES } from '$lib/theme.svelte.js';
	import { voicePrefs, saveVoicePrefs } from '$lib/voice.svelte.js';
	import { pct } from '$lib/format.js';
	import { evalPrefs, evalState, saveEvalPrefs, track, flush, TASKS, cleanCode, localRows, clearLocal, toCsv } from '$lib/eval.svelte.js';

	let notif = $state(notificationState());
	let testResult = $state('');
	let testing = $state(false);
	let installEvent = $state(/** @type {any} */ (null));
	const standalone = typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone);
	const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

	$effect(() => {
		const h = (/** @type {any} */ e) => {
			e.preventDefault();
			installEvent = e;
		};
		window.addEventListener('beforeinstallprompt', h);
		return () => window.removeEventListener('beforeinstallprompt', h);
	});

	// ---------- Evaluation mode (HCI tool, Part D) ----------
	let evalSummary = $state(/** @type {any} */ (null));
	let confirmClear = $state(false);
	let localCsvUrl = $state('');

	async function loadEvalSummary() {
		if (settings.dataSource !== 'http') {
			evalSummary = { events: localRows().length, participants: [...new Set(localRows().map((r) => r.participant))].sort(), storedIn: 'this device' };
			return;
		}
		await flush();
		try {
			const res = await fetch(`${settings.apiBase}/eval/summary`);
			evalSummary = res.ok ? await res.json() : null;
		} catch {
			evalSummary = null;
		}
	}
	$effect(() => {
		settings.dataSource;
		evalState.sent;
		loadEvalSummary();
	});

	function setEvalOn(/** @type {boolean} */ on) {
		evalPrefs.on = on;
		saveEvalPrefs();
		if (on) track('session_started', { detail: `${settings.dataSource === 'http' ? 'server' : 'device'} log` });
	}
	function setParticipant(/** @type {string} */ v) {
		evalPrefs.participant = cleanCode(v);
		saveEvalPrefs();
	}
	function setTask(/** @type {string} */ v) {
		evalPrefs.task = v;
		saveEvalPrefs();
		track('task_changed', { value: v || 'none' });
	}
	function prepareLocalCsv() {
		if (localCsvUrl) URL.revokeObjectURL(localCsvUrl);
		localCsvUrl = URL.createObjectURL(new Blob([toCsv(localRows())], { type: 'text/csv' }));
	}
	async function clearEval() {
		if (!confirmClear) {
			confirmClear = true;
			setTimeout(() => (confirmClear = false), 4000);
			return;
		}
		confirmClear = false;
		if (settings.dataSource === 'http') {
			try {
				await fetch(`${settings.apiBase}/eval/clear`, { method: 'POST' });
			} catch {
				toast('Could not clear the server log', 'error');
			}
		} else clearLocal();
		toast('Evaluation log cleared', 'success');
		loadEvalSummary();
	}
	const today = new Date().toISOString().slice(0, 10);

	// ---------- Alert sound ----------
	$effect(() => {
		JSON.stringify(soundPrefs);
		saveSoundPrefs();
	});
	const styleHint = $derived(SOUND_STYLES.find((s) => s.id === soundPrefs.style)?.hint || '');
	function previewSound(/** @type {string} */ severity) {
		const secs = chime(severity);
		if (soundPrefs.speakAlerts) {
			setTimeout(() => speak(`New ${severity} alert. Encoded PowerShell on workstation.`), (secs + 0.3) * 1000);
		}
	}

	// ---------- Voice ----------
	let voices = $state(/** @type {SpeechSynthesisVoice[]} */ ([]));
	let previewing = $state(false);
	$effect(() => watchVoices((v) => (voices = v)));
	$effect(() => {
		JSON.stringify(voicePrefs);
		saveVoicePrefs();
	});
	let naturalVoices = $state(/** @type {{id:string, label:string}[]} */ ([]));
	let naturalChecked = $state(false);
	$effect(() => {
		settings.apiBase;
		fetchNaturalVoices().then((list) => {
			naturalVoices = list;
			naturalChecked = true;
		});
	});
	const usingNatural = $derived(voicePrefs.uri?.startsWith(PIPER_PREFIX));
	const missingVoice = $derived(
		!!voicePrefs.uri &&
			(usingNatural
				? naturalChecked && !naturalVoices.some((v) => PIPER_PREFIX + v.id === voicePrefs.uri)
				: voices.length > 0 && !voices.some((v) => v.voiceURI === voicePrefs.uri))
	);

	function preview() {
		if (previewing) {
			stopSpeaking();
			previewing = false;
			return;
		}
		previewing = speak(
			'Kia ora. Critical alert: encoded PowerShell on a workstation. The AI is 81 percent confident this is malicious. Suggested action: isolate the host.',
			() => (previewing = false)
		);
	}

	async function enableNotifications() {
		notif = await askNotificationPermission();
		if (notif === 'granted') toast('Notifications on', 'success');
	}

	async function simulate() {
		try {
			unlockAudio(); // unlocks audio on iOS/Safari from this tap
			await api.simulateIncoming();
			await refreshAlerts(); // the feed notices the new alert and announces it
		} catch (e) {
			toast(describeError(e), 'error');
		}
	}

	async function testConnection() {
		testing = true;
		testResult = '';
		try {
			const list = await httpApi(settings.apiBase, settings.timeoutMs).listAlerts();
			testResult = `Connected. The agent returned ${list.length} alerts.`;
		} catch (e) {
			testResult = `Failed: ${describeError(e)}`;
		} finally {
			testing = false;
		}
	}

	async function resetDemo() {
		await api.reset();
		await refreshAlerts();
		refreshApprovals();
		toast('Demo data reset', 'success');
	}

	async function install() {
		installEvent?.prompt();
		installEvent = null;
	}
</script>

<section class="stack">
	<div>
		<p class="eyebrow">Settings</p>
		<h1>Settings</h1>
	</div>

	<section class="card stack" aria-labelledby="role-h">
		<h2 id="role-h">Who is using this phone</h2>
		<div class="seg" role="radiogroup" aria-label="Role">
			{#each Object.values(PERSONAS) as p}
				<button role="radio" aria-checked={settings.role === p.role} class:sel={settings.role === p.role} onclick={() => (settings.role = /** @type {any} */ (p.role))}>
					<b>{p.name}</b><span class="small">{p.title}</span>
				</button>
			{/each}
		</div>
		<p class="small muted">Demo personas. Juniors’ decisions go to a senior for sign-off; seniors can approve others’ requests but never their own.</p>
	</section>

	<section class="card stack" aria-labelledby="al-h">
		<h2 id="al-h">Alerts</h2>
		<label class="toggle">
			<span><b>I’m on call</b><br /><span class="small muted">Sound, vibration and notifications for new alerts. Off: silent in-app notices only.</span></span>
			<input type="checkbox" bind:checked={settings.onCall} />
		</label>
		{#if notif === 'granted'}
			<p class="small">✓ System notifications are on.</p>
		{:else if notif === 'unsupported'}
			<p class="small muted">{isIOS && !standalone ? 'On iPhone, add Tūtei to your Home Screen first, then notifications can be turned on.' : 'This browser does not support notifications.'}</p>
		{:else if notif === 'denied'}
			<p class="small muted">Notifications are blocked. Allow them in your browser’s site settings.</p>
		{:else}
			<button class="btn" onclick={enableNotifications}>Turn on system notifications</button>
		{/if}
		<button class="btn primary" onclick={simulate}>Simulate an incoming alert</button>
	</section>

	<section class="card stack" aria-labelledby="snd-h">
		<h2 id="snd-h">Alert sound</h2>
		<label class="stack tight" for="sound-style"><span class="small"><b>Sound</b></span></label>
		<select id="sound-style" bind:value={soundPrefs.style} aria-describedby="sound-hint">
			{#each SOUND_STYLES as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
		<p id="sound-hint" class="small muted">{styleHint}</p>
		<label class="stack tight" for="volume"><span class="small"><b>Volume: {Math.round(soundPrefs.volume * 100)}%</b></span></label>
		<input id="volume" type="range" min="0.1" max="1" step="0.1" bind:value={soundPrefs.volume} disabled={soundPrefs.style === 'none'} />
		<label class="toggle">
			<span><b>Different sound for critical alerts</b><br /><span class="small muted">Critical alerts use the sound below, whatever you chose above (unless Silent).</span></span>
			<input type="checkbox" bind:checked={soundPrefs.criticalUrgent} />
		</label>
		{#if soundPrefs.criticalUrgent}
			<label class="stack tight" for="urgent-style"><span class="small"><b>Critical alert sound</b></span></label>
			<select id="urgent-style" bind:value={soundPrefs.urgentStyle}>
				{#each SOUND_STYLES.filter((s) => s.id !== 'none') as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		{/if}
		<label class="toggle">
			<span><b>Read new alerts aloud</b><br /><span class="small muted">After the sound, says the severity and title in your briefing voice. Never reads user or host names.</span></span>
			<input type="checkbox" bind:checked={soundPrefs.speakAlerts} />
		</label>
		<div class="seg">
			<button class="btn" onclick={() => previewSound('medium')} disabled={soundPrefs.style === 'none'}>▶ Preview</button>
			<button class="btn" onclick={() => previewSound('critical')} disabled={soundPrefs.style === 'none'}>▶ Preview critical</button>
		</div>
		<p class="small muted">Phones only allow sound after you’ve tapped somewhere in Tūtei since opening it, and a phone on silent stays silent. System notifications use the phone’s own sound.</p>
	</section>

	<section class="card stack" aria-labelledby="ai-h">
		<h2 id="ai-h">AI confidence threshold: {pct(settings.threshold)}</h2>
		<input type="range" min="0.5" max="0.95" step="0.05" bind:value={settings.threshold} aria-describedby="thr-help" />
		<p id="thr-help" class="small muted">Below this, Tūtei marks the alert “Needs human review” and hides the suggested action.</p>
	</section>

	<section class="card stack" aria-labelledby="acc-h">
		<h2 id="acc-h">Display and privacy</h2>
		<div class="stack tight">
			<span class="small" id="theme-label"><b>Theme</b></span>
			<div class="seg seg3" role="radiogroup" aria-labelledby="theme-label">
				{#each THEMES as t (t.id)}
					<button role="radio" aria-checked={theme.choice === t.id} class:sel={theme.choice === t.id} onclick={() => (theme.choice = /** @type {any} */ (t.id))}>
						<b>{t.label}</b><span class="small">{t.hint}</span>
					</button>
				{/each}
			</div>
		</div>
		<label class="toggle">
			<span><b>Lightweight mode</b><br /><span class="small muted">Text first, no animation or charts. For weak connections and battery saving.</span></span>
			<input type="checkbox" bind:checked={settings.lightweight} />
		</label>
		<label class="toggle">
			<span><b>Speak user and host names</b><br /><span class="small muted">Off by default, so briefings are safe to play in public.</span></span>
			<input type="checkbox" bind:checked={settings.speakSensitive} />
		</label>
	</section>

	<section class="card stack" aria-labelledby="voice-h">
		<h2 id="voice-h">Briefing voice</h2>
		{#if !canSpeak() && naturalVoices.length === 0}
			<p class="small muted">This browser can’t speak briefings, and the EduStack natural voice service isn’t reachable.</p>
		{:else}
			<label class="stack tight" for="voice">
				<span class="small"><b>Voice</b></span>
			</label>
			<select id="voice" bind:value={voicePrefs.uri}>
				<option value="">Automatic (New Zealand English if available)</option>
				{#if naturalVoices.length}
					<optgroup label="Natural voices on your EduStack">
						{#each naturalVoices as v (v.id)}
							<option value={PIPER_PREFIX + v.id}>{v.label}</option>
						{/each}
					</optgroup>
				{/if}
				{#if voices.length}
					<optgroup label="Voices on this device">
						{#each voices as v (v.voiceURI)}
							<option value={v.voiceURI}>{v.name} · {v.lang}{v.localService ? '' : ' · online'}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
			{#if usingNatural && !missingVoice}
				<p class="small">✓ Natural voice generated on your EduStack. Briefing text never leaves your network. It takes a second or two to start.</p>
			{/if}
			{#if missingVoice}
				<p class="small muted">
					{usingNatural
						? 'The natural voice service isn’t answering, so briefings use a device voice for now.'
						: 'Your chosen voice isn’t on this device, so Tūtei is using the automatic choice.'}
				</p>
			{/if}
			{#if naturalChecked && naturalVoices.length === 0}
				<p class="small muted">Natural voices appear here once the voice service on the EduStack is running and Data source points at it.</p>
			{/if}
			<label class="stack tight" for="rate">
				<span class="small"><b>Speed: {Number(voicePrefs.rate).toFixed(1)}×</b></span>
			</label>
			<input id="rate" type="range" min="0.7" max="1.4" step="0.1" bind:value={voicePrefs.rate} />
			<button class="btn" onclick={preview} aria-pressed={previewing}>{previewing ? '■ Stop' : '🔊 Preview voice'}</button>
			<p class="small muted">Voices come from this device, so each phone or computer has its own list. Download more in the device’s Accessibility → Spoken Content settings. “Online” voices need an internet connection.</p>
		{/if}
	</section>

	<section class="card stack" aria-labelledby="eval-h">
		<h2 id="eval-h">Evaluation mode</h2>
		<p class="small muted">For usability testing (HCI tool, Part D). Records what you tap and when, under a participant code. No names, and only demo alerts should be used.</p>
		<label class="toggle">
			<span><b>Record this session</b><br /><span class="small muted">{evalPrefs.on ? 'Recording. Turn off when the session ends.' : 'Off'}</span></span>
			<input type="checkbox" checked={evalPrefs.on} onchange={(e) => setEvalOn(e.currentTarget.checked)} />
		</label>
		{#if evalPrefs.on}
			<div class="evalgrid">
				<label class="stack tight">
					<span class="small"><b>Participant code</b></span>
					<input value={evalPrefs.participant} onchange={(e) => setParticipant(e.currentTarget.value)} autocapitalize="characters" autocomplete="off" maxlength="12" aria-describedby="pc-hint" />
					<span class="small muted" id="pc-hint">For example P3. Never a name.</span>
				</label>
				<label class="stack tight">
					<span class="small"><b>Current task</b></span>
					<select value={evalPrefs.task} onchange={(e) => setTask(e.currentTarget.value)}>
						{#each TASKS as [code, label] (code)}<option value={code}>{label}</option>{/each}
					</select>
				</label>
			</div>
			{#if evalState.pending}
				<p class="small muted" role="status">{evalState.pending} events waiting to send{evalState.lastError ? `: ${evalState.lastError}` : ''}</p>
			{/if}
		{/if}
		{#if evalSummary}
			<p class="small" role="status"><b>{evalSummary.events}</b> events recorded{evalSummary.participants?.length ? ` from ${evalSummary.participants.join(', ')}` : ''} · stored on {evalSummary.storedIn === 'this device' ? 'this device' : 'the Tūtei server'}</p>
		{/if}
		<div class="row wrap">
			{#if settings.dataSource === 'http'}
				<a class="btn" href="{settings.apiBase}/eval/export.csv" download="tutei-eval-{today}.csv">Download CSV</a>
			{:else if localCsvUrl}
				<a class="btn" href={localCsvUrl} download="tutei-eval-{today}.csv">Download CSV</a>
			{:else}
				<button class="btn" onclick={prepareLocalCsv}>Prepare CSV</button>
			{/if}
			<button class="btn ghost" onclick={clearEval}>{confirmClear ? 'Tap again to delete all events' : 'Clear log'}</button>
		</div>
	</section>

	<section class="card stack" aria-labelledby="ds-h">
		<h2 id="ds-h">Data source</h2>
		<div class="seg" role="radiogroup" aria-label="Data source">
			<button role="radio" aria-checked={settings.dataSource === 'mock'} class:sel={settings.dataSource === 'mock'} onclick={() => (settings.dataSource = 'mock')}><b>Demo data</b><span class="small">Built in</span></button>
			<button role="radio" aria-checked={settings.dataSource === 'http'} class:sel={settings.dataSource === 'http'} onclick={() => (settings.dataSource = 'http')}><b>OpenClaw API</b><span class="small">EduStack</span></button>
		</div>
		{#if settings.dataSource === 'http'}
			<label class="stack tight">
				<span class="small"><b>API base URL</b></span>
				<input type="url" bind:value={settings.apiBase} placeholder="/api or https://openclaw.edustack.internal/api" />
			</label>
			<button class="btn" onclick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button>
			{#if testResult}<p class="small" role="status">{testResult}</p>{/if}
		{:else}
			<label class="toggle">
				<span><b>Simulate agent failures</b><br /><span class="small muted">About 1 in 3 triage calls time out, to show the failure state.</span></span>
				<input type="checkbox" bind:checked={settings.simulateFailures} />
			</label>
		{/if}
		<button class="btn ghost" onclick={resetDemo}>Reset demo data</button>
	</section>

	<section class="card stack" aria-labelledby="app-h">
		<h2 id="app-h">App</h2>
		{#if standalone}
			<p class="small">✓ Installed on this device.</p>
		{:else if installEvent}
			<button class="btn" onclick={install}>Install Tūtei</button>
		{:else}
			<p class="small muted">{isIOS ? 'To install: tap Share, then “Add to Home Screen”.' : 'To install: use your browser’s “Install app” or “Add to Home screen” option.'}</p>
		{/if}
		<p class="small muted">Tūtei 0.1.0 prototype · IT8530 · tūtei: lookout, sentry, scout</p>
	</section>
</section>

<style>
	.tight {
		gap: 6px;
	}
	.evalgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}
	.wrap {
		flex-wrap: wrap;
		gap: 8px;
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.seg button {
		min-height: 64px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.seg3 {
		grid-template-columns: repeat(3, 1fr);
	}
	.seg button.sel {
		border: 2px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
	}
	.toggle {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		cursor: pointer;
	}
	.toggle input {
		width: 24px;
		height: 24px;
		flex: none;
		accent-color: var(--accent);
	}
	select {
		width: 100%;
		min-height: var(--tap);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0 12px;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
		min-height: 32px;
	}
</style>
