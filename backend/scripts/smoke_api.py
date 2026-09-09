import json
import urllib.error
import urllib.request

base = "http://127.0.0.1:8000"


def get(path: str):
    with urllib.request.urlopen(base + path) as r:
        return json.loads(r.read())


health = get("/api/health")
dash = get("/api/dashboard")
comps = get("/api/components")
analytics = get("/api/analytics")
burn = get("/api/burn-in")
settings = get("/api/settings")
alerts = get("/api/alerts")

print("health", health)
print("dashboard totals", dash.get("totals"), "alerts", len(dash.get("alerts", [])))
print("components", len(comps["items"]), comps["items"][0]["component_id"], comps["items"][0]["status"])
print("kpis", analytics.get("kpis"))
print("burn-in", len(burn["items"]))
print("metrics", (settings.get("latest_model_run") or {}).get("metrics"))
print("alerts", len(alerts["items"]))

anom = get("/api/components?status=ANOMALY")["items"] or get("/api/components?status=WARNING")["items"]
cid = anom[0]["component_id"]
detail = get("/api/components/" + cid)
print("detail", cid, "status", detail["summary"]["status"])
print("layers", detail.get("layers"))
print("explanations", (detail.get("layers") or {}).get("explanations"))
print("pred", detail.get("prediction"))

req = urllib.request.Request(base + "/api/reports/" + cid, method="POST")
with urllib.request.urlopen(req) as r:
    report = json.loads(r.read())
print("report id", report["id"], "rec", report["payload"]["recommendation"][:60])

boundary = "----xyz"
payload = (
    f"--{boundary}\r\n"
    'Content-Disposition: form-data; name="file"; filename="bad.csv"\r\n'
    "Content-Type: text/csv\r\n\r\n"
    "foo,bar\n1,2\n"
    f"\r\n--{boundary}--\r\n"
).encode()
preq = urllib.request.Request(
    base + "/api/upload/preview",
    data=payload,
    method="POST",
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
)
with urllib.request.urlopen(preq) as r:
    preview = json.loads(r.read())
print("preview errors", preview["errors"])
