"""Backend for YouR Party Rentals: serves the site and a gallery API.

Run with: python3 server.py
Env vars:
  GALLERY_ADMIN_USERNAME (default: admin)
  GALLERY_ADMIN_PASSWORD (default: yourr-admin)
  PORT (default: 3002)
"""

import base64
import json
import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOADS_DIR = ROOT / "uploads" / "gallery"
GALLERY_PATH = DATA_DIR / "gallery.json"
SETTINGS_PATH = DATA_DIR / "business-settings.json"
AVAILABILITY_PATH = DATA_DIR / "dropoff-availability.json"
CATALOG_PATH = DATA_DIR / "catalog.json"

GALLERY_ADMIN_USERNAME = os.getenv("GALLERY_ADMIN_USERNAME", "admin")
GALLERY_ADMIN_PASSWORD = os.getenv("GALLERY_ADMIN_PASSWORD", "yourr-admin")

STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/script.js": "script.js",
    "/styles.css": "styles.css",
    "/config.js": "config.js",
    "/admin-gallery.html": "admin-gallery.html",
    "/admin-gallery.js": "admin-gallery.js",
}

ALLOWED_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

MAX_IMAGE_BYTES = 8 * 1024 * 1024
DEFAULT_DROPOFF_SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"]
DEFAULT_CATALOG = {
    "items": [
        {"key": "tables", "name": "Tables", "description": "Rectangular and round event tables for dining and display.", "price": 10, "inventory": 100},
        {"key": "chairs", "name": "Chairs", "description": "Comfortable, stackable seating for indoor and outdoor events.", "price": 2, "inventory": 250},
        {"key": "canopies", "name": "Canopies", "description": "Shade coverage for backyard celebrations and open spaces.", "price": 75, "inventory": 20},
        {"key": "fans", "name": "Fans", "description": "Portable cooling fans to keep guests comfortable all day.", "price": 20, "inventory": 30},
        {"key": "iceChests", "name": "Ice Chests", "description": "Large-capacity coolers for drinks, food storage, and service.", "price": 15, "inventory": 40},
    ],
    "packages": [],
}


def ensure_data_files():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if not GALLERY_PATH.exists():
        write_json(GALLERY_PATH, [])
    if not SETTINGS_PATH.exists():
        write_json(SETTINGS_PATH, default_settings())
    if not AVAILABILITY_PATH.exists():
        write_json(AVAILABILITY_PATH, {})
    if not CATALOG_PATH.exists():
        write_json(CATALOG_PATH, DEFAULT_CATALOG)


def default_settings():
    return {
        "accountHolder": "",
        "bankName": "",
        "accountNumber": "",
        "routingNumber": "",
        "notificationEmail": "",
        "notificationPhone": "",
    }


def read_json(path, fallback):
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else fallback
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path, data):
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def read_catalog():
    ensure_data_files()
    try:
        with CATALOG_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        data = DEFAULT_CATALOG
    items = data.get("items", []) if isinstance(data, dict) else []
    packages = data.get("packages", []) if isinstance(data, dict) else []
    return {"items": items, "packages": packages[:4]}


def write_catalog(payload):
    catalog = read_catalog()
    allowed_keys = {item["key"] for item in DEFAULT_CATALOG["items"]}
    incoming_items = payload.get("items", []) if isinstance(payload, dict) else []
    items_by_key = {item.get("key"): item for item in incoming_items if isinstance(item, dict)}
    items = []
    for default_item in DEFAULT_CATALOG["items"]:
        item = {**default_item, **items_by_key.get(default_item["key"], {})}
        item["key"] = default_item["key"]
        item["price"] = max(0, round(float(item.get("price", default_item["price"])), 2))
        item["inventory"] = max(0, int(item.get("inventory", default_item["inventory"])))
        item["name"] = str(item.get("name", default_item["name"]))[:80]
        item["description"] = str(item.get("description", default_item["description"]))[:240]
        items.append(item)

    packages = []
    for package in (payload.get("packages", []) if isinstance(payload, dict) else [])[:4]:
        if not isinstance(package, dict) or not str(package.get("name", "")).strip():
            continue
        package_items = {
            key: max(0, int(package.get("items", {}).get(key, 0)))
            for key in allowed_keys
        }
        packages.append({
            "id": str(package.get("id") or uuid.uuid4().hex),
            "name": str(package.get("name", "")).strip()[:80],
            "description": str(package.get("description", "")).strip()[:240],
            "price": max(0, round(float(package.get("price", 0)), 2)),
            "items": package_items,
        })
    result = {"items": items, "packages": packages}
    write_json(CATALOG_PATH, result)
    return result


