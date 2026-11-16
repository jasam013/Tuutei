# Tūtei ↔ OpenClaw API contract

Tūtei only talks to the orchestration layer (OpenClaw, CT 201), never to the models directly.
This is the contract the app expects. `server/mock-api.js` implements it so the app can be tested before OpenClaw does.

Base URL: set in **Settings → Data source → API base URL** (default `/api`, same origin).
All bodies are JSON. Errors use any non-2xx status with:

```json
{ "error": { "code": "TRIAGE_TIMEOUT", "message": "The agent did not answer in time" } }
```

The app gives every call a timeout (8 s by default). A timeout, network failure or error body is shown as a clear error state with **Retry**; the app never guesses.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/alerts` | Alert list (summaries), newest first |
| GET | `/alerts/{id}` | One alert with timeline events, activity counts, raw SIEM event and audit trail |
| GET | `/alerts/{id}/triage` | AI triage: verdict, confidence, diagnosis, suggested action, similar tickets. **Slow (seconds).** |
| POST | `/alerts/{id}/decision` | Analyst decision; may be routed for senior sign-off |
| GET | `/approvals` | Pending sign-off requests |
| POST | `/approvals/{id}` | Senior approves or sends back |
| POST | `/dev/simulate` | Demo only: create a new incoming alert |
| POST | `/dev/reset` | Demo only: reset data |

### Alert summary (`GET /alerts`)

```json
{
  "id": "ALR-1042",
  "title": "Impossible travel sign-in",
  "source": "Microsoft Entra ID via Splunk",
  "severity": "critical | high | medium | low",
  "createdAt": 1793585636167,
  "status": "new | awaiting_approval | resolved | closed | escalated",
  "entity": { "user": "r.tane@example.co.nz", "host": "—", "ip": "185.220.101.37" },
  "returnedComment": null
}
```

### Alert detail (`GET /alerts/{id}`)

Summary fields, plus:

```json
{
  "rule": "Identity: sign-ins from distant locations within 30 min",
  "events": [{ "at": 1793585100000, "label": "Sign-in succeeded from Frankfurt, DE", "kind": "info | warn | bad | alert" }],
  "activity": [0, 0, 1, 0, 0, 2, 5, 3],
  "raw": { "...": "the SIEM event as received" },
  "audit": [{ "at": 1793585700000, "who": "Aroha", "role": "junior", "what": "approve", "note": "…" }]
}
```

`activity` is related-event counts per 5-minute window, oldest first (8 values = last 40 minutes).

### Triage (`GET /alerts/{id}/triage`)

```json
{
  "alertId": "ALR-1042",
  "verdict": "true_positive | false_positive | benign",
  "confidence": 0.88,
  "diagnosis": "Plain-English explanation from the fine-tuned LLM",
  "action": { "id": "disable-account", "label": "Disable account and revoke sessions", "impact": "high | low", "detail": "What the action changes" },
  "similar": [{ "id": "INC-2231", "title": "…", "resolution": "…", "similarity": 0.91 }]
}
```

`confidence` comes from the tree-ensemble classifier. The app compares it with the analyst's threshold (default 0.75):
at or above = **Confident** (suggestion shown); below = **Unsure** (“Needs human review”, suggestion hidden).
`impact: "high"` means the action changes a production system.

### Decision (`POST /alerts/{id}/decision`)

```json
{
  "decision": "approve | reject | escalate",
  "note": "Why, for the audit trail",
  "voiceNote": "data:audio/webm;base64,… or null",
  "analyst": { "name": "Aroha", "role": "junior | senior" }
}
```

Response: `{ "status": "resolved" }` or, when sign-off is needed,
`{ "status": "awaiting_approval", "approvalId": "APR-1", "reasons": ["…"] }`.

**Sign-off rules** (in `src/lib/policy.js`; the agent must enforce them too, the app only previews them):
- approving an action with `impact: "high"` needs a senior;
- any approve/reject by a junior needs a senior;
- escalating never needs sign-off.

### Sign-off (`POST /approvals/{id}`)

```json
{ "approve": true, "comment": "Feedback (required when sending back)", "approver": { "name": "Jason", "role": "senior" } }
```

Rejected with `403 SAME_PERSON` if the approver made the original decision (separation of duties), and `403 FORBIDDEN` if the approver is not a senior.

## Identity and transport

In production the analyst's identity must come from the authenticated session (the mTLS client certificate from the EduStack CA, or SSO), not from the `analyst`/`approver` fields, which exist only so the prototype can switch personas. Traffic reaches OpenClaw only through the WireGuard tunnel.

## Knowledge base

Alerts now carry `client: {code, name}`. `GET /alerts/:id` adds `record: {id, outcome, wiki}` once resolved.
`GET /alerts/:id/triage` returns `similar[]` (each with `scope: "same" | "other"`; `other` entries
carry no ids, names, hosts or notes) and `learning: {baseConfidence, adjustment, sameCount, otherCount, summary}`.
`POST /alerts/:id/decision` accepts an optional `lesson` (max 500 characters).

| Method | Path | Returns |
|---|---|---|
| GET | `/kb` | `{wiki:{enabled,label}, records[], playbooks[]}` |
| GET | `/kb/:id` | Full record plus `markdown` and `sharedLesson` (customer-confidential) |
| GET | `/kb/playbook/:pattern` | Anonymised playbook plus `markdown` |
| POST | `/kb/sync` | Queues every record not yet in the wiki: `{queued}` |

`wiki.status` is one of `pending`, `written` (with `url`), `failed` (with `error`), `off`, or `history`. See WIKI.md.
