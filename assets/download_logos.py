import urllib.request, os, pathlib, time

# Try multiple sources per logo
logos = {
    "intel.svg":        "https://cdn.worldvectorlogo.com/logos/intel.svg",
    "nyu.svg":          "https://cdn.worldvectorlogo.com/logos/new-york-university.svg",
    "northwestern.svg": "https://cdn.worldvectorlogo.com/logos/northwestern-university.svg",
    "ucsd.svg":         "https://cdn.worldvectorlogo.com/logos/uc-san-diego-1.svg",
    "horizon.svg":      "https://cdn.worldvectorlogo.com/logos/horizon-media.svg",
}

dest = pathlib.Path(__file__).parent / "logos"
dest.mkdir(exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "*/*",
}

for filename, url in logos.items():
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r, open(dest / filename, "wb") as f:
            f.write(r.read())
        size = os.path.getsize(dest / filename)
        print(f"OK  {filename}  ({size} bytes)")
    except Exception as e:
        print(f"ERR {filename}: {e}")
    time.sleep(0.5)
