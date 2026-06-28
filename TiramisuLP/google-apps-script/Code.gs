const SHEET_NAME = 'registrations';
const MAX_DISCOUNT_SLOTS = 200;

function doGet() {
  try {
    const sheet = getSheet_();
    const rows = getRowObjects_(sheet);
    const payload = buildSummary_(rows);
    return jsonOutput_(payload);
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: error.message,
    });
  }
}

function doPost(e) {
  try {
    const sheet = getSheet_();
    const data = normalizeSubmission_(e && e.parameter ? e.parameter : {});

    validateSubmission_(data);

    sheet.appendRow([
      new Date(),
      data.source,
      data.clinicName,
      data.prefecture,
      data.addressLine,
      data.contactName,
      data.email,
      data.phone,
      data.clinicScale,
      data.desiredTiming,
      data.aiQuestion,
    ]);

    const rows = getRowObjects_(sheet);
    return jsonOutput_({
      ok: true,
      message: 'registered',
      summary: buildSummary_(rows),
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: error.message,
    });
  }
}

function normalizeSubmission_(params) {
  return {
    source: valueOrEmpty_(params.source),
    clinicName: valueOrEmpty_(params.clinicName || params.clinic_name),
    prefecture: valueOrEmpty_(params.prefecture),
    addressLine: valueOrEmpty_(params.addressLine || params.city),
    contactName: valueOrEmpty_(params.contactName || params.contact_name),
    email: valueOrEmpty_(params.email).toLowerCase(),
    phone: valueOrEmpty_(params.phone),
    clinicScale: valueOrEmpty_(params.clinicScale || params.clinic_size),
    desiredTiming: valueOrEmpty_(params.desiredTiming || params.timing),
    aiQuestion: valueOrEmpty_(params.aiQuestion || params.message),
  };
}

function validateSubmission_(data) {
  const requiredFields = [
    ['clinicName', '院名・法人名'],
    ['prefecture', '都道府県'],
    ['addressLine', '市区町村以降'],
    ['contactName', '代表者名 / 担当者名'],
    ['email', 'メール'],
    ['phone', '電話番号'],
    ['clinicScale', '院の規模'],
    ['desiredTiming', '導入希望時期'],
  ];

  requiredFields.forEach(function(field) {
    if (!data[field[0]]) {
      throw new Error(field[1] + ' は必須です。');
    }
  });
}

function buildSummary_(rows) {
  const registeredCount = rows.length;
  const prefectureSet = {};
  const clinicSize = {
    single: 0,
    small: 0,
    medium: 0,
    enterprise: 0,
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth();

  let monthlyIncrease = 0;

  rows.forEach(function(row) {
    if (row.prefecture) {
      prefectureSet[row.prefecture] = true;
    }

    switch (row.clinicScale) {
      case '1店舗':
        clinicSize.single += 1;
        break;
      case '2〜5店舗':
        clinicSize.small += 1;
        break;
      case '6〜20店舗':
        clinicSize.medium += 1;
        break;
      case '21店舗以上':
        clinicSize.enterprise += 1;
        break;
    }

    if (row.createdAt instanceof Date &&
        row.createdAt.getFullYear() === previousYear &&
        row.createdAt.getMonth() === previousMonth) {
      monthlyIncrease += 1;
    }
  });

  return {
    registeredCount: registeredCount,
    monthlyIncrease: monthlyIncrease,
    prefectureCount: Object.keys(prefectureSet).length,
    launchMonth: getScriptProperty_('LAUNCH_MONTH', '2026年10月'),
    lastUpdated: formatDateJP_(now),
    clinicSize: clinicSize,
    remainingSlots: Math.max(0, MAX_DISCOUNT_SLOTS - registeredCount),
  };
}

function getSheet_() {
  const spreadsheetId = getRequiredProperty_('SPREADSHEET_ID');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  ensureHeader_(sheet);
  return sheet;
}

function ensureHeader_(sheet) {
  const headers = [
    'createdAt',
    'source',
    'clinicName',
    'prefecture',
    'addressLine',
    'contactName',
    'email',
    'phone',
    'clinicScale',
    'desiredTiming',
    'aiQuestion',
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const headerMismatch = headers.some(function(header, index) {
    return currentHeaders[index] !== header;
  });

  if (headerMismatch) {
    throw new Error('registrations シートのヘッダーが想定と一致しません。README の定義を確認してください。');
  }
}

function getRowObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return values
    .filter(function(row) {
      return row[2];
    })
    .map(function(row) {
      return {
        createdAt: row[0],
        source: row[1],
        clinicName: row[2],
        prefecture: row[3],
        addressLine: row[4],
        contactName: row[5],
        email: row[6],
        phone: row[7],
        clinicScale: row[8],
        desiredTiming: row[9],
        aiQuestion: row[10],
      };
    });
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatDateJP_(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy年M月d日');
}

function getRequiredProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(key + ' が Script Properties に設定されていません。');
  }
  return value;
}

function getScriptProperty_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback;
}

function valueOrEmpty_(value) {
  return (value || '').toString().trim();
}
