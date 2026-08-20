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
3. Log in with the temporary admin username/password: `admin` / `yourr-admin`.
4. After signing in, use the Admin Login Credentials section to change the username and password.
5. Upload images with an optional caption; they're saved to `uploads/gallery/` on the server and immediately appear in the public gallery on `index.html` for every visitor.
6. Delete images from the admin panel as needed.

Images and metadata are stored under `data/gallery.json` and `uploads/gallery/` (both git-ignored/created automatically). Change the default admin credentials before deploying publicly.

The admin page also includes private fields for payment deposit banking information and booking confirmation notification email/phone details. These are stored in `data/business-settings.json` and are available only through authenticated admin requests. Each uploaded gallery image includes a `Preview` button that opens a larger modal preview before publishing or deleting decisions.

The same admin page includes inventory and price editing for tables, chairs, canopies, fans, and ice chests. It also supports up to four packages; saved packages appear on the public booking page and can prefill the rental quantities.

## Booking Notifications (Real Sending)

Every booking submitted on the public site is sent to the server at `POST /api/bookings`, which:
- Saves the booking to `data/bookings.json` (viewable in the admin **Recent Booking Requests** panel).
- Attempts to send a real email to the address in **Notification Email** (Business Settings) via SMTP.
- Attempts to send a real SMS to the number in **Notification Phone** via Twilio.

Both attempts report an honest `sent` / `not sent` status back to the customer and to the admin log — nothing is falsely reported as delivered. To make delivery actually work, set these environment variables before starting `server.py`:

```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=bookings@yourrpartyrentals.com

TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_FROM_NUMBER=+15551234567
```

If these are not set, bookings still save and the admin log clearly shows "SMTP not configured" / "Twilio not configured" instead of pretending to send.

## Payments and Bank Deposits (Important)

The **Payment Deposit Information** fields (account holder, bank name, account/routing number) in the admin page are stored for your own records only. No money moves as a result of filling in that form — there is no payment processor connected to it.

The only real payment step is `paymentCheckoutUrl` in `config.js`, which redirects the customer to a Stripe Payment Link (or similar hosted checkout) that you create yourself in your own Stripe/payment-provider account. Money deposits to whichever bank account you configured **directly in that provider's dashboard**, not from this site. Set up a real Stripe Payment Link before launch or no payment will be collected.

## Integrations

1. Configure frontend contact and endpoint in `config.js`.
2. Deploy Google Apps Script endpoint from `apps-script/Code.gs`.
3. Follow setup steps in `apps-script/SETUP.md`.

This setup enables:
- Email booking notifications
- Google Sheets booking log
- SMS notifications to your cell phone (when Twilio values are configured)

This Google Sheets/Apps Script integration is optional and separate from the built-in `/api/bookings` notification flow described above; both can run at the same time.

## Branding

The UI is styled around the supplied YouR logo:
- Green: `#16c878`
- Blue: `#3855ad`
- White canvas with black uppercase supporting text

These are defined as CSS variables in `styles.css`.

## Notes

- Local bookings are still saved in browser localStorage.
- For production, keep endpoint credentials server-side and secure access as needed.
