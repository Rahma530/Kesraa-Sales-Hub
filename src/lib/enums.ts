export enum Role {
  ADMIN = "ADMIN",
  HEAD_OF_SALES = "HEAD_OF_SALES",
  HEAD_OF_TELE_SALES = "HEAD_OF_TELE_SALES",
  TELE_SALES = "TELE_SALES",
  SALES = "SALES"
}
export enum LeadStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  NO_ANSWER = "NO_ANSWER",
  NOT_AVAILABLE = "NOT_AVAILABLE",
  NEEDS_FOLLOWUP = "NEEDS_FOLLOWUP",
  INTERESTED = "INTERESTED",
  NOT_INTERESTED = "NOT_INTERESTED",
  HOT = "HOT",
  COLD = "COLD",
  MEETING_SCHEDULED = "MEETING_SCHEDULED",
  MEETING_DONE = "MEETING_DONE",
  TRANSFERRED_TO_SALES = "TRANSFERRED_TO_SALES",
  CLOSED_WON = "CLOSED_WON",
  CLOSED_LOST = "CLOSED_LOST"
}
export enum LeadTier {
  WARM = "WARM",
  HOT = "HOT",
  COLD = "COLD"
}
export enum MeetingStatus {
  SCHEDULED = "SCHEDULED",
  DONE = "DONE",
  POSTPONED = "POSTPONED",
  CANCELLED = "CANCELLED"
}
export enum LeadSource {
  EXCEL_UPLOAD = "EXCEL_UPLOAD",
  MANUAL = "MANUAL",
  ADS_SHEET = "ADS_SHEET"
}

// Lead.acquisitionType — only set on ADS_SHEET leads: was this a paid ad
// or did the customer come in on their own (organic)?
export enum LeadAcquisitionType {
  ADS = "ADS",
  ORGANIC = "ORGANIC"
}

// Lead.currentStage can also be this value while an ADS_SHEET lead is
// waiting for Head of Tele-Sales to assign + classify it. Not a Prisma
// enum (currentStage is a plain String) so it's just a shared constant.
export const PENDING_REVIEW_STAGE = "PENDING_REVIEW";
export enum ActivityType {
  STATUS_CHANGE = "STATUS_CHANGE",
  FOLLOWUP_CREATED = "FOLLOWUP_CREATED",
  FOLLOWUP_COMPLETED = "FOLLOWUP_COMPLETED",
  MEETING_SCHEDULED = "MEETING_SCHEDULED",
  MEETING_UPDATED = "MEETING_UPDATED",
  TRANSFERRED = "TRANSFERRED",
  NOTE = "NOTE",
  LEAD_CREATED = "LEAD_CREATED",
  LEAD_ASSIGNED = "LEAD_ASSIGNED"
}
