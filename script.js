const calendarEl = document.getElementById("two-month-calendar");
const monthRangeLabelEl = document.getElementById("month-range-label");
const selectedDateInput = document.getElementById("selected-date");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");
const bookingForm = document.getElementById("booking-form");
const formStatus = document.getElementById("form-status");
const paymentPanel = document.getElementById("payment-panel");
const paymentTotal = document.getElementById("payment-total");
const payNowBtn = document.getElementById("pay-now-btn");
const paymentStatus = document.getElementById("payment-status");
const timeSlotField = document.getElementById("time-slot-field");
const timeSlotSelect = document.getElementById("time-slot");
const contactPhone = document.getElementById("contact-phone");
const contactText = document.getElementById("contact-text");
const contactEmail = document.getElementById("contact-email");
const galleryGridEl = document.getElementById("gallery-grid");
const packageGridEl = document.getElementById("package-grid");
const rentalInventoryGridEl = document.getElementById("rental-inventory-grid");

const quoteTables = document.getElementById("quote-tables");
const quoteChairs = document.getElementById("quote-chairs");
const quoteCanopies = document.getElementById("quote-canopies");
const quoteFans = document.getElementById("quote-fans");
const quoteIceChests = document.getElementById("quote-iceChests");
const quoteTotal = document.getElementById("quote-total");

const BOOKINGS_KEY = "yourr_party_rentals_bookings";
const MS_PER_DAY = 86400000;

const DEFAULT_GALLERY_IMAGES = [
  {
    src: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80",
    caption: "Elegant table layout",
  },
  {
    src: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80",
    caption: "Guest seating ready",
  },
  {
    src: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80",
    caption: "Canopy coverage",
  },
  {
    src: "https://images.unsplash.com/photo-1523875194681-bedd468c58bf?auto=format&fit=crop&w=1200&q=80",
    caption: "Ice chest beverage station",
  },
];

const DEFAULT_ITEM_PRICES = {
  tables: 10,
  chairs: 2,
  canopies: 75,
  fans: 20,
  iceChests: 15,
};
let itemPrices = { ...DEFAULT_ITEM_PRICES };
let inventory = {};
let packages = [];
let currentCatalogItems = {};

const APP_CONFIG = window.YPR_CONFIG || {
  bookingEndpoint: "",
  businessEmail: "bookings@example.com",
  businessPhone: "+10000000000",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let today = new Date();
today.setHours(0, 0, 0, 0);
let currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDateISO = "";
let selectedTime = "";
let bookings = loadBookings();

const INVENTORY_KEYS = ["tables", "chairs", "canopies", "fans", "iceChests"];

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthRange(monthStart) {
  const secondMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const first = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthStart);
  const second = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(secondMonth);
  return `${first} - ${second}`;
}

function loadBookings() {
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveBookings() {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
}

function formatTimeSlot(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes || 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function loadTimeSlots(dateISO) {
  timeSlotField.hidden = false;
  timeSlotSelect.disabled = true;
  timeSlotSelect.innerHTML = "<option value=\"\">Loading time slots...</option>";

  try {
    const response = await fetch(`/api/dropoff-slots?date=${encodeURIComponent(dateISO)}`);
    if (!response.ok) {
      throw new Error("Could not load time slots");
    }
    const slots = await response.json();
    timeSlotSelect.innerHTML = "<option value=\"\">Select a drop-off time</option>";
    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = formatTimeSlot(slot);
      timeSlotSelect.appendChild(option);
    });
    timeSlotSelect.value = selectedTime;
    timeSlotSelect.disabled = slots.length === 0;
    if (slots.length === 0) {
      timeSlotSelect.innerHTML = "<option value=\"\">No times available for this date</option>";
    }
  } catch (error) {
    timeSlotSelect.innerHTML = "<option value=\"\">Could not load time slots</option>";
  }
}

timeSlotSelect.addEventListener("change", () => {
  selectedTime = timeSlotSelect.value;
});

function loadGalleryImages() {
  return fetch("/api/gallery")
    .then((response) => (response.ok ? response.json() : []))
    .then((images) => (Array.isArray(images) ? images : []))
    .catch(() => []);
}

