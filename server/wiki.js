// Writes resolution records to a Gitea wiki (CT 202) through the Gitea REST API.
//
//   TUTEI_GITEA_URL         http://192.168.100.22:3000   (internal address, from CT 204)
//   TUTEI_GITEA_REPO        owner/repo whose wiki holds the knowledge base
//   TUTEI_GITEA_TOKEN       access token with write:repository scope (keep it in a root-only file)
//   TUTEI_GITEA_PUBLIC_URL  optional: address the phone can open, used for "Open in Gitea" links
//   TUTEI_GITEA_CA          optional: root CA file that signed the Gitea/nginx server certificate
//   TUTEI_GITEA_CERT        optional: client certificate, for nginx mTLS in front of Gitea
//   TUTEI_GITEA_KEY         optional: the client certificate's private key
//
// Three kinds of page are kept up to date for every resolution:
//   "INC-2400 AWA VPN brute force then success"   the full record (customer-confidential)
//   "Customer AWA"                                 that customer's index
//   "Playbook VPN brute force then success"        the anonymised cross-customer playbook
import https from 'node:https';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { recordMarkdown, clientMarkdown, playbookMarkdown, recordPageTitle, clientPageTitle, playbookPageTitle } from '../src/lib/mock/knowledge.js';

const BASE = (process.env.TUTEI_GITEA_URL || '').replace(/\/$/, '');
const REPO = process.env.TUTEI_GITEA_REPO || '';
const TOKEN = process.env.TUTEI_GITEA_TOKEN || '';
const PUBLIC = (process.env.TUTEI_GITEA_PUBLIC_URL || '').replace(/\/$/, '');

export const wikiConfig = {
	enabled: !!(BASE && TOKEN && /^[\w.-]+\/[\w.-]+$/.test(REPO)),
	label: REPO ? `Gitea wiki ${REPO}` : ''
};

const readOpt = (name) => (process.env[name] ? readFileSync(process.env[name]) : undefined);
let tls = {};
try {
	tls = { ca: readOpt('TUTEI_GITEA_CA'), cert: readOpt('TUTEI_GITEA_CERT'), key: readOpt('TUTEI_GITEA_KEY') };
} catch (e) {
	console.error(`wiki: cannot read a TUTEI_GITEA certificate file: ${/** @type {any} */ (e).message}`);
	wikiConfig.enabled = false;
}
const agent = BASE.startsWith('https:') ? new https.Agent({ ...tls, keepAlive: true }) : undefined;

/** One HTTP(S) request with an optional mTLS client certificate. */
function request(method, url, body) {
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const lib = u.protocol === 'https:' ? https : http;
		const data = body ? Buffer.from(JSON.stringify(body)) : null;
		const req = lib.request(
			u,
			{
				method,
				agent,
				timeout: 10000,
				headers: { authorization: `token ${TOKEN}`, accept: 'application/json', ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) }
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (c) => (raw += c));
				res.on('end', () => {
					let json = null;
					try {
						json = raw ? JSON.parse(raw) : null;
					} catch {
						/* nginx error pages are HTML */
					}
					resolve({ status: res.statusCode || 0, json, raw });
				});
			}
		);
		req.on('timeout', () => req.destroy(Object.assign(new Error('Gitea did not answer within 10 seconds'), { code: 'TIMEOUT' })));
		req.on('error', reject);
		if (data) req.write(data);
		req.end();
	});
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
/** @type {Map<string,string>} page title -> sub_url, learnt from Gitea */
const pages = new Map();
let listed = false;

async function gitea(method, path, body) {
	let res;
	try {
		res = await request(method, `${BASE}/api/v1/repos/${REPO}${path}`, body);
	} catch (e) {
		const code = /** @type {any} */ (e)?.code || '';
		if (code === 'TIMEOUT') throw e;
		if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/.test(code)) throw new Error(`TLS problem talking to Gitea (${code}): check TUTEI_GITEA_CA`);
		throw new Error(`Cannot reach Gitea at ${BASE} (${code || /** @type {any} */ (e)?.message})`);
	}
	if (res.status < 200 || res.status >= 300) {
		const hint =
			res.status === 400 && /certificate/i.test(res.raw) ? ' (nginx wants a client certificate: set TUTEI_GITEA_CERT and TUTEI_GITEA_KEY)'
			: res.status === 403 && !res.json ? ' (nginx refused the client certificate: add its CN to the gitea_allowed map)'
			: res.status === 401 ? ' (check the token)'
			: res.status === 404 ? ' (check the repository name, and that its wiki is enabled)'
			: '';
		throw new Error(`Gitea answered ${res.status}${hint}${res.json?.message ? `: ${res.json.message}` : ''}`);
	}
	return res.json;
}

async function loadPageList() {
	if (listed) return;
	for (let p = 1; p < 50; p++) {
		const batch = await gitea('GET', `/wiki/pages?page=${p}&limit=50`);
		for (const pg of batch || []) pages.set(pg.title, pg.sub_url);
		if (!batch || batch.length < 50) break;
	}
	listed = true;
}

const publicUrl = (url) => {
	if (!url || !PUBLIC) return url || null;
	try {
		const u = new URL(url);
		return PUBLIC + u.pathname + u.search;
	} catch {
		return url;
	}
};

/** Create the page, or replace it if a page with that title exists. Returns its web address. */
async function upsert(title, markdown, message) {
	await loadPageList();
	const existing = pages.get(title);
	const body = { title, content_base64: b64(markdown), message };
	const page = existing ? await gitea('PATCH', `/wiki/page/${existing}`, body) : await gitea('POST', '/wiki/new', body);
	if (page?.sub_url) pages.set(page.title || title, page.sub_url);
	return publicUrl(page?.html_url) || `${PUBLIC || BASE}/${REPO}/wiki/${page?.sub_url || encodeURIComponent(title.replace(/ /g, '-'))}`;
}

/** Writes a record and refreshes the two pages that list it. */
export async function writeRecord(record, kb) {
	const msg = `Tūtei: ${record.id} resolved (${record.outcome})`;
	const url = await upsert(recordPageTitle(record), recordMarkdown(record), msg);
	await upsert(clientPageTitle(record.client), clientMarkdown(record.client, kb), msg);
	await upsert(playbookPageTitle(record.pattern), playbookMarkdown(record.pattern, kb), msg);
	return url;
}

/** One at a time, so pages that list several records are never written concurrently. */
export function createWikiQueue(backend) {
	const queue = [];
	let busy = false;
	async function run() {
		if (busy) return;
		busy = true;
		while (queue.length) {
			const id = queue.shift();
			const record = backend.kbState().find((r) => r.id === id);
			if (!record) continue;
			try {
				const url = await writeRecord(record, backend.kbState());
				backend.setWiki(id, { status: 'written', url, at: Date.now() });
			} catch (e) {
				listed = false; // re-read the page list next time
				backend.setWiki(id, { status: 'failed', error: String(/** @type {any} */ (e)?.message || e) });
				console.error(`wiki: ${id}: ${/** @type {any} */ (e)?.message || e}`);
			}
		}
		busy = false;
	}
	return {
		push(id) {
			if (!wikiConfig.enabled) return;
			if (!queue.includes(id)) queue.push(id);
			run();
		}
	};
}
