const AUTH_KEY = "yourr_party_rentals_gallery_admin_auth";

const APP_CONFIG = window.YPR_CONFIG || {};
const API_BASE_URL = (APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
function imageUrl(path) {
  return path && path.startsWith("/") ? apiUrl(path) : path;
}

const loginSection = document.getElementById("admin-login");
const panelSection = document.getElementById("admin-panel");
const loginForm = document.getElementById("admin-login-form");
const loginStatus = document.getElementById("login-status");
const logoutBtn = document.getElementById("logout-btn");
const uploadForm = document.getElementById("upload-form");
const uploadStatus = document.getElementById("upload-status");
const adminGalleryGrid = document.getElementById("admin-gallery-grid");
const settingsForm = document.getElementById("settings-form");
const settingsStatus = document.getElementById("settings-status");
const previewModal = document.getElementById("preview-modal");
const previewImage = document.getElementById("preview-image");
const previewTitle = document.getElementById("preview-title");
const previewCaption = document.getElementById("preview-caption");
const closePreviewBtn = document.getElementById("close-preview-btn");
const availabilityForm = document.getElementById("availability-form");
const availabilityStatus = document.getElementById("availability-status");
const catalogForm = document.getElementById("catalog-form");
const inventoryEditor = document.getElementById("inventory-editor");
const packageEditor = document.getElementById("package-editor");
const addPackageBtn = document.getElementById("add-package-btn");
const catalogStatus = document.getElementById("catalog-status");
const authForm = document.getElementById("auth-form");
const authStatus = document.getElementById("auth-status");
const bookingsList = document.getElementById("bookings-list");
const refreshBookingsBtn = document.getElementById("refresh-bookings-btn");

let availabilityOverrides = {};
let replacingImageId = "";

function getCredentials() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed.username && parsed.password ? parsed : null;
  } catch (error) {
    return null;
  }
}

function setCredentials(username, password) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ username, password }));
}

function clearCredentials() {
  sessionStorage.removeItem(AUTH_KEY);
}

function authHeader() {
  const credentials = getCredentials();
  if (!credentials) {
    return {};
  }
  const token = btoa(`${credentials.username}:${credentials.password}`);
  return { Authorization: `Basic ${token}` };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function verifyCredentials(username, password) {
  const token = btoa(`${username}:${password}`);
  const response = await fetch(apiUrl("/api/admin/ping"), {
    headers: { Authorization: `Basic ${token}` },
  });
  return response.ok;
}

function showPanel() {
  loginSection.hidden = true;
  panelSection.hidden = false;
  loadAdminGallery();
  loadSettings();
  loadAvailability();
  loadCatalog();
  loadAdminUsername();
  loadBookings();
}

function showLogin() {
  loginSection.hidden = false;
  panelSection.hidden = true;
}

async function loadAdminGallery() {
  try {
    const response = await fetch(apiUrl("/api/gallery"));
    const images = response.ok ? await response.json() : [];
    renderAdminGallery(images);
  } catch (error) {
    adminGalleryGrid.innerHTML = "<p>Could not reach the server. Is it running?</p>";
  }
}

function renderAdminGallery(images) {
  adminGalleryGrid.innerHTML = "";

  if (images.length === 0) {
    adminGalleryGrid.innerHTML = "<p>No uploaded images yet. Add one above.</p>";
    return;
  }

  images.forEach((image) => {
    const figure = document.createElement("figure");
    figure.className = "gallery-card admin-gallery-card";

    const img = document.createElement("img");
    img.src = imageUrl(image.url);
    img.alt = image.caption || "Uploaded gallery image";
    img.addEventListener("click", () => openPreview(image));
    figure.appendChild(img);

    const figcaption = document.createElement("figcaption");
    figcaption.textContent = image.caption || "(no caption)";
    figure.appendChild(figcaption);

    const actions = document.createElement("div");
    actions.className = "gallery-actions";

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "preview-btn";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", () => openPreview(image));
    actions.appendChild(previewBtn);

    const replaceBtn = document.createElement("button");
    replaceBtn.type = "button";
    replaceBtn.textContent = "Replace";
    replaceBtn.addEventListener("click", () => {
      replacingImageId = image.id;
      uploadForm.elements.image.click();
      uploadStatus.textContent = "Choose a replacement image, preview it, then add it to the gallery.";
    });
    actions.appendChild(replaceBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-gallery-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteImage(image.id));
    actions.appendChild(deleteBtn);
    figure.appendChild(actions);

    adminGalleryGrid.appendChild(figure);
  });
}

function openPreview(image) {
  previewImage.src = imageUrl(image.url);
  previewImage.alt = image.caption || "Uploaded gallery image";
  previewTitle.textContent = image.caption || "Image Preview";
  previewCaption.textContent = image.caption || "";
  previewModal.hidden = false;
  closePreviewBtn.focus();
}

function closePreview() {
  previewModal.hidden = true;
  previewImage.src = "";
}

async function loadSettings() {
  try {
    const response = await fetch(apiUrl("/api/admin/settings"), { headers: authHeader() });
    if (!response.ok) {
      throw new Error("Could not load settings");
    }
    const settings = await response.json();
    Object.entries(settings).forEach(([name, value]) => {
      const field = settingsForm.elements.namedItem(name);
      if (field) {
        field.value = value;
      }
    });
  } catch (error) {
    settingsStatus.textContent = "Could not load business settings.";
  }
}

async function loadAvailability() {
  try {
    const response = await fetch(apiUrl("/api/admin/availability"), { headers: authHeader() });
    if (!response.ok) {
      throw new Error("Could not load availability");
    }
    availabilityOverrides = await response.json();
  } catch (error) {
    availabilityStatus.textContent = "Could not load drop-off availability.";
  }
}

availabilityForm.elements.availabilityDate.addEventListener("change", (event) => {
  const slots = availabilityOverrides[event.target.value] || [];
  availabilityForm.elements.availabilitySlots.value = slots.join(", ");
});

function renderCatalogEditor(catalog) {
  inventoryEditor.innerHTML = "";
  catalog.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "inventory-row";
    row.dataset.key = item.key;
    row.innerHTML = `<strong></strong><label class="inventory-description-field">Description<input type="text" name="description" required></label><label>Inventory<input type="number" min="0" name="inventory" required></label><label>Price<input type="number" min="0" step="0.01" name="price" required></label>`;
    row.querySelector("strong").textContent = item.name;
    row.querySelector('[name="description"]').value = item.description || "";
    row.querySelector('[name="inventory"]').value = item.inventory;
    row.querySelector('[name="price"]').value = item.price;
    inventoryEditor.appendChild(row);
  });

  packageEditor.innerHTML = "";
  catalog.packages.forEach((pkg) => addPackageEditor(pkg));
}

