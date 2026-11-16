import { JWT } from "google-auth-library";

/**
 * قراءة بيانات من Google Sheet عن طريق Service Account — مفيش أي تسجيل
 * دخول شخصي مطلوب، بس لازم الـ Sheet يكون متشارك (Viewer) مع إيميل الـ
 * Service Account قبل ما نقدر نقراه.
 *
 * Env vars مطلوبة:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (القيمة اللي جايه من ملف الـ JSON،
 *   لو اتلصقت كـ environment variable هتحتاج تستبدل الأسطر الحقيقية بـ \n)
 */

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function getClient(): JWT {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Google Sheets isn't configured on the server yet — GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are missing."
    );
  }

  // When a private key is pasted into an env var, its real newlines are
  // usually escaped as the two characters "\n" — turn them back into real
  // newlines or the key fails to parse.
  const key = rawKey.replace(/\\n/g, "\n");

  return new JWT({
    email,
    key,
    scopes: [SHEETS_SCOPE],
  });
}

/** يستخرج الـ Spreadsheet ID من أي لينك Google Sheets كامل. */
export function extractSpreadsheetId(sheetUrl: string): string {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("This doesn't look like a valid Google Sheets link.");
  }
  return match[1];
}

/**
 * بيرجع كل صفوف أول ورقة (Sheet) في الملف كـ array of string arrays،
 * شاملة صف الـ headers نفسه كأول عنصر.
 */
export async function fetchSheetRows(sheetUrl: string): Promise<string[][]> {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  const client = getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken.token) {
    throw new Error("Couldn't authenticate with Google — check the service account credentials.");
  }

  // A1:Z بدل تحديد اسم Sheet معين، عشان يشتغل مهما كان اسم الورقة الأولى،
  // ويغطي لحد عمود Z وده أكتر بكتير من عدد الأعمدة الحالي.
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${accessToken.token}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        "Couldn't open the sheet — make sure it's shared (Viewer) with the service account's email, and that the link is correct."
      );
    }
    throw new Error(`Google Sheets API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

export type AdsSheetLeadRow = {
  name: string;
  phone: string;
  need?: string;
  storeUrl?: string;
  socialMediaUrl?: string;
  acquisitionType?: string;
  platform?: string;
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

// تطابق أسماء أعمدة الـ Ads Sheet (زي ما هي في شيت الإعلانات الحالي) مع
// الحقول اللي بنخزنها. مكتوبة lowercase لإن normalizeHeader بتحول الهيدر
// الأصلي لـ lowercase قبل المقارنة.
const HEADER_MAP: Record<string, keyof AdsSheetLeadRow> = {
  "customer name": "name",
  "phone number": "phone",
  "comment": "need",
  "link/url": "_link", // معالجة خاصة تحت (محتاج نعرف store ولا social)
  "source": "acquisitionType",
  "platform": "platform",
} as any;

function classifyLink(url: string): "storeUrl" | "socialMediaUrl" {
  const lower = url.toLowerCase();
  if (lower.includes("instagram.com") || lower.includes("facebook.com") || lower.includes("tiktok.com")) {
    return "socialMediaUrl";
  }
  return "storeUrl";
}

/**
 * يحول الصفوف الخام (array of arrays) لـ objects منظمة حسب الـ headers،
 * ويطبق نفس منطق تصنيف اللينك (متجر/سوشيال ميديا) ونوع الـ acquisition.
 * بيتجاهل تمامًا الأعمدة الخاصة بمراحل بعد التوزيع (tele name, sales
 * comment, meetings, Sales Man, Paid...) لإنها مش جزء من بيانات العميل
 * الخام — النظام نفسه هيتابع المراحل دي بعد كده.
 */
export function mapSheetRowsToLeads(rows: string[][]): AdsSheetLeadRow[] {
  if (rows.length === 0) return [];

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(normalizeHeader);

  const result: AdsSheetLeadRow[] = [];

  for (const row of dataRows) {
    const lead: Partial<AdsSheetLeadRow> & { _link?: string } = {};

    headers.forEach((header, i) => {
      const field = HEADER_MAP[header];
      const value = row[i]?.trim();
      if (!field || !value) return;
      (lead as any)[field] = value;
    });

    if (!lead.name || !lead.phone) continue; // صف ناقص بيانات أساسية — متجاهله

    if (lead._link) {
      lead[classifyLink(lead._link)] = lead._link;
      delete lead._link;
    }

    // توحيد "ADS"/"Ads"/"ads" وما شابه لـ ADS، ونفس الكلام لـ ORGANIC —
    // الشيت بتتكتب فيه القيم يدوي فمحتمل يبقى شكلها مختلف شوية كل مرة.
    if (lead.acquisitionType) {
      const normalized = lead.acquisitionType.trim().toLowerCase();
      if (normalized.startsWith("ad")) lead.acquisitionType = "ADS";
      else if (normalized.startsWith("org")) lead.acquisitionType = "ORGANIC";
    }

    result.push(lead as AdsSheetLeadRow);
  }

  return result;
}