def read_gallery():
    ensure_data_files()
    return read_json(GALLERY_PATH, [])


def write_gallery(images):
    write_json(GALLERY_PATH, images)


def read_settings():
    ensure_data_files()
    try:
        with SETTINGS_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    defaults = default_settings()
    return {key: str(data.get(key, defaults[key]))[:200] for key in defaults}


def write_settings(payload):
    settings = default_settings()
    for key in settings:
        settings[key] = str(payload.get(key, "")).strip()[:200]
    write_json(SETTINGS_PATH, settings)
    return settings


def read_availability():
    try:
        with AVAILABILITY_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    return data if isinstance(data, dict) else {}


def normalize_slots(slots):
    valid_slots = []
    for slot in slots if isinstance(slots, list) else []:
        value = str(slot).strip()
        try:
            hour, minute = value.split(":")
            if 0 <= int(hour) <= 23 and int(minute) in (0, 30):
                normalized = f"{int(hour):02d}:{int(minute):02d}"
                if normalized not in valid_slots:
                    valid_slots.append(normalized)
        except (ValueError, TypeError):
            continue
    return sorted(valid_slots)


def get_slots_for_date(date_value):
    overrides = read_availability()
    if date_value in overrides:
        return normalize_slots(overrides[date_value])
    return DEFAULT_DROPOFF_SLOTS


def write_date_availability(date_value, slots):
    overrides = read_availability()
    normalized = normalize_slots(slots)
    if normalized:
        overrides[date_value] = normalized
    else:
        overrides.pop(date_value, None)
    write_json(AVAILABILITY_PATH, overrides)
    return normalized


def is_authorized(auth_header):
    if not auth_header or not auth_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
        username, _, password = decoded.partition(":")
    except Exception:
        return False
    return username == GALLERY_ADMIN_USERNAME and password == GALLERY_ADMIN_PASSWORD


