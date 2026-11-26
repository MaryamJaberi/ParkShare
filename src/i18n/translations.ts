import type { Language, ReservationStatus, ResourceType, DeploymentModel } from '../types/parkshare.ts';
import { EN_TO_NL } from './nlDictionary.ts';

export const resourceTypeLabels: Record<ResourceType, { fa: string; en: string; nl: string }> = {
  parking: { fa: 'پارکینگ خودرو', en: 'Parking Space', nl: 'Parkeerplaats' },
  boat_berth: { fa: 'جایگاه قایق', en: 'Boat Berth', nl: 'Ligplaats' },
  storage: { fa: 'فضای انبار', en: 'Storage Space', nl: 'Berging' },
  commercial: { fa: 'فضای تجاری', en: 'Commercial Bay', nl: 'Commerciële plek' },
};

export const deploymentLabels: Record<DeploymentModel, { fa: string; en: string; nl: string }> = {
  self_hosted: { fa: 'میزبانی مستقل (Self-hosted)', en: 'Self-hosted (Independent)', nl: 'Zelf gehost (Onafhankelijk)' },
  dedicated_cloud: { fa: 'ابر اختصاصی با کلید مشتری', en: 'Dedicated Cloud (CMK)', nl: 'Eigen Cloud (CMK-versleuteling)' },
  shared_saas: { fa: 'زیرساخت مشترک چندمستاجره', en: 'Shared Multi-tenant SaaS', nl: 'Gedeelde Multi-tenant SaaS' },
};

export const reservationStatusLabels: Record<ReservationStatus, { fa: string; en: string; nl: string }> = {
  Draft: { fa: 'پیش‌نویس', en: 'Draft', nl: 'Concept' },
  Pending: { fa: 'در انتظار تأیید', en: 'Pending', nl: 'In afwachting' },
  Confirmed: { fa: 'قطعی‌شده', en: 'Confirmed', nl: 'Bevestigd' },
  Active: { fa: 'در حال استفاده', en: 'Active', nl: 'Actief' },
  Completed: { fa: 'پایان‌یافته', en: 'Completed', nl: 'Afgerond' },
  Cancelled: { fa: 'لغوشده', en: 'Cancelled', nl: 'Geannuleerd' },
  Expired: { fa: 'منقضی', en: 'Expired', nl: 'Verlopen' },
  Disputed: { fa: 'مورد اختلاف', en: 'Disputed', nl: 'Geschil' },
  'Relocation Pending': { fa: 'نیازمند جابه‌جایی', en: 'Relocation Pending', nl: 'Verplaatsing vereist' },
};

export function t(lang: Language, fa: string, en: string, nl?: string): string {
  if (lang === 'fa') return fa;
  if (lang === 'nl') return nl ?? EN_TO_NL[en] ?? en;
  return en;
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
  if (lang === 'nl') {
    if (m === 0) return `${h}u`;
    if (h === 0) return `${m}m`;
    return `${h}u ${m}m`;
  }
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
