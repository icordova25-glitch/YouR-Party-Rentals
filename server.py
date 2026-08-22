"""Backend for YouR Party Rentals: serves the site and a gallery API.

Run with: python3 server.py
Env vars:
  GALLERY_ADMIN_USERNAME (default: admin)
  GALLERY_ADMIN_PASSWORD (default: yourr-admin)
  PORT (default: 3002)
  CORS_ALLOWED_ORIGIN (default: *; set to your frontend's exact origin in production)

Optional booking notification env vars (leave unset to skip real sending):
  SMTP_HOST, SMTP_PORT (default 587), SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
"""

import base64
import json
import mimetypes
import os
import re
import smtplib
import ssl
import urllib.error
import urllib.request
import uuid
from email.message import EmailMessage
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(ROOT / "data")))
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", str(DATA_DIR / "uploads" / "gallery")))
GALLERY_PATH = DATA_DIR / "gallery.json"
GALLERY_SEEDED_PATH = DATA_DIR / ".gallery-seeded"
SETTINGS_PATH = DATA_DIR / "business-settings.json"
AVAILABILITY_PATH = DATA_DIR / "dropoff-availability.json"
CATALOG_PATH = DATA_DIR / "catalog.json"
AUTH_PATH = DATA_DIR / "admin-auth.json"
BOOKINGS_PATH = DATA_DIR / "bookings.json"

GALLERY_ADMIN_USERNAME = os.getenv("GALLERY_ADMIN_USERNAME", "admin")
GALLERY_ADMIN_PASSWORD = os.getenv("GALLERY_ADMIN_PASSWORD", "yourr-admin")
CORS_ALLOWED_ORIGIN = os.getenv("CORS_ALLOWED_ORIGIN", "*")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_SUCCESS_URL = os.getenv("STRIPE_SUCCESS_URL", "https://your-party-rentals.com/?payment=success")
STRIPE_CANCEL_URL = os.getenv("STRIPE_CANCEL_URL", "https://your-party-rentals.com/?payment=cancelled")

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
MAX_GALLERY_IMAGES = 10
DEFAULT_DROPOFF_SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"]
DEFAULT_GALLERY = [
    {
        "id": "default-elegant-table",
        "url": "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80",
        "caption": "Elegant table layout",
    },
    {
        "id": "default-guest-seating",
        "url": "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80",
        "caption": "Guest seating ready",
    },
    {
        "id": "default-canopy",
        "url": "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80",
        "caption": "Canopy coverage",
    },
    {
        "id": "default-ice-chest",
        "url": "https://images.unsplash.com/photo-1523875194681-bedd468c58bf?auto=format&fit=crop&w=1200&q=80",
        "caption": "Ice chest beverage station",
    },
]
DEFAULT_CATALOG = {
    "items": [
        {"key": "tables", "name": "Tables", "description": "Rectangular and round event tables for dining and display.", "price": 10, "inventory": 100},
        {"key": "chairs", "name": "Chairs", "description": "Comfortable, stackable seating for indoor and outdoor events.", "price": 2, "inventory": 250},
        {"key": "canopies", "name": "Canopies", "description": "Shade coverage for backyard celebrations and open spaces.", "price": 75, "inventory": 20},
        {"key": "fans", "name": "Fans", "description": "Portable cooling fans to keep guests comfortable all day.", "price": 20, "inventory": 30},
        {"key": "iceChests", "name": "Ice Chests", "description": "Large-capacity coolers for drinks, food storage, and service.", "price": 15, "inventory": 40},
    ],
    "packages": [
        {
            "id": "summer-special",
            "name": "Summer Special",
            "description": "4 Tables, 24 Chairs, one 10x20 Canopy, plus your choice of one add-on: Ice Chest, Fan, or Speaker. Note your add-on choice in the booking notes (Speaker is not stocked in inventory and will be confirmed by our team).",
            "price": 169,
            "items": {"tables": 4, "chairs": 24, "canopies": 1, "fans": 0, "iceChests": 1},
        }
    ],
}


