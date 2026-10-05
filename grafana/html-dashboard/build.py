import json
from pathlib import Path

source = Path(__file__).parent
dashboards = source.parent / "dashboards"
variables = json.loads((dashboards / "servicemap.json").read_text())["templating"]
edges_query = "sum by (client, server, uri, caller_uri) (round(increase(traces_service_graph_request_total[$__range])))"

dashboard = {
    "uid": "servicemap-html",
    "title": "Service map (HTML)",
    "schemaVersion": 39,
    "version": 1,
    "time": {"from": "now-15m", "to": "now"},
    "refresh": "30s",
    "templating": variables,
    "panels": [
        {
            "id": 1,
            "type": "marcusolsson-dynamictext-panel",
            "title": "",
            "transparent": True,
            "gridPos": {"x": 0, "y": 0, "w": 24, "h": 24},
            "datasource": {"type": "prometheus", "uid": "prometheus"},
            "targets": [{"refId": "A", "expr": edges_query, "instant": True, "range": False}],
            "transformations": [
                {"id": "labelsToFields", "options": {"mode": "columns"}},
                {"id": "merge", "options": {}},
            ],
            "options": {
                "renderMode": "data",
                "wrap": False,
                "content": (source / "content.hbs").read_text(),
                "defaultContent": "The query didn't return any results.",
                "helpers": (source / "helpers.js").read_text(),
                "afterRender": (source / "afterRender.js").read_text(),
                "styles": (source / "styles.css").read_text(),
                "editor": {"language": "html", "format": "auto"},
                "editors": [],
                "externalStyles": [],
                "contentPartials": [],
            },
        }
    ],
}
(dashboards / "servicemap-html.json").write_text(json.dumps(dashboard, indent=2))