function renderGallery() {
  if (!galleryGridEl) {
    return;
  }

  loadGalleryImages().then((adminImages) => {
    const images =
      adminImages.length > 0
        ? adminImages.map((image) => ({ src: image.url, caption: image.caption }))
        : DEFAULT_GALLERY_IMAGES;

    galleryGridEl.innerHTML = "";
    images.forEach((image) => {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = image.caption || "Party rental setup";
      img.loading = "lazy";
      figure.appendChild(img);

      if (image.caption) {
        const figcaption = document.createElement("figcaption");
        figcaption.textContent = image.caption;
        figure.appendChild(figcaption);
      }

      galleryGridEl.appendChild(figure);
    });
  });
}

function toCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function sanitizePhoneForLink(phone) {
  return String(phone || "").replace(/[^+\d]/g, "") || "+10000000000";
}

function initContactLinks() {
  const phone = sanitizePhoneForLink(APP_CONFIG.businessPhone);
  const email = APP_CONFIG.businessEmail || "bookings@example.com";

  contactPhone.href = `tel:${phone}`;
  contactText.href = `sms:${phone}`;
  contactEmail.href = `mailto:${email}`;
}

function getItemCountsFromFormData(formData) {
  return {
    tables: Number(formData.get("tables") || 0),
    chairs: Number(formData.get("chairs") || 0),
    canopies: Number(formData.get("canopies") || 0),
    fans: Number(formData.get("fans") || 0),
    iceChests: Number(formData.get("iceChests") || 0),
  };
}

function renderCatalog() {
  rentalInventoryGridEl.innerHTML = "";
  INVENTORY_KEYS.forEach((key) => {
    const catalogItem = currentCatalogItems[key];
    if (catalogItem) {
      const card = document.createElement("article");
      card.className = "item-card stagger-item";
      const heading = document.createElement("h3");
      heading.textContent = catalogItem.name;
      const description = document.createElement("p");
      description.textContent = catalogItem.description;
      card.append(heading, description);
      rentalInventoryGridEl.appendChild(card);
    }
    const priceTag = document.querySelector(`[data-price-for="${key}"]`);
    const input = bookingForm.elements.namedItem(key);
    if (priceTag) {
      priceTag.textContent = `${toCurrency(itemPrices[key])} each`;
    }
    if (input && Number.isFinite(inventory[key])) {
      input.max = String(inventory[key]);
    }
  });

  packageGridEl.innerHTML = "";
  packages.forEach((pkg) => {
    const card = document.createElement("article");
    card.className = "package-card";
    card.innerHTML = `<h3></h3><p></p><strong></strong>`;
    card.querySelector("h3").textContent = pkg.name;
    card.querySelector("p").textContent = pkg.description;
    card.querySelector("strong").textContent = toCurrency(pkg.price);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Add Package";
    button.addEventListener("click", () => {
      INVENTORY_KEYS.forEach((key) => {
        bookingForm.elements.namedItem(key).value = pkg.items[key] || 0;
      });
      updateQuoteFromForm();
      document.getElementById("book").scrollIntoView({ behavior: "smooth" });
    });
    card.appendChild(button);
    packageGridEl.appendChild(card);
  });
}

async function loadCatalog() {
  try {
    const response = await fetch("/api/catalog");
    if (!response.ok) {
      throw new Error("Catalog unavailable");
    }
    const catalog = await response.json();
    currentCatalogItems = Object.fromEntries(
      catalog.items.map((item) => [item.key, item])
    );
    catalog.items.forEach((item) => {
      itemPrices[item.key] = Number(item.price);
      inventory[item.key] = Number(item.inventory);
    });
    packages = Array.isArray(catalog.packages) ? catalog.packages.slice(0, 4) : [];
  } catch (error) {
    inventory = Object.fromEntries(INVENTORY_KEYS.map((key) => [key, 999]));
    currentCatalogItems = {
      tables: { key: "tables", name: "Tables", description: "Rectangular and round event tables for dining and display." },
      chairs: { key: "chairs", name: "Chairs", description: "Comfortable, stackable seating for indoor and outdoor events." },
      canopies: { key: "canopies", name: "Canopies", description: "Shade coverage for backyard celebrations and open spaces." },
      fans: { key: "fans", name: "Fans", description: "Portable cooling fans to keep guests comfortable all day." },
      iceChests: { key: "iceChests", name: "Ice Chests", description: "Large-capacity coolers for drinks, food storage, and service." },
    };
  }
  renderCatalog();
  updateQuoteFromForm();
}

