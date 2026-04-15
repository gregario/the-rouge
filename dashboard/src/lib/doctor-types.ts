// Shared types for the structured doctor result produced by
// src/launcher/doctor.js and consumed by the wizard.

export type DoctorStatus = "ok" | "blocker" | "warning";

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  detail: string;
  installHint?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  blockers: string[];
  warnings: string[];
  allGreen: boolean;
  allRequired: boolean;
}