function addPackageEditor(pkg = {}) {
  if (packageEditor.children.length >= 4) {
    catalogStatus.textContent = "A maximum of four packages can be displayed.";
    return;
  }
  const editor = document.createElement("fieldset");
  editor.className = "package-editor-row";
  editor.innerHTML = `<legend>Package ${packageEditor.children.length + 1}</legend><button type="button" class="remove-package-btn">Remove</button><label>Name<input type="text" name="packageName" required></label><label>Description<input type="text" name="packageDescription"></label><label>Package Price<input type="number" name="packagePrice" min="0" step="0.01" required></label><div class="package-quantities"></div>`;
  editor.querySelector('[name="packageName"]').value = pkg.name || "";
  editor.querySelector('[name="packageDescription"]').value = pkg.description || "";
  editor.querySelector('[name="packagePrice"]').value = pkg.price || 0;
  editor.dataset.id = pkg.id || "";
  const quantities = editor.querySelector(".package-quantities");
  ["tables", "chairs", "canopies", "fans", "iceChests"].forEach((key) => {
    const label = document.createElement("label");
    label.textContent = key;
    label.innerHTML += `<input type="number" min="0" name="package-${key}" value="${pkg.items?.[key] || 0}">`;
    quantities.appendChild(label);
  });
  editor.querySelector(".remove-package-btn").addEventListener("click", () => editor.remove());
  packageEditor.appendChild(editor);
}

async function loadCatalog() {
  try {
    const response = await fetch(apiUrl("/api/admin/catalog"), { headers: authHeader() });
    if (!response.ok) throw new Error("Could not load catalog");
    renderCatalogEditor(await response.json());
  } catch (error) {
    catalogStatus.textContent = "Could not load inventory and packages.";
  }
}

async function loadAdminUsername() {
  const response = await fetch(apiUrl("/api/admin/auth"), { headers: authHeader() });
  if (response.ok) {
    const data = await response.json();
    authForm.elements.username.value = data.username;
  }
}

function notificationBadge(result) {
  if (!result) {
    return "unknown";
  }
  return result.sent ? "sent" : `not sent (${result.detail || "skipped"})`;
}

async function loadBookings() {
  try {
    const response = await fetch(apiUrl("/api/admin/bookings"), { headers: authHeader() });
    if (!response.ok) {
      throw new Error("Could not load bookings");
    }
    const bookings = await response.json();
    bookingsList.innerHTML = "";

    if (bookings.length === 0) {
      bookingsList.innerHTML = "<p>No booking requests yet.</p>";
      return;
    }

    [...bookings].reverse().forEach((booking) => {
      const row = document.createElement("div");
      row.className = "booking-row";
      row.innerHTML = `
        <strong>${booking.fullName || "(no name)"}</strong> - ${booking.selectedDate || ""} ${booking.selectedTime || ""}<br>
        Email: ${booking.email || "(none)"} | Total: $${Number(booking.quoteTotal || 0).toFixed(2)}<br>
        Notification email: ${notificationBadge(booking.notifications?.email)} | SMS: ${notificationBadge(booking.notifications?.sms)}
      `;
      bookingsList.appendChild(row);
    });
  } catch (error) {
    bookingsList.innerHTML = "<p>Could not load booking requests.</p>";
  }
}

