// Synthetic SIEM alerts for the prototype. Every name, host and address is invented.
// Times are offsets in minutes before "now", so the demo always looks fresh.
// Each alert carries what the SIEM would send (raw), plus a canned triage result
// standing in for the OpenClaw agent (tree-ensemble verdict + LLM diagnosis).

export const SEED_ALERTS = [
	{
		id: 'ALR-1042',
		client: 'KWH',
		pattern: 'impossible-travel',
		title: 'Impossible travel sign-in',
		rule: 'Identity: sign-ins from distant locations within 30 min',
		source: 'Microsoft Entra ID via Splunk',
		severity: 'high',
		minutesAgo: 4,
		entity: { user: 'r.tane@example.co.nz', host: '—', ip: '185.220.101.37' },
		activity: [0, 0, 1, 0, 0, 2, 5, 3],
		events: [
			{ t: -26, label: 'Sign-in succeeded from Wellington, NZ', kind: 'info' },
			{ t: -9, label: 'Sign-in succeeded from Frankfurt, DE', kind: 'warn' },
			{ t: -8, label: 'MFA prompt approved on registered phone', kind: 'warn' },
			{ t: -6, label: 'Mailbox forwarding rule created', kind: 'bad' },
			{ t: -4, label: 'SIEM rule fired: impossible travel', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.88,
			diagnosis:
				'Two successful sign-ins 17 minutes apart from Wellington and Frankfurt cannot both be the user. The Frankfurt address is a known anonymising exit node, and a mail forwarding rule was created straight after. This matches the MFA-fatigue account takeover pattern seen in two earlier tickets.',
			action: {
				id: 'disable-account',
				label: 'Disable account and revoke sessions',
				impact: 'high',
				detail: 'Blocks sign-in, revokes refresh tokens and removes the forwarding rule.'
			}
		}
	},
	{
		id: 'ALR-1041',
		client: 'HBR',
		pattern: 'encoded-powershell',
		title: 'Encoded PowerShell on workstation',
		rule: 'Endpoint: powershell.exe with -EncodedCommand',
		source: 'CrowdStrike Falcon via NG-SIEM',
		severity: 'critical',
		minutesAgo: 11,
		entity: { user: 'svc-print', host: 'WS-0142', ip: '10.20.4.142' },
		activity: [0, 1, 0, 0, 3, 8, 6, 2],
		events: [
			{ t: -31, label: 'Macro-enabled document opened from email', kind: 'warn' },
			{ t: -29, label: 'powershell.exe launched with -EncodedCommand', kind: 'bad' },
			{ t: -28, label: 'Outbound HTTPS to unrecognised domain', kind: 'bad' },
			{ t: -20, label: 'Scheduled task created for persistence', kind: 'bad' },
			{ t: -11, label: 'SIEM rule fired: encoded PowerShell', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.81,
			diagnosis:
				'The chain of a macro document, encoded PowerShell, an outbound call and a new scheduled task is a classic initial-access pattern. The decoded command downloads a second stage. The host should be contained before lateral movement.',
			action: {
				id: 'isolate-host',
				label: 'Isolate WS-0142 with EDR network containment',
				impact: 'high',
				detail: 'Cuts the host off the network except for the EDR console.'
			}
		}
	},
	{
		id: 'ALR-1040',
		client: 'AWA',
		pattern: 'vpn-bruteforce',
		title: 'VPN brute force, then success',
		rule: 'Network: 20+ failed VPN logins followed by success',
		source: 'FortiGate VPN via Splunk',
		severity: 'medium',
		minutesAgo: 23,
		entity: { user: 'm.williams', host: 'vpn-gw-01', ip: '203.0.113.88' },
		activity: [2, 6, 9, 12, 7, 1, 0, 0],
		events: [
			{ t: -58, label: '23 failed logins for m.williams in 8 minutes', kind: 'warn' },
			{ t: -47, label: 'Successful login from the same address', kind: 'warn' },
			{ t: -45, label: 'Session idle, no internal connections', kind: 'info' },
			{ t: -23, label: 'SIEM rule fired: brute force then success', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.58,
			diagnosis:
				'The failure pattern looks like a password-guessing attack, but the address is a residential New Zealand connection and the user has a history of lockouts after password changes. The evidence points both ways, so this needs a human judgement.',
			action: {
				id: 'reset-password',
				label: 'Force password reset and end VPN session',
				impact: 'low',
				detail: 'User must set a new password at next sign-in.'
			}
		}
	},
	{
		id: 'ALR-1039',
		client: 'KWH',
		pattern: 'sandbox-block',
		title: 'Malware download blocked',
		rule: 'Web: file blocked by sandbox verdict',
		source: 'Zscaler ZIA via Cribl',
		severity: 'low',
		minutesAgo: 37,
		entity: { user: 'k.patel', host: 'LT-0388', ip: '10.20.7.88' },
		activity: [0, 0, 0, 1, 0, 0, 0, 0],
		events: [
			{ t: -38, label: 'User clicked link in a shopping newsletter', kind: 'info' },
			{ t: -38, label: 'invoice_2026.zip flagged malicious by sandbox', kind: 'warn' },
			{ t: -38, label: 'Download blocked by web policy', kind: 'info' },
			{ t: -37, label: 'SIEM rule fired: sandbox block', kind: 'alert' }
		],
		triage: {
			verdict: 'benign',
			confidence: 0.95,
			diagnosis:
				'The proxy blocked the file before it reached the laptop, and no other activity followed. Policy worked as intended. Close as handled; no user action needed.',
			action: {
				id: 'close-handled',
				label: 'Close as handled by policy',
				impact: 'low',
				detail: 'No change to any system.'
			}
		}
	},
	{
		id: 'ALR-1038',
		client: 'HBR',
		pattern: 'new-domain',
		title: 'Traffic to newly registered domain',
		rule: 'DNS: lookups of domains registered < 7 days ago',
		source: 'Splunk Stream DNS',
		severity: 'medium',
		minutesAgo: 52,
		entity: { user: '—', host: 'SRV-APP-03', ip: '10.20.1.13' },
		activity: [1, 1, 2, 1, 1, 2, 1, 1],
		events: [
			{ t: -70, label: 'First lookup of kia-ora-update[.]net', kind: 'warn' },
			{ t: -55, label: 'Repeated lookups every 5 minutes', kind: 'warn' },
			{ t: -52, label: 'SIEM rule fired: newly registered domain', kind: 'alert' }
		],
		// No triage block: the agent times out on this one, to demonstrate the failure state.
		triage: null,
		failTriage: true
	},
	{
		id: 'ALR-1037',
		client: 'AWA',
		pattern: 'forwarder-gap',
		title: 'Forwarder stopped sending data',
		rule: 'Health: no events from forwarder for 30 min',
		source: 'Splunk monitoring console',
		severity: 'low',
		minutesAgo: 75,
		entity: { user: '—', host: 'uf-dc-02', ip: '10.20.0.22' },
		activity: [9, 9, 8, 9, 0, 0, 0, 0],
		events: [
			{ t: -110, label: 'Windows update installed on uf-dc-02', kind: 'info' },
			{ t: -105, label: 'Host rebooted', kind: 'info' },
			{ t: -105, label: 'Universal Forwarder service did not start', kind: 'warn' },
			{ t: -75, label: 'SIEM rule fired: data gap', kind: 'alert' }
		],
		triage: {
			verdict: 'benign',
			confidence: 0.9,
			diagnosis:
				'Patch-night reboot; the forwarder service is set to delayed start and failed once. Same cause as the last two data-gap tickets. Restarting the service resolves it.',
			action: {
				id: 'restart-forwarder',
				label: 'Restart SplunkForwarder service on uf-dc-02',
				impact: 'high',
				detail: 'Restarts a service on a domain controller (production change).'
			}
		}
	}
];

// Pool used by "Simulate incoming alert". It repeats earlier patterns, at the same
// customer and at others, so resolving an alert visibly changes the next triage.
// The first one is critical, so usability task T1 (respond to a critical alert) gets one.
export const INCOMING_POOL = [
	{
		client: 'HBR',
		pattern: 'encoded-powershell',
		title: 'Encoded PowerShell on workstation',
		rule: 'Endpoint: powershell.exe with -EncodedCommand',
		source: 'CrowdStrike Falcon via NG-SIEM',
		severity: 'critical',
		entity: { user: 'b.cooper', host: 'WS-0219', ip: '10.30.4.219' },
		activity: [0, 0, 2, 5, 7, 3, 1, 0],
		events: [
			{ t: -16, label: 'Macro-enabled document opened from email', kind: 'warn' },
			{ t: -15, label: 'powershell.exe launched with -EncodedCommand', kind: 'bad' },
			{ t: -1, label: 'SIEM rule fired: encoded PowerShell', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.83,
			diagnosis: 'Same opening as the macro droppers seen before: an Office document spawning encoded PowerShell. No persistence yet.',
			action: { id: 'isolate-host', label: 'Isolate WS-0219 with EDR network containment', impact: 'high', detail: 'Cuts the host off the network except for the EDR console.' }
		}
	},
	{
		client: 'AWA',
		pattern: 'vpn-bruteforce',
		title: 'VPN brute force, then success',
		rule: 'Network: 20+ failed VPN logins followed by success',
		source: 'FortiGate VPN via Splunk',
		severity: 'medium',
		entity: { user: 'm.williams', host: 'vpn-gw-01', ip: '203.0.113.91' },
		activity: [1, 5, 8, 10, 4, 0, 0, 0],
		events: [
			{ t: -14, label: '21 failed logins for m.williams in 6 minutes', kind: 'warn' },
			{ t: -6, label: 'Successful login from the same address', kind: 'warn' },
			{ t: -1, label: 'SIEM rule fired: brute force then success', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.64,
			diagnosis:
				'Another burst of failed VPN logins for m.williams from a residential New Zealand address, followed by a success. On the raw signal alone this looks like password guessing.',
			action: { id: 'reset-password', label: 'Force password reset and end VPN session', impact: 'low', detail: 'User must set a new password at next sign-in.' }
		}
	},
	{
		client: 'AWA',
		pattern: 'impossible-travel',
		title: 'Impossible travel sign-in',
		rule: 'Identity: sign-ins from distant locations within 30 min',
		source: 'Microsoft Entra ID via Splunk',
		severity: 'high',
		entity: { user: 'w.parata@example.govt.nz', host: '—', ip: '91.219.236.18' },
		activity: [0, 0, 0, 1, 0, 3, 4, 2],
		events: [
			{ t: -20, label: 'Sign-in succeeded from Whangārei, NZ', kind: 'info' },
			{ t: -7, label: 'Sign-in succeeded from Amsterdam, NL', kind: 'warn' },
			{ t: -6, label: 'MFA prompt approved on registered phone', kind: 'warn' },
			{ t: -1, label: 'SIEM rule fired: impossible travel', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.77,
			diagnosis:
				'Sign-ins from Whangārei and Amsterdam 13 minutes apart, with an MFA approval straight after the foreign one. No mailbox rule yet.',
			action: { id: 'disable-account', label: 'Disable account and revoke sessions', impact: 'high', detail: 'Blocks sign-in and revokes refresh tokens.' }
		}
	},
	{
		client: 'HBR',
		pattern: 'priv-group-change',
		title: 'Admin group membership changed',
		rule: 'Identity: user added to Domain Admins',
		source: 'Windows Security via Splunk',
		severity: 'high',
		entity: { user: 'a.hohaia', host: 'DC-01', ip: '10.20.0.10' },
		activity: [0, 0, 0, 0, 0, 0, 1, 1],
		events: [
			{ t: -3, label: 'a.hohaia added to Domain Admins by helpdesk-svc', kind: 'bad' },
			{ t: -1, label: 'SIEM rule fired: privileged group change', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.79,
			diagnosis:
				'A service account that normally only resets passwords added a user to Domain Admins outside a change window. No matching change ticket exists.',
			action: { id: 'revert-membership', label: 'Remove a.hohaia from Domain Admins', impact: 'high', detail: 'Production directory change.' }
		}
	},
	{
		client: 'AWA',
		pattern: 'large-upload',
		title: 'Large upload to personal cloud storage',
		rule: 'Web: > 500 MB to unsanctioned cloud app',
		source: 'Zscaler ZIA via Cribl',
		severity: 'medium',
		entity: { user: 's.lee', host: 'LT-0451', ip: '10.20.7.151' },
		activity: [0, 0, 1, 4, 6, 3, 0, 0],
		events: [
			{ t: -12, label: '1.2 GB uploaded to a personal storage site', kind: 'warn' },
			{ t: -2, label: 'SIEM rule fired: large upload', kind: 'alert' }
		],
		triage: {
			verdict: 'true_positive',
			confidence: 0.67,
			diagnosis:
				'Volume is unusual for this user, but they work in marketing and often share large video files. Needs a human to check intent.',
			action: { id: 'contact-user', label: 'Contact user and request justification', impact: 'low', detail: 'No system change.' }
		}
	}
];
