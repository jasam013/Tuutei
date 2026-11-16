// Quick check from CT 204: sends one sample alert to OpenClaw and prints what came back.
//   set -a; . /etc/tutei/openclaw.env; set +a; node server/openclaw-check.js
import { openclawConfig, createAgent } from './openclaw.js';

if (!openclawConfig) {
	console.error('TUTEI_OPENCLAW_URL is not set. Load the env file first: set -a; . /etc/tutei/openclaw.env; set +a');
	process.exit(1);
}
const agent = createAgent(openclawConfig);
console.log(`Asking ${agent.label} (timeout ${openclawConfig.timeoutMs / 1000} s)…`);
try {
	const out = await agent.triage({
		alert: {
			id: 'CHECK-1', customer: 'Awanui District Council', title: 'VPN brute force, then success',
			rule: 'Network: 20+ failed VPN logins followed by success', source: 'FortiGate VPN via Splunk', severity: 'medium',
			entity: { user: 'm.williams', host: 'vpn-gw-01', ip: '203.0.113.91' }, activity: [1, 5, 8, 10, 4, 0, 0, 0],
			events: [{ t: -14, label: '21 failed logins for m.williams in 6 minutes' }, { t: -6, label: 'Successful login from the same address' }]
		},
		matches: [{ scope: 'same', outcome: 'false_positive', resolution: 'Closed: phone retrying the old password', lesson: 'Repeated failures from one residential address right after a password change are usually a stale saved password.' }],
		actions: [
			{ id: 'reset-password', label: 'Force password reset and end VPN session' },
			{ id: 'contact-user', label: 'Contact the user and ask for justification' }
		]
	});
	console.log(`OK in ${(out.ms / 1000).toFixed(1)} s`);
	console.log(JSON.stringify({ verdict: out.verdict, confidence: out.confidence, action: out.action.id, diagnosis: out.diagnosis, reason: out.reason }, null, 2));
} catch (e) {
	console.error(`FAILED: ${/** @type {any} */ (e).code || ''} ${/** @type {any} */ (e).message}`);
	process.exit(2);
}
