# YouR-Party-Rentals

Modern single-page website for YouR Party Rentals LLC with:
- Rental catalog for tables, chairs, canopies, fans, and ice chests
- Per-item pricing and automatic live quote total
- Visual gallery section
- Two-month advance booking calendar with saved bookings (localStorage)
- Client-facing gallery populated by admin-uploaded images, served from a small Python backend (with default placeholder photos until images are uploaded)
- Integration-ready booking endpoint for email, Google Sheets, and phone SMS alerts

## Quick start

1. Run the backend server (required for the gallery to work; no dependencies beyond Python 3):
	```
	python3 server.py
	```
2. Open `http://localhost:3002` in your browser (opening `index.html` directly still works for everything except the gallery, which needs the server).
3. To use your real brand logo image, place your logo file at:
	- `assets/yourr-logo.png`
4. Refresh the page.

## Pricing

Default item prices (editable in `script.js`):
- Tables: `$10`
- Chairs: `$2`
- Canopies: `$75`
- Fans: `$20`
- Ice Chests: `$15`

The booking form calculates a live estimate automatically.

## Secure Payments

After a booking request is submitted, the client sees a payment step with the booking total. Set `paymentCheckoutUrl` in `config.js` to a Stripe Payment Link or hosted Checkout URL before accepting card payments. The customer enters card details on that secure provider page; this site never receives or stores card numbers, expiration dates, or CVC values.

Do not add raw card fields to the frontend or send card data through the booking endpoint. A production setup should use Stripe Checkout/Payment Links or Stripe Elements with a server-created PaymentIntent and webhook confirmation.

## Gallery Admin

1. Start the server: `python3 server.py` (defaults to port `3002`).
2. Open `http://localhost:3002/admin-gallery.html` (linked from the site footer).
3. Log in with the admin username/password (defaults: `admin` / `yourr-admin`, override with the `GALLERY_ADMIN_USERNAME` / `GALLERY_ADMIN_PASSWORD` environment variables).
4. Upload images with an optional caption; they're saved to `uploads/gallery/` on the server and immediately appear in the public gallery on `index.html` for every visitor.
5. Delete images from the admin panel as needed.

Images and metadata are stored under `data/gallery.json` and `uploads/gallery/` (both git-ignored/created automatically). Change the default admin credentials before deploying publicly.

The admin page also includes private fields for payment deposit banking information and booking confirmation notification email/phone details. These are stored in `data/business-settings.json` and are available only through authenticated admin requests. Each uploaded gallery image includes a `Preview` button that opens a larger modal preview before publishing or deleting decisions.

The same admin page includes inventory and price editing for tables, chairs, canopies, fans, and ice chests. It also supports up to four packages; saved packages appear on the public booking page and can prefill the rental quantities.

## Integrations

1. Configure frontend contact and endpoint in `config.js`.
2. Deploy Google Apps Script endpoint from `apps-script/Code.gs`.
3. Follow setup steps in `apps-script/SETUP.md`.

This setup enables:
- Email booking notifications
- Google Sheets booking log
- SMS notifications to your cell phone (when Twilio values are configured)

## Branding

The UI is styled around the supplied YouR logo:
- Green: `#16c878`
- Blue: `#3855ad`
- White canvas with black uppercase supporting text

These are defined as CSS variables in `styles.css`.

## Notes

- Local bookings are still saved in browser localStorage.
- For production, keep endpoint credentials server-side and secure access as needed.
