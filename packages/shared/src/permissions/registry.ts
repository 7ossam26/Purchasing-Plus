function entry(
  area: string,
  label: string,
  requires: string[],
  superadminOnly = false,
) {
  return {
    area,
    label,
    consequence: 'تتيح هذه الصلاحية ' + label + '.',
    requires,
    superadminOnly,
  };
}
const definitions = {
  'requests.view': entry('الطلبات', 'عرض الطلبات', []),
  'requests.create': entry('الطلبات', 'إنشاء الطلبات وتعديلها قبل الموافقة', [
    'requests.view',
  ]),
  'requests.approve': entry('الطلبات', 'الموافقة على الطلب', ['requests.view']),
  'requests.reject': entry('الطلبات', 'رفض الطلب نهائيًا', ['requests.view']),
  'requests.returnForEdit': entry('الطلبات', 'إرجاع الطلب للتعديل', [
    'requests.view',
  ]),
  'requests.raiseUrgency': entry('الطلبات', 'رفع درجة الاستعجال', [
    'requests.view',
  ]),
  'requests.editQuantities': entry('الطلبات', 'تعديل الكميات قبل الموافقة', [
    'requests.view',
  ]),
  'requests.pause': entry('الطلبات', 'إيقاف الطلب مؤقتًا واستئنافه', [
    'requests.view',
  ]),
  'requests.editWhilePaused': entry('الطلبات', 'تعديل الطلب أثناء الإيقاف', [
    'requests.view',
  ]),
  'requests.cancelAnyStage': entry('الطلبات', 'إلغاء الطلب في أي مرحلة', [
    'requests.view',
  ]),
  'requests.viewTimeline': entry('الطلبات', 'رؤية السجل الزمني', [
    'requests.view',
  ]),
  'requests.viewPrices': entry('الطلبات', 'رؤية الأسعار', ['requests.view']),
  'requests.viewSupplierNames': entry('الطلبات', 'رؤية أسماء الموردين', [
    'requests.view',
  ]),
  'purchasing.sendRfq': entry('المشتريات', 'إرسال طلبات الأسعار للموردين', [
    'requests.view',
    'requests.viewSupplierNames',
  ]),
  'purchasing.price': entry('المشتريات', 'تسعير البنود وإرسالها للاعتماد', [
    'requests.view',
    'requests.viewPrices',
    'requests.viewSupplierNames',
  ]),
  'purchasing.returnForEdit': entry(
    'المشتريات',
    'إرجاع الطلب للتعديل من المشتريات',
    ['requests.view'],
  ),
  'purchasing.sendSupplyOrder': entry('المشتريات', 'إرسال أوامر التوريد', [
    'requests.view',
    'requests.viewSupplierNames',
  ]),
  'purchasing.handleRemaining': entry(
    'المشتريات',
    'التعامل مع البنود المتبقية',
    ['requests.view', 'requests.viewPrices', 'requests.viewSupplierNames'],
  ),
  'pricing.approve': entry('الاعتماد والاستلام', 'اعتماد التسعير', [
    'requests.view',
    'requests.viewPrices',
  ]),
  'pricing.reject': entry('الاعتماد والاستلام', 'رفض التسعير', [
    'requests.view',
    'requests.viewPrices',
  ]),
  'receipt.record': entry('الاعتماد والاستلام', 'تسجيل الاستلام', [
    'requests.view',
  ]),
  'items.resolveExternally': entry(
    'الاعتماد والاستلام',
    'تعليم بند «اتحل من المهندس»',
    ['requests.view'],
  ),
  'masterData.view': entry('التكويدات', 'فتح صفحة التكويدات', []),
  'catalog.view': entry('التكويدات', 'تصفح الأصناف', []),
  'catalog.create': entry('التكويدات', 'إضافة الأصناف', [
    'masterData.view',
    'catalog.view',
  ]),
  'catalog.edit': entry('التكويدات', 'تعديل الأصناف', [
    'masterData.view',
    'catalog.view',
  ]),
  'catalog.delete': entry('التكويدات', 'إيقاف الأصناف', [
    'masterData.view',
    'catalog.view',
  ]),
  'catalogTree.view': entry('التكويدات', 'عرض الفئات والمجموعات', [
    'masterData.view',
  ]),
  'catalogTree.create': entry('التكويدات', 'إضافة الفئات والمجموعات', [
    'masterData.view',
    'catalogTree.view',
  ]),
  'catalogTree.edit': entry('التكويدات', 'تعديل الفئات والمجموعات', [
    'masterData.view',
    'catalogTree.view',
  ]),
  'catalogTree.delete': entry('التكويدات', 'إيقاف الفئات والمجموعات', [
    'masterData.view',
    'catalogTree.view',
  ]),
  'attributes.view': entry('التكويدات', 'عرض الخصائص', ['masterData.view']),
  'attributes.create': entry('التكويدات', 'إضافة الخصائص', [
    'masterData.view',
    'attributes.view',
  ]),
  'attributes.edit': entry('التكويدات', 'تعديل الخصائص', [
    'masterData.view',
    'attributes.view',
  ]),
  'attributes.delete': entry('التكويدات', 'إيقاف الخصائص', [
    'masterData.view',
    'attributes.view',
  ]),
  'units.view': entry('التكويدات', 'عرض الوحدات', ['masterData.view']),
  'units.create': entry('التكويدات', 'إضافة الوحدات', [
    'masterData.view',
    'units.view',
  ]),
  'units.edit': entry('التكويدات', 'تعديل الوحدات', [
    'masterData.view',
    'units.view',
  ]),
  'units.delete': entry('التكويدات', 'إيقاف الوحدات', [
    'masterData.view',
    'units.view',
  ]),
  'suppliers.view': entry('التكويدات', 'عرض الموردين', ['masterData.view']),
  'suppliers.create': entry('التكويدات', 'إضافة الموردين', [
    'masterData.view',
    'suppliers.view',
  ]),
  'suppliers.edit': entry('التكويدات', 'تعديل الموردين', [
    'masterData.view',
    'suppliers.view',
  ]),
  'suppliers.delete': entry('التكويدات', 'إيقاف الموردين', [
    'masterData.view',
    'suppliers.view',
  ]),
  'sites.view': entry('التكويدات', 'عرض المواقع', ['masterData.view']),
  'sites.create': entry('التكويدات', 'إضافة المواقع', [
    'masterData.view',
    'sites.view',
  ]),
  'sites.edit': entry('التكويدات', 'تعديل المواقع', [
    'masterData.view',
    'sites.view',
  ]),
  'sites.delete': entry('التكويدات', 'إيقاف المواقع', [
    'masterData.view',
    'sites.view',
  ]),
  'reports.requestsOverview': entry(
    'التقارير والسجلات',
    'تقرير نظرة عامة على الطلبات',
    ['requests.view'],
  ),
  'reports.stageTimes': entry('التقارير والسجلات', 'تقرير زمن المراحل', [
    'requests.view',
  ]),
  'reports.spending': entry('التقارير والسجلات', 'تقرير الإنفاق', [
    'requests.view',
  ]),
  'reports.suppliers': entry('التقارير والسجلات', 'تقرير الموردين', [
    'requests.view',
  ]),
  'reports.priceHistory': entry(
    'التقارير والسجلات',
    'تقرير تاريخ أسعار الأصناف',
    ['requests.view'],
  ),
  'reports.unavailable': entry(
    'التقارير والسجلات',
    'تقرير البنود غير المتوفرة والمحلولة خارجيًا',
    ['requests.view'],
  ),
  'reports.userActivity': entry('التقارير والسجلات', 'تقرير نشاط المستخدمين', [
    'requests.view',
  ]),
  'records.view': entry('التقارير والسجلات', 'السجلات', ['requests.view']),
  'reports.export': entry(
    'التقارير والسجلات',
    'تصدير التقارير والسجلات إلى Excel',
    ['requests.view'],
  ),
  'users.view': entry('الإدارة', 'عرض المستخدمين', []),
  'users.manage': entry('الإدارة', 'إدارة المستخدمين', []),
  'roles.view': entry('الإدارة', 'عرض الأدوار والصلاحيات', []),
  'roles.manage': entry('الإدارة', 'إدارة الأدوار والصلاحيات', []),
  'settings.manage': entry('الإدارة', 'الإعدادات', []),
  'data.import': entry('الإدارة', 'استيراد البيانات', []),
  'data.export': entry('الإدارة', 'تصدير البيانات', []),
  'system.auditLog': entry('الدعم الفني', 'سجل المراجعة', [], true),
  'system.maintenance': entry('الدعم الفني', 'صيانة قاعدة البيانات', [], true),
  'system.superadmins': entry(
    'الدعم الفني',
    'إدارة حسابات الدعم الفني',
    [],
    true,
  ),
};
export type PermissionKey = keyof typeof definitions;
export const purchasingKeys = (
  Object.keys(definitions) as PermissionKey[]
).filter((key) => key.startsWith('purchasing.'));
export const registry = Object.entries(definitions).map(([key, value]) => ({
  key: key as PermissionKey,
  ...value,
}));
export function isPermissionKey(key: string): key is PermissionKey {
  return Object.hasOwn(definitions, key);
}
export function closeOverRequires(keys: Iterable<string>): PermissionKey[] {
  const result = new Set<PermissionKey>();
  function add(key: string) {
    if (!isPermissionKey(key) || result.has(key)) return;
    result.add(key);
    definitions[key].requires.forEach(add);
  }
  for (const key of keys) add(key);
  return [...result];
}
export function validateRoleKeys(keys: readonly string[]) {
  const selected = new Set(keys);
  const unknown = keys.filter((key) => !isPermissionKey(key));
  const restricted = registry
    .filter((p) => selected.has(p.key) && p.superadminOnly)
    .map((p) => p.key);
  const missing = closeOverRequires(keys).filter((key) => !selected.has(key));
  return {
    valid: !unknown.length && !restricted.length && !missing.length,
    unknown,
    restricted,
    missing,
  };
}
export function areas() {
  return [
    ...new Set(registry.filter((p) => !p.superadminOnly).map((p) => p.area)),
  ];
}
