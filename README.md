# Service map by URL

A local demo that shows, for a chosen service and URL, who calls it and what it calls, including transitive calls. Sixteen Spring Boot 4.1 / Kotlin services (Java 27) send traces, logs and metrics via OTLP to a Grafana LGTM stack (`grafana/otel-lgtm`), and the dashboards draw the service map from those signals.

- `service-a` to `service-d`: the small diamond demo
- twelve bank-like services (`api-gateway`, `ledger-service`, ...): see [Bank-like service mesh](#bank-like-service-mesh)

```
service-a --/relay--> service-b --/greet--> service-c
service-a --/config-> service-d --/hello--> service-c
service-a --/status-> service-d --/hello--> service-c
```

`service-a` calls only `service-b` and `service-d` (every 5 s); it never calls `service-c` directly.

## Run it and see the UI

Requirements: Docker with Compose, about 10 GB free RAM for the Docker VM (sixteen JVMs plus Grafana) and internet access for the first build (Maven dependencies and base images). Nothing else needs installing; the services are built inside Docker.

```bash
docker compose up --build -d
```

1. Wait about 2 minutes: the first build takes a while, the services start, and the load generator waits 20-25 s before sending traffic. Check with `docker compose ps` (everything should be `Up`).
2. Open Grafana at http://localhost:3000. Anonymous access is enabled with the admin role, so there is no login.
3. Open one of the dashboards (Dashboards menu, or the direct links):
   - [Service map (HTML)](http://localhost:3000/d/servicemap-html/service-map-html): the main UI, drawn as SVG with labels on every edge.
   - [Service map by URL](http://localhost:3000/d/servicemap-endpoint/service-map-by-url): the same map in Grafana's Node Graph panel (edge text only on hover).
4. Pick the type (**Called service** or **Caller service**), a service and a URL. Good starting points:
   - Called service, `ledger-service`: everything that ends up calling the ledger.
   - Caller service, `api-gateway`: the complete call tree behind the gateway.
   - Called service, `service-c`: the small diamond.
5. If a dropdown looks empty or the graph says "No calls found", wait another minute for traffic and pick a longer time range (top right).

Other UIs: Explore in Grafana has Tempo (traces), Loki (logs, label `service_name`) and Prometheus (metrics). Ports: Grafana 3000, OTLP 4317/4318, `service-a`..`d` on 8081-8084.

Stop everything with `docker compose down`; start it again with `docker compose up -d`. All data lives inside the Grafana container and is lost when it is recreated.

## Load generator

There is no separate tool: some services call their downstreams on a schedule, which produces the traffic the map is built from.

| Source | What it does | Where to change it |
|---|---|---|
| `api-gateway` | every 3 s three `/api/transfers` calls, every 2 s four `/api/dashboard` calls, every 5 s one `/oauth/token` call, each fanning out through the mesh | `entrypoints` in `mesh/api-gateway.yaml` (`every-millis`, `times`) |
| `service-a` | every 5 s calls `service-b /relay`, `service-d /config` four times and `service-d /status` once | `EntryPointCaller` in `service-a/src/main/kotlin/demo/ServiceAApplication.kt` |

Useful commands:

```bash
docker compose up -d api-gateway            # apply a changed mesh/api-gateway.yaml
docker compose stop api-gateway service-a   # pause the load; the map empties after the selected time range
docker compose start api-gateway service-a  # resume it
curl localhost:8081/trigger                 # one extra round of service-a calls
```

The thickness of an edge in the dashboards follows the call counts, so changing `times` or `every-millis` changes how thick the edges look.

## Service map by URL (direct and transitive callers)

Open the dashboard [Service map by URL](http://localhost:3000/d/servicemap-endpoint/service-map-by-endpoint). Pick the type first (**Selected service is the** `Called service` or `Caller service`), then the service and URL:

- `Called service`: shows everything upstream that calls the selected service/URL.
- `Caller service`: shows everything downstream the selected service calls (e.g. `service-a` → b, d → c). URL filters by the outgoing call: the URL being called on the downstream service.

- `service-c` + `/hello` → `service-a → service-d → service-c`
- `service-c` + `/greet` → `service-a → service-b → service-c`
- Edge thickness is normalized across the visible edges (thinnest = least calls, thickest = most calls); every edge has a small label node in the middle showing caller, URL and call count (Grafana Node Graph cannot draw text directly on edges).

How it works: each outgoing call records the inbound route of its caller as span attribute `caller.uri` (`common/.../CallerUriObservationFilter.kt`). Tempo's service-graph generator turns `uri` and `caller.uri` into metric labels (`lgtm/tempo-config.yaml`), so an edge `d → c /hello` knows it was made while serving `d /config`. The dashboard follows those links upstream with PromQL.

## HTML dashboard (edge labels, animated edges)

[Service map (HTML)](http://localhost:3000/d/servicemap-html/service-map-html) is the same map drawn as SVG by the Business Text panel (`marcusolsson-dynamictext-panel` 6.3.0, Handlebars templates, Apache-2.0, maintained by Grafana Labs). It uses the same dropdowns and adds:

- summary cards (selection, services, calls, busiest edge, reach) and a hop filter (`Direct only`, `Up to N hops`)
- every edge labelled with its URL and call count, ported to its own spot on the service card so labels do not overlap
- thickness and a single-hue blue gradient scaled across the visible edges
- service cards with in/out call totals; the selected service is highlighted
- hover an edge to trace its call chain with a detail tooltip; hover or focus a service to isolate its calls (after a short delay so brushing across the map stays calm)
- click a service or an edge to select it: it stays highlighted, a "Selected" bar names it, and the table below shows only the matching edges (a service's edges, or an edge's call chain with the selected row marked); `Esc` or `Clear` releases it
- Grafana light/dark theme, reduced-motion support, and a table view underneath

- The plugin zip is committed unpacked in `grafana/plugins/` and mounted into the container, because the container cannot download plugins behind a TLS-intercepting proxy. To update it: download the new version from https://grafana.com/grafana/plugins/marcusolsson-dynamictext-panel/ and unpack it there.
- `GF_PANELS_DISABLE_SANITIZE_HTML=true` in `docker-compose.yaml` lets the panel render SVG.
- Dashboard source: `grafana/html-dashboard/` (`content.hbs`, `helpers.js`, `afterRender.js`, `styles.css`). Regenerate the JSON with `python3 grafana/html-dashboard/build.py`, then `docker compose restart lgtm`.

## Bank-like service mesh

Besides `service-a..d`, twelve services run from one image (`mesh-service`); each one only reads a YAML file from `mesh/` that lists its routes and the downstream calls each route makes (`times: 2` calls the same URL twice). Gateway entrypoints generate the traffic.

```
api-gateway ──/api/transfers──> mobile-banking-bff ──/payments──> payment-orchestrator ──> ledger-service /ledger/holds (x2)
                                      │                                  ├─> clearing-service /clearing/submit ──> fraud-detection-service /fraud/score
                                      │                                  │                                     └─> notification-service /notifications/payment-confirmation
                                      │                                  └─> settlement-service /settlements/schedule ──> ledger-service /ledger/postings
                                      │                                                                                └─> notification-service /notifications/settlement-advice
                                      ├─/customers/profile──> customer-service ──> identity-service /identity/verify
api-gateway ──/api/dashboard──> mobile-banking-bff ──> account-service /accounts/summary ──> ledger-service /ledger/balances
                                      └─> transaction-service /transactions/search ──> account-service /accounts/lookup ──> ledger-service /ledger/balances
api-gateway ──/oauth/token──> identity-service
```

Change the topology by editing `mesh/*.yaml` and `docker compose up -d`.

## Where the signals are

- Traces: Explore → Tempo
- Logs (with trace ids): Explore → Loki, label `service_name`
- Metrics: Explore → Prometheus (`http_server_requests_milliseconds_count`, JVM metrics)

## Tests

```bash
docker build --target build --build-arg SERVICE=service-a -t servicemap-build .
docker run --rm servicemap-build mvn -B test
```

Kotlin 2.4 cannot target JVM 27 yet, so bytecode targets 25 and runs on the Java 27 runtime image.
