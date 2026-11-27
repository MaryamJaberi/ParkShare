import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  MessageCircle,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  Share2,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  DirectShareBookingOwnerView,
  DirectShareBookingPublic,
  DirectShareSpotPublic,
  Language,
} from '../types/parkshare';
import { t } from '../i18n/translations';

interface Props {
  lang: Language;
  initialSpotSlug?: string | null;
  initialBuildingSlug?: string | null;
  onBackToMain: () => void;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === 'fa' ? 'fa-IR' : lang === 'nl' ? 'nl-NL' : 'en-GB';
  return d.toLocaleString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pickLocalizedError(data: Record<string, unknown> | null, lang: Language, fallback: string): string {
  if (!data) return fallback;
  if (lang === 'fa' && typeof data.errorFa === 'string') return data.errorFa;
  if (lang === 'nl' && typeof data.errorNl === 'string') return data.errorNl;
  if (typeof data.errorEn === 'string') return data.errorEn;
  if (typeof data.error === 'string') return data.error;
  return fallback;
}

export const DirectNeighborShareView: React.FC<Props> = ({
  lang,
  initialSpotSlug,
  initialBuildingSlug,
  onBackToMain,
}) => {
  const [spots, setSpots] = useState<DirectShareSpotPublic[]>([]);
  const [bookings, setBookings] = useState<DirectShareBookingPublic[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(initialSpotSlug || 'boston-177');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Booking form state
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalDateTimeInputValue(d);
  }, []);
  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 5);
    return toLocalDateTimeInputValue(d);
  }, []);

  const [startLocal, setStartLocal] = useState(defaultStart);
  const [endLocal, setEndLocal] = useState(defaultEnd);
  const [purposeTag, setPurposeTag] = useState<'visite' | 'temporary' | 'delivery'>('visite');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestUnit, setGuestUnit] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookSuccess, setBookSuccess] = useState<{
    bookingId: string;
    cancelCode: string;
    ownerWhatsAppUrl: string | null;
  } | null>(null);

  // Share & copy feedback
  const [copiedMode, setCopiedMode] = useState<'link' | 'wa' | null>(null);

  // Step-by-step guide accordion
  const [showGuide, setShowGuide] = useState(false);

  // Guest self-cancel state
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [guestCancelCode, setGuestCancelCode] = useState('');
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  // Add My Spot modal state
  const [showAddSpot, setShowAddSpot] = useState(false);
  const [newBay, setNewBay] = useState('');
  const [newFloor, setNewFloor] = useState('P1');
  const [newBuilding, setNewBuilding] = useState('Boston Residence');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerPin, setNewOwnerPin] = useState('');
  const [newAvailNote, setNewAvailNote] = useState('');
  const [newMaxHours, setNewMaxHours] = useState(24);
  const [newMaxDays, setNewMaxDays] = useState(8);
  const [addingSpot, setAddingSpot] = useState(false);
  const [addSpotError, setAddSpotError] = useState<string | null>(null);

  // Owner Private Drawer (Claim PIN / Unlock Guest Contacts)
  const [showOwnerPanel, setShowOwnerPanel] = useState(false);
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [claimName, setClaimName] = useState('Maryam (Plek 177)');
  const [claimPhone, setClaimPhone] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownerUnlocked, setOwnerUnlocked] = useState<{
    pin: string;
    ownerPhone: string;
    bookings: DirectShareBookingOwnerView[];
  } | null>(null);

  const loadDirectData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (initialBuildingSlug) params.set('building', initialBuildingSlug);
      if (initialSpotSlug) params.set('spot', initialSpotSlug);
      const res = await fetch(`/api/direct/spots${params.toString() ? `?${params.toString()}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Failed to load');
      const fetchedSpots: DirectShareSpotPublic[] = Array.isArray(data.spots) ? data.spots : [];
      setSpots(fetchedSpots);
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      if (fetchedSpots.length > 0) {
        setSelectedSlug((prev) =>
          fetchedSpots.some((s) => s.slug === prev)
            ? prev
            : initialSpotSlug && fetchedSpots.some((s) => s.slug === initialSpotSlug)
              ? initialSpotSlug
              : fetchedSpots[0].slug
        );
      }
    } catch {
      setLoadError(
        t(
          lang,
          'خطا در بارگذاری پارکینگ‌های اشتراکی.',
          'Failed to load shared neighbor spots.',
          'Kan gedeelde parkeerplekken niet laden.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, [initialBuildingSlug, initialSpotSlug, lang]);

  useEffect(() => {
    loadDirectData();
  }, [loadDirectData]);

  const activeSpot = useMemo(
    () => spots.find((s) => s.slug === selectedSlug) ?? spots[0] ?? null,
    [spots, selectedSlug]
  );

  const activeSpotBookings = useMemo(
    () =>
      activeSpot
        ? bookings.filter((b) => b.spotId === activeSpot.id && b.status === 'Confirmed')
        : [],
    [bookings, activeSpot]
  );

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !activeSpot) return '';
    return `${window.location.origin}/?spot=${encodeURIComponent(activeSpot.slug)}`;
  }, [activeSpot]);

  const setQuickWindow = (dayOffset: number, startHour: number, endHour: number, overnight = false) => {
    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(start);
    if (overnight) {
      end.setDate(end.getDate() + 1);
    }
    end.setHours(endHour, 0, 0, 0);
    setStartLocal(toLocalDateTimeInputValue(start));
    setEndLocal(toLocalDateTimeInputValue(end));
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedMode('link');
    setTimeout(() => setCopiedMode(null), 2500);
  };

  const handleCopyWhatsAppMessage = async () => {
    if (!activeSpot || !shareUrl) return;
    const msg =
      lang === 'fa'
        ? `سلام همسایه‌های عزیز 🌿\nپارکینگ من (شماره ${activeSpot.bayNumber} در ${activeSpot.buildingName}) کاملاً آزاد است و برای استفاده موقت / مهمان (رایگان) در اختیار شماست.\n\nبرای رزرو بدون نیاز به پیام دادن در گروه، از این لینک استفاده کنید:\n${shareUrl}\n\nبقیه همسایه‌ها هم اگر جای پارک خالی دارند می‌توانند روی همین لینک پارکینگ خودشان را اضافه کنند.`
        : lang === 'en'
          ? `Hi neighbors! 🚗\nMy parking spot (Bay ${activeSpot.bayNumber} at ${activeSpot.buildingName}) is free for temporary / guest use (free of charge, fair-use limits apply).\n\nBook directly here without messaging the group:\n${shareUrl}\n\nOther neighbors can also add their own spot on the same link!`
          : `Hallo buren! 🚗\nMijn parkeerplek (Plek ${activeSpot.bayNumber} in ${activeSpot.buildingName}) is vrij voor tijdelijk gebruik / visite (gratis, alleen tijdelijk gebruik).\n\nReserveer direct via deze link zonder telkens in de groep te vragen:\n${shareUrl}\n\nAndere buren met een vrije plek kunnen hun plek ook direct via dezelfde link toevoegen!`;
    await navigator.clipboard.writeText(msg);
    setCopiedMode('wa');
    setTimeout(() => setCopiedMode(null), 2500);
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSpot) return;
    setBookError(null);
    setBookSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/direct/spots/${encodeURIComponent(activeSpot.slug)}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startIso: new Date(startLocal).toISOString(),
          endIso: new Date(endLocal).toISOString(),
          guestName,
          guestPhone,
          guestUnit,
          guestPlate,
          purposeTag,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookError(
          pickLocalizedError(
            data,
            lang,
            t(lang, 'ثبت رزرو انجام نشد.', 'Booking failed.', 'Reservering mislukt.')
          )
        );
        return;
      }
      setBookSuccess({
        bookingId: data.booking?.id,
        cancelCode: data.cancelCode,
        ownerWhatsAppUrl: data.ownerWhatsAppUrl ?? null,
      });
      setNote('');
      await loadDirectData();
    } catch {
      setBookError(t(lang, 'خطای شبکه.', 'Network error.', 'Netwerkfout.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSpot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSpotError(null);
    setAddingSpot(true);
    try {
      const res = await fetch('/api/direct/spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingName: newBuilding,
          bayNumber: newBay,
          floorOrZone: newFloor,
          ownerDisplayName: newOwnerName,
          ownerPhone: newOwnerPhone,
          ownerPin: newOwnerPin,
          availabilityNote: newAvailNote,
          maxHoursPerBooking: newMaxHours,
          maxDaysPerMonthPerGuest: newMaxDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddSpotError(
          pickLocalizedError(
            data,
            lang,
            t(lang, 'خطا در ثبت پارکینگ.', 'Could not add spot.', 'Kan plek niet toevoegen.')
          )
        );
        return;
      }
      setShowAddSpot(false);
      setNewBay('');
      setNewOwnerName('');
      setNewOwnerPhone('');
      setNewOwnerPin('');
      setNewAvailNote('');
      await loadDirectData();
      if (data.spot?.slug) {
        setSelectedSlug(data.spot.slug);
      }
    } catch {
      setAddSpotError(t(lang, 'خطای شبکه.', 'Network error.', 'Netwerkfout.'));
    } finally {
      setAddingSpot(false);
    }
  };

  const handleClaimOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSpot) return;
    setOwnerError(null);
    setOwnerLoading(true);
    try {
      const res = await fetch(`/api/direct/spots/${encodeURIComponent(activeSpot.slug)}/claim-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPin: ownerPinInput,
          ownerDisplayName: claimName,
          ownerPhone: claimPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOwnerError(pickLocalizedError(data, lang, 'Error'));
        return;
      }
      await loadDirectData();
      // Immediately unlock owner view
      const unlockRes = await fetch(`/api/direct/spots/${encodeURIComponent(activeSpot.slug)}/owner-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerPin: ownerPinInput }),
      });
      const unlockData = await unlockRes.json();
      if (unlockRes.ok) {
        setOwnerUnlocked({
          pin: ownerPinInput,
          ownerPhone: unlockData.spot?.ownerPhone || '',
          bookings: unlockData.bookings || [],
        });
      }
    } catch {
      setOwnerError(t(lang, 'خطای شبکه.', 'Network error.', 'Netwerkfout.'));
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleUnlockOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSpot) return;
    setOwnerError(null);
    setOwnerLoading(true);
    try {
      const res = await fetch(`/api/direct/spots/${encodeURIComponent(activeSpot.slug)}/owner-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerPin: ownerPinInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOwnerError(pickLocalizedError(data, lang, 'Invalid PIN'));
        return;
      }
      setOwnerUnlocked({
        pin: ownerPinInput,
        ownerPhone: data.spot?.ownerPhone || '',
        bookings: data.bookings || [],
      });
    } catch {
      setOwnerError(t(lang, 'خطای شبکه.', 'Network error.', 'Netwerkfout.'));
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleToggleSpotActive = async () => {
    if (!activeSpot || !ownerUnlocked) return;
    const res = await fetch(`/api/direct/spots/${encodeURIComponent(activeSpot.slug)}/owner-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerPin: ownerUnlocked.pin, active: !activeSpot.active }),
    });
    if (res.ok) {
      await loadDirectData();
    }
  };

  const handleCancelBooking = async (bookingId: string, opts: { cancelCode?: string; ownerPin?: string }) => {
    setCancelFeedback(null);
    const res = await fetch(`/api/direct/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    if (!res.ok) {
      setCancelFeedback(pickLocalizedError(data, lang, 'Cancel failed'));
      return;
    }
    setCancellingId(null);
    setGuestCancelCode('');
    await loadDirectData();
    if (ownerUnlocked && activeSpot) {
      const refreshRes = await fetch(`/api/direct/spots/${encodeURIComponent(activeSpot.slug)}/owner-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerPin: ownerUnlocked.pin }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setOwnerUnlocked({
          pin: ownerUnlocked.pin,
          ownerPhone: refreshData.spot?.ownerPhone || '',
          bookings: refreshData.bookings || [],
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-[1120px] mx-auto py-12 text-center text-sm text-slate-500">
        {t(lang, 'در حال بارگذاری پارکینگ‌های همسایگان...', 'Loading shared neighbor spots...', 'Gedeelde parkeerplekken laden...')}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-[1120px] mx-auto space-y-6 pb-10">
      {/* Top Bar Back + Quick Info */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToMain}
          className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
        >
          <ArrowLeft className={`w-4 h-4 ${lang === 'fa' ? 'rotate-180' : ''}`} />
          {t(lang, 'ورود مدیر / سامانه ساختمان', 'Building Manager Portal', 'Gebouwbeheerder portaal')}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-bold rounded-xl border transition-colors ${
              showGuide
                ? 'bg-[#F5F1FD] border-[#6E41C4] text-[#5A2FA8]'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            {t(lang, 'راهنمای قدم‌به‌قدم (رزرو و لغو)', 'Step-by-Step Guide (Book & Cancel)', 'Stappenplan (Boeken & Annuleren)')}
          </button>
          <button
            type="button"
            onClick={() => setShowAddSpot(true)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-bold text-white ps-violet-btn rounded-xl"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'من هم پارکینگم را اضافه می‌کنم', 'Share My Spot Too', 'Mijn plek ook delen')}
          </button>
        </div>
      </div>

      {/* Step-by-Step Guide (How to Book, How to Cancel as Guest vs Owner, Fair-Use & Adding Your Spot) */}
      {showGuide && (
        <section className="bg-white border border-[#E4DCF7] rounded-3xl p-5 sm:p-6 ps-card-shadow space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              {t(
                lang,
                'راهنمای قدم‌به‌قدم رزرو، لغو و اشتراک‌گذاری پارکینگ',
                'Step-by-Step Guide: Booking, Cancelling & Sharing',
                'Stappenplan: Reserveren, Annuleren & Delen'
              )}
            </h2>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label={t(lang, 'بستن', 'Close', 'Sluiten')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-[#F8F6FD] border border-[#E6E0F7] space-y-2">
              <div className="font-extrabold text-[#5A2FA8]">
                {t(lang, '۱. چطور پارکینگ رزرو کنم؟', '1. How to Reserve a Spot', '1. Hoe reserveer ik een plek?')}
              </div>
              <ol className="list-decimal ps-4 space-y-1.5 text-slate-700 leading-relaxed">
                <li>{t(lang, 'تاریخ و ساعت شروع و پایان را انتخاب کنید (تا ۲۴ ساعت).', 'Pick start & end date/time (up to 24 hours).', 'Kies begin- en einddatum/tijd (tot max. 24 uur).')}</li>
                <li>{t(lang, 'نام، شماره تماس/واتساپ و شماره واحد خود را وارد کنید (فقط برای مالک قابل مشاهده است).', 'Enter your name, phone/WhatsApp, and unit (visible only to the owner).', 'Vul uw naam, telefoon/WhatsApp en huisnummer in (alleen zichtbaar voor de eigenaar).')}</li>
                <li>{t(lang, 'دکمه تأیید رزرو را بزنید و کد ۶ کاراکتری لغو را نگه دارید.', 'Confirm booking and save the 6-character cancel code shown in the green box.', 'Bevestig en bewaar de 6-tekens annuleringscode uit het groene vak.')}</li>
              </ol>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-2">
              <div className="font-extrabold text-rose-800">
                {t(lang, '۲. چطور یک رزرو را لغو (باطل) کنم؟', '2. How to Cancel a Booking', '2. Hoe annuleer ik een reservering?')}
              </div>
              <ul className="space-y-2 text-slate-700 leading-relaxed">
                <li>
                  <strong className="text-slate-900">{t(lang, 'اگر همسایه رزروکننده هستید:', 'As the guest:', 'Als huurder / buur:')}</strong>{' '}
                  {t(
                    lang,
                    'در لیست «رزروهای ثبت‌شده» روی «لغو با کد» بزنید، کد ۶ کاراکتری که هنگام رزرو دریافت کردید را وارد و روی «لغو» کلیک کنید. (اگر کد را گم کردید، به مالک پیام دهید.)',
                    'Click "Cancel with code" on your booking, enter the 6-char code shown when you booked, and click Cancel. (Lost your code? Ask the spot owner.)',
                    'Klik op "Annuleren met code", vul de 6-tekens code in die u na het boeken kreeg en klik op Annuleer. (Code kwijt? Vraag de eigenaar.)'
                  )}
                </li>
                <li>
                  <strong className="text-slate-900">{t(lang, 'اگر مالک پارکینگ هستید:', 'As the spot owner:', 'Als eigenaar van de plek:')}</strong>{' '}
                  {t(
                    lang,
                    'نیازی به کد مهمان ندارید! پایین صفحه بخش «پنل خصوصی مالک» را باز کنید، پین خصوصی خود را بزنید و روی «لغو رزرو توسط مالک» کلیک کنید.',
                    'No guest code needed! Open "Owner Panel" below, enter your private PIN, and click "Cancel booking (Owner)".',
                    'Geen gastcode nodig! Open hieronder het "Eigenaar-paneel", voer uw pincode in en klik op "Annuleren (Eigenaar)".'
                  )}
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
              <div className="font-extrabold text-emerald-900">
                {t(lang, '۳. قوانین عادلانه و افزودن پارکینگ دیگران', '3. Fair-Use Rules & Adding Your Spot', '3. Spelregels & Eigen plek toevoegen')}
              </div>
              <ul className="space-y-1.5 text-slate-700 leading-relaxed">
                <li>{t(lang, '• حداکثر ۲۴ ساعت در هر رزرو مستقیم.', '• Max 24 hours per instant booking.', '• Max. 24 uur per directe reservering.')}</li>
                <li>{t(lang, '• برای ۲ روز پشت سر هم (فاصله کمتر از ۲۴ ساعت) ابتدا با مالک هماهنگ کنید.', '• Need 2 consecutive days? Coordinate with the owner first (24h gap rule).', '• 2 dagen achter elkaar nodig? Stem dit eerst af met de eigenaar (24u pauze).')}</li>
                <li>{t(lang, '• همسایه‌های دیگر هم با دکمه «من هم پارکینگم را اضافه می‌کنم» می‌توانند جای پارکشان را اضافه کنند.', '• Other neighbors can click "Share My Spot Too" to add their own bay.', '• Andere buren kunnen via "Mijn plek ook delen" ook hun eigen plek toevoegen.')}</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {loadError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
          {loadError}
        </div>
      )}

      {/* Hero Banner */}
      {activeSpot && (
        <section className="relative overflow-hidden rounded-[28px] ps-hero-gradient text-white p-6 sm:p-8 shadow-[0_18px_42px_rgba(90,47,168,0.2)]">
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="space-y-2.5 max-w-2xl">
              <div className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold text-white/90">
                <span className="px-2.5 py-1 rounded-full bg-white/15 border border-white/20">
                  {activeSpot.buildingName}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-400/20 border border-emerald-200/30 text-emerald-100">
                  {activeSpot.active
                    ? t(lang, 'آزاد و آماده رزرو موقت (رایگان)', 'Open for Temporary Use (Free)', 'Vrij voor tijdelijk gebruik (Gratis)')
                    : t(lang, 'موقتاً متوقف‌شده', 'Temporarily Paused', 'Tijdelijk gepauzeerd')}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {t(
                  lang,
                  `پارکینگ ${activeSpot.bayNumber} · ${activeSpot.floorOrZone}`,
                  `Parking Spot ${activeSpot.bayNumber} · ${activeSpot.floorOrZone}`,
                  `Parkeerplek ${activeSpot.bayNumber} · ${activeSpot.floorOrZone}`
                )}
              </h1>

              <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                {activeSpot.availabilityNote}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-white/90">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t(
                    lang,
                    `حداکثر ${activeSpot.fairUse.maxHoursPerBooking} ساعت در هر رزرو`,
                    `Max ${activeSpot.fairUse.maxHoursPerBooking}h per stay`,
                    `Max. ${activeSpot.fairUse.maxHoursPerBooking}u per reservering`
                  )}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {t(
                    lang,
                    `حداکثر ${activeSpot.fairUse.maxDaysPerMonthPerGuest} روز در ماه (ضد استفاده دائمی)`,
                    `Max ${activeSpot.fairUse.maxDaysPerMonthPerGuest} days/month (anti-permanent)`,
                    `Max. ${activeSpot.fairUse.maxDaysPerMonthPerGuest} dagen/maand (geen vast gebruik)`
                  )}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10">
                  <Lock className="w-3.5 h-3.5" />
                  {t(
                    lang,
                    'شماره تماس فقط برای مالک نمایش داده می‌شود',
                    'Contact shared privately with owner only',
                    'Contactgegevens alleen zichtbaar voor eigenaar'
                  )}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyWhatsAppMessage}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-[#F46A46] hover:bg-[#E25A36] text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
              >
                {copiedMode === 'wa' ? <Check className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                {copiedMode === 'wa'
                  ? t(lang, 'پیام واتساپ کپی شد!', 'WhatsApp Message Copied!', 'WhatsApp-bericht gekopieerd!')
                  : t(lang, 'کپی پیام برای گروه واتساپ', 'Copy Group WhatsApp Msg', 'Kopieer groepsbericht')}
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                {copiedMode === 'link' ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {copiedMode === 'link'
                  ? t(lang, 'لینک کپی شد!', 'Link Copied!', 'Link gekopieerd!')
                  : t(lang, 'کپی لینک مستقیم', 'Copy Direct Link', 'Kopieer directe link')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Community Spot Selector (Shows Spot 177 + Any Other Neighbors Who Joined!) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">
          {t(lang, 'پارکینگ‌های اشتراکی همسایه‌ها:', 'Shared neighbor spots:', 'Gedeelde plekken van buren:')}
        </span>
        {spots.map((s) => {
          const isSelected = activeSpot?.slug === s.slug;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelectedSlug(s.slug);
                setBookSuccess(null);
                setBookError(null);
                setOwnerUnlocked(null);
                setOwnerPinInput('');
                setOwnerError(null);
              }}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all inline-flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[#6E41C4] text-white border-[#6E41C4] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-[#6E41C4]/40'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>
                {t(lang, `پلاک ${s.bayNumber}`, `Spot ${s.bayNumber}`, `Plek ${s.bayNumber}`)} · {s.floorOrZone}
              </span>
              {!s.active && (
                <span className="text-[10px] opacity-80">
                  ({t(lang, 'متوقف', 'Paused', 'Gepauzeerd')})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Workspace */}
      {activeSpot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Instant Temporary Booking Form */}
          <form
            onSubmit={handleBook}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 ps-card-shadow space-y-5"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {t(
                    lang,
                    `رزرو موقت پارکینگ ${activeSpot.bayNumber}`,
                    `Reserve Spot ${activeSpot.bayNumber} Temporarily`,
                    `Plek ${activeSpot.bayNumber} tijdelijk reserveren`
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    lang,
                    'بدون نیاز به تأیید مدیر ساختمان — اطلاعات تماس شما فقط برای مالک پارکینگ ارسال می‌شود.',
                    'No manager approval needed — your contact details are shared privately with the spot owner only.',
                    'Geen goedkeuring van beheerder nodig — uw contactgegevens worden alleen gedeeld met de eigenaar.'
                  )}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold shrink-0">
                {t(lang, 'رایگان', 'Free', 'Gratis')}
              </span>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500">
                {t(lang, 'انتخاب سریع:', 'Quick pick:', 'Snel kiezen:')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuickWindow(0, 14, 23)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {t(lang, 'امروز ۱۴:۰۰–۲۳:۰۰', 'Today 14:00–23:00', 'Vandaag 14:00–23:00')}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickWindow(1, 11, 18)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {t(lang, 'فردا ۱۱:۰۰–۱۸:۰۰', 'Tomorrow 11:00–18:00', 'Morgen 11:00–18:00')}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickWindow(1, 13, 13, true)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {t(lang, 'شبانه‌روزی (۲۴ ساعت)', 'Full Day (24h)', 'Hele dag (24u)')}
                </button>
              </div>
            </div>

            {/* Start & End Date-Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-slate-700">
                  {t(lang, 'از تاریخ و ساعت', 'Start Date & Time', 'Begindatum & tijd')}
                </span>
                <input
                  type="datetime-local"
                  required
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl text-slate-900"
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-semibold text-slate-700">
                  {t(lang, 'تا تاریخ و ساعت', 'End Date & Time', 'Einddatum & tijd')}
                </span>
                <input
                  type="datetime-local"
                  required
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl text-slate-900"
                />
              </label>
            </div>

            {/* Purpose */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'visite', fa: 'مهمان (Visite)', en: 'Guest / Visit', nl: 'Visite / Bezoek' },
                  { id: 'temporary', fa: 'استفاده موقت', en: 'Temporary Need', nl: 'Tijdelijk gebruik' },
                  { id: 'delivery', fa: 'بارگیری / تعمیرکار', en: 'Delivery / Service', nl: 'Bezorging / Klusser' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPurposeTag(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    purposeTag === p.id
                      ? 'bg-[#F5F1FD] border-[#6E41C4] text-[#5A2FA8]'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t(lang, p.fa, p.en, p.nl)}
                </button>
              ))}
            </div>

            {/* Mandatory Contact Info for Spot Owner */}
            <div className="p-4 rounded-2xl bg-[#F8F6FD] border border-[#E6E0F7] space-y-3.5">
              <div className="flex items-start gap-2">
                <UserCheck className="w-4 h-4 text-[#6E41C4] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {t(
                      lang,
                      'اطلاعات تماس شما (فقط برای اشتراک با مالک پارکینگ)',
                      'Your Contact Details (Shared Privately with Owner Only)',
                      'Uw contactgegevens (Alleen gedeeld met de eigenaar)'
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {t(
                      lang,
                      'سایر همسایه‌ها در تقویم عمومی هیچ نام یا شماره‌ای از شما نمی‌بینند.',
                      'Other neighbors only see that the spot is booked — never your name, phone, or apartment.',
                      'Andere buren zien alleen dat de plek bezet is — nooit uw naam, telefoon of huisnummer.'
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700">
                    {t(lang, 'نام شما *', 'Your Name *', 'Uw naam *')}
                  </span>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={t(lang, 'مثلاً: سارا', 'e.g. Menno', 'bijv. Menno')}
                    className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700">
                    {t(lang, 'شماره موبایل / واتساپ *', 'Phone / WhatsApp *', 'Telefoon / WhatsApp *')}
                  </span>
                  <input
                    type="tel"
                    required
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+31 6 12345678"
                    className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700">
                    {t(lang, 'شماره واحد / آپارتمان *', 'Apartment / Unit *', 'Huisnummer / Appartement *')}
                  </span>
                  <input
                    type="text"
                    required
                    value={guestUnit}
                    onChange={(e) => setGuestUnit(e.target.value)}
                    placeholder={t(lang, 'مثلاً: 12B', 'e.g. 12B', 'bijv. 12B')}
                    className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700">
                    {t(lang, 'پلاک خودرو (اختیاری)', 'License Plate (Optional)', 'Kenteken (Optioneel)')}
                  </span>
                  <input
                    type="text"
                    value={guestPlate}
                    onChange={(e) => setGuestPlate(e.target.value)}
                    placeholder="XX-123-X"
                    className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl uppercase"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-xs font-semibold text-slate-700">
                  {t(lang, 'یادداشت کوتاه (اختیاری)', 'Short Note (Optional)', 'Korte notitie (Optioneel)')}
                </span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t(lang, 'مثلاً: مهمان آخر هفته', 'e.g. Weekend guest', 'bijv. Visite van ouders')}
                  className="w-full h-11 px-3 text-sm bg-white border border-slate-200 rounded-xl"
                />
              </label>
            </div>

            {bookError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
                {bookError}
              </div>
            )}

            {bookSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5 text-emerald-950">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  {t(
                    lang,
                    `رزرو شما روی پارکینگ ${activeSpot.bayNumber} ثبت شد!`,
                    `Confirmed on Spot ${activeSpot.bayNumber}!`,
                    `Reservering op plek ${activeSpot.bayNumber} bevestigd!`
                  )}
                </div>
                <div className="text-xs">
                  {t(lang, 'کد لغو اختصاصی شما (نگه دارید):', 'Your personal cancel code (save this):', 'Uw persoonlijke annuleringscode (bewaar deze):')}{' '}
                  <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-white border border-emerald-200">
                    {bookSuccess.cancelCode}
                  </span>
                </div>
                {bookSuccess.ownerWhatsAppUrl && (
                  <a
                    href={bookSuccess.ownerWhatsAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t(
                      lang,
                      'ارسال پیام تأیید به واتساپ مالک',
                      'Send WhatsApp Confirmation to Owner',
                      'Stuur bevestiging naar eigenaar via WhatsApp'
                    )}
                  </a>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !activeSpot.active}
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl ps-violet-btn text-white text-sm font-bold disabled:opacity-50 transition-all"
            >
              {submitting
                ? t(lang, 'در حال ثبت رزرو...', 'Reserving...', 'Bezig met reserveren...')
                : t(
                    lang,
                    `تأیید و رزرو پارکینگ ${activeSpot.bayNumber}`,
                    `Confirm Booking for Spot ${activeSpot.bayNumber}`,
                    `Reservering bevestigen voor plek ${activeSpot.bayNumber}`
                  )}
            </button>
          </form>

          {/* RIGHT: Live Schedule (Anonymized) + Owner Private Panel */}
          <div className="lg:col-span-5 space-y-5">
            {/* Public Anonymized Bookings */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 ps-card-shadow space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">
                  {t(
                    lang,
                    `رزروهای ثبت‌شده روی پارکینگ ${activeSpot.bayNumber}`,
                    `Booked Windows on Spot ${activeSpot.bayNumber}`,
                    `Gereserveerde tijden op plek ${activeSpot.bayNumber}`
                  )}
                </h3>
                <span className="text-[11px] font-mono font-semibold text-slate-500">
                  {activeSpotBookings.length}
                </span>
              </div>

              {activeSpotBookings.length === 0 ? (
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-900 font-medium">
                  {t(
                    lang,
                    'در حال حاضر هیچ رزروی ثبت نشده — این پارکینگ کاملاً آزاد است!',
                    'No bookings yet — this spot is completely open!',
                    'Nog geen reserveringen — deze plek is volledig vrij!'
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeSpotBookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-bold text-slate-900">
                          {formatDateTime(b.startIso, lang)} → {formatDateTime(b.endIso, lang)}
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 text-[10px] font-bold uppercase shrink-0">
                          {b.purposeTag}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>
                          {t(lang, 'رزرو شده (اطلاعات تماس محفوظ)', 'Booked (contact private)', 'Gereserveerd (contact privé)')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingId(cancellingId === b.id ? null : b.id);
                            setCancelFeedback(null);
                          }}
                          className="text-rose-600 hover:underline font-semibold"
                        >
                          {t(lang, 'لغو با کد', 'Cancel with code', 'Annuleren met code')}
                        </button>
                      </div>

                      {cancellingId === b.id && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={guestCancelCode}
                              onChange={(e) => setGuestCancelCode(e.target.value)}
                              placeholder={t(lang, 'کد ۶ کاراکتری لغو', '6-char cancel code', '6-tekens code')}
                              className="flex-1 h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg font-mono uppercase"
                            />
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b.id, { cancelCode: guestCancelCode })}
                              className="h-9 px-3 text-xs font-bold bg-rose-600 text-white rounded-lg"
                            >
                              {t(lang, 'لغو', 'Cancel', 'Annuleer')}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            {t(
                              lang,
                              'کد ۶ کاراکتری پس از ثبت رزرو نمایش داده شده است. اگر مالک پارکینگ هستید از «پنل خصوصی مالک» پایین صفحه بدون کد لغو کنید.',
                              'Enter the 6-char code shown when you booked. Spot owners can cancel directly from the Owner Panel below without this code.',
                              'Vul de 6-tekens code in die u na het boeken kreeg. De eigenaar kan zonder code annuleren via het Eigenaar-paneel hieronder.'
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {cancelFeedback && (
                <div className="text-xs text-rose-700 font-medium">{cancelFeedback}</div>
              )}
            </div>

            {/* Owner Private Panel (PIN Claim / View Guest Contact Info) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 ps-card-shadow space-y-4">
              <button
                type="button"
                onClick={() => setShowOwnerPanel((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-start"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 text-[#5A2FA8] flex items-center justify-center shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {t(
                        lang,
                        `پنل خصوصی مالک پارکینگ ${activeSpot.bayNumber}`,
                        `Owner Panel for Spot ${activeSpot.bayNumber}`,
                        `Eigenaar-paneel plek ${activeSpot.bayNumber}`
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {activeSpot.ownerPinClaimed
                        ? t(lang, 'مشاهده اطلاعات تماس رزروکنندگان و مدیریت پارکینگ', 'View guest contacts & manage spot', 'Bekijk contactgegevens & beheer plek')
                        : t(lang, 'مالک این پارکینگ هستید؟ پین خصوصی خود را تنظیم کنید', 'Are you the owner? Set your private PIN', 'Bent u de eigenaar? Stel uw pincode in')}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#5A2FA8]">
                  {showOwnerPanel ? t(lang, 'بستن', 'Hide', 'Verberg') : t(lang, 'باز کردن', 'Open', 'Openen')}
                </span>
              </button>

              {showOwnerPanel && (
                <div className="pt-2 border-t border-slate-100 space-y-4">
                  {!activeSpot.ownerPinClaimed ? (
                    <form onSubmit={handleClaimOwner} className="space-y-3">
                      <p className="text-xs text-slate-600">
                        {t(
                          lang,
                          'یک پین خصوصی (حداقل ۴ کاراکتر) و شماره واتساپ خود را ثبت کنید تا فقط شما بتوانید اطلاعات تماس همسایه‌های رزروکننده را ببینید.',
                          'Set a private PIN (min 4 chars) and optional WhatsApp number so only you can view guest contact details.',
                          'Stel een eigen pincode (min. 4 tekens) en optioneel WhatsApp-nummer in zodat alleen u de contactgegevens van buren kunt zien.'
                        )}
                      </p>
                      <input
                        type="text"
                        required
                        value={claimName}
                        onChange={(e) => setClaimName(e.target.value)}
                        placeholder={t(lang, 'نام نمایشی مالک', 'Owner display name', 'Uw weergavenaam')}
                        className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                      <input
                        type="tel"
                        value={claimPhone}
                        onChange={(e) => setClaimPhone(e.target.value)}
                        placeholder={t(lang, 'شماره واتساپ شما (اختیاری، مثلاً +316...)', 'Your WhatsApp number (optional, +316...)', 'Uw WhatsApp-nummer (optioneel, +316...)')}
                        className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                      <input
                        type="password"
                        required
                        minLength={4}
                        value={ownerPinInput}
                        onChange={(e) => setOwnerPinInput(e.target.value)}
                        placeholder={t(lang, 'پین خصوصی مالک (حداقل ۴ کاراکتر)', 'Private Owner PIN (min 4 chars)', 'Eigenaar-pincode (min. 4 tekens)')}
                        className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                      {ownerError && <div className="text-xs text-rose-700 font-medium">{ownerError}</div>}
                      <button
                        type="submit"
                        disabled={ownerLoading}
                        className="w-full h-10 rounded-xl ps-violet-btn text-white text-xs font-bold"
                      >
                        {t(lang, 'ثبت پین مالک و باز کردن پنل', 'Set Owner PIN & Unlock', 'Pincode opslaan & openen')}
                      </button>
                    </form>
                  ) : !ownerUnlocked ? (
                    <form onSubmit={handleUnlockOwner} className="space-y-3">
                      <input
                        type="password"
                        required
                        value={ownerPinInput}
                        onChange={(e) => setOwnerPinInput(e.target.value)}
                        placeholder={t(lang, 'پین مالک را وارد کنید', 'Enter Owner PIN', 'Voer eigenaar-pincode in')}
                        className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                      {ownerError && <div className="text-xs text-rose-700 font-medium">{ownerError}</div>}
                      <button
                        type="submit"
                        disabled={ownerLoading}
                        className="w-full h-10 rounded-xl ps-violet-btn text-white text-xs font-bold"
                      >
                        {t(lang, 'مشاهده اطلاعات تماس رزروکنندگان', 'Unlock Guest Contacts', 'Contactgegevens bekijken')}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-emerald-700">
                          {t(lang, 'پنل مالک باز شد', 'Owner Unlocked', 'Eigenaar ontgrendeld')}
                        </span>
                        <button
                          type="button"
                          onClick={handleToggleSpotActive}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                            activeSpot.active
                              ? 'bg-amber-50 border-amber-200 text-amber-800'
                              : 'bg-emerald-600 border-emerald-600 text-white'
                          }`}
                        >
                          {activeSpot.active ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                          {activeSpot.active
                            ? t(lang, 'توقف موقت پارکینگ', 'Pause Spot', 'Plek pauzeren')
                            : t(lang, 'فعال‌سازی مجدد', 'Resume Spot', 'Plek activeren')}
                        </button>
                      </div>

                      {ownerUnlocked.bookings.length === 0 ? (
                        <div className="text-xs text-slate-500">
                          {t(lang, 'هنوز رزروی ثبت نشده است.', 'No bookings recorded yet.', 'Nog geen reserveringen.')}
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[360px] overflow-y-auto">
                          {ownerUnlocked.bookings.map((b) => {
                            const waDigits = b.guestPhone.replace(/[^\d]/g, '');
                            return (
                              <div
                                key={b.id}
                                className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                                  b.status === 'Cancelled'
                                    ? 'bg-slate-50 border-slate-200 opacity-60'
                                    : 'bg-[#F8F6FD] border-[#E4DCF7]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-900">
                                    {b.guestName} · {t(lang, 'واحد', 'Unit', 'Woning')} {b.guestUnit}
                                  </span>
                                  <span className="text-[10px] font-bold uppercase text-slate-500">{b.status}</span>
                                </div>
                                <div className="text-[11px] text-slate-700">
                                  {formatDateTime(b.startIso, lang)} → {formatDateTime(b.endIso, lang)}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <a
                                    href={`tel:${b.guestPhone}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-mono"
                                  >
                                    <Phone className="w-3 h-3" />
                                    {b.guestPhone}
                                  </a>
                                  {waDigits && (
                                    <a
                                      href={`https://wa.me/${waDigits}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white font-semibold"
                                    >
                                      <MessageCircle className="w-3 h-3" />
                                      WhatsApp
                                    </a>
                                  )}
                                  {b.guestPlate && (
                                    <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono">
                                      {b.guestPlate}
                                    </span>
                                  )}
                                </div>
                                {b.note && <div className="text-[11px] text-slate-600 italic">“{b.note}”</div>}
                                {b.status === 'Confirmed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelBooking(b.id, { ownerPin: ownerUnlocked.pin })}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:underline pt-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    {t(lang, 'لغو رزرو توسط مالک', 'Cancel booking (Owner)', 'Annuleren (Eigenaar)')}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Any Neighbor Can Add Their Own Spot */}
      {showAddSpot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {t(lang, 'پارکینگ خود را به اشتراک بگذارید', 'Add Your Parking Spot to Share', 'Uw eigen parkeerplek toevoegen')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSpot(false)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSpot} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700">{t(lang, 'شماره پارکینگ *', 'Bay Number *', 'Pleknummer *')}</span>
                  <input
                    type="text"
                    required
                    value={newBay}
                    onChange={(e) => setNewBay(e.target.value)}
                    placeholder="bijv. 220"
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700">{t(lang, 'طبقه *', 'Floor *', 'Verdieping *')}</span>
                  <input
                    type="text"
                    required
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                    placeholder="P1 / P5 / P6"
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="font-semibold text-slate-700">{t(lang, 'نام ساختمان', 'Building Name', 'Gebouw')}</span>
                <input
                  type="text"
                  required
                  value={newBuilding}
                  onChange={(e) => setNewBuilding(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700">{t(lang, 'نام شما *', 'Your Name *', 'Uw naam *')}</span>
                  <input
                    type="text"
                    required
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    placeholder="bijv. Lenneke"
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700">{t(lang, 'شماره واتساپ (اختیاری)', 'WhatsApp (Optional)', 'WhatsApp (Optioneel)')}</span>
                  <input
                    type="tel"
                    value={newOwnerPhone}
                    onChange={(e) => setNewOwnerPhone(e.target.value)}
                    placeholder="+31 6 ..."
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="font-semibold text-slate-700">
                  {t(lang, 'پین خصوصی مدیریت (حداقل ۴ کاراکتر) *', 'Private Owner PIN (min 4 chars) *', 'Eigenaar-pincode (min. 4 tekens) *')}
                </span>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newOwnerPin}
                  onChange={(e) => setNewOwnerPin(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700">{t(lang, 'سقف ساعت هر رزرو', 'Max hours / stay', 'Max. uren / keer')}</span>
                  <input
                    type="number"
                    min={2}
                    max={72}
                    value={newMaxHours}
                    onChange={(e) => setNewMaxHours(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700">{t(lang, 'سقف روز در ماه', 'Max days / month', 'Max. dagen / maand')}</span>
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={newMaxDays}
                    onChange={(e) => setNewMaxDays(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="font-semibold text-slate-700">{t(lang, 'توضیح زمان آزادی', 'Availability note', 'Beschikbaarheid')}</span>
                <input
                  type="text"
                  value={newAvailNote}
                  onChange={(e) => setNewAvailNote(e.target.value)}
                  placeholder={t(lang, 'مثلاً: همیشه آزاد برای مهمان', 'e.g. Open anytime for temporary use', 'bijv. Altijd vrij voor visite')}
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl"
                />
              </label>

              {addSpotError && <div className="text-rose-700 font-medium">{addSpotError}</div>}

              <button
                type="submit"
                disabled={addingSpot}
                className="w-full min-h-[44px] rounded-xl ps-violet-btn text-white text-sm font-bold"
              >
                {addingSpot
                  ? t(lang, 'در حال ثبت...', 'Adding...', 'Toevoegen...')
                  : t(lang, 'ثبت پارکینگ و ساخت لینک اشتراک', 'Publish Spot & Get Share Link', 'Plek publiceren & deellink maken')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
