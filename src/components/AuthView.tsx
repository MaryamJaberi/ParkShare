import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Scale,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { AccessPolicyLevel, Language } from '../types/parkshare';
import { formatMinutes, t } from '../i18n/translations';

export interface AuthAccount {
  id: string;
  username: string;
  displayName: string;
  role: 'super_admin' | 'manager' | 'resident';
  userId?: string;
  communityId?: string;
}

interface VerifiedWhitelistPayload {
  entry: {
    id: string;
    communityId: string;
    ownerName: string;
    unitNumber: string;
    bayCode: string;
    floorOrZone: string;
    evCharging: boolean;
  };
  community: {
    id: string;
    name: string;
    nameFa: string;
    organization: string;
    allowedUsagePolicies: AccessPolicyLevel[];
    allowPaidSharing: boolean;
    dataResidencyRegion: string;
  };
}

interface Props {
  lang: Language;
  hasManager: boolean;
  hasSuperAdmin: boolean;
  envAdminConfigured: boolean;
  isAdminRoute: boolean;
  initialInviteToken: string | null;
  onAuthenticated: (token: string, account: AuthAccount) => void;
  onClearInviteToken: () => void;
  onExitAdminRoute: () => void;
}

const HOURS = Array.from({ length: 19 }, (_, i) => (i + 6) * 60);

const POLICY_LABELS: Record<AccessPolicyLevel, { fa: string; en: string }> = {
  residents_only: { fa: 'فقط ساکنان همین ساختمان', en: 'Residents of this building only' },
  residents_and_guests: { fa: 'ساکنان و مهمانان همین ساختمان', en: 'Residents & guests of this building' },
  network_members: { fa: 'سایر ساختمان‌های همین مجموعه', en: 'Other buildings in the same group' },
  public: { fa: 'کاربران بیرونی / عمومی', en: 'External / public users' },
};

