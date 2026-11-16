// Mock of the OpenClaw agent API over real HTTP, using the same logic as the in-app mock.
// Use it to test "OpenClaw API" mode end to end (timeouts, network errors, sign-off)
// before pointing the app at the real agent.
//
//   npm run mock-api                 # API on http://localhost:8787/api
//   npm run build && npm run mock-api  # also serves the built app on the same port
//
// No dependencies: Node 18+ only.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend, ApiError } from '../src/lib/mock/backend.js';
import { wikiConfig, createWikiQueue } from './wiki.js';
import { createEvalStore } from './eval.js';
import { openclawConfig, createAgent } from './openclaw.js';

const PORT = Number(process.env.PORT || 8787);
const BUILD_DIR = resolve(fileURLToPath(new URL('../build', import.meta.url)));

// Alerts, sign-offs and the knowledge base survive restarts when TUTEI_DATA_DIR is set
// (systemd: StateDirectory=tutei gives /var/lib/tutei).
const DATA_DIR = process.env.TUTEI_DATA_DIR || '';
const DATA_FILE = DATA_DIR ? join(DATA_DIR, 'state.json') : '';
let saveTimer = null;
function load() {
	if (!DATA_FILE) return null;
	try {
		return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
	} catch {
		return null;
	}
}
function save(state) {
	if (!DATA_FILE) return;
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		try {
			mkdirSync(DATA_DIR, { recursive: true });
			writeFileSync(DATA_FILE + '.tmp', JSON.stringify(state));
			renameSync(DATA_FILE + '.tmp', DATA_FILE);
		} catch (e) {
			console.error(`Could not save state to ${DATA_FILE}: ${/** @type {any} */ (e).message}`);
		}
	}, 250);
}

let wikiQueue = null;
// Live OpenClaw triage when TUTEI_OPENCLAW_URL is set; otherwise the scripted stand-in.
const agent = openclawConfig ? createAgent(openclawConfig) : null;
const SCRIPTED_FAILURE = process.env.TUTEI_SCRIPTED_FAILURE !== 'off';
const backend = createBackend({ load, save, wiki: wikiConfig, onRecord: (r) => wikiQueue?.push(r.id) });
wikiQueue = createWikiQueue(backend);
const evalStore = createEvalStore(DATA_DIR);
// Finish any wiki writes that were interrupted by a restart.
for (const r of backend.kbState()) if (r.wiki?.status === 'pending') wikiQueue.push(r.id);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function send(res, status, body) {
	res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
	res.end(JSON.stringify(body));
}

async function readJson(req) {
	let raw = '';
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > 2_000_000) throw new ApiError('TOO_LARGE', 'Body too large', 413);
	}
	try {
		return raw ? JSON.parse(raw) : {};
	} catch {
		throw new ApiError('BAD_JSON', 'Body is not valid JSON');
	}
}

// ---------- Natural voice (Piper on its own container) ----------
// Briefing text goes only to the TTS container on the internal network, never off-site.
const TTS_URL = (process.env.TUTEI_TTS_URL || '').replace(/\/$/, '');
const MAX_TTS_CHARS = 1500;
const NICE_NAMES = {
	northern_english_male: 'Northern English male',
	southern_english_female: 'Southern English female',
	jenny_dioco: 'Jenny',
	alba: 'Alba (Scottish)',
	aru: 'ARU',
	vctk: 'VCTK',
	semaine: 'Semaine'
};
const MAX_SPEAKERS_PER_VOICE = 120;

async function ttsFetch(path, init = {}, ms = 30000) {
	if (!TTS_URL) throw new ApiError('TTS_UNAVAILABLE', 'Natural voice service is not configured', 503);
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		const res = await fetch(TTS_URL + path, { ...init, signal: ctrl.signal });
		if (!res.ok) throw new ApiError('TTS_FAILED', `Voice service answered ${res.status}`, 502);
		return res;
	} catch (e) {
		if (e instanceof ApiError) throw e;
		throw new ApiError('TTS_UNAVAILABLE', 'Cannot reach the natural voice service', 503);
	} finally {
		clearTimeout(timer);
	}
}

async function ttsVoices() {
	const data = await (await ttsFetch('/voices', {}, 5000)).json();
	// Multi-speaker voices (Semaine, ARU, VCTK) become one entry per speaker: "<voice>#<speaker>".
	return Object.entries(data)
		.flatMap(([id, cfg]) => {
			const [, name = id, quality = ''] = id.split('-');
			const nice = NICE_NAMES[name] || name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
			const country = cfg?.language?.country_english || cfg?.language?.code || '';
			const lang = (cfg?.language?.code || '').replace('_', '-');
			const speakers = Object.keys(cfg?.speaker_id_map || {});
			if ((cfg?.num_speakers || 1) > 1 && speakers.length) {
				return speakers.slice(0, MAX_SPEAKERS_PER_VOICE).map((s) => ({
					id: `${id}#${s}`,
					label: `${nice} – ${s.charAt(0).toUpperCase() + s.slice(1)} · English (${country}) · ${quality}`,
					lang
				}));
			}
			return [{ id, label: `${nice} · English (${country}) · ${quality}`, lang }];
		})
		.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
}

