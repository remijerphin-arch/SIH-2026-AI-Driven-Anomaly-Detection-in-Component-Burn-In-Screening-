import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"


def get(path: str):
    with urllib.request.urlopen(BASE + path) as resp:
        return json.loads(resp.read())


def post(path: str, payload: dict | None = None):
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main() -> None:
    boundary = "----Bound"
    csv = "foo,bar\n1,2\n"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="bad.csv"\r\n'
        "Content-Type: text/csv\r\n\r\n"
        f"{csv}\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        BASE + "/api/upload/preview",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        prev = json.loads(resp.read())
    print("preview errors", prev["errors"])

    d = get("/api/components/IC-00001")
    print(
        "detail",
        d["summary"]["status"],
        "n_expl",
        len(d["layers"]["explanations"]),
        "pred",
        d["prediction"]["predicted_168h"],
    )
    rejected = get("/api/components?status=REJECTED")["items"][0]["component_id"]
    d = get(f"/api/components/{rejected}")
    print("rejected", rejected)
    for line in d["layers"]["explanations"][:3]:
        print(" -", line)
    print("rec", d["recommendation"])
    report = post(f"/api/reports/{rejected}")
    print("report", report["id"], report["payload"]["title"])
    try:
        get("/api/components/NOPE")
    except urllib.error.HTTPError as e:
        print("404", e.code, json.loads(e.read())["detail"])


if __name__ == "__main__":
    main()