function computeQuote(itemCounts) {
  const lineItems = {
    tables: itemCounts.tables * itemPrices.tables,
    chairs: itemCounts.chairs * itemPrices.chairs,
    canopies: itemCounts.canopies * itemPrices.canopies,
    fans: itemCounts.fans * itemPrices.fans,
    iceChests: itemCounts.iceChests * itemPrices.iceChests,
  };

  const total =
    lineItems.tables +
    lineItems.chairs +
    lineItems.canopies +
    lineItems.fans +
    lineItems.iceChests;

  return { lineItems, total };
}

function updateQuoteFromForm() {
  const formData = new FormData(bookingForm);
  const itemCounts = getItemCountsFromFormData(formData);
  const quote = computeQuote(itemCounts);

  quoteTables.textContent = toCurrency(quote.lineItems.tables);
  quoteChairs.textContent = toCurrency(quote.lineItems.chairs);
  quoteCanopies.textContent = toCurrency(quote.lineItems.canopies);
  quoteFans.textContent = toCurrency(quote.lineItems.fans);
  quoteIceChests.textContent = toCurrency(quote.lineItems.iceChests);
  quoteTotal.textContent = toCurrency(quote.total);

  return quote;
}

function hasBookingOnDate(dateISO) {
  return bookings.some((booking) => booking.selectedDate === dateISO);
}

function buildMonthGrid(monthStart) {
  const monthGrid = document.createElement("div");
  monthGrid.className = "month-grid";

  const heading = document.createElement("h3");
  heading.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthStart);
  monthGrid.appendChild(heading);

  const weekdaysRow = document.createElement("div");
  weekdaysRow.className = "month-weekdays";
  WEEKDAY_LABELS.forEach((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    weekdaysRow.appendChild(span);
  });
  monthGrid.appendChild(weekdaysRow);

  const daysGrid = document.createElement("div");
  daysGrid.className = "month-days";
  daysGrid.setAttribute("role", "listbox");

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = monthStart.getDay();

  for (let i = 0; i < leadingBlanks; i += 1) {
    const blank = document.createElement("div");
    blank.className = "day-btn empty";
    daysGrid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const iso = toISODate(date);
    const dayBtn = document.createElement("button");
    dayBtn.type = "button";
    dayBtn.className = "day-btn";
    dayBtn.setAttribute("role", "option");
    dayBtn.dataset.date = iso;

    const isPast = date < today;
    const isBooked = hasBookingOnDate(iso);

    if (isBooked) {
      dayBtn.classList.add("booked");
    }
    if (selectedDateISO === iso) {
      dayBtn.classList.add("selected");
    }
    if (isPast || isBooked) {
      dayBtn.disabled = true;
    }

    const availability = isPast ? "Past" : isBooked ? "Booked" : "Available";
    dayBtn.innerHTML = `<strong>${day}</strong><small>${availability}</small>`;

    dayBtn.addEventListener("click", () => {
      selectedDateISO = iso;
      selectedTime = "";
      selectedDateInput.value = iso;
      formStatus.textContent = "";
      loadTimeSlots(iso);
      renderCalendar();
    });

    daysGrid.appendChild(dayBtn);
  }

  monthGrid.appendChild(daysGrid);
  return monthGrid;
}

function renderCalendar() {
  monthRangeLabelEl.textContent = formatMonthRange(currentMonthStart);
  calendarEl.innerHTML = "";

  const secondMonthStart = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() + 1,
    1
  );

  calendarEl.appendChild(buildMonthGrid(currentMonthStart));
  calendarEl.appendChild(buildMonthGrid(secondMonthStart));
}

