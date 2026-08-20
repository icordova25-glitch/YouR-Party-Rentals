window.YPR_CONFIG = {
  bookingEndpoint: "",
  businessEmail: "bookings@yourrpartyrentals.com",
  businessPhone: "+15551234567",
  paymentCheckoutUrl: "",
  apiBaseUrl: "https://your-party-rentals-api.onrender.com",
};

const apiBaseUrl = window.YPR_CONFIG.apiBaseUrl.replace(/\/$/, "");
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const requestUrl = typeof input === "string" ? input : input?.url;
  const request = requestUrl?.startsWith("/api/") ? `${apiBaseUrl}${requestUrl}` : input;
  return nativeFetch(request, init).then((response) => {
    if (!requestUrl?.endsWith("/api/gallery") || !response.ok) {
      return response;
    }
    return response.clone().json().then((images) => {
      if (!Array.isArray(images)) {
        return response;
      }
      const normalized = images.map((image) => ({
        ...image,
        url: image.url?.startsWith("/") ? `${apiBaseUrl}${image.url}` : image.url,
      }));
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        headers: response.headers,
      });
    });
  });
};

const galleryImageInput = document.querySelector('#upload-form input[name="image"]');
if (galleryImageInput) {
  const preview = document.createElement("img");
  preview.hidden = true;
  preview.alt = "Selected gallery image preview";
  preview.style.cssText = "display:block;max-width:100%;max-height:320px;margin:12px 0;object-fit:contain";
  galleryImageInput.closest("label").after(preview);
  galleryImageInput.addEventListener("change", () => {
    const file = galleryImageInput.files?.[0];
    if (!file) {
      preview.hidden = true;
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });
}