def ensure_data_files():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if not GALLERY_PATH.exists():
        write_json(GALLERY_PATH, [])
    if not GALLERY_SEEDED_PATH.exists() and read_json(GALLERY_PATH, []) == []:
        write_json(GALLERY_PATH, DEFAULT_GALLERY)
        GALLERY_SEEDED_PATH.touch()
    if not SETTINGS_PATH.exists():
        write_json(SETTINGS_PATH, default_settings())
    if not AVAILABILITY_PATH.exists():
        write_json(AVAILABILITY_PATH, {})
    if not CATALOG_PATH.exists():
        write_json(CATALOG_PATH, DEFAULT_CATALOG)
    if not AUTH_PATH.exists():
        write_json(AUTH_PATH, {
            "username": os.getenv("GALLERY_ADMIN_USERNAME", "admin"),
            "password": os.getenv("GALLERY_ADMIN_PASSWORD", "yourr-admin"),
        })
    if not BOOKINGS_PATH.exists():
        write_json(BOOKINGS_PATH, [])


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
    return read_json(GALLERY_PATH, [])[:MAX_GALLERY_IMAGES]


def write_gallery(images):
    write_json(GALLERY_PATH, images[:MAX_GALLERY_IMAGES])


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
    auth = read_admin_auth()
    return username == auth["username"] and password == auth["password"]


def read_admin_auth():
    ensure_data_files()
    try:
        with AUTH_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    return {
        "username": str(data.get("username") or GALLERY_ADMIN_USERNAME),
        "password": str(data.get("password") or GALLERY_ADMIN_PASSWORD),
    }


def write_admin_auth(username, password):
    auth = {"username": username.strip()[:80], "password": password[:200]}
    write_json(AUTH_PATH, auth)
    return auth


def read_bookings():
    ensure_data_files()
    return read_json(BOOKINGS_PATH, [])


def write_bookings(bookings):
    write_json(BOOKINGS_PATH, bookings)


def format_booking_message(payload):
    item_lines = "\n".join(
        f"- {key}: {payload.get(key, 0)}"
        for key in ("tables", "chairs", "canopies", "fans", "iceChests")
        if float(payload.get(key, 0) or 0) > 0
    )
    return (
        f"New booking request\n\n"
        f"Name: {payload.get('fullName', '')}\n"
        f"Email: {payload.get('email', '')}\n"
        f"Date: {payload.get('selectedDate', '')}\n"
        f"Time: {payload.get('selectedTime', '')}\n\n"
        f"Items:\n{item_lines or '(none)'}\n\n"
        f"Quote Total: ${float(payload.get('quoteTotal', 0) or 0):.2f}\n\n"
        f"Notes: {payload.get('notes') or '(none)'}"
    )


def send_notification_email(to_email, subject, body):
    host = os.getenv("SMTP_HOST")
    if not to_email or not host:
        return False, "SMTP not configured" if not host else "No notification email set"

    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username or "bookings@yourrpartyrentals.com")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls(context=context)
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return True, "sent"
    except Exception as error:  # noqa: BLE001 - report any delivery failure back to caller
        return False, str(error)


def send_notification_sms(to_phone, body):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_FROM_NUMBER")

    if not to_phone:
        return False, "No notification phone set"
    if not (account_sid and auth_token and from_number):
        return False, "Twilio not configured"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = f"To={to_phone}&From={from_number}&Body={body}".encode("utf-8")
    auth_header = "Basic " + base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": auth_header,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status < 300, "sent"
    except urllib.error.HTTPError as error:
        return False, error.read().decode("utf-8", "ignore")
    except Exception as error:  # noqa: BLE001 - report any delivery failure back to caller
        return False, str(error)


def create_booking(payload):
    settings = read_settings()
    message = format_booking_message(payload)

    email_sent, email_detail = send_notification_email(
        settings.get("notificationEmail", ""),
        f"New Booking: {payload.get('selectedDate', '')}",
        message,
    )
    sms_sent, sms_detail = send_notification_sms(
        settings.get("notificationPhone", ""),
        message[:300],
    )

    record = dict(payload)
    record["id"] = uuid.uuid4().hex
    record["receivedAt"] = datetime.now(timezone.utc).isoformat()
    record["notifications"] = {
        "email": {"sent": email_sent, "detail": email_detail},
        "sms": {"sent": sms_sent, "detail": sms_detail},
    }

    bookings = read_bookings()
    bookings.append(record)
    write_bookings(bookings)
    return record


def create_stripe_checkout(payload):
    if not STRIPE_SECRET_KEY:
        return None, "Stripe is not configured on the backend."

    try:
        total_cents = int(round(float(payload.get("quoteTotal", 0) or 0) * 100))
    except (TypeError, ValueError):
        return None, "The booking total is invalid."
    if total_cents <= 0:
        return None, "The booking total must be greater than zero."

    form = {
        "mode": "payment",
        "success_url": STRIPE_SUCCESS_URL,
        "cancel_url": STRIPE_CANCEL_URL,
        "customer_email": str(payload.get("email", "")).strip(),
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": "YouR Party Rentals booking",
        "line_items[0][price_data][product_data][description]": f"Event date: {payload.get('selectedDate', '')}",
        "line_items[0][price_data][unit_amount]": str(total_cents),
        "line_items[0][quantity]": "1",
        "metadata[booking_date]": str(payload.get("selectedDate", "")),
        "metadata[booking_email]": str(payload.get("email", "")),
    }
    request = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=urlencode(form).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            session = json.loads(response.read().decode("utf-8"))
        return session.get("url"), ""
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "ignore")
        return None, f"Stripe rejected the checkout request: {detail[:240]}"
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        return None, f"Could not reach Stripe: {error}"