async function ttsSynthesize(req, res) {
	const body = await readJson(req);
	const text = String(body.text || '').trim();
	if (!text) throw new ApiError('NO_TEXT', 'Nothing to say');
	if (text.length > MAX_TTS_CHARS) throw new ApiError('TOO_LONG', `Briefings are limited to ${MAX_TTS_CHARS} characters`, 413);
	const rate = Math.min(1.4, Math.max(0.7, Number(body.rate) || 1));
	const m = /^([\w-]{1,80})(?:#([\w-]{1,40}))?$/.exec(body.voice || '');
	const voice = m?.[1];
	const speaker = m?.[2];
	const upstream = await ttsFetch('/synthesize', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text, voice, speaker, length_scale: Number((1 / rate).toFixed(2)) })
	});
	const audio = Buffer.from(await upstream.arrayBuffer());
	res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': audio.length, 'cache-control': 'no-store' });
	res.end(audio);
	return RAW;
}

const RAW = Symbol('raw response already sent');

const routes = [
	['GET', /^\/api\/tts\/voices$/, () => ttsVoices()],
	['POST', /^\/api\/tts$/, (m, req, res) => ttsSynthesize(req, res)],
	['GET', /^\/api\/alerts$/, () => backend.listAlerts()],
	['GET', /^\/api\/alerts\/([\w-]+)$/, (m) => backend.getAlert(m[1])],
	['GET', /^\/api\/alerts\/([\w-]+)\/triage$/, async (m) => {
		if (agent) return backend.getTriageLive(m[1], agent, { scriptedFailure: SCRIPTED_FAILURE });
		await wait(1200 + Math.random() * 1800);
		return backend.getTriage(m[1]);
	}],
	['POST', /^\/api\/alerts\/([\w-]+)\/decision$/, async (m, req) => backend.postDecision(m[1], await readJson(req))],
	['GET', /^\/api\/approvals$/, () => backend.listApprovals()],
	['POST', /^\/api\/approvals\/([\w-]+)$/, async (m, req) => backend.postApproval(m[1], await readJson(req))],
	['GET', /^\/api\/kb$/, () => backend.listKb()],
	['GET', /^\/api\/kb\/playbook\/([\w-]+)$/, (m) => backend.getPlaybook(m[1])],
	['GET', /^\/api\/kb\/([\w-]+)$/, (m) => backend.getKb(m[1])],
	['POST', /^\/api\/kb\/sync$/, () => {
		const ids = backend.queueWikiSync();
		ids.forEach((id) => wikiQueue.push(id));
		return { queued: ids.length };
	}],
	['POST', /^\/api\/eval\/events$/, async (m, req) => evalStore.add(await readJson(req))],
	['GET', /^\/api\/eval\/summary$/, () => evalStore.summary()],
	['GET', /^\/api\/eval\/export\.csv$/, (m, req, res) => {
		const csv = evalStore.csv();
		const name = `tutei-eval-${new Date().toISOString().slice(0, 10)}.csv`;
		res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' });
		res.end(csv);
		return RAW;
	}],
	['POST', /^\/api\/eval\/clear$/, () => evalStore.clear()],
	['GET', /^\/api\/agent$/, () => ({ mode: agent ? 'openclaw' : 'scripted', target: agent?.label || null, scriptedFailure: SCRIPTED_FAILURE })],
	['POST', /^\/api\/dev\/simulate$/, () => backend.simulateIncoming()],
	['POST', /^\/api\/dev\/reset$/, () => (backend.reset(), { ok: true })]
];

async function serveStatic(req, res) {
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	const file = normalize(join(BUILD_DIR, path === '/' ? 'index.html' : path));
	if (!file.startsWith(BUILD_DIR)) return send(res, 403, { error: { code: 'FORBIDDEN', message: 'Forbidden' } });
	try {
		const data = await readFile(file);
		res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
		res.end(data);
	} catch {
		send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found (run npm run build to serve the app here)' } });
	}
}

http
	.createServer(async (req, res) => {
		if (req.method === 'OPTIONS') return send(res, 204, {});
		const path = new URL(req.url, 'http://x').pathname;
		if (!path.startsWith('/api/')) return serveStatic(req, res);
		for (const [method, re, handler] of routes) {
			const m = path.match(re);
			if (m && req.method === method) {
				try {
					const out = await handler(m, req, res);
					if (out === RAW) return;
					return send(res, 200, out);
				} catch (e) {
					const err = e instanceof ApiError ? e : new ApiError('SERVER', 'Unexpected error', 500);
					if (!(e instanceof ApiError)) console.error(e);
					return send(res, err.status, { error: { code: err.code, message: err.message } });
				}
			}
		}
		send(res, 404, { error: { code: 'NOT_FOUND', message: `No route ${req.method} ${path}` } });
	})
	.listen(PORT, () =>
		console.log(`Tūtei mock agent API on http://localhost:${PORT}/api` + (TTS_URL ? ` · natural voice via ${TTS_URL}` : ' · natural voice off (set TUTEI_TTS_URL)') +
			(wikiConfig.enabled ? ` · writing to ${wikiConfig.label}` : ' · wiki off (set TUTEI_GITEA_*)') +
			(agent ? ` · triage by OpenClaw ${agent.label}` : ' · triage scripted (set TUTEI_OPENCLAW_URL)') +
			(DATA_FILE ? ` · state in ${DATA_FILE}` : ' · state in memory only (set TUTEI_DATA_DIR)'))
	);