export const AuthView: React.FC<Props> = ({
  lang,
  hasManager,
  hasSuperAdmin,
  envAdminConfigured,
  isAdminRoute,
  initialInviteToken,
  onAuthenticated,
  onClearInviteToken,
  onExitAdminRoute,
}) => {
  const [mode, setMode] = useState<'setup_manager' | 'setup_admin' | 'admin_login' | 'login' | 'resident_register'>(() => {
    if (isAdminRoute) {
      return hasSuperAdmin || envAdminConfigured ? 'admin_login' : 'setup_admin';
    }
    if (initialInviteToken) return 'resident_register';
    return hasManager || hasSuperAdmin ? 'login' : 'setup_manager';
  });

  useEffect(() => {
    if (isAdminRoute) {
      setMode(hasSuperAdmin || envAdminConfigured ? 'admin_login' : 'setup_admin');
    } else if (initialInviteToken) {
      setMode('resident_register');
    } else if (mode === 'admin_login' || mode === 'setup_admin') {
      setMode(hasManager || hasSuperAdmin ? 'login' : 'setup_manager');
    } else if (!hasManager && !hasSuperAdmin && mode === 'login') {
      setMode('setup_manager');
    }
  }, [hasManager, hasSuperAdmin, envAdminConfigured, isAdminRoute, initialInviteToken, mode]);

  // Login state (Public screen ONLY shows Resident & Building Manager)
  const [loginRole, setLoginRole] = useState<'resident' | 'manager'>('resident');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Manager first-run setup state
  const [mgrName, setMgrName] = useState('');
  const [mgrUsername, setMgrUsername] = useState('');
  const [mgrPassword, setMgrPassword] = useState('');
  const [mgrPasswordConfirm, setMgrPasswordConfirm] = useState('');
  const [showMgrPassword, setShowMgrPassword] = useState(false);

  // Super Admin first-run claim state (only active when no env secret & no admin claimed yet)
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Resident whitelist registration state
  const [inviteInfo, setInviteInfo] = useState<{
    communities: { id: string; name: string; nameFa: string; organization: string }[];
  } | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [unitOrBay, setUnitOrBay] = useState('');
  const [verifiedData, setVerifiedData] = useState<VerifiedWhitelistPayload | null>(null);
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [shareMyBay, setShareMyBay] = useState(true);
  const [startMin, setStartMin] = useState(480);
  const [endMin, setEndMin] = useState(1140);
  const [isFree, setIsFree] = useState(true);
  const [hourlyEur, setHourlyEur] = useState(1.5);
  const [autoApproval, setAutoApproval] = useState(true);
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicyLevel>('residents_only');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialInviteToken) return;
    fetch(`/api/invite/${encodeURIComponent(initialInviteToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            lang === 'fa' ? data.errorFa || 'لینک دعوت نامعتبر است.' : data.errorEn || 'Invalid invite link.'
          );
        }
        return res.json();
      })
      .then((data) => {
        setInviteInfo(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Invite link error');
      });
  }, [initialInviteToken, lang]);

  const handleSetupManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mgrPassword !== mgrPasswordConfirm) {
      setError(t(lang, 'رمز عبور و تکرار آن یکسان نیستند.', 'Passwords do not match.'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: mgrName.trim(),
          username: mgrUsername.trim(),
          password: mgrPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error);
        return;
      }
      onAuthenticated(data.token, data.account);
    } catch {
      setError(t(lang, 'خطا در برقراری ارتباط با سرور.', 'Network error.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (adminPassword !== adminPasswordConfirm) {
      setError(t(lang, 'رمز عبور و تکرار آن یکسان نیستند.', 'Passwords do not match.'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: adminName.trim(),
          username: adminUsername.trim(),
          password: adminPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error);
        return;
      }
      onAuthenticated(data.token, data.account);
    } catch {
      setError(t(lang, 'خطا در برقراری ارتباط با سرور.', 'Network error.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          role: mode === 'admin_login' ? 'super_admin' : loginRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error);
        return;
      }
      onAuthenticated(data.token, data.account);
    } catch {
      setError(t(lang, 'خطا در برقراری ارتباط با سرور.', 'Network error.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/invite/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteToken: initialInviteToken ?? undefined,
          identifier: identifier.trim(),
          unitOrBay: unitOrBay.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error);
        return;
      }
      setVerifiedData(data);
      const allowed = data.community.allowedUsagePolicies as AccessPolicyLevel[];
      setAccessPolicy(allowed[0] ?? 'residents_only');
      if (!data.community.allowPaidSharing) {
        setIsFree(true);
      }
    } catch {
      setError(t(lang, 'خطا در بررسی لیست ساختمان.', 'Verification error.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteResidentSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedData) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register-resident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteToken: initialInviteToken ?? undefined,
          identifier: identifier.trim(),
          unitOrBay: unitOrBay.trim(),
          username: regUsername.trim(),
          password: regPassword,
          shareMyBay,
          startMin,
          endMin,
          isFree: verifiedData.community.allowPaidSharing ? isFree : true,
          hourlyEur,
          autoApproval,
          accessPolicy,
          evCharging: verifiedData.entry.evCharging,
          graceNoticeMinutes: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error);
        return;
      }
      onClearInviteToken();
      onAuthenticated(data.token, data.account);
    } catch {
      setError(t(lang, 'خطا در ایجاد حساب کاربری.', 'Registration error.'));
    } finally {
      setLoading(false);
    }
  };

  const passwordsMismatch = mgrPasswordConfirm.length > 0 && mgrPassword !== mgrPasswordConfirm;
  const adminPasswordsMismatch =
    adminPasswordConfirm.length > 0 && adminPassword !== adminPasswordConfirm;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-0 items-stretch bg-transparent lg:bg-white lg:border lg:border-[#ECE9F7] lg:rounded-3xl lg:overflow-hidden lg:ps-card-shadow">
        {/* Desktop Value & Privacy Pillar Panel (Hidden on mobile so form is instantly above the fold) */}
        <aside className="hidden lg:flex lg:col-span-5 bg-gradient-to-br from-[#2B1B54] via-[#4C2A96] to-[#7342C4] text-white p-10 flex-col justify-between relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -end-16 w-56 h-56 rounded-full bg-[#D58AF0]/25 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -start-10 w-44 h-44 rounded-full bg-[#F46A46]/20 blur-2xl" />

          <div className="space-y-8 relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 text-white flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">ParkShare</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl font-bold leading-snug text-balance">
                {t(
                  lang,
                  'اشتراک‌گذاری امن و منصفانه پارکینگ در ساختمان شما',
                  'Private, fair parking sharing built for your building'
                )}
              </h1>
              <p className="text-sm text-[#EAE4FB] leading-relaxed">
                {t(
                  lang,
                  'جای پارک‌های خالی را فقط در اختیار همسایه‌های تاییدشده بگذارید؛ با کنترل کامل مدیر ساختمان و حفظ حریم خصوصی هر واحد.',
                  'Share unused bays exclusively with verified neighbors — under full manager control and resident privacy.'
                )}
              </p>
            </div>

            <div className="space-y-5 pt-4 border-t border-white/15">
              <div className="flex items-start gap-3.5">
                <ShieldCheck className="w-5 h-5 text-[#9EEAD8] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {t(lang, 'ورود فقط با لیست رسمی مدیر', 'Manager Whitelist Only')}
                  </div>
                  <p className="text-xs text-[#D9CEF7] mt-1 leading-relaxed">
                    {t(
                      lang,
                      'هیچ فرد خارج از لیست مجاز ساختمان نمی‌تواند ثبت‌نام کند یا ظرفیت پارکینگ‌ها را ببیند.',
                      'Outsiders cannot register or view building parking availability.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <Lock className="w-5 h-5 text-[#E5B8FA] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {t(lang, 'هویت مخفی در تمام رزروها', 'Pseudonymous by Default')}
                  </div>
                  <p className="text-xs text-[#D9CEF7] mt-1 leading-relaxed">
                    {t(
                      lang,
                      'نام، شماره واحد، تلفن و ایمیل شما هرگز برای همسایه‌های دیگر نمایش داده نمی‌شود.',
                      'Your name, unit, phone, and email are never exposed to other neighbors.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <Scale className="w-5 h-5 text-[#FFB49F] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {t(lang, 'قوانین منصفانه پارکینگ موقت', 'Anti-Abuse Fair-Use Rules')}
                  </div>
                  <p className="text-xs text-[#D9CEF7] mt-1 leading-relaxed">
                    {t(
                      lang,
                      'سقف ساعتی، روزانه و ماهانه از تبدیل پارکینگ موقت به اجاره دائمی جلوگیری می‌کند.',
                      'Hourly, consecutive-day, and monthly caps keep temporary spots fair for everyone.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/15 text-xs text-[#D9CEF7] relative">
            {t(
              lang,
              'داده‌های هر ساختمان به‌صورت جداگانه و رمزگذاری‌شده نگهداری می‌شود.',
              'Every building tenant is isolated and encrypted independently.'
            )}
          </div>
        </aside>

        {/* Form Column (Full-width mobile card / Right-hand 7-col desktop panel) */}
        <div className="lg:col-span-7 flex flex-col justify-center lg:p-10">
          <div className="w-full max-w-md mx-auto space-y-5">
            {/* Compact Mobile Brand Header */}
            <div className="lg:hidden text-center space-y-1.5">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl ps-hero-gradient text-white mx-auto shadow-sm">
                <Building2 className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold text-[#171525]">ParkShare</h1>
              <p className="text-xs text-[#7D7A92]">
                {t(lang, 'اشتراک‌گذاری امن و خصوصی پارکینگ ساختمان', 'Private & Secure Building Parking Sharing')}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs leading-relaxed"
              >
                {error}
              </div>
            )}

            {/* MODE 1: MANAGER ACCOUNT CREATION */}
            {mode === 'setup_manager' && (
              <form
                onSubmit={handleSetupManager}
                className="bg-white lg:bg-transparent border border-slate-200 lg:border-0 rounded-2xl p-5 sm:p-6 lg:p-0 space-y-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900">
                      {t(lang, 'ساخت حساب مدیر ساختمان', 'Create Building Manager Account')}
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t(
                        lang,
                        'نام کاربری و رمز عبور اختصاصی خود را بسازید تا ساختمان، پارکینگ‌ها و لیست ساکنان مجاز را مدیریت کنید.',
                        'Create your manager credentials to configure your building, parking catalog, and resident whitelist.'
                      )}
                    </p>
                  </div>
                  {hasManager && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setLoginRole('manager');
                        setMode('login');
                      }}
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
                    >
                      <ArrowRight className={`w-3.5 h-3.5 ${lang === 'en' ? 'rotate-180' : ''}`} />
                      {t(lang, 'ورود', 'Login')}
                    </button>
                  )}
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="mgr-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'نام و نام خانوادگی مدیر', 'Manager Full Name')}
                    </label>
                    <input
                      id="mgr-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={mgrName}
                      onChange={(e) => setMgrName(e.target.value)}
                      placeholder={t(lang, 'مثلاً: محمد جابری', 'e.g. Alex van Dijk')}
                      className="w-full h-11 px-3.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="mgr-user" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'نام کاربری (برای ورود)', 'Username')}
                    </label>
                    <input
                      id="mgr-user"
                      type="text"
                      required
                      minLength={3}
                      dir="ltr"
                      autoComplete="username"
                      value={mgrUsername}
                      onChange={(e) => setMgrUsername(e.target.value)}
                      placeholder="manager"
                      className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="mgr-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'رمز عبور (حداقل ۶ کاراکتر)', 'Password (min 6 chars)')}
                    </label>
                    <div className="relative">
                      <input
                        id="mgr-pass"
                        type={showMgrPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        dir="ltr"
                        autoComplete="new-password"
                        value={mgrPassword}
                        onChange={(e) => setMgrPassword(e.target.value)}
                        className="w-full h-11 px-3.5 pe-11 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMgrPassword((v) => !v)}
                        className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-700"
                        aria-label={t(lang, 'نمایش یا مخفی کردن رمز عبور', 'Toggle password visibility')}
                      >
                        {showMgrPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="mgr-pass-confirm" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'تکرار رمز عبور', 'Confirm Password')}
                    </label>
                    <input
                      id="mgr-pass-confirm"
                      type={showMgrPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      dir="ltr"
                      autoComplete="new-password"
                      value={mgrPasswordConfirm}
                      onChange={(e) => setMgrPasswordConfirm(e.target.value)}
                      className={`w-full h-11 px-3.5 text-sm font-mono bg-white border rounded-xl ${
                        passwordsMismatch ? 'border-red-400 bg-red-50/30' : 'border-slate-200 focus:border-blue-600'
                      }`}
                    />
                    {passwordsMismatch && (
                      <p className="text-[11px] text-red-700 mt-1">
                        {t(lang, 'رمز عبور و تکرار آن هنوز یکسان نیستند.', 'Passwords do not match yet.')}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || passwordsMismatch}
                  className="w-full h-12 text-sm font-semibold ps-violet-btn text-white rounded-2xl active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {loading
                    ? t(lang, 'در حال ساخت حساب...', 'Creating account...')
                    : t(lang, 'ساخت حساب مدیر و ورود', 'Create Manager Account')}
                </button>

                <div className="pt-3 border-t border-[#ECE9F7] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setLoginRole('manager');
                      setMode('login');
                    }}
                    className="min-h-[40px] px-3 text-xs font-semibold text-[#6E41C4] hover:underline"
                  >
                    {t(
                      lang,
                      'قبلاً حساب ساخته‌اید؟ ورود با نام کاربری و رمز عبور',
                      'Already have an account? Sign in'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* PRIVATE /admin ROUTE: ONE-TIME ADMIN SETUP */}
            {mode === 'setup_admin' && (
              <form
                onSubmit={handleSetupAdmin}
                className="bg-white lg:bg-transparent border border-slate-200 lg:border-0 rounded-2xl p-5 sm:p-6 lg:p-0 space-y-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t(lang, 'مسیر اختصاصی پنل ادمین', 'Private Admin Setup')}</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {t(lang, 'تعیین نام کاربری و رمز عبور ادمین', 'Set Admin Username & Password')}
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t(
                        lang,
                        'پس از ثبت این حساب، هم از همین آدرس (/admin) و هم از فرم عادی «ورود مدیر ساختمان» می‌توانید وارد داشبورد کل شوید.',
                        'Once set, sign in either via /admin or directly through the normal Building Manager login form.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      onExitAdminRoute();
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
                  >
                    <ArrowRight className={`w-3.5 h-3.5 ${lang === 'en' ? 'rotate-180' : ''}`} />
                    {t(lang, 'صفحه اصلی', 'Home')}
                  </button>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="adm-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'نام نمایشی مالک سامانه', 'Owner Display Name')}
                    </label>
                    <input
                      id="adm-name"
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder={t(lang, 'مثلاً: مدیر کل ParkShare', 'e.g. Platform Owner')}
                      className="w-full h-11 px-3.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-user" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'نام کاربری مدیریت کل', 'Admin Username')}
                    </label>
                    <input
                      id="adm-user"
                      type="text"
                      required
                      minLength={3}
                      dir="ltr"
                      autoComplete="username"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'رمز عبور قوی (حداقل ۸ کاراکتر)', 'Strong Password (min 8 chars)')}
                    </label>
                    <div className="relative">
                      <input
                        id="adm-pass"
                        type={showAdminPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        dir="ltr"
                        autoComplete="new-password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full h-11 px-3.5 pe-11 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword((v) => !v)}
                        className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-700"
                        aria-label={t(lang, 'نمایش رمز عبور', 'Toggle password visibility')}
                      >
                        {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="adm-pass-confirm" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'تکرار رمز عبور', 'Confirm Password')}
                    </label>
                    <input
                      id="adm-pass-confirm"
                      type={showAdminPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      dir="ltr"
                      autoComplete="new-password"
                      value={adminPasswordConfirm}
                      onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                      className={`w-full h-11 px-3.5 text-sm font-mono bg-white border rounded-xl ${
                        adminPasswordsMismatch ? 'border-red-400 bg-red-50/30' : 'border-slate-200 focus:border-blue-600'
                      }`}
                    />
                    {adminPasswordsMismatch && (
                      <p className="text-[11px] text-red-700 mt-1">
                        {t(lang, 'رمز عبور و تکرار آن یکسان نیستند.', 'Passwords do not match.')}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || adminPasswordsMismatch}
                  className="w-full h-12 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {loading
                    ? t(lang, 'در حال ثبت و ورود...', 'Setting up...')
                    : t(lang, 'ثبت حساب مدیریت کل و ورود به داشبورد', 'Claim Owner Account & Enter')}
                </button>
              </form>
            )}

            {/* PRIVATE /admin ROUTE: ADMIN SIGN-IN */}
            {mode === 'admin_login' && (
              <form
                onSubmit={handleLogin}
                className="bg-white lg:bg-transparent border border-slate-200 lg:border-0 rounded-2xl p-5 sm:p-6 lg:p-0 space-y-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 font-mono">
                      <Lock className="w-3.5 h-3.5" />
                      <span>/admin</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {t(lang, 'ورود به پنل ادمین سامانه', 'Admin Console Sign In')}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      onExitAdminRoute();
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
                  >
                    <ArrowRight className={`w-3.5 h-3.5 ${lang === 'en' ? 'rotate-180' : ''}`} />
                    {t(lang, 'صفحه اصلی', 'Home')}
                  </button>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="admin-login-user" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'نام کاربری ادمین', 'Admin Username')}
                    </label>
                    <input
                      id="admin-login-user"
                      type="text"
                      required
                      dir="ltr"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-login-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'رمز عبور', 'Password')}
                    </label>
                    <div className="relative">
                      <input
                        id="admin-login-pass"
                        type={showPassword ? 'text' : 'password'}
                        required
                        dir="ltr"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-11 px-3.5 pe-11 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-700"
                        aria-label={t(lang, 'نمایش یا مخفی کردن رمز عبور', 'Toggle password visibility')}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {loading ? t(lang, 'در حال ورود...', 'Signing in...') : t(lang, 'ورود به پنل ادمین', 'Sign In to Admin Panel')}
                </button>
              </form>
            )}

            {/* MODE 2: PUBLIC USERNAME & PASSWORD LOGIN (ONLY RESIDENT OR BUILDING MANAGER) */}
            {mode === 'login' && (
              <form
                onSubmit={handleLogin}
                className="bg-white lg:bg-transparent border border-slate-200 lg:border-0 rounded-2xl p-5 sm:p-6 lg:p-0 space-y-5"
              >
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    {t(lang, 'ورود به حساب کاربری', 'Sign In to ParkShare')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t(lang, 'نقش خود را انتخاب کرده و نام کاربری و رمز عبور را وارد کنید.', 'Choose your role and enter your credentials.')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1 p-1 bg-[#F2EFFA] rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole('resident');
                      setError(null);
                    }}
                    className={`min-h-[40px] text-xs font-semibold rounded-xl transition-colors whitespace-nowrap ${
                      loginRole === 'resident' ? 'bg-white text-[#5A2FA8] shadow-xs' : 'text-[#6B6780] hover:text-[#171525]'
                    }`}
                  >
                    {t(lang, 'ورود ساکن', 'Resident Login')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole('manager');
                      setError(null);
                    }}
                    className={`min-h-[40px] text-xs font-semibold rounded-xl transition-colors whitespace-nowrap ${
                      loginRole === 'manager' ? 'bg-white text-[#5A2FA8] shadow-xs' : 'text-[#6B6780] hover:text-[#171525]'
                    }`}
                  >
                    {t(lang, 'ورود مدیر ساختمان', 'Manager Login')}
                  </button>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="login-user" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'نام کاربری', 'Username')}
                    </label>
                    <input
                      id="login-user"
                      type="text"
                      required
                      dir="ltr"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t(lang, 'رمز عبور', 'Password')}
                    </label>
                    <div className="relative">
                      <input
                        id="login-pass"
                        type={showPassword ? 'text' : 'password'}
                        required
                        dir="ltr"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-11 px-3.5 pe-11 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-700"
                        aria-label={t(lang, 'نمایش یا مخفی کردن رمز عبور', 'Toggle password visibility')}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-sm font-semibold ps-violet-btn text-white rounded-2xl active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {loading
                    ? t(lang, 'در حال ورود...', 'Signing in...')
                    : loginRole === 'manager'
                      ? t(lang, 'ورود به پنل مدیر ساختمان', 'Sign In as Manager')
                      : t(lang, 'ورود به اپلیکیشن ساکنان', 'Sign In as Resident')}
                </button>

                <div className="pt-3 border-t border-[#ECE9F7] text-center">
                  {loginRole === 'resident' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setVerifiedData(null);
                        setMode('resident_register');
                      }}
                      className="min-h-[40px] px-3 text-xs font-semibold text-[#6E41C4] hover:underline"
                    >
                      {t(
                        lang,
                        'اولین بار است وارد می‌شوید؟ فعال‌سازی حساب از لیست ساختمان',
                        'First time here? Activate your login from the building list'
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode('setup_manager');
                      }}
                      className="min-h-[40px] px-3 text-xs font-semibold text-[#6E41C4] hover:underline"
                    >
                      {t(
                        lang,
                        'حساب مدیر ساختمان ندارید؟ ساخت حساب مدیر جدید',
                        'No manager account yet? Create Building Manager Account'
                      )}
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* MODE 3: RESIDENT WHITELIST VERIFICATION + SET USERNAME & PASSWORD */}
            {mode === 'resident_register' && (
              <div className="bg-white lg:bg-transparent border border-slate-200 lg:border-0 rounded-2xl p-5 sm:p-6 lg:p-0 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
                      <UserCheck className="w-4 h-4" />
                      <span>
                        {verifiedData
                          ? t(lang, 'مرحله ۲ از ۲', 'Step 2 of 2')
                          : t(lang, 'مرحله ۱ از ۲', 'Step 1 of 2')}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {verifiedData
                        ? t(lang, 'ساخت نام کاربری و تنظیم پارکینگ', 'Create Login & Bay Settings')
                        : t(lang, 'احراز هویت در لیست رسمی ساختمان', 'Verify Against Building List')}
                    </h2>
                  </div>

                  {hasManager && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearInviteToken();
                        setVerifiedData(null);
                        setError(null);
                        setMode('login');
                      }}
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
                    >
                      <ArrowRight className={`w-3.5 h-3.5 ${lang === 'en' ? 'rotate-180' : ''}`} />
                      {t(lang, 'ورود', 'Login')}
                    </button>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-1.5 rounded-full bg-[#6E41C4]" />
                  <div className={`h-1.5 rounded-full transition-colors ${verifiedData ? 'bg-[#6E41C4]' : 'bg-[#E5DFF5]'}`} />
                </div>

                {inviteInfo?.communities?.length ? (
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                    {t(lang, 'دعوت‌نامه معتبر برای:', 'Valid invite for:')}{' '}
                    <strong className="text-slate-900">
                      {inviteInfo.communities.map((c) => (lang === 'fa' ? c.nameFa : c.name)).join(' · ')}
                    </strong>
                  </div>
                ) : null}

                {!verifiedData ? (
                  <form onSubmit={handleVerifyWhitelist} className="space-y-3.5">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t(
                        lang,
                        'فقط ساکنانی که مدیر ساختمان مشخصاتشان را در لیست رسمی وارد کرده، می‌توانند نام کاربری و رمز عبور بسازند.',
                        'Only residents registered on the manager’s official list can activate an account.'
                      )}
                    </p>
                    <div>
                      <label htmlFor="wl-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                        {t(lang, 'ایمیل یا شماره تلفن ثبت‌شده نزد مدیر', 'Registered Email or Phone')}
                      </label>
                      <input
                        id="wl-id"
                        type="text"
                        required
                        dir="ltr"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="wl-bay" className="block text-xs font-medium text-slate-700 mb-1.5">
                        {t(lang, 'شماره واحد یا کد پارکینگ', 'Unit Number or Bay Code')}
                      </label>
                      <input
                        id="wl-bay"
                        type="text"
                        required
                        dir="ltr"
                        value={unitOrBay}
                        onChange={(e) => setUnitOrBay(e.target.value)}
                        placeholder="P1-001"
                        className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 inline-flex items-center justify-center gap-2 text-sm font-semibold ps-violet-btn text-white rounded-2xl active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                      <KeyRound className="w-4 h-4" />
                      {loading ? t(lang, 'در حال بررسی...', 'Checking...') : t(lang, 'بررسی لیست و ادامه', 'Verify & Continue')}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleCompleteResidentSignup} className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span className="leading-relaxed">
                        <strong>{verifiedData.entry.ownerName}</strong> · {t(lang, 'واحد', 'Unit')}{' '}
                        {verifiedData.entry.unitNumber} · {t(lang, 'پارکینگ', 'Bay')}{' '}
                        <strong className="font-mono">{verifiedData.entry.bayCode}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="reg-user" className="block text-xs font-medium text-slate-700 mb-1.5">
                          {t(lang, 'نام کاربری دلخواه', 'Choose Username')}
                        </label>
                        <input
                          id="reg-user"
                          type="text"
                          required
                          minLength={3}
                          dir="ltr"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          className="w-full h-11 px-3 text-sm font-mono bg-white border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div>
                        <label htmlFor="reg-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                          {t(lang, 'رمز عبور (حداقل ۶ کاراکتر)', 'Password (min 6)')}
                        </label>
                        <div className="relative">
                          <input
                            id="reg-pass"
                            type={showRegPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            dir="ltr"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            className="w-full h-11 px-3 pe-10 text-sm font-mono bg-white border border-slate-200 rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword((v) => !v)}
                            className="absolute inset-y-0 end-0 w-10 flex items-center justify-center text-slate-400 hover:text-slate-700"
                            aria-label={t(lang, 'نمایش رمز', 'Toggle password')}
                          >
                            {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shareMyBay}
                        onChange={(e) => setShareMyBay(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700"
                      />
                      <span>
                        {t(lang, 'مایلم پارکینگ خودم را در ساعات آزاد به اشتراک بگذارم', 'Share my bay when I am not using it')}
                      </span>
                    </label>

                    {shareMyBay && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-600 mb-1">{t(lang, 'آزاد از', 'Free from')}</label>
                            <select
                              value={startMin}
                              onChange={(e) => setStartMin(Number(e.target.value))}
                              className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                            >
                              {HOURS.slice(0, -1).map((m) => (
                                <option key={m} value={m}>
                                  {formatMinutes(m)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-600 mb-1">{t(lang, 'آزاد تا', 'Free until')}</label>
                            <select
                              value={endMin}
                              onChange={(e) => setEndMin(Number(e.target.value))}
                              className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                            >
                              {HOURS.filter((m) => m > startMin).map((m) => (
                                <option key={m} value={m}>
                                  {formatMinutes(m)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-600 mb-1">
                            {t(lang, 'چه کسانی مجاز باشند؟ (طبق قانون مدیر)', 'Who may use it?')}
                          </label>
                          <select
                            value={accessPolicy}
                            onChange={(e) => setAccessPolicy(e.target.value as AccessPolicyLevel)}
                            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                          >
                            {(verifiedData.community.allowedUsagePolicies.length
                              ? verifiedData.community.allowedUsagePolicies
                              : (['residents_only'] as AccessPolicyLevel[])
                            ).map((pol) => (
                              <option key={pol} value={pol}>
                                {t(lang, POLICY_LABELS[pol].fa, POLICY_LABELS[pol].en)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-1">
                          <label className="inline-flex items-center gap-2 min-h-[36px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoApproval}
                              onChange={(e) => setAutoApproval(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-700"
                            />
                            <span>{t(lang, 'تأیید خودکار', 'Auto-approval')}</span>
                          </label>

                          {verifiedData.community.allowPaidSharing ? (
                            <div className="inline-flex items-center gap-2">
                              <label className="inline-flex items-center gap-2 min-h-[36px] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isFree}
                                  onChange={(e) => setIsFree(e.target.checked)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-700"
                                />
                                <span>{t(lang, 'رایگان', 'Free')}</span>
                              </label>
                              {!isFree && (
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0.5"
                                  value={hourlyEur}
                                  onChange={(e) => setHourlyEur(Number(e.target.value))}
                                  className="w-20 h-9 px-2.5 font-mono bg-white border border-slate-200 rounded-lg"
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-800 font-medium">
                              {t(lang, 'فقط رایگان (قانون ساختمان)', 'Free only (building rule)')}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-[11px] text-emerald-900 flex items-start gap-2">
                      <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <span>
                        {t(
                          lang,
                          'نام، شماره واحد، ایمیل و شماره تلفن شما هرگز برای سایر همسایه‌ها نمایش داده نمی‌شود.',
                          'Your name, unit, email, and phone are never shown to other neighbors.'
                        )}
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 inline-flex items-center justify-center gap-2 text-sm font-semibold ps-violet-btn text-white rounded-2xl active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {loading
                        ? t(lang, 'در حال ثبت‌نام...', 'Creating account...')
                        : t(lang, 'ساخت حساب کاربری و ورود', 'Create Login & Enter')}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