class GalleryRequestHandler(BaseHTTPRequestHandler):
    server_version = "YouRPartyRentals/1.0"

    def log_message(self, format, *args):  # noqa: A002 - matches base signature
        pass

    def add_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", CORS_ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self.add_cors_headers()
        self.end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.add_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_unauthorized(self):
        self.send_response(401)
        self.add_cors_headers()
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
        self.add_cors_headers()
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

        if path == "/api/health":
            self.send_json(200, {"ok": True})
            return

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

        if path == "/api/admin/auth":
            if not is_authorized(self.headers.get("Authorization")):
                self.send_unauthorized()
                return
            self.send_json(200, {"username": read_admin_auth()["username"]})
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

        if path == "/api/admin/bookings":
            if not is_authorized(self.headers.get("Authorization")):
                self.send_unauthorized()
                return
            self.send_json(200, read_bookings())
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

        if parsed.path == "/api/bookings":
            try:
                payload = self.read_json_body()
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"error": "Invalid request body."})
                return

            if not isinstance(payload, dict) or not payload.get("selectedDate"):
                self.send_json(400, {"error": "A booking payload with selectedDate is required."})
                return

            record = create_booking(payload)
            self.send_json(201, record)
            return

        if parsed.path == "/api/payments/checkout":
            try:
                payload = self.read_json_body()
                checkout_url, error = create_stripe_checkout(payload)
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"error": "Invalid request body."})
                return
            if not checkout_url:
                self.send_json(503, {"error": error})
                return
            self.send_json(200, {"url": checkout_url})
            return

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
        replace_id = str(payload.get("replaceId", "")).strip()

        match = re.match(r"^data:(image/[A-Za-z0-9.+-]+);base64,(.+)$", image_data_url, re.DOTALL)
        if not match:
            self.send_json(400, {"error": "A valid image data URL is required."})
            return

        mime_type, encoded = match.group(1), match.group(2)
        ext = ALLOWED_MIME_TO_EXT.get(mime_type)
        if not ext:
            self.send_json(400, {"error": "Unsupported image type."})
            return

        try:
            image_bytes = base64.b64decode(encoded, validate=True)
        except Exception:
            self.send_json(400, {"error": "Could not decode image."})
            return

        if len(image_bytes) > MAX_IMAGE_BYTES:
            self.send_json(400, {"error": "Image is too large (max 8MB)."})
            return

        ensure_data_files()
        images = read_gallery()
        replace_index = next((index for index, image in enumerate(images) if image.get("id") == replace_id), None)
        if replace_id and replace_index is None:
            self.send_json(404, {"error": "Image to replace was not found."})
            return
        if not replace_id and len(images) >= MAX_GALLERY_IMAGES:
            self.send_json(400, {"error": f"The gallery can display up to {MAX_GALLERY_IMAGES} images. Delete or replace an image before adding another."})
            return

        filename = f"{uuid.uuid4().hex}{ext}"
        (UPLOADS_DIR / filename).write_bytes(image_bytes)

        entry = {
            "id": replace_id or uuid.uuid4().hex,
            "url": f"/uploads/gallery/{filename}",
            "caption": caption,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        if replace_id:
            old_url = images[replace_index].get("url", "")
            old_file = UPLOADS_DIR / os.path.basename(old_url)
            if old_url.startswith("/uploads/gallery/") and old_file.exists():
                old_file.unlink()
            images[replace_index] = entry
        else:
            images.append(entry)
        write_gallery(images)

        self.send_json(201, entry)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/admin/settings", "/api/admin/availability", "/api/admin/catalog", "/api/admin/auth"):
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

        if parsed.path == "/api/admin/auth":
            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", ""))
            if len(username) < 3 or len(password) < 8:
                self.send_json(400, {"error": "Username must be at least 3 characters and password at least 8 characters."})
                return
            self.send_json(200, {"username": write_admin_auth(username, password)["username"]})
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
    print(f"YouR Party Rentals server running at http://0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
