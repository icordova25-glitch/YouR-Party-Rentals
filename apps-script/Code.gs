function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var sheetId = props.getProperty('SHEET_ID');
    var sheetName = props.getProperty('SHEET_NAME') || 'Bookings';
    var notifyEmail = props.getProperty('NOTIFY_EMAIL');
    var notifyPhone = props.getProperty('NOTIFY_PHONE');

    var twilioSid = props.getProperty('TWILIO_ACCOUNT_SID');
    var twilioToken = props.getProperty('TWILIO_AUTH_TOKEN');
    var twilioFrom = props.getProperty('TWILIO_FROM_NUMBER');

    if (!sheetId || !notifyEmail) {
      return jsonResponse({
        ok: false,
        error: 'Missing SHEET_ID or NOTIFY_EMAIL script properties.',
      }, 400);
    }

    var payload = JSON.parse(e.postData.contents || '{}');
    validatePayload(payload);

    appendBookingRow(sheetId, sheetName, payload);
    sendBookingEmail(notifyEmail, payload);

    if (notifyPhone && twilioSid && twilioToken && twilioFrom) {
      sendBookingSms(twilioSid, twilioToken, twilioFrom, notifyPhone, payload);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'YouR Party Rentals booking endpoint',
  }, 200);
}

function validatePayload(payload) {
  if (!payload.fullName) {
    throw new Error('fullName is required');
  }
  if (!payload.email) {
    throw new Error('email is required');
  }
  if (!payload.selectedDate) {
    throw new Error('selectedDate is required');
  }
}

function appendBookingRow(sheetId, sheetName, payload) {
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      'Created At',
      'Name',
      'Email',
      'Date',
      'Tables',
      'Chairs',
      'Canopies',
      'Fans',
      'Ice Chests',
      'Quote Total',
      'Notes',
    ]);
  }

  sheet.appendRow([
    payload.createdAt || new Date().toISOString(),
    payload.fullName || '',
    payload.email || '',
    payload.selectedDate || '',
    Number(payload.tables || 0),
    Number(payload.chairs || 0),
    Number(payload.canopies || 0),
    Number(payload.fans || 0),
    Number(payload.iceChests || 0),
    Number(payload.quoteTotal || 0),
    payload.notes || '',
  ]);
}

function sendBookingEmail(toEmail, payload) {
  var subject = 'New Booking Request: ' + payload.selectedDate;
  var lines = [
    'New rental booking received.',
    '',
    'Name: ' + payload.fullName,
    'Email: ' + payload.email,
    'Date: ' + payload.selectedDate,
    '',
    'Items:',
    '- Tables: ' + Number(payload.tables || 0),
    '- Chairs: ' + Number(payload.chairs || 0),
    '- Canopies: ' + Number(payload.canopies || 0),
    '- Fans: ' + Number(payload.fans || 0),
    '- Ice Chests: ' + Number(payload.iceChests || 0),
    '',
    'Quote Total: $' + Number(payload.quoteTotal || 0).toFixed(2),
    '',
    'Notes: ' + (payload.notes || '(none)'),
  ];

  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    body: lines.join('\n'),
  });
}

function sendBookingSms(accountSid, authToken, fromNumber, toNumber, payload) {
  var message =
    'New booking: ' +
    payload.selectedDate +
    ' | ' +
    payload.fullName +
    ' | Total $' +
    Number(payload.quoteTotal || 0).toFixed(2);

  var url = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json';
  var auth = Utilities.base64Encode(accountSid + ':' + authToken);

  var options = {
    method: 'post',
    payload: {
      To: toNumber,
      From: fromNumber,
      Body: message,
    },
    headers: {
      Authorization: 'Basic ' + auth,
    },
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() >= 300) {
    throw new Error('Twilio SMS failed: ' + response.getContentText());
  }
}

function jsonResponse(payload, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
