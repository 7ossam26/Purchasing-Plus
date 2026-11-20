import type { PermissionKey } from './registry.js';
interface Module {
  id: string;
  label: string;
  description: string;
  icon: string;
  path: string;
  kind: 'admin' | 'masterData' | 'reports' | 'operations';
  anyOf: PermissionKey[];
}
export const modules: Module[] = [
  {
    id: 'users',
    label: 'المستخدمون',
    description: 'إدارة حسابات المستخدمين',
    icon: 'Users',
    path: '/admin/users',
    kind: 'admin',
    anyOf: ['users.view'],
  },
  {
    id: 'roles',
    label: 'الأدوار والصلاحيات',
    description: 'تحديد صلاحيات الأدوار',
    icon: 'Shield',
    path: '/admin/roles',
    kind: 'admin',
    anyOf: ['roles.view'],
  },
  {
    id: 'sites',
    label: 'المواقع',
    description: 'إدارة مواقع العمل',
    icon: 'MapPin',
    path: '/admin/sites',
    kind: 'admin',
    anyOf: ['sites.view'],
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    description: 'ضبط إعدادات النظام',
    icon: 'Settings',
    path: '/admin/settings',
    kind: 'admin',
    anyOf: ['settings.manage'],
  },
  {
    id: 'data',
    label: 'إدارة البيانات',
    description: 'استيراد البيانات وتصديرها',
    icon: 'Database',
    path: '/admin/data',
    kind: 'admin',
    anyOf: ['data.import', 'data.export'],
  },
  {
    id: 'audit',
    label: 'سجل المراجعة',
    description: 'مراجعة العمليات',
    icon: 'History',
    path: '/admin/audit',
    kind: 'admin',
    anyOf: ['system.auditLog'],
  },
  {
    id: 'maintenance',
    label: 'الصيانة',
    description: 'صيانة قاعدة البيانات',
    icon: 'Wrench',
    path: '/admin/maintenance',
    kind: 'admin',
    anyOf: ['system.maintenance'],
  },
  {
    id: 'superadmins',
    label: 'الدعم الفني',
    description: 'إدارة حسابات الدعم',
    icon: 'Key',
    path: '/admin/superadmins',
    kind: 'admin',
    anyOf: ['system.superadmins'],
  },
  {
    id: 'masterData',
    label: 'التكويدات',
    description: 'تصفح البيانات الأساسية',
    icon: 'Folder',
    path: '/master-data',
    kind: 'masterData',
    anyOf: ['masterData.view'],
  },
];
