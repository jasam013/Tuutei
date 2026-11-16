<script>
	import '../app.css';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { theme, applyTheme } from '$lib/theme.svelte.js';
	import { viewport } from '$lib/viewport.svelte.js';
	import AlertFeed from '$lib/components/AlertFeed.svelte';
	import { settings, persistSettings, me } from '$lib/settings.svelte.js';
	import { app, toasts, refreshAlerts, refreshApprovals } from '$lib/state.svelte.js';
	import { evalPrefs } from '$lib/eval.svelte.js';

	let { children } = $props();

	// Theme: apply the chosen one, and follow the phone live when set to System.
	$effect(() => {
		theme.choice;
		applyTheme();
		const mq = matchMedia('(prefers-color-scheme: light)');
		const onChange = () => applyTheme();
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	// Save settings whenever any of them changes.
	$effect(() => {
		JSON.stringify(settings);
		persistSettings();
	});

	// Poll the agent for new alerts and approvals. Re-runs when the data source changes.
	$effect(() => {
		settings.dataSource;
		settings.apiBase;
		untrack(() => {
			app.updatedAt = 0;
			refreshAlerts();
			refreshApprovals();
		});
		const t = setInterval(() => {
			refreshAlerts();
			refreshApprovals();
		}, 15000);
		return () => clearInterval(t);
	});

	const route = $derived(page.route.id);
	// Tablets: alert list and the open alert side by side.
	const split = $derived(viewport.wide && (route === '/' || route === '/alerts/[id]'));
	let headerH = $state(60);
	const pending = $derived(app.approvals.length);
	const tabs = $derived([
		{ href: '#/', id: '/', label: 'Alerts', icon: '◉' },
		{ href: '#/approvals', id: '/approvals', label: 'Sign-off', icon: '✓', badge: settings.role === 'senior' ? pending : 0 },
		{ href: '#/kb', id: '/kb', label: 'Wiki', icon: '▤' },
		{ href: '#/settings', id: '/settings', label: 'Settings', icon: '⚙' }
	]);
</script>

<a class="skip sr-only" href="#main">Skip to content</a>

<header class="top" bind:clientHeight={headerH}>
	<a class="brand" href="#/" aria-label="Tūtei home">
		<Logo size={30} label="" />
		<span>Tūtei</span>
	</a>
	<div class="row">
		{#if evalPrefs.on}
			<a class="chip rec" href="#/settings" title="Evaluation mode is recording">● {evalPrefs.participant}{evalPrefs.task ? ` · ${evalPrefs.task}` : ''}</a>
		{/if}
		<span class="chip" class:hide-narrow={evalPrefs.on} title="Data source">
			<span class="dot" class:live={settings.dataSource === 'http'} aria-hidden="true"></span>
			{settings.dataSource === 'http' ? 'OpenClaw' : 'Demo data'}
		</span>
		<span class="chip">{me().name} · {settings.role === 'senior' ? 'Senior' : 'Junior'}</span>
	</div>
</header>

<div class="toasts" aria-live="polite">
	{#each toasts as t (t.id)}
		<div class="toast {t.kind}" role="status">
			{#if t.href}<a href={t.href}>{t.text}</a>{:else}{t.text}{/if}
		</div>
	{/each}
</div>

{#if split}
	<main id="main" class="split" style:--hdr="{headerH}px">
		<div class="pane list-pane" aria-label="Alerts">
			<AlertFeed selectedId={page.params.id ?? null} />
		</div>
		<div class="pane detail-pane">
			{#if route === '/alerts/[id]'}
				<div class="detail-inner">{@render children()}</div>
			{:else}
				<div class="pick">
					<Logo size={64} label="" />
					<p><b>Select an alert</b></p>
					<p class="small muted">Its AI triage, timeline and your decision appear here.</p>
				</div>
			{/if}
		</div>
	</main>
{:else}
	<main id="main" class:wide={viewport.wide}>
		{@render children()}
	</main>
{/if}

<nav class="tabs" class:rail={viewport.wide} aria-label="Main" style:--hdr="{headerH}px">
	{#each tabs as tab}
		<a href={tab.href} class:active={route === tab.id || (tab.id === '/' && route === '/alerts/[id]') || (tab.id === '/kb' && route?.startsWith('/kb'))} aria-current={route === tab.id ? 'page' : undefined}>
			<span class="ic" aria-hidden="true">{tab.icon}</span>
			<span>{tab.label}</span>
			{#if tab.badge}<span class="badge" aria-label="{tab.badge} waiting">{tab.badge}</span>{/if}
		</a>
	{/each}
</nav>

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
		background: color-mix(in srgb, var(--bg) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-size: 1.2rem;
		text-decoration: none;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--muted);
	}
	.dot.live {
		background: var(--good);
	}
	@media (max-width: 480px) {
		.hide-narrow {
			display: none;
		}
	}
	.chip.rec {
		color: var(--bad);
		border-color: var(--bad);
		text-decoration: none;
		font-weight: 700;
	}
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
	}
	.tabs {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		background: var(--surface);
		border-top: 1px solid var(--line);
		padding-bottom: env(safe-area-inset-bottom);
	}
	.tabs a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 60px;
		text-decoration: none;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.tabs a.active {
		color: var(--accent);
		font-weight: 700;
	}
	.ic {
		font-size: 1.2rem;
		line-height: 1;
	}
	.badge {
		position: absolute;
		top: 6px;
		left: calc(50% + 8px);
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--bad);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.toasts {
		position: fixed;
		top: calc(64px + env(safe-area-inset-top));
		left: 12px;
		right: 12px;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 536px;
		margin: 0 auto;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-left: 6px solid var(--accent);
		border-radius: 12px;
		padding: 12px 14px;
		font-weight: 600;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
		animation: slide 0.25s ease-out;
	}
	.toast a {
		text-decoration: none;
		display: block;
	}
	.toast.critical,
	.toast.error {
		border-left-color: var(--bad);
	}
	.toast.success {
		border-left-color: var(--good);
	}
	/* ---------- Tablet layout ---------- */
	.tabs.rail {
		top: var(--hdr);
		right: auto;
		width: 96px;
		grid-template-columns: none;
		grid-auto-rows: 80px;
		align-content: start;
		gap: 4px;
		padding: 12px 0 env(safe-area-inset-bottom) env(safe-area-inset-left);
		border-top: none;
		border-right: 1px solid var(--line);
	}
	.tabs.rail a {
		min-height: 80px;
		border-radius: 12px;
		margin: 0 8px;
	}
	.tabs.rail a.active {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}
	.tabs.rail .badge {
		top: 10px;
		left: calc(50% + 6px);
	}
	main.wide {
		max-width: 760px;
		margin: 0 auto 0 calc(96px + max(0px, (100vw - 96px - 760px) / 2));
		padding: 24px 24px 32px;
	}
	main.split {
		max-width: none;
		margin: 0 0 0 calc(96px + env(safe-area-inset-left));
		padding: 0;
		display: grid;
		grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
		height: calc(100dvh - var(--hdr));
	}
	/* Smaller tablets and iPads in portrait: narrower list, slimmer rail, more room for the alert. */
	@media (max-width: 1023px) {
		main.split {
			grid-template-columns: 280px minmax(0, 1fr);
			margin-left: calc(80px + env(safe-area-inset-left));
		}
		.tabs.rail {
			width: 80px;
		}
		main.wide {
			margin-left: calc(80px + max(0px, (100vw - 80px - 760px) / 2));
			padding: 20px 20px 32px;
		}
		.tabs.rail a {
			margin: 0 6px;
		}
		.list-pane {
			padding: 16px 14px;
		}
		.detail-pane {
			padding: 16px 20px calc(24px + env(safe-area-inset-bottom));
		}
	}
	.pane {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
	}
	.list-pane {
		border-right: 1px solid var(--line);
	}
	.detail-pane {
		padding: 20px 28px calc(24px + env(safe-area-inset-bottom));
		container-type: inline-size;
	}
	.detail-inner {
		max-width: 880px;
		margin: 0 auto;
	}
	.pick {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		text-align: center;
		color: var(--muted);
	}
	@media (min-width: 768px) and (min-height: 600px) {
		.toasts {
			left: auto;
			right: 24px;
			width: 380px;
		}
	}

	.skip:focus {
		position: fixed;
		top: 8px;
		left: 8px;
		width: auto;
		height: auto;
		clip: auto;
		z-index: 30;
		background: var(--accent);
		color: var(--on-accent);
		padding: 8px 12px;
	}
	@keyframes slide {
		from {
			transform: translateY(-12px);
			opacity: 0;
		}
	}
</style>
