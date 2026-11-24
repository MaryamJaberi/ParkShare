import React, { useEffect, useState } from 'react';
import { CheckCircle2, Play, XCircle } from 'lucide-react';
import { AcceptanceTestResult, Language } from '../types/parkshare';
import { runCoreAcceptanceSuite } from '../engines/acceptanceTests';
import { t } from '../i18n/translations';

interface Props {
  lang: Language;
}

const NON_NEGOTIABLE_RULES = [
  { key: 'Owner Control', fa: 'صاحب منبع کنترل کامل بر فعال‌سازی اشتراک‌گذاری را دارد.' },
  { key: 'Default Free', fa: 'اشتراک‌گذاری به‌صورت پیش‌فرض رایگان است مگر انتخاب خلاف توسط مالک.' },
  { key: 'No Unauthorized Access', fa: 'هیچ ترجیح جست‌وجویی نمی‌تواند قوانین امنیتی Policy Engine را دور بزند.' },
  { key: 'No Double Booking', fa: 'قفل اتمیک از ثبت دو رزرو متداخل روی یک منبع جلوگیری می‌کند.' },
  { key: 'Explicit Consent', fa: 'اطلاعات شخصی بدون رضایت منتشر نمی‌شود و از Gateway عبور نمی‌کند.' },
  { key: 'Federated Independence', fa: 'قطع شبکه مرکزی عملکرد داخلی ساختمان را مختل نمی‌کند (Graceful Degradation).' },
  { key: 'Resource Extensibility', fa: 'افزودن Boat Berth، Storage یا منابع جدید نیازمند بازنویسی Core نیست.' },
  { key: 'Auditability', fa: 'تمامی رویدادهای رزرو، تخلیه و تبادل فدرال قابل پیگیری هستند.' },
];

export const AcceptanceSuiteView: React.FC<Props> = ({ lang }) => {
  const [results, setResults] = useState<AcceptanceTestResult[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string>('');

  const executeSuite = () => {
    const res = runCoreAcceptanceSuite();
    setResults(res);
    setLastRunAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  useEffect(() => {
    executeSuite();
  }, []);

  const passedCount = results.filter((r) => r.passed).length;
  const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t(lang, 'آزمون پذیرش زنده مغز اصلی (Core Engine Acceptance Suite)', 'Core Engine Live Acceptance Suite')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            {t(
              lang,
              'اجرای واقعی هر ۱۰ معیار پذیرش بخش دهم روی کد زنده موتورهای تطبیق، قفل هم‌زمانی، زنجیره‌سازی، حالت آفلاین و Zero-PII فدرال.',
              'Executes all 10 Section-10 acceptance criteria directly against the live TypeScript Core Engines in real time.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={executeSuite}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <Play className="w-3.5 h-3.5" />
          {t(lang, 'اجرای مجدد ۱۰ آزمون هسته', 'Re-run All 10 Tests')}
        </button>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{t(lang, 'نتیجه آزمون‌ها', 'Verification Result')}</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-700">
            {passedCount} / {results.length} {t(lang, 'موفق', 'Passed')}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{t(lang, 'زمان اجرای کل موتور', 'Total Engine Execution')}</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {totalDuration.toFixed(2)} ms
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">{t(lang, 'آخرین اجرا', 'Last Executed')}</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {lastRunAt || '—'}
          </div>
        </div>
      </div>

      {/* 10 Acceptance Tests Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm text-start border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-600 font-medium">
              <th className="py-3 px-4 text-start">{t(lang, 'سناریوی آزمون (بخش ۱۰)', 'Acceptance Scenario')}</th>
              <th className="py-3 px-4 text-start">{t(lang, 'نتیجه مورد انتظار', 'Expected Behavior')}</th>
              <th className="py-3 px-4 text-start">{t(lang, 'خروجی زنده موتور', 'Live Engine Assertion')}</th>
              <th className="py-3 px-4 text-end">{t(lang, 'وضعیت', 'Status')}</th>
              <th className="py-3 px-4 text-end">{t(lang, 'زمان', 'Time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="py-3.5 px-4 font-medium text-slate-900">
                  <span className="font-mono text-xs text-slate-400 me-2">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {lang === 'fa' ? r.nameFa : r.nameEn}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-600">
                  {lang === 'fa' ? r.expectedFa : r.expectedEn}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-800">
                  {lang === 'fa' ? r.actualFa : r.actualEn}
                </td>
                <td className="py-3.5 px-4 text-end whitespace-nowrap">
                  {r.passed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      {t(lang, 'موفق', 'Pass')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                      <XCircle className="w-4 h-4" />
                      {t(lang, 'ناموفق', 'Fail')}
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-end font-mono tabular-nums text-xs text-slate-500">
                  {r.durationMs.toFixed(1)}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Non-Negotiable Core Product Invariants (Section 8) */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          {t(lang, 'قوانین غیرقابل مذاکره هسته محصول (بخش هشتم)', 'Non-Negotiable Core Product Invariants')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {NON_NEGOTIABLE_RULES.map((rule) => (
            <div key={rule.key} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="text-xs font-semibold font-mono text-blue-800">{rule.key}</div>
              <p className="text-xs text-slate-600 leading-relaxed">{rule.fa}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
