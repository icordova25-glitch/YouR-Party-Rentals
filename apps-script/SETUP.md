# Google Apps Script Setup

This connects your website booking form to:
- Email notifications
- Google Sheets logging
- SMS text to your cell phone number (optional, via Twilio)

## 1. Create a Google Sheet

1. Create a new Google Sheet for bookings.
2. Copy the Sheet ID from the URL.

Example URL:
https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit

## 2. Create a Google Apps Script project

1. Go to script.google.com.
2. Create a new project.
3. Replace Code.gs with the code from apps-script/Code.gs.

## 3. Add Script Properties

In Apps Script:
- Project Settings
- Script properties

Add these properties:
- SHEET_ID = your Google Sheet ID
- SHEET_NAME = Bookings
- NOTIFY_EMAIL = your email address
- NOTIFY_PHONE = your phone number in +1XXXXXXXXXX format

Optional Twilio properties (required only if you want SMS):
- TWILIO_ACCOUNT_SID = your Twilio SID
- TWILIO_AUTH_TOKEN = your Twilio auth token
- TWILIO_FROM_NUMBER = your Twilio phone number in +1XXXXXXXXXX format

## 4. Deploy as Web App

1. Deploy > New deployment.
2. Type: Web app.
3. Execute as: Me.
4. Who has access: Anyone.
5. Deploy and copy the Web App URL.

## 5. Connect website config

Open config.js and set:
- bookingEndpoint to your Web App URL
- businessEmail to your public contact email
- businessPhone to your business cell number

Example:

window.YPR_CONFIG = {
  bookingEndpoint: "https://script.google.com/macros/s/XXXXX/exec",
  businessEmail: "bookings@yourrpartyrentals.com",
  businessPhone: "+15551234567",
};

## 6. Test end to end

1. Open index.html.
2. Select a date and submit a booking.
3. Confirm:
- New row appears in Google Sheet
- Email arrives
- SMS arrives (if Twilio values were configured)

## Notes

- If bookingEndpoint is blank, form still works locally and stores bookings in browser storage.
- Keep Twilio auth token only in Apps Script properties, not in frontend files.
