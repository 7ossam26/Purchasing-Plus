import {
  masterData as copy,
  purchasingUi,
  reportsUi,
  requestUi,
} from '../i18n/ar.js';
import { reportHubKeys } from '../reports.js';

import type { PermissionKey } from './registry.js';
import { purchasingKeys } from './registry.js';
interface Module {
  id: string;
  label: string;
  description: string;
  icon: string;
  path: string;
  kind: 'admin' | 'masterData' | 'reports' | 'operations';
  parent?: string;
  anyOf: PermissionKey[];
  children?: { path: string; anyOf: PermissionKey[] }[];
}
export const modules: Module[] = [
  {
    id: 'purchasing',
    label: purchasingUi.title,
    description: purchasingUi.description,
    icon: 'ShoppingCart',
    path: '/purchasing',
    kind: 'operations',
    anyOf: purchasingKeys,
  },
  {
    id: 'requests',
    label: requestUi.title,
    description: requestUi.description,
    icon: 'ClipboardList',
    path: '/requests',
    kind: 'operations',
    anyOf: ['requests.view'],
  },
  {
    id: 'catalog',
    label: copy.items,
    description: copy.itemsDescription,
    icon: 'Package',
    path: '/catalog',
    kind: 'operations',
    anyOf: ['catalog.view'],
  },
  {
    id: 'reports',
    label: reportsUi.title,
    description: reportsUi.description,
    icon: 'ChartColumn',
    path: '/reports',
    kind: 'reports',
    anyOf: reportHubKeys,
  },
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
    children: [
      { path: 'new', anyOf: ['roles.manage'] },
      { path: ':roleId', anyOf: ['roles.manage'] },
    ],
  },
  {
    id: 'sites',
    label: 'المواقع',
    description: 'إدارة مواقع العمل',
    icon: 'MapPin',
    path: '/master-data/sites',
    kind: 'masterData',
    parent: '/master-data',
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