function getTotalItems(formData) {
  const keys = ["tables", "chairs", "canopies", "fans", "iceChests"];
  return keys.reduce((sum, key) => {
    const value = Number(formData.get(key) || 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
}

async function sendToBookingEndpoint(payload) {
  if (!APP_CONFIG.bookingEndpoint) {
    return { ok: true, skipped: true };
  }

  const response = await fetch(APP_CONFIG.bookingEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Could not send booking to integrations endpoint.");
  }

  return { ok: true, skipped: false };
}

function initCalendarActions() {
  prevMonthBtn.addEventListener("click", () => {
    const prevMonth = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 1,
      1
    );
    const earliestMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    currentMonthStart = prevMonth < earliestMonth ? earliestMonth : prevMonth;
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", () => {
    currentMonthStart = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() + 1,
      1
    );
    renderCalendar();
  });
}

function initBookingForm() {
  bookingForm.addEventListener("input", () => {
    updateQuoteFromForm();
  });

  bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(bookingForm);
    const payload = Object.fromEntries(formData.entries());
    const itemCounts = getItemCountsFromFormData(formData);
    const quote = computeQuote(itemCounts);

    if (!payload.selectedDate) {
      formStatus.textContent = "Please select a date from the calendar.";
      return;
    }

    if (!payload.selectedTime) {
      formStatus.textContent = "Please select a drop-off time.";
      return;
    }

    if (hasBookingOnDate(payload.selectedDate)) {
      formStatus.textContent = "That day is already booked. Please choose another date.";
      return;
    }

    if (getTotalItems(formData) === 0) {
      formStatus.textContent = "Please request at least one rental item.";
      return;
    }

    const overInventory = INVENTORY_KEYS.find(
      (key) => itemCounts[key] > (inventory[key] ?? Number.MAX_SAFE_INTEGER)
    );
    if (overInventory) {
      formStatus.textContent = `Only ${inventory[overInventory]} ${overInventory} currently available.`;
      return;
    }

    const bookingRecord = {
      fullName: String(payload.fullName || "").trim(),
      email: String(payload.email || "").trim(),
      selectedDate: payload.selectedDate,
      selectedTime: payload.selectedTime,
      tables: itemCounts.tables,
      chairs: itemCounts.chairs,
      canopies: itemCounts.canopies,
      fans: itemCounts.fans,
      iceChests: itemCounts.iceChests,
      itemPrices,
      quoteLineItems: quote.lineItems,
      quoteTotal: quote.total,
      notes: String(payload.notes || "").trim(),
      createdAt: new Date().toISOString(),
    };

    formStatus.textContent = "Submitting booking...";

    sendToBookingEndpoint(bookingRecord)
      .then(() => {
        bookings.push(bookingRecord);
        saveBookings();
        bookingForm.reset();
        selectedDateISO = "";
        selectedTime = "";
        selectedDateInput.value = "";
        timeSlotField.hidden = true;
        timeSlotSelect.disabled = true;
        updateQuoteFromForm();
        formStatus.textContent =
          "Booking request submitted. Quote saved and notification sent.";
        paymentTotal.textContent = toCurrency(quote.total);
        paymentPanel.hidden = false;
        paymentStatus.textContent = APP_CONFIG.paymentCheckoutUrl
          ? "Continue below to enter your card details securely."
          : "Secure checkout is not configured yet. Please contact us to arrange payment.";
        renderCalendar();
      })
      .catch(() => {
        formStatus.textContent =
          "Booking saved locally, but remote notification failed. Check endpoint setup.";
      });
  });
}

function initPaymentActions() {
  payNowBtn.addEventListener("click", () => {
    if (!APP_CONFIG.paymentCheckoutUrl) {
      paymentStatus.textContent =
        "Secure payment is not configured yet. Please use the contact options below.";
      return;
    }

    window.location.assign(APP_CONFIG.paymentCheckoutUrl);
  });
}

function init() {
  initContactLinks();
  initCalendarActions();
  initBookingForm();
  initPaymentActions();
  updateQuoteFromForm();
  renderCalendar();
  renderGallery();
  loadCatalog();
}

init();
