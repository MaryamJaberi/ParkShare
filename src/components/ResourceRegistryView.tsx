import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  AccessPolicyLevel,
  Community,
  Language,
  Resource,
  ResourceType,
} from '../types/parkshare';
import { resourceTypeLabels, t } from '../i18n/translations';

interface Props {
  lang: Language;
  communities: Community[];
  resources: Resource[];
  onToggleSharing: (resourceId: string) => void;
  onTogglePricing: (resourceId: string) => void;
  onToggleApproval: (resourceId: string) => void;
  onToggleHideRecall: (resourceId: string) => void;
  onAddResource: (resource: Resource) => void;
}

const RESOURCE_TYPES: ResourceType[] = ['parking', 'boat_berth', 'storage', 'commercial'];

export const ResourceRegistryView: React.FC<Props> = ({
  lang,
  communities,
  resources,
  onToggleSharing,
  onTogglePricing,
  onToggleApproval,
  onToggleHideRecall,
  onAddResource,
}) => {
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // New resource form state
  const [newType, setNewType] = useState<ResourceType>('parking');
  const [newCommunityId, setNewCommunityId] = useState<string>(communities[0]?.id ?? 'comm-boston');
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newZone, setNewZone] = useState('B1');
  const [newLength, setNewLength] = useState(5.2);
  const [newWidth, setNewWidth] = useState(2.5);
  const [newHeightOrDepth, setNewHeightOrDepth] = useState(2.15);
  const [newAccess, setNewAccess] = useState<AccessPolicyLevel>('residents_and_guests');
  const [newFree, setNewFree] = useState(true);
  const [newHourly, setNewHourly] = useState(2.0);
  const [newAutoApprove, setNewAutoApprove] = useState(true);

  const communityMap = useMemo(() => new Map(communities.map((c) => [c.id, c])), [communities]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return resources;
    return resources.filter((r) => r.type === typeFilter);
  }, [resources, typeFilter]);

  const handleTypeSelect = (rt: ResourceType) => {
    setNewType(rt);
    if (rt === 'boat_berth') {
      setNewZone('Dock-A');
      setNewLength(12.0);
      setNewWidth(3.8);
      setNewHeightOrDepth(2.5);
    } else if (rt === 'parking') {
      setNewZone('B1');
      setNewLength(5.2);
      setNewWidth(2.5);
      setNewHeightOrDepth(2.15);
    } else if (rt === 'storage') {
      setNewZone('B2');
      setNewLength(4.0);
      setNewWidth(3.0);
      setNewHeightOrDepth(2.6);
    } else {
      setNewZone('G');
      setNewLength(7.0);
      setNewWidth(3.5);
      setNewHeightOrDepth(3.2);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newTitle.trim()) return;
    const id = `res-${Date.now()}`;
    const created: Resource = {
      id,
      networkAliasId: `anon-${newType.slice(0, 3)}-${Math.random().toString(16).slice(2, 8)}`,
      communityId: newCommunityId,
      code: newCode.trim().toUpperCase(),
      title: newTitle.trim(),
      titleFa: newTitle.trim(),
      type: newType,
      sharingEnabled: true,
      active: true,
      floorOrZone: newZone.trim() || 'B1',
      nearElevatorOrDock: true,
      dimensions: {
        lengthM: Number(newLength),
        widthM: Number(newWidth),
        heightOrDepthM: Number(newHeightOrDepth),
        areaSqm: newType === 'storage' || newType === 'commercial' ? Math.round(newLength * newWidth * 10) / 10 : undefined,
      },
      allowedVehicleTypes: newType === 'parking' ? ['car', 'motorcycle', 'van'] : undefined,
      allowedVesselTypes: newType === 'boat_berth' ? ['motorboat', 'sailboat'] : undefined,
      evCharging: newType === 'parking' ? false : undefined,
      shorePower: newType === 'boat_berth' ? true : undefined,
      climateControlled: newType === 'storage' ? true : undefined,
      pricing: { isFree: newFree, hourlyEur: newFree ? 0 : Number(newHourly) },
      approvalMode: newAutoApprove ? 'automatic' : 'manual',
      accessPolicy: newAccess,
      bufferMinutes: 15,
      recallRiskScore: 0.12,
      hideRecallRiskFromPublic: false,
      graceNoticeMinutes: 30,
      declaredAvailability: [{ startMin: 480, endMin: 1320 }],
      maintenanceBlocks: [],
      ownerPrivate: {
        ownerId: `own-${Date.now()}`,
        fullName: 'Verified Resource Holder',
        phone: '+31 6 5500 1200',
        email: 'holder@community-node.nl',
        unitNumber: 'Unit Registered',
        emergencyContact: '+31 6 5500 1299',
      },
    };
    onAddResource(created);
    setNewCode('');
    setNewTitle('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t(lang, 'موتور منابع جهانی (Universal Resource Registry)', 'Universal Resource Engine Registry')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            {t(
              lang,
              'هسته سیستم به پارکینگ محدود نیست: پارکینگ خودرو، جایگاه قایق (عمق آب/آبخور)، فضای انبار و فضای تجاری از یک مدل عمومی با ویژگی‌های اختصاصی استفاده می‌کنند.',
              'Resource-extensible core supporting Parking Spaces, Boat Berths (water depth/draft), Storage Units, and Commercial Bays without rewriting core engines.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          {t(lang, 'ثبت منبع جدید', 'Register Resource')}
        </button>
      </div>

      {/* Add Resource Form */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              {t(lang, 'افزودن منبع جدید به رجیستری جهانی', 'Register New Extensible Resource')}
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'نوع منبع (Resource Type)', 'Resource Type')}
              </label>
              <select
                value={newType}
                onChange={(e) => handleTypeSelect(e.target.value as ResourceType)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              >
                {RESOURCE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {resourceTypeLabels[rt][lang]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'مجموعه مالک', 'Community Tenant')}
              </label>
              <select
                value={newCommunityId}
                onChange={(e) => setNewCommunityId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              >
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'fa' ? c.nameFa : c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'کد منبع', 'Resource Code')}
              </label>
              <input
                type="text"
                required
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={newType === 'boat_berth' ? 'B405' : 'P109'}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'عنوان نمایشی', 'Display Title')}
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={newType === 'boat_berth' ? 'Maashaven 12m Slip' : 'Boston B1 Shared Bay'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {newType === 'boat_berth' ? t(lang, 'طول اسکله (متر)', 'Berth Length (m)') : t(lang, 'طول (متر)', 'Length (m)')}
              </label>
              <input
                type="number"
                step="0.1"
                value={newLength}
                onChange={(e) => setNewLength(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {newType === 'boat_berth' ? t(lang, 'عرض جایگاه (متر)', 'Beam Width (m)') : t(lang, 'عرض (متر)', 'Width (m)')}
              </label>
              <input
                type="number"
                step="0.1"
                value={newWidth}
                onChange={(e) => setNewWidth(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {newType === 'boat_berth'
                  ? t(lang, 'عمق آب / آبخور (متر)', 'Water Depth / Draft (m)')
                  : t(lang, 'محدودیت ارتفاع (متر)', 'Height Clearance (m)')}
              </label>
              <input
                type="number"
                step="0.1"
                value={newHeightOrDepth}
                onChange={(e) => setNewHeightOrDepth(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'سیاست دسترسی (Policy)', 'Access Policy')}
              </label>
              <select
                value={newAccess}
                onChange={(e) => setNewAccess(e.target.value as AccessPolicyLevel)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="residents_only">residents_only</option>
                <option value="residents_and_guests">residents_and_guests</option>
                <option value="network_members">network_members (Federated)</option>
                <option value="public">public (City Network)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFree}
                  onChange={(e) => setNewFree(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                <span>{t(lang, 'رایگان (قانون Default Free)', 'Free (Default Free Rule)')}</span>
              </label>

              {!newFree && (
                <label className="inline-flex items-center gap-1.5">
                  <span>€/h:</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={newHourly}
                    onChange={(e) => setNewHourly(Number(e.target.value))}
                    className="w-20 px-2 py-1 font-mono border border-slate-200 rounded"
                  />
                </label>
              )}

              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAutoApprove}
                  onChange={(e) => setNewAutoApprove(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                <span>{t(lang, 'تأیید خودکار (Instant Approval)', 'Automatic Approval')}</span>
              </label>
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
            >
              {t(lang, 'ثبت در موتور منابع', 'Add to Registry')}
            </button>
          </div>
        </form>
      )}

      {/* Filter Segmented Control */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto max-w-full">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            typeFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t(lang, `همه (${resources.length})`, `All (${resources.length})`)}
        </button>
        {RESOURCE_TYPES.map((rt) => (
          <button
            key={rt}
            type="button"
            onClick={() => setTypeFilter(rt)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              typeFilter === rt ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {resourceTypeLabels[rt][lang]}
          </button>
        ))}
      </div>

      {/* Resource Registry Table with Live Owner Controls */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm text-start border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-600 font-medium">
              <th className="py-3 px-4 text-start">{t(lang, 'کد و عنوان منبع', 'Resource')}</th>
              <th className="py-3 px-4 text-start">{t(lang, 'نوع / مجموعه', 'Type / Tenant')}</th>
              <th className="py-3 px-4 text-start">{t(lang, 'ابعاد تخصصی (L × W × H/Depth)', 'Dimensions')}</th>
              <th className="py-3 px-4 text-start">{t(lang, 'سیاست دسترسی', 'Access Policy')}</th>
              <th className="py-3 px-4 text-start">{t(lang, 'کنترل صاحب منبع (Owner Control)', 'Owner Controls')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((res) => {
              const comm = communityMap.get(res.communityId);
              return (
                <tr key={res.id} className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-slate-900">
                      <span className="font-mono text-xs text-blue-800 me-2">{res.code}</span>
                      {lang === 'fa' ? res.titleFa : res.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {res.networkAliasId} · {res.floorOrZone}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs">
                    <div className="text-slate-800 font-medium">{resourceTypeLabels[res.type][lang]}</div>
                    <div className="text-slate-500 mt-0.5">{lang === 'fa' ? comm?.nameFa : comm?.name}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700">
                    <div>
                      {res.dimensions.lengthM}m × {res.dimensions.widthM}m ×{' '}
                      {res.type === 'boat_berth'
                        ? `${t(lang, 'عمق', 'Depth')} ${res.dimensions.heightOrDepthM}m`
                        : `${t(lang, 'ارتفاع', 'H')} ${res.dimensions.heightOrDepthM}m`}
                    </div>
                    <div className="font-sans text-[11px] text-slate-500 mt-0.5">
                      {res.evCharging && t(lang, 'شارژر EV · ', 'EV Charger · ')}
                      {res.shorePower && t(lang, 'برق ساحلی · ', 'Shore Power · ')}
                      {res.climateControlled && t(lang, 'تهویه کنترل‌شده · ', 'Climate Ctrl · ')}
                      {t(lang, `مهلت تخلیه ${res.graceNoticeMinutes}د`, `${res.graceNoticeMinutes}m grace`)}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-700">{res.accessPolicy}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleSharing(res.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          res.sharingEnabled && res.active
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}
                      >
                        {res.sharingEnabled && res.active
                          ? t(lang, 'اشتراک فعال', 'Sharing On')
                          : t(lang, 'غیرفعال', 'Sharing Off')}
                      </button>

                      <button
                        type="button"
                        onClick={() => onTogglePricing(res.id)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-mono tabular-nums whitespace-nowrap"
                      >
                        {res.pricing.isFree ? t(lang, 'رایگان', 'Free') : `€${res.pricing.hourlyEur}/h`}
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleApproval(res.id)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {res.approvalMode === 'automatic'
                          ? t(lang, 'تأیید خودکار', 'Auto')
                          : t(lang, 'تأیید دستی', 'Manual')}
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleHideRecall(res.id)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {res.hideRecallRiskFromPublic
                          ? t(lang, 'ریسک: مخفی', 'Risk: Hidden')
                          : t(lang, 'ریسک: نمایان', 'Risk: Visible')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
