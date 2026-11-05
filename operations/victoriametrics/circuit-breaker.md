# Emergency cache-only analysis

The application checks available bytes and inodes on `/` and
`BUILD_TMP_DIR` (default `/tmp/tmp-build`) at most every five seconds. It
also samples on a five-second timer so recovery does not require traffic.
This is a last-resort disk guard, separate from ordinary client rate limits.

It opens below 5 GiB available on either filesystem or below 10% free inodes.
An unreadable filesystem also opens it rather than admitting unknown disk demand.
It closes after scratch has at least 10 GiB, root at least 8 GiB, and both have
at least 20% free inodes for a sampled 60-second recovery period. These initial
thresholds target the current 25 GiB scratch filesystem; larger deployments
should review them. Local development needs an existing BUILD_TMP_DIR.

Cache hits continue through the ordinary cache path. During emergency mode,
`force=true` still tries cached results. For unversioned/latest package-size
requests, a previously built release can be returned without registry resolution;
its actual version is in the response and the response is not stored by HTTP
caches. Explicit versions never substitute a different version. Cold misses and
uncached exports return 503, Retry-After: 60, without invoking a build.

The guard covers the application's analysis routes (including internal page/MCP
calls to those routes). It does not abort running work, reserve disk per package,
clean files, or guard direct installation-service callers. Already admitted
work may continue; existing installation concurrency and cancellation still apply.

## VictoriaMetrics dashboard

Builds & installs -> Emergency recovery shows:

- `bundlephobia_build_circuit_breaker_active`: current state, 1 = paused.
- `bundlephobia_build_circuit_breaker_activations_total{reason}`: transitions to
  emergency mode, not the number of requests. Reasons are disk_pressure and
  disk_check_failed. Counts reset on application restart, so use increase().
- `bundlephobia_build_circuit_breaker_responses_total{result}`: cache_served,
  rejected, or other origin analysis responses while active. Probes are excluded.
  cache_served requires an actual successful cache hit. It includes hits that
  would also have happened normally; it is not an estimate of incremental hits
  or saved builds. CDN responses that never reach the origin are not counted.

The existing application-metrics scrape collects these metrics. No extra exporter
or high-cardinality package/IP labels are added. Counters count requests reaching
the analysis routes, not unique visitors or package installations.

The activation counter is per application process. The current host has one main
application process; multiple processes may independently observe one pressure
incident. This does not change the shared filesystem admission decision.

## Existing bot limits: source and deployed configuration reviewed Nov 5, 2026

`operations/haproxy/conf.d/30-traffic-policy.cfg` and its deployed counterpart
have both pool and aggregate limits:

- sc2: approximately 26 analysis requests/minute per automation budget. Several
  named families share each category (search, ai, aggressive, developer_tools,
  seo); others use their individual family key.
- sc3: approximately 100 admitted analysis requests/minute across ALL populated
  automation_group values, using the constant integer key 1 in named_bot_usage.
  Mapped families and derived crawler tokens both participate; separate pool
  keys do not multiply this aggregate allowance. Rate windows are estimates.
- The aggregate count is charged after earlier pool/cooldown denials. Rejected
  retries do not continually charge that shared accepted-request allowance.
- automated_client is broader than automation_group: bare curl, got,
  HeadlessChrome and prerender user agents can match automated_client without
  receiving automation_group. They have sc2/IP-derived limits but do NOT enter
  the sc3 aggregate. The mapping file does not map these generic agents.
- Ordinary browser UAs use the non-bot 120/5m/IP allowance. Distributed IPs can
  therefore collectively admit much more work than a single IP. User-agent
  classification does not establish that traffic is human or malicious.
- The application also limits cold requests to 10/5m/IP. HAProxy's build-duration
  budget charges completed work (60 seconds/IP/5m), rather than reserving capacity
  for queued/in-flight work. A request ceiling is not a global CPU/disk budget.

The bot aggregate exists and is shared; it is not proof that total capacity was
protected. This review identifies a classification coverage gap and missing
resource admission, not proof that generic automated clients caused the outage.
Changing bot policy is intentionally a separate change from this circuit PR.

## Deployment

Deploy only the merged commit using AGENTS.md. Confirm the scratch path exists,
metrics scrape succeeds, and dashboard queries return data. Keep the production
emergency HAProxy gate until disk admission and cache responses have been
verified. Removing that temporary gate is a separate, explicit operational step;
this PR does not install or alter HAProxy policy.
