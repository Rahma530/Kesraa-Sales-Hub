import * as XLSX from "xlsx";

export type DataRow = {
  phone: string;
  storeUrl?: string;
  answered: boolean;
  meetingHeld: boolean;
  followUpDate?: Date;
  comment?: string;
  comment2?: string;
};

export type ParsedDataWorkbook = {
  // Sheet/tab name → rows that belong to it. The caller matches the tab
  // name against an employee's name — this function knows nothing about
  // employees.
  bySheet: Record<string, DataRow[]>;
};

function normalizeHeader(h: string) {
  return String(h ?? "").trim().toLowerCase();
}

// العمود الأول في الأعمدة دي اللي وصلنا في ملف الاختبار؛ باقي القيم أسماء
// بديلة محتملة لو الصياغة اتغيرت شوية.
const PHONE_HEADERS = ["phone number", "phone", "رقم الهاتف", "الهاتف"];
const STORE_URL_HEADERS = ["store link", "storeurl", "رابط المتجر", "لينك المتجر"];
const ANSWERED_HEADERS = ["answer", "answered", "رد"];
const MEETING_HEADERS = ["held meeting", "meeting held", "اجتماع"];
const FOLLOW_DATE_HEADERS = ["date follow", "follow date", "تاريخ المتابعة"];
const COMMENT_HEADERS = ["comment", "تعليق"];
const COMMENT2_HEADERS = ["comment 2", "comment2", "تعليق 2"];

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.includes(h));
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "نعم";
}

function toPhone(value: unknown): string {
  if (typeof value === "number") {
    // Excel stores a long phone number as a float (e.g. 966500200598.0) —
    // round-trip through a plain integer string so it doesn't come out as
    // "966500200598.0" or scientific notation.
    return String(Math.trunc(value));
  }
  return String(value ?? "").trim();
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * يقرا Workbook فيه sheet/tab منفصل لكل موظفة، ويرجع صفوف كل tab منظمة.
 * بيتجاهل تمامًا أي صف من غير رقم تليفون حقيقي (زي صفوف الأمثلة
 * التوضيحية الموجودة في ملف الاختبار).
 */
export function parseTeleSalesDataWorkbook(buffer: Buffer): ParsedDataWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const bySheet: Record<string, DataRow[]> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (matrix.length === 0) continue;

    const [headerRow, ...dataRows] = matrix;
    const headers = headerRow.map((h) => normalizeHeader(String(h ?? "")));

    const phoneCol = findColumn(headers, PHONE_HEADERS);
    if (phoneCol === -1) continue; // sheet مش بالشكل المتوقع — متجاهله

    const storeUrlCol = findColumn(headers, STORE_URL_HEADERS);
    const answeredCol = findColumn(headers, ANSWERED_HEADERS);
    const meetingCol = findColumn(headers, MEETING_HEADERS);
    const followDateCol = findColumn(headers, FOLLOW_DATE_HEADERS);
    const commentCol = findColumn(headers, COMMENT_HEADERS);
    const comment2Col = findColumn(headers, COMMENT2_HEADERS);

    const rows: DataRow[] = [];
    for (const row of dataRows) {
      const rawPhone = row[phoneCol];
      if (rawPhone === null || rawPhone === undefined || String(rawPhone).trim() === "") continue;
      const phone = toPhone(rawPhone);
      if (!phone) continue;

      rows.push({
        phone,
        storeUrl: storeUrlCol !== -1 ? (row[storeUrlCol] ? String(row[storeUrlCol]).trim() : undefined) : undefined,
        answered: answeredCol !== -1 ? toBool(row[answeredCol]) : false,
        meetingHeld: meetingCol !== -1 ? toBool(row[meetingCol]) : false,
        followUpDate: followDateCol !== -1 ? toDate(row[followDateCol]) : undefined,
        comment: commentCol !== -1 ? (row[commentCol] ? String(row[commentCol]).trim() : undefined) : undefined,
        comment2: comment2Col !== -1 ? (row[comment2Col] ? String(row[comment2Col]).trim() : undefined) : undefined,
      });
    }

    if (rows.length > 0) bySheet[sheetName.trim()] = rows;
  }

  return { bySheet };
}
