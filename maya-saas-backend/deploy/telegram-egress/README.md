# Telegram OAuth egress

`maya-telegram-egress.service` provides a loopback-only SOCKS tunnel for
Telegram OAuth when the application host cannot reach `oauth.telegram.org`
directly.

Security boundaries:

- the listener binds only to `127.0.0.1:1081`;
- the dedicated SSH key must be restricted on the egress host with
  `restrict,port-forwarding,permitopen="oauth.telegram.org:443"`;
- the key has no shell or unrelated forwarding purpose;
- application secrets and OAuth codes remain inside encrypted TLS requests to
  Telegram;
- no generic public proxy is used.

Server configuration:

```dotenv
TELEGRAM_OAUTH_PROXY_URL=socks5h://127.0.0.1:1081
```

Install the unit as `/etc/systemd/system/maya-telegram-egress.service`, enable
it, and verify both the service and the restricted route before restarting the
backend:

```bash
systemctl is-active maya-telegram-egress.service
curl --socks5-hostname 127.0.0.1:1081 \
  https://oauth.telegram.org/.well-known/jwks.json
```

The tunnel is an infrastructure workaround, not a tenant-facing dependency.
Move it to neutral MAYA infrastructure when the final platform host is ready.