class GalleryRequestHandler(BaseHTTPRequestHandler):
    server_version = "YouRPartyRentals/1.0"

    def log_message(self, format, *args):  # noqa: A002 - matches base signature
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_unauthorized(self):
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Gallery Admin"')
        self.send_header("Content-Type", "application/json")
        body = json.dumps({"error": "Authorization required."}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, file_path):
        if not file_path.exists() or not file_path.is_file():
            self.send_json(404, {"error": "Not found."})
            return
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/gallery":
            self.send_json(200, read_gallery())
            return

        if path == "/api/catalog":
            self.send_json(200, read_catalog())
            return

        if path == "/api/dropoff-slots":
            date_value = parse_qs(parsed.query).get("date", [""])[0]
            self.send_json(200, get_slots_for_date(date_value))
            return

        if path == "/api/admin/ping":
            if not is_authorized(self.headers.get("Authorization")):
                self.send_unauthorized()
                return
            self.send_json(200, {"ok": True})
            return

        if path == "/api/admin/settings":
            if not is_authorized(self.headers.get("Authorization")):
                self.send_unauthorized()
                return
            self.send_json(200, read_settings())
            return

        if path == "/api/admin/availability":
            if not is_authorized(self.headers.get("Authorization")):
                self.send_unauthorized()
                return
            self.send_json(200, read_availability())
            return

        if path == "/api/admin/catalog":
            if not is_authorized(self.headers.get("Authorization")):
                self.send_unauthorized()
                return
            self.send_json(200, read_catalog())
            return

        if path in STATIC_FILES:
            self.send_file(ROOT / STATIC_FILES[path])
            return

        if path.startswith("/assets/"):
            candidate = (ROOT / path.lstrip("/")).resolve()
            if ROOT / "assets" in candidate.parents or candidate == ROOT / "assets":
                self.send_file(candidate)
                return
            self.send_json(404, {"error": "Not found."})
            return

        if path.startswith("/uploads/gallery/"):
            filename = os.path.basename(path)
            self.send_file(UPLOADS_DIR / filename)
            return

        self.send_json(404, {"error": "Not found."})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/gallery":
            self.send_json(404, {"error": "Not found."})
            return

        if not is_authorized(self.headers.get("Authorization")):
            self.send_unauthorized()
            return

        try:
            payload = self.read_json_body()
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Invalid request body."})
            return

        image_data_url = str(payload.get("image", ""))
        caption = str(payload.get("caption", "")).strip()

        match = re.match(r"^data:(image/[\w.+-]+);base64,(.+)$", image_data_url, re.DOTALL)
        if not match:
            self.send_json(400, {"error": "A valid image data URL is required."})
            return

        mime_type, encoded = match.group(1), match.group(2)
        ext = ALLOWED_MIME_TO_EXT.get(mime_type)
        if not ext:
            self.send_json(400, {"error": "Unsupported image type."})
            return

        try:
            image_bytes = base64.b64decode(encoded)
        except Exception:
            self.send_json(400, {"error": "Could not decode image."})
            return

        if len(image_bytes) > MAX_IMAGE_BYTES:
            self.send_json(400, {"error": "Image is too large (max 8MB)."})
            return

        ensure_data_files()
        filename = f"{uuid.uuid4().hex}{ext}"
        (UPLOADS_DIR / filename).write_bytes(image_bytes)

        entry = {
            "id": uuid.uuid4().hex,
            "url": f"/uploads/gallery/{filename}",
            "caption": caption,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        images = read_gallery()
        images.append(entry)
        write_gallery(images)

        self.send_json(201, entry)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/admin/settings", "/api/admin/availability", "/api/admin/catalog"):
            self.send_json(404, {"error": "Not found."})
            return

        if not is_authorized(self.headers.get("Authorization")):
            self.send_unauthorized()
            return

        try:
            payload = self.read_json_body()
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Invalid request body."})
            return

        if not isinstance(payload, dict):
            self.send_json(400, {"error": "Settings must be an object."})
            return

        if parsed.path == "/api/admin/availability":
            date_value = str(payload.get("date", "")).strip()
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_value):
                self.send_json(400, {"error": "A date in YYYY-MM-DD format is required."})
                return
            self.send_json(200, {"date": date_value, "slots": write_date_availability(date_value, payload.get("slots", []))})
            return

        if parsed.path == "/api/admin/catalog":
            self.send_json(200, write_catalog(payload))
            return

        self.send_json(200, write_settings(payload))

    def do_DELETE(self):
        parsed = urlparse(self.path)
        match = re.match(r"^/api/gallery/([\w-]+)$", parsed.path)
        if not match:
            self.send_json(404, {"error": "Not found."})
            return

        if not is_authorized(self.headers.get("Authorization")):
            self.send_unauthorized()
            return

        image_id = match.group(1)
        images = read_gallery()
        target = next((image for image in images if image.get("id") == image_id), None)
        if not target:
            self.send_json(404, {"error": "Image not found."})
            return

        write_gallery([image for image in images if image.get("id") != image_id])

        filename = os.path.basename(target.get("url", ""))
        file_path = UPLOADS_DIR / filename
        if file_path.exists():
            file_path.unlink()

        self.send_json(200, {"success": True})


def main():
    ensure_data_files()
    port = int(os.getenv("PORT", "3002"))
    server = ThreadingHTTPServer(("0.0.0.0", port), GalleryRequestHandler)
    print(f"YouR Party Rentals server running at http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
