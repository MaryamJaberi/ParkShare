import type { Language, ReservationStatus, ResourceType, DeploymentModel } from '../types/parkshare.ts';
import { EN_TO_NL } from './nlDictionary.ts';
import { EN_TO_AR, EN_TO_ES, EN_TO_TR } from './extraLanguages.ts';

export const SUPPORTED_LANGUAGES: { code: Language; short: string; label: string }[] = [
  { code: 'nl', short: 'NL', label: 'Nederlands' },
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'fa', short: 'FA', label: 'فارسی' },
  { code: 'ar', short: 'AR', label: 'العربية' },
  { code: 'tr', short: 'TR', label: 'Türkçe' },
  { code: 'es', short: 'ES', label: 'Español' },
];

export function isRtlLanguage(lang: Language): boolean {
  return lang === 'fa' || lang === 'ar';
}

export const resourceTypeLabels: Record<ResourceType, { fa: string; en: string; nl: string; ar: string; tr: string; es: string }> = {
  parking: { fa: 'پارکینگ خودرو', en: 'Parking Space', nl: 'Parkeerplaats', ar: 'موقف سيارة', tr: 'Park Yeri', es: 'Plaza de aparcamiento' },
  boat_berth: { fa: 'جایگاه قایق', en: 'Boat Berth', nl: 'Ligplaats', ar: 'مرسى قارب', tr: 'Tekne Yeri', es: 'Amarre' },
  storage: { fa: 'فضای انبار', en: 'Storage Space', nl: 'Berging', ar: 'مساحة تخزين', tr: 'Depo', es: 'Trastero' },
  commercial: { fa: 'فضای تجاری', en: 'Commercial Bay', nl: 'Commerciële plek', ar: 'موقف تجاري', tr: 'Ticari Alan', es: 'Plaza comercial' },
};

export const deploymentLabels: Record<DeploymentModel, { fa: string; en: string; nl: string; ar: string; tr: string; es: string }> = {
  self_hosted: { fa: 'میزبانی مستقل (Self-hosted)', en: 'Self-hosted (Independent)', nl: 'Zelf gehost (Onafhankelijk)', ar: 'استضافة ذاتية', tr: 'Kendi Sunucusunda', es: 'Autoalojado' },
  dedicated_cloud: { fa: 'ابر اختصاصی با کلید مشتری', en: 'Dedicated Cloud (CMK)', nl: 'Eigen Cloud (CMK-versleuteling)', ar: 'سحابة مخصصة', tr: 'Özel Bulut (CMK)', es: 'Nube dedicada (CMK)' },
  shared_saas: { fa: 'زیرساخت مشترک چندمستاجره', en: 'Shared Multi-tenant SaaS', nl: 'Gedeelde Multi-tenant SaaS', ar: 'سحابة مشتركة', tr: 'Paylaşımlı SaaS', es: 'SaaS compartido' },
};

export const reservationStatusLabels: Record<ReservationStatus, { fa: string; en: string; nl: string; ar: string; tr: string; es: string }> = {
  Draft: { fa: 'پیش‌نویس', en: 'Draft', nl: 'Concept', ar: 'مسودة', tr: 'Taslak', es: 'Borrador' },
  Pending: { fa: 'در انتظار تأیید', en: 'Pending', nl: 'In afwachting', ar: 'قيد الانتظار', tr: 'Beklemede', es: 'Pendiente' },
  Confirmed: { fa: 'قطعی‌شده', en: 'Confirmed', nl: 'Bevestigd', ar: 'مؤكد', tr: 'Onaylandı', es: 'Confirmada' },
  Active: { fa: 'در حال استفاده', en: 'Active', nl: 'Actief', ar: 'نشط', tr: 'Aktif', es: 'Activa' },
  Completed: { fa: 'پایان‌یافته', en: 'Completed', nl: 'Afgerond', ar: 'مكتمل', tr: 'Tamamlandı', es: 'Completada' },
  Cancelled: { fa: 'لغوشده', en: 'Cancelled', nl: 'Geannuleerd', ar: 'ملغى', tr: 'İptal edildi', es: 'Cancelada' },
  Expired: { fa: 'منقضی', en: 'Expired', nl: 'Verlopen', ar: 'منتهي', tr: 'Süresi doldu', es: 'Expirada' },
  Disputed: { fa: 'مورد اختلاف', en: 'Disputed', nl: 'Geschil', ar: 'متنازع عليه', tr: 'İhtilaflı', es: 'En disputa' },
  'Relocation Pending': { fa: 'نیازمند جابه‌جایی', en: 'Relocation Pending', nl: 'Verplaatsing vereist', ar: 'بانتظار النقل', tr: 'Yer Değişikliği', es: 'Reubicación pendiente' },
};

export function t(lang: Language, fa: string, en: string, nl?: string): string {
  if (lang === 'fa') return fa;
  if (lang === 'nl') return nl ?? EN_TO_NL[en] ?? en;
  if (lang === 'ar') return EN_TO_AR[en] ?? en;
  if (lang === 'tr') return EN_TO_TR[en] ?? en;
  if (lang === 'es') return EN_TO_ES[en] ?? en;
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
