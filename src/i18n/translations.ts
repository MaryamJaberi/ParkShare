import type { Language, ReservationStatus, ResourceType, DeploymentModel } from '../types/parkshare.ts';

export const resourceTypeLabels: Record<ResourceType, { fa: string; en: string }> = {
  parking: { fa: 'پارکینگ خودرو', en: 'Parking Space' },
  boat_berth: { fa: 'جایگاه قایق', en: 'Boat Berth' },
  storage: { fa: 'فضای انبار', en: 'Storage Space' },
  commercial: { fa: 'فضای تجاری', en: 'Commercial Bay' },
};

export const deploymentLabels: Record<DeploymentModel, { fa: string; en: string }> = {
  self_hosted: { fa: 'میزبانی مستقل (Self-hosted)', en: 'Self-hosted (Independent)' },
  dedicated_cloud: { fa: 'ابر اختصاصی با کلید مشتری', en: 'Dedicated Cloud (CMK)' },
  shared_saas: { fa: 'زیرساخت مشترک چندمستاجره', en: 'Shared Multi-tenant SaaS' },
};

export const reservationStatusLabels: Record<ReservationStatus, { fa: string; en: string }> = {
  Draft: { fa: 'پیش‌نویس', en: 'Draft' },
  Pending: { fa: 'در انتظار تأیید', en: 'Pending' },
  Confirmed: { fa: 'قطعی‌شده', en: 'Confirmed' },
  Active: { fa: 'در حال استفاده', en: 'Active' },
  Completed: { fa: 'پایان‌یافته', en: 'Completed' },
  Cancelled: { fa: 'لغوشده', en: 'Cancelled' },
  Expired: { fa: 'منقضی', en: 'Expired' },
  Disputed: { fa: 'مورد اختلاف', en: 'Disputed' },
  'Relocation Pending': { fa: 'نیازمند جابه‌جایی', en: 'Relocation Pending' },
};

export function t(lang: Language, fa: string, en: string): string {
  return lang === 'fa' ? fa : en;
}

export function formatMinutes(mins: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(mins: number, lang: Language): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (lang === 'fa') {
    if (m === 0) return `${h} ساعت`;
    if (h === 0) return `${m} دقیقه`;
    return `${h} ساعت و ${m} دقیقه`;
  }
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
