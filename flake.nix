{
  description = "Service map demo: one command to build and run everything";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          up = pkgs.writeShellApplication {
            name = "servicemap-up";
            runtimeInputs = [ pkgs.jdk25 pkgs.curl pkgs.jq ];
            text = ''
              grafana=http://localhost:3000
              failures=0

              if [ ! -f docker-compose.yaml ] || [ ! -x gradlew ]; then
                echo "Run this from the root of the repository: nix run ." >&2
                exit 1
              fi
              if ! command -v docker >/dev/null; then
                echo "Docker is required but was not found on PATH." >&2
                exit 1
              fi

              check() {
                description=$1
                timeout_seconds=$2
                shift 2
                waited=0
                until "$@" >/dev/null 2>&1; do
                  if [ "$waited" -ge "$timeout_seconds" ]; then
                    echo "  FAIL  $description (gave up after $timeout_seconds s)"
                    failures=$((failures + 1))
                    return
                  fi
                  sleep 5
                  waited=$((waited + 5))
                done
                echo "  ok    $description"
              }

              grafana_query() {
                curl -sf -u admin:admin -G "$grafana/api/datasources/proxy/uid/$1" "''${@:2}"
              }

              dashboards_provisioned() {
                [ "$(curl -sf "$grafana/api/search?query=Service%20map" | jq length)" -ge 2 ]
              }

              panel_plugin_loaded() {
                curl -sf "$grafana/api/plugins/marcusolsson-dynamictext-panel/settings" | jq -e '.id' >/dev/null
              }

              gateway_traces_exist() {
                [ "$(grafana_query tempo/api/search --data-urlencode 'q={resource.service.name="api-gateway"}' --data-urlencode limit=5 | jq '.traces | length')" -ge 1 ]
              }

              deep_traces_exist() {
                [ "$(grafana_query tempo/api/search --data-urlencode 'q={resource.service.name="fraud-detection-service"}' --data-urlencode limit=5 | jq '.traces | length')" -ge 1 ]
              }

              service_graph_has_load() {
                [ "$(grafana_query prometheus/api/v1/query --data-urlencode 'query=count(traces_service_graph_request_total{client="api-gateway"})' | jq '.data.result | length')" -ge 1 ]
              }

              logs_arrive() {
                grafana_query loki/loki/api/v1/label/service_name/values | jq -e '.data | index("api-gateway")' >/dev/null
              }

              export JAVA_HOME=${pkgs.jdk25.home}
              ./gradlew bootBuildImage
              docker compose up -d --remove-orphans

              echo
              echo "Checking the stack (the load generator starts after about 30 s):"
              check "Grafana is healthy" 120 curl -sf "$grafana/api/health"
              check "dashboards are provisioned" 60 dashboards_provisioned
              check "Business Text panel plugin is loaded" 60 panel_plugin_loaded
              check "load generator: traces from api-gateway in Tempo" 240 gateway_traces_exist
              check "load generator: traces reach the deepest service (fraud-detection-service)" 240 deep_traces_exist
              check "service graph metrics for api-gateway in Prometheus" 240 service_graph_has_load
              check "logs from api-gateway in Loki" 120 logs_arrive

              echo
              if [ "$failures" -gt 0 ]; then
                echo "$failures check(s) failed. See: docker compose ps / docker compose logs <service>" >&2
                exit 1
              fi
              echo "Everything is up and producing telemetry."
              echo "Grafana:      $grafana   (no login)"
              echo "Service map:  $grafana/d/servicemap-html/service-map-html"
              echo "Stop and wipe everything with: nix run .#down"
            '';
          };
          down = pkgs.writeShellApplication {
            name = "servicemap-down";
            text = ''
              docker compose down -v
            '';
          };
          default = self.packages.${system}.up;
        });

      apps = forAllSystems (system: {
        up = { type = "app"; program = "${self.packages.${system}.up}/bin/servicemap-up"; };
        down = { type = "app"; program = "${self.packages.${system}.down}/bin/servicemap-down"; };
        default = self.apps.${system}.up;
      });

      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.jdk25 pkgs.gradle_9 ];
          };
        });
    };
}