refreshBookingsBtn.addEventListener("click", loadBookings);

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(authForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    authStatus.textContent = "The passwords do not match.";
    return;
  }

  authStatus.textContent = "Saving...";
  try {
    const response = await fetch(apiUrl("/api/admin/auth"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Could not change credentials.");
    }
    sessionStorage.removeItem(AUTH_KEY);
    authForm.reset();
    showLogin();
    loginStatus.textContent = "Credentials changed. Log in with your new username and password.";
  } catch (error) {
    authStatus.textContent = error.message;
  }
});

addPackageBtn.addEventListener("click", () => addPackageEditor());

catalogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  catalogStatus.textContent = "Saving...";
  const items = [...inventoryEditor.children].map((row) => ({
    key: row.dataset.key,
    description: row.querySelector('[name="description"]').value,
    inventory: Number(row.querySelector('[name="inventory"]').value || 0),
    price: Number(row.querySelector('[name="price"]').value || 0),
  }));
  const packages = [...packageEditor.children].map((editor) => {
    const items = {};
    ["tables", "chairs", "canopies", "fans", "iceChests"].forEach((key) => {
      items[key] = Number(editor.querySelector(`[name="package-${key}"]`).value || 0);
    });
    return {
      id: editor.dataset.id,
      name: editor.querySelector('[name="packageName"]').value,
      description: editor.querySelector('[name="packageDescription"]').value,
      price: Number(editor.querySelector('[name="packagePrice"]').value || 0),
      items,
    };
  });
  try {
    const response = await fetch(apiUrl("/api/admin/catalog"), { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ items, packages }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Save failed");
    renderCatalogEditor(body);
    catalogStatus.textContent = `Saved ${body.packages.length} package${body.packages.length === 1 ? "" : "s"}.`;
  } catch (error) {
    catalogStatus.textContent = error.message || "Could not save catalog.";
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsStatus.textContent = "Saving...";
  const settings = Object.fromEntries(new FormData(settingsForm).entries());

  try {
    const response = await fetch(apiUrl("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error("Save failed");
    }
    settingsStatus.textContent = "Business settings saved.";
  } catch (error) {
    settingsStatus.textContent = "Could not save business settings.";
  }
});

availabilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  availabilityStatus.textContent = "Saving...";
  const formData = new FormData(availabilityForm);
  const date = String(formData.get("availabilityDate") || "");
  const slots = String(formData.get("availabilitySlots") || "")
    .split(",")
    .map((slot) => slot.trim())
    .filter(Boolean);

  try {
    const response = await fetch(apiUrl("/api/admin/availability"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ date, slots }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Save failed");
    }
    availabilityStatus.textContent = body.slots.length
      ? `Saved ${body.slots.length} time slots for ${date}.`
      : `Default time slots restored for ${date}.`;
  } catch (error) {
    availabilityStatus.textContent = error.message || "Could not save date availability.";
  }
});

closePreviewBtn.addEventListener("click", closePreview);
previewModal.addEventListener("click", (event) => {
  if (event.target === previewModal) {
    closePreview();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !previewModal.hidden) {
    closePreview();
  }
});

async function deleteImage(id) {
  try {
    const response = await fetch(apiUrl(`/api/gallery/${id}`), {
      method: "DELETE",
      headers: authHeader(),
    });
    if (!response.ok) {
      throw new Error("Delete failed");
    }
    loadAdminGallery();
  } catch (error) {
    uploadStatus.textContent = "Could not delete that image.";
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  loginStatus.textContent = "Checking credentials...";

  try {
    const valid = await verifyCredentials(username, password);
    if (!valid) {
      loginStatus.textContent = "Incorrect username or password.";
      return;
    }
    setCredentials(username, password);
    loginStatus.textContent = "";
    loginForm.reset();
    showPanel();
  } catch (error) {
    loginStatus.textContent = "Could not reach the server. Is it running?";
  }
});

logoutBtn.addEventListener("click", () => {
  clearCredentials();
  showLogin();
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(uploadForm);
  const file = formData.get("image");
  const caption = String(formData.get("caption") || "").trim();

  if (!file || file.size === 0) {
    uploadStatus.textContent = "Please choose an image file.";
    return;
  }

  uploadStatus.textContent = "Uploading...";

  try {
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch(apiUrl("/api/gallery"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ image: dataUrl, caption, replaceId: replacingImageId }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Upload failed");
    }

    const action = replacingImageId ? "replaced" : "added to";
    replacingImageId = "";
    uploadForm.reset();
    uploadStatus.textContent = `Image ${action} gallery.`;
    loadAdminGallery();
  } catch (error) {
    uploadStatus.textContent = error.message || "Could not upload that image.";
  }
});

uploadForm.elements.image.addEventListener("change", () => {
  const file = uploadForm.elements.image.files?.[0];
  if (!file) {
    return;
  }
  const previewUrl = URL.createObjectURL(file);
  openPreview({ url: previewUrl, caption: uploadForm.elements.caption.value || file.name });
  uploadStatus.textContent = "Preview shown. Submit when the image looks right.";
});

if (getCredentials()) {
  showPanel();
} else {
  showLogin();
}
