# Knowledge base and Gitea wiki

Every closed alert becomes a **resolution record**. When a similar alert arrives, the
triage step retrieves records with the same pattern and uses them in two ways:

1. **Shown to the analyst** under *Past resolutions*.
   - Same customer: the full record (users, hosts, notes, who signed off).
   - Other customers: the pattern only (outcome, generic action, redacted lesson),
     labelled "Seen at another customer". No customer, user, host or address crosses over.
2. **Confidence adjustment.** History that agrees with the AI's verdict raises its
   confidence, and contradicting history lowers it, by at most 0.12. Same-customer
   records count double. This is retrieval-based learning: nothing is retrained per alert.

Escalated alerts are not recorded until a colleague resolves them.

## Wiki pages written per resolution

| Page | Audience | Content |
|---|---|---|
| `INC-2400 AWA VPN brute force then success` | That customer only | Full record |
| `Customer AWA` | That customer only | Index of the customer's records |
| `Playbook VPN brute force then success` | All customers | Anonymised counts, lessons and fixes |

Playbooks are built only from structured fields plus the analyst's optional
"Lesson for other customers", which is redacted automatically (the alert's own user,
host and IP, customer names, emails, IPv4 addresses and host-style names). A senior
sees the proposed lesson before signing off.

## Turning on the Gitea wiki (CT 202, behind nginx mTLS)

Gitea listens on 127.0.0.1 only; nginx on 192.168.100.22:3000 terminates TLS, requires a client
certificate from the EduStack root, and admits only the CNs in its `$gitea_allowed` map.
Tūtei gets its **own** identity, `tutei.edustack.internal`, so it can be revoked without touching
OpenClaw's gateway certificate.

1. In Gitea, create a repository such as `tutei-kb` (wiki enabled), and a token
   (Settings → Applications) with **repository: read and write**.
2. Issue Tūtei's client certificate on the CA (CT 203), then copy it with the root CA to CT 204:

```bash
pct enter 203
step ca certificate tutei.edustack.internal /root/tutei.crt /root/tutei.key --not-after 2160h
exit
pct pull 203 /root/tutei.crt /root/tutei.crt && pct pull 203 /root/tutei.key /root/tutei.key
pct pull 202 /etc/edustack-pki/root_ca.crt /root/edustack_root_ca.crt
pct exec 204 -- mkdir -p /etc/tutei/pki
pct push 204 /root/tutei.crt /etc/tutei/pki/tutei.crt
pct push 204 /root/tutei.key /etc/tutei/pki/tutei.key
pct push 204 /root/edustack_root_ca.crt /etc/tutei/pki/root_ca.crt
pct exec 204 -- bash -c 'chown root:tutei /etc/tutei/pki/* && chmod 640 /etc/tutei/pki/tutei.key && chmod 644 /etc/tutei/pki/*.crt'
rm /root/tutei.key
pct exec 203 -- rm /root/tutei.key
```

3. Allow the new CN in nginx (CT 202):

```bash
pct exec 202 -- sed -i 's/"CN=admin-mac.edustack.internal" 1;/"CN=admin-mac.edustack.internal" 1; "CN=tutei.edustack.internal" 1;/' /etc/nginx/conf.d/edustack-mtls-server.conf
pct exec 202 -- nginx -t && pct exec 202 -- systemctl reload nginx
```

4. Configure Tūtei (CT 204):

```bash
pct exec 204 -- bash -c 'grep -q gitea.edustack.internal /etc/hosts || echo "192.168.100.22 gitea.edustack.internal" >> /etc/hosts'
pct exec 204 -- bash -c 'umask 077 && cat > /etc/tutei/gitea.env <<EOT
TUTEI_GITEA_URL=https://gitea.edustack.internal:3000
TUTEI_GITEA_REPO=<your-gitea-user>/tutei-kb
TUTEI_GITEA_TOKEN=<paste the token>
TUTEI_GITEA_CA=/etc/tutei/pki/root_ca.crt
TUTEI_GITEA_CERT=/etc/tutei/pki/tutei.crt
TUTEI_GITEA_KEY=/etc/tutei/pki/tutei.key
EOT'
pct exec 204 -- bash -c 'cat > /etc/systemd/system/tutei.service.d/kb.conf <<EOT
[Service]
EnvironmentFile=/etc/tutei/gitea.env
StateDirectory=tutei
Environment=TUTEI_DATA_DIR=/var/lib/tutei
EOT
systemctl daemon-reload && systemctl restart tutei && journalctl -u tutei -n 3 --no-pager'
```

The log should say `writing to Gitea wiki ...`. Open Tūtei's Wiki tab and press **Copy 10 records to the wiki**.
If a record shows "Wiki write failed", its message says which layer refused it: TLS (root CA),
400 (no client certificate), 403 from nginx (CN not in the map), 401 (token) or 404 (repository).

Certificate lifetime: step-ca may cap `--not-after` (default maximum 24h). If it refuses 2160h, either raise
`maxTLSCertDuration` on the provisioner or renew automatically with `step ca renew --daemon`, then restart tutei.

Without these settings, records are still kept and used for learning. They just aren't written to Gitea.
