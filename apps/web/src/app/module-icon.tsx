import {
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ShoppingCart,
  Database,
  Folder,
  History,
  Key,
  MapPin,
  Package,
  PackageCheck,
  PackageX,
  Receipt,
  Settings,
  Shield,
  Users,
  Wrench,
} from 'lucide-react';

const icons = {
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ShoppingCart,
  Database,
  Folder,
  History,
  Key,
  MapPin,
  Package,
  PackageCheck,
  PackageX,
  Receipt,
  Settings,
  Shield,
  Users,
  Wrench,
};
export function ModuleIcon({ name }: { name: string }) {
  const Icon = icons[name as keyof typeof icons] ?? Folder;
  return <Icon aria-hidden="true" size={24} strokeWidth={1.75} />;
}
