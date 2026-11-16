# Connecting Tūtei to the live OpenClaw agent

Tūtei's server (CT 204) asks the OpenClaw gateway (CT 201) to triage each alert through the
gateway's OpenAI-compatible endpoint, `POST /v1/chat/completions`. Everything else (alerts,
knowledge base, sign-off policy, Gitea wiki, evaluation log) stays in Tūtei.

```
Phone ──Tailscale──► CT 204 Tūtei server ──HTTP + Bearer token──► CT 201 OpenClaw gateway :18789
                         │  alert + past resolutions + allowed actions          │
                         ◄──────── JSON: verdict, confidence, diagnosis, action ┘
```

## What the agent can and cannot do

* It gets one alert, the matching past resolutions (other customers' already anonymised) and
  a short list of allowed actions: the playbook's action, "contact the user" and "close with no action".
* It must reply with JSON. Anything else is shown to the analyst as **No answer from the
  agent** (nothing is guessed). An action that was not offered is replaced by the playbook's.
* It never sets an action's impact, so the senior sign-off rule cannot be talked around.
* Alert text is wrapped as data and the instructions tell the agent not to follow anything
  inside it (prompt injection through a crafted username or hostname).
* The gateway token is an operator credential. It lives only in `/etc/tutei/openclaw.env`
  (mode 600) on CT 204, never in the app or the browser.

## 1. On CT 201: enable the endpoint

The endpoint is off by default. In the OpenClaw config (`~/.openclaw/openclaw.json` for the
user that runs the gateway):

```json5
{
  gateway: {
    bind: "lan",                 // CT 204 must reach it; default is loopback only
    auth: { mode: "token", token: "<long random string>" },
    http: { endpoints: { chatCompletions: { enabled: true } } }
  }
}
```

Restart the gateway, then test on CT 201 itself:

```
curl -sS http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"model":"openclaw/default","messages":[{"role":"user","content":"Reply with the word ready"}]}'
```

Optional hardening: a Proxmox firewall rule on CT 201 that only lets 192.168.100.24 (CT 204)
reach port 18789.

## 2. On CT 204: point Tūtei at it

```
umask 077
cat > /etc/tutei/openclaw.env <<EOT
TUTEI_OPENCLAW_URL=http://<CT 201 address>:18789
TUTEI_OPENCLAW_TOKEN=<token>
TUTEI_OPENCLAW_AGENT=default
TUTEI_OPENCLAW_TIMEOUT_MS=60000
EOT
cd /opt/tutei && set -a && . /etc/tutei/openclaw.env && set +a && node server/openclaw-check.js
```

`openclaw-check.js` sends one sample alert and prints the verdict, or says exactly what went
wrong (unreachable, 401 token, 404 endpoint not enabled, timeout, reply not JSON).

When it prints OK, load the file in the service and restart:

```
cat > /etc/systemd/system/tutei.service.d/openclaw.conf <<EOT
[Service]
EnvironmentFile=/etc/tutei/openclaw.env
EOT
systemctl daemon-reload && systemctl restart tutei && journalctl -u tutei -n 3 --no-pager
```

The start-up line now ends `· triage by OpenClaw http://…:18789 · openclaw/default`.
`GET /api/agent` reports the same. In the app, a live verdict shows
"Live answer from the OpenClaw agent in N s".

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `TUTEI_OPENCLAW_URL` | (unset = scripted triage) | Gateway base URL |
| `TUTEI_OPENCLAW_TOKEN` | | `gateway.auth.token` |
| `TUTEI_OPENCLAW_AGENT` | `default` | Agent id, sent as model `openclaw/<id>` |
| `TUTEI_OPENCLAW_TIMEOUT_MS` | `60000` | After this the analyst sees "No answer from the agent" |
| `TUTEI_SCRIPTED_FAILURE` | on | `off` stops ALR-1038 failing twice (it exists for usability task T4) |

The phone waits up to 200 s for a triage, so the server's timeout always reports first.

## Confidence

The agent's own confidence is the base. Tūtei's bounded history adjustment (at most ±0.12,
see API.md) is still applied on top, so the same rule explains every score. The agent also sees
the past resolutions, so history counts twice; the cap keeps that small, and it is a known
limitation to discuss in the report.
