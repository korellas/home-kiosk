"""Make a local HA app installation bundle from the validated frontend."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
if not (root / "dist/app/index.html").is_file():
    raise SystemExit("Run npm run build:app first.")
config = json.loads((root / "config.json").read_text())
# Local apps build the included source instead of pulling an unpublished image.
config.pop("image")
destination = root / "dist/home-kiosk-app.zip"
with ZipFile(destination, "w", ZIP_DEFLATED) as package:
    package.writestr("home-kiosk/config.json", json.dumps(config, ensure_ascii=False, indent=2))
    for name in ["Dockerfile", "LICENSE", "README.md", "rootfs", "patches", "server", "dist/app"]:
        path = root / name
        for source in ([path] if path.is_file() else sorted(path.rglob("*"))):
            if source.is_file() and not source.name.endswith(".test.mjs"):
                package.write(source, "home-kiosk/" + str(source.relative_to(root)))
print(f"Local HA app installation bundle: {destination}")
print("Package created only; no device installation or registry publication performed.")
