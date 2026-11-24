<script>
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api/index.js';
	import { settings, PERSONAS } from '$lib/settings.svelte.js';
	import { app, refreshAlerts, refreshApprovals, toast } from '$lib/state.svelte.js';
	import {
		study, saveStudy, initStudy, beginTasks, currentTask, finishTask, finishStudy, resultsJson, endStudy,
		STUDY_TASKS, SUS_ITEMS, TLX_ITEMS, TRUST_ITEMS, susScore, tlxMean
	} from '$lib/study.svelte.js';

	onMount(() => initStudy());
	$effect(() => {
		JSON.stringify(study);
		saveStudy();
	});

	const task = $derived(study.active && study.step === 'tasks' ? currentTask() : null);

	// Room under the page content for the task card, so it never covers the last item.
	$effect(() => {
		document.body.classList.toggle('study-tasks', !!task);
	});

	// Fold the task card out of the way whenever the participant opens a screen, so it never
	// hides what they are meant to judge. A new task opens it again (finishTask).
	let lastPath = '';
	$effect(() => {
		const path = `${page.route.id}|${page.params.id ?? page.params.key ?? ''}`;
		untrack(() => {
			if (lastPath && path !== lastPath && task && !pendingOutcome) study.collapsed = true;
			lastPath = path;
		});
	});
	let pendingOutcome = $state(/** @type {'done'|'failed'|null} */ (null));
	let ease = $state(/** @type {number|null} */ (null));
	let recall = $state('');
	let busy = $state(false);
	let sent = $state(false);

	async function resetDemo() {
		await api.reset();
		await refreshAlerts();
		await refreshApprovals();
	}

	async function start() {
		busy = true;
		try {
			await beginTasks(resetDemo);
			location.hash = '#/';
		} finally {
			busy = false;
		}
	}

	async function sendAlert() {
		busy = true;
		try {
			await api.simulateIncoming();
			await refreshAlerts();
			sent = true;
		} catch {
			toast('Could not send the alert. Tap again.', 'error');
		} finally {
			busy = false;
		}
	}

	// T6: become the senior, and make sure a junior's request is waiting.
	async function prepareSenior() {
		settings.role = 'senior';
		await refreshApprovals();
		if (!app.approvals.length) {
			try {
				await api.postDecision('ALR-1039', { decision: 'approve', note: 'Looks like a blocked download, closing.', analyst: PERSONAS.junior });
			} catch {
				/* already waiting */
			}
			await refreshApprovals();
		}
	}
	$effect(() => {
		if (task?.action === 'senior' && settings.role !== 'senior') prepareSenior();
	});

	function choose(/** @type {'done'|'failed'} */ o) {
		pendingOutcome = o;
		ease = null;
	}
	function next() {
		if (!pendingOutcome || ease == null) return;
		finishTask(pendingOutcome, ease, recall);
		pendingOutcome = null;
		ease = null;
		recall = '';
		sent = false;
		if (study.step === 'questions') window.scrollTo({ top: 0 });
	}

	const susDone = $derived(study.answers.sus.every((v) => v != null));
	const tlxDone = $derived(Object.values(study.answers.tlx).every((v) => v != null));
	const trustDone = $derived(study.answers.trust.every((v) => v != null));
	const allDone = $derived(susDone && tlxDone && trustDone);

	let shareMsg = $state('');
	let showText = $state(false);
	const fileName = $derived(`tutei-study-${study.code}.json`);
	async function share() {
		const text = resultsJson();
		const file = new File([text], fileName, { type: 'application/json' });
		try {
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({ files: [file], title: `Tūtei study results ${study.code}` });
				shareMsg = 'Shared. Thank you!';
				return;
			}
		} catch (e) {
			if (/** @type {any} */ (e)?.name === 'AbortError') return;
		}
		download();
	}
	function download() {
		const url = URL.createObjectURL(new Blob([resultsJson()], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
		shareMsg = `Saved as ${fileName}. Please send that file back to the person who gave you the link.`;
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(resultsJson());
			shareMsg = 'Copied. Paste it into an email or message back to the person who gave you the link.';
		} catch {
			showText = true;
			shareMsg = 'Select all the text below, copy it, and paste it into a message.';
		}
	}
</script>

{#if study.active && study.step !== 'tasks'}
	<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="study-h">
		<div class="sheet stack">
			{#if study.step === 'welcome'}
				<p class="eyebrow">Usability study · about 15 minutes</p>
				<h1 id="study-h">Help test Tūtei</h1>
				<p>Tūtei is a phone app for security analysts on call: an AI looks at each security alert first, and the analyst decides what to do. You will try seven short tasks, then answer a few questions about how it went.</p>
				<ul class="small">
					<li>It is the app being tested, not you. If something is confusing, that is a useful result.</li>
					<li>Everything is demo data: invented alerts, customers and people. The AI's answers are scripted.</li>
					<li>You are anonymous. Your code is <b>{study.code}</b>. No name, email or device ID is recorded.</li>
					<li>The app records what you tap and when, on this phone only. At the end you choose to send the results file back.</li>
					<li>You can stop at any time. Results are used only for an NMIT IT8530 assessment and deleted afterwards.</li>
					<li>Turn your volume up: there are sounds and a spoken briefing.</li>
				</ul>
				<div class="grid">
					<label class="f">Your work
						<select bind:value={study.background.role}>
							<option value="">Choose</option>
							<option>SOC or security analyst</option>
							<option>Security or SIEM engineer</option>
							<option>IT operations or support</option>
							<option>Developer</option>
							<option>Student</option>
							<option>Other</option>
						</select></label>
					<label class="f">Years in security or IT
						<select bind:value={study.background.years}>
							<option value="">Choose</option>
							<option>Less than 1</option><option>1 to 3</option><option>4 to 7</option><option>8 or more</option>
						</select></label>
					<label class="f">Do you work on call?
						<select bind:value={study.background.oncall}>
							<option value="">Choose</option><option>Yes</option><option>Sometimes</option><option>No</option>
						</select></label>
				</div>
				<label class="check"><input type="checkbox" bind:checked={study.consent} /> I have read this and agree to take part.</label>
				<button class="btn primary" disabled={!study.consent || busy} onclick={start}>Start the tasks</button>
			{:else if study.step === 'questions'}
				<p class="eyebrow">Last step · {study.code}</p>
				<h1 id="study-h">How did it go?</h1>
				<p class="small muted">Answer straight away; your first reaction is what counts.</p>

				<h2>About Tūtei</h2>
				<p class="small muted">1 strongly disagree, 5 strongly agree</p>
				{#each SUS_ITEMS as text, i}
					<fieldset class="q">
						<legend><span class="n">{i + 1}</span>{text}</legend>
						<div class="scale s5">
							{#each [1, 2, 3, 4, 5] as v}
								<label class:on={study.answers.sus[i] === v}><input type="radio" name="sus-{i}" value={v} bind:group={study.answers.sus[i]} />{v}</label>
							{/each}
						</div>
					</fieldset>
				{/each}

				<h2>Workload</h2>
				{#each TLX_ITEMS as [key, name, text, lo, hi]}
					<div class="q">
						<label for="tlx-{key}"><b>{name}.</b> {text}</label>
						<div class="slider">
							<input id="tlx-{key}" type="range" min="0" max="100" step="5" value={study.answers.tlx[key] ?? 50} oninput={(e) => (study.answers.tlx[key] = Number(e.currentTarget.value))} />
							<output for="tlx-{key}">{study.answers.tlx[key] ?? '–'}</output>
						</div>
						<div class="ends small muted"><span>{lo}</span><span>{hi}</span></div>
					</div>
				{/each}

				<h2>The AI's suggestions</h2>
				<p class="small muted">1 strongly disagree, 7 strongly agree</p>
				{#each TRUST_ITEMS as text, i}
					<fieldset class="q">
						<legend><span class="n">{i + 1}</span>{text}</legend>
						<div class="scale s7">
							{#each [1, 2, 3, 4, 5, 6, 7] as v}
								<label class:on={study.answers.trust[i] === v}><input type="radio" name="trust-{i}" value={v} bind:group={study.answers.trust[i]} />{v}</label>
							{/each}
						</div>
					</fieldset>
				{/each}

				<h2>In your own words (optional)</h2>
				<label class="f">What was the hardest moment?<textarea bind:value={study.answers.hardest} rows="2"></textarea></label>
				<label class="f">What was most useful?<textarea bind:value={study.answers.useful} rows="2"></textarea></label>
				<label class="f">What would you change?<textarea bind:value={study.answers.change} rows="2"></textarea></label>

				{#if !allDone}<p class="small muted" role="status">Still to answer: {[!susDone && 'the 10 statements about Tūtei', !tlxDone && 'all 6 workload sliders', !trustDone && 'the 3 AI statements'].filter(Boolean).join(', ')}.</p>{/if}
				<button class="btn primary" disabled={!allDone} onclick={finishStudy}>Finish</button>
			{:else}
				<p class="eyebrow">Done · {study.code}</p>
				<h1 id="study-h">Thank you</h1>
				<p>Please send your results back to the person who gave you the link. The file holds your answers and what you tapped, with your code and nothing that names you.</p>
				<p class="small muted">Your usability score: {susScore(study.answers.sus)} out of 100 · workload {tlxMean()} out of 100</p>
				<div class="row wrap">
					<button class="btn primary" onclick={share}>Send results</button>
					<button class="btn" onclick={download}>Save as a file</button>
					<button class="btn" onclick={copy}>Copy as text</button>
				</div>
				{#if shareMsg}<p class="small" role="status">{shareMsg}</p>{/if}
				{#if showText}<textarea class="mono small" rows="8" readonly value={resultsJson()} onfocus={(e) => e.currentTarget.select()}></textarea>{/if}
				<button class="btn ghost small" onclick={endStudy}>Close the study and explore the app</button>
			{/if}
		</div>
	</div>
{/if}

{#if task}
	<aside class="taskcard" class:collapsed={study.collapsed} aria-label="Study task">
		<div class="head">
			{#if study.collapsed}
				<button class="pill" onclick={() => (study.collapsed = false)} aria-expanded="false"><span class="eyebrow">Task {study.taskIndex + 1}/{STUDY_TASKS.length}</span> {task.title} <b>Show</b></button>
			{:else}
				<span class="eyebrow">Task {study.taskIndex + 1} of {STUDY_TASKS.length}</span>
				<button class="btn ghost small" onclick={() => (study.collapsed = true)} aria-expanded="true">Hide</button>
			{/if}
		</div>
		{#if !study.collapsed}
			<p class="title">{task.title}</p>
			<p class="small">{task.text}</p>
			{#if task.action === 'send' && !sent}
				<button class="btn primary" disabled={busy} onclick={sendAlert}>Send the alert</button>
			{:else}
				{#if task.open}<a class="btn small" href="#/alerts/{task.open}" onclick={() => (study.collapsed = true)}>Open this alert</a>{/if}
				<p class="small muted">{task.done}</p>
				{#if task.recall}<textarea bind:value={recall} rows="2" placeholder="What did the briefing say?" aria-label="What did the briefing say?"></textarea>{/if}
				{#if !pendingOutcome}
					<div class="row wrap">
						<button class="btn primary" onclick={() => choose('done')}>I’ve done it</button>
						<button class="btn" onclick={() => choose('failed')}>I couldn’t do it</button>
					</div>
				{:else}
					<fieldset class="q">
						<legend class="small">Overall, how easy or difficult was this task?</legend>
						<div class="scale s7">
							{#each [1, 2, 3, 4, 5, 6, 7] as v}
								<label class:on={ease === v}><input type="radio" name="ease" value={v} bind:group={ease} />{v}</label>
							{/each}
						</div>
						<div class="ends small muted"><span>Very difficult</span><span>Very easy</span></div>
					</fieldset>
					<div class="row wrap">
						<button class="btn primary" disabled={ease == null} onclick={next}>{study.taskIndex < STUDY_TASKS.length - 1 ? 'Next task' : 'On to the questions'}</button>
						<button class="btn ghost small" onclick={() => (pendingOutcome = null)}>Back</button>
					</div>
				{/if}
			{/if}
		{/if}
	</aside>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: var(--bg);
		overflow-y: auto;
		padding: calc(16px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
	}
	.sheet {
		max-width: 640px;
		margin: 0 auto;
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
	}
	h2 {
		margin: 16px 0 0;
		font-size: 1.1rem;
	}
	ul {
		padding-left: 20px;
		margin: 0;
		display: grid;
		gap: 6px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 500;
		font-size: 0.9rem;
	}
	select,
	textarea {
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 10px;
		min-height: 44px;
		width: 100%;
	}
	.check {
		display: flex;
		gap: 10px;
		align-items: center;
		min-height: 44px;
		font-weight: 500;
	}
	.check input {
		width: 22px;
		height: 22px;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}
	.q {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.n {
		color: var(--muted);
		margin-right: 6px;
	}
	.scale {
		display: grid;
		gap: 4px;
	}
	.s5 {
		grid-template-columns: repeat(5, 1fr);
	}
	.s7 {
		grid-template-columns: repeat(7, 1fr);
	}
	.scale label {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		cursor: pointer;
		font-variant-numeric: tabular-nums;
	}
	.scale label.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 700;
	}
	.scale input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.scale label:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.ends {
		display: flex;
		justify-content: space-between;
	}
	.slider {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.slider input {
		flex: 1;
		accent-color: var(--accent);
		min-height: 40px;
	}
	.slider output {
		min-width: 3ch;
		text-align: right;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.row.wrap {
		flex-wrap: wrap;
		gap: 8px;
	}
	.taskcard {
		position: fixed;
		z-index: 40;
		left: max(12px, env(safe-area-inset-left));
		right: max(12px, env(safe-area-inset-right));
		bottom: calc(76px + env(safe-area-inset-bottom));
		max-width: 520px;
		margin: 0 auto;
		max-height: 55vh;
		overflow-y: auto;
		background: var(--surface);
		border: 2px solid var(--accent);
		border-radius: 14px;
		padding: 12px 14px;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 20%, transparent);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.taskcard.collapsed {
		padding: 0;
		border-width: 2px;
	}
	.pill {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 6px 12px;
		background: none;
		border: 0;
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
		text-align: left;
		cursor: pointer;
	}
	.pill b {
		margin-left: auto;
		color: var(--accent);
	}
	.taskcard .head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.taskcard .title {
		margin: 0;
		font-weight: 700;
	}
	.taskcard p {
		margin: 0;
	}
	@media (min-width: 768px) and (min-height: 600px) {
		.taskcard {
			left: auto;
			bottom: max(16px, env(safe-area-inset-bottom));
			width: 420px;
		}
	}
</style>
