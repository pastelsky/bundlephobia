# Firebase usage metrics

The application emits aggregated Firebase Realtime Database usage summaries
through the `bp:firebase-metrics` debug namespace once per minute. Production
already enables `DEBUG=bp:*`, so the summaries are written to the PM2 service
logs without logging package names or Firebase credentials.

Each summary contains the number of completed SDK calls and the approximate
UTF-8 JSON payload bytes by direction and logical top-level path. The byte
count represents the serialized data payload, not Firebase protocol, TLS, or
HTTP overhead, so it should be treated as a lower-bound estimate of network
traffic.

Example:

```text
bp:firebase-metrics Firebase usage summary: {
  'read:modules-v3': { calls: 120, payloadBytes: 456789 },
  'write:searches-v2': { calls: 80, payloadBytes: 12345 }
}
```

The cache service and the main application each emit their own summary. Add
the values from all PM2 processes when comparing with Firebase or Cloudflare
quotas. A Firebase history read can issue a second read to the legacy path
when fallback is enabled; those calls are recorded separately.
