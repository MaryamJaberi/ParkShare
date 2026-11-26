import type { Language, ReservationStatus, ResourceType, DeploymentModel } from '../types/parkshare.ts';

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

const EN_TO_NL: Record<string, string> = {
  // Navigation & Roles
  'Platform Overview': 'Platformoverzicht',
  'Overview': 'Overzicht',
  'Building Managers': 'Gebouwbeheerders',
  'Managers': 'Beheerders',
  'Buildings & Federation': 'Gebouwen & Federatie',
  'Buildings': 'Gebouwen',
  'Activity & Audit': 'Activiteit & Audit',
  'Activity': 'Activiteit',
  'Building Manager': 'Gebouwbeheerder',
  'Manager': 'Beheerder',
  'Resident App': 'Bewonersapp',
  'Resident': 'Bewoner',
  'Bookings & Schedule': 'Reserveringen & Planning',
  'Bookings': 'Reserveringen',
  'Trust & Privacy Center': 'Vertrouwen & Privacy',
  'Privacy': 'Privacy',
  'WhatsApp Bot': 'WhatsApp-bot',
  'Sign Out': 'Uitloggen',
  'Close': 'Sluiten',
  'Back to Manager': 'Terug naar beheerder',
  'Account and sign out': 'Account en uitloggen',

  // Auth & Onboarding
  'Sign In': 'Inloggen',
  'Manager Login': 'Beheerder inloggen',
  'Resident Login': 'Bewoner inloggen',
  'Register Manager': 'Beheerder registreren',
  'Create Manager Account': 'Beheerdersaccount aanmaken',
  'Resident Sign Up': 'Bewoner registreren',
  'Username': 'Gebruikersnaam',
  'Password': 'Wachtwoord',
  'Full Name': 'Volledige naam',
  'Display Name': 'Weergavenaam',
  'Private & Secure Building Parking Sharing': 'Veilig & privé parkeerplaatsen delen met buren',
  'Invite Link': 'Uitnodigingslink',
  'Verify & Continue': 'Verifiëren & doorgaan',
  'Platform Owner': 'Platformeigenaar',
  'Platform Owner Login': 'Platformeigenaar inloggen',
  'Invalid invite link.': 'Ongeldige uitnodigingslink.',

  // Building Manager & Catalog
  'Overview & Invite': 'Overzicht & Uitnodiging',
  'Parking Catalog': 'Parkeercatalogus',
  'Resident Whitelist': 'Bewonerslijst (Whitelist)',
  'Fair-Use & Requests': 'Fair-Use & Verzoeken',
  'Active Bays': 'Actieve plekken',
  'Whitelisted Residents': 'Geregistreerde bewoners',
  'Pending Requests': 'Openstaande verzoeken',
  'Blocked Outsiders': 'Geblokkeerde buitenstaanders',
  'Private Encrypted Building Tenant': 'Versleutelde privé-omgeving van het gebouw',
  'Free Only': 'Alleen gratis',
  'Free or Paid': 'Gratis of betaald',
  'Add Building': 'Gebouw toevoegen',
  'Load Sample Building': 'Voorbeeldgebouw laden',
  'Copy Invite Link': 'Uitnodigingslink kopiëren',
  'Copied': 'Gekopieerd',
  'Active': 'Actief',
  'Inactive': 'Inactief',
  'Search': 'Zoeken',
  'Filter': 'Filteren',
  'All': 'Alle',

  // Resident App & Bookings
  'Temporary Parking': 'Tijdelijk parkeren',
  'Available Bays': 'Beschikbare plekken',
  'Find Parking': 'Parkeerplek zoeken',
  'Book Now': 'Nu reserveren',
  'Confirm Booking': 'Reservering bevestigen',
  'Cancel': 'Annuleren',
  'Approve': 'Goedkeuren',
  'Reject': 'Afwijzen',
  'Start Time': 'Begintijd',
  'End Time': 'Eindtijd',
  'Free': 'Gratis',
  'Instant Approval': 'Directe bevestiging',
  'Manual Approval': 'Handmatige goedkeuring',
  'EV Charging': 'Laadpaal (EV)',
  'Schedule & Booking Management': 'Planning & Reserveringsbeheer',

  // Trust & Privacy
  'Why You Can Trust ParkShare': 'Waarom u ParkShare kunt vertrouwen',
  'Transparency Matrix: Who Sees What?': 'Transparantiematrix: Wie ziet wat?',
  'Test Offline Mode': 'Offline-modus testen',
  'Offline Mode Active': 'Offline-modus actief',
  'Independent Local Building Mode Active': 'Onafhankelijke lokale gebouwmodus actief',
  'Building': 'Gebouw',
  'Encryption Key': 'Versleutelingssleutel',
  'Retention': 'Bewaartermijn',
  'Cross-Building': 'Gebouwoverschrijdend',
  'Anon Stats': 'Anonieme statistieken',
  'Actions': 'Acties',
  'Rotate Key': 'Sleutel vernieuwen',
  'Export JSON': 'JSON exporteren',
  'Immediate auto-purge': 'Direct automatisch wissen',
  '30 days (GDPR)': '30 dagen (AVG/GDPR)',
  '90 days': '90 dagen',
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
