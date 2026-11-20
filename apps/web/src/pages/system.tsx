import { ar } from '@purchasing-plus/shared/i18n/ar';
import { ArrowLeft, House } from 'lucide-react';
import { Link } from 'react-router';

import { useBack } from '../app/navigation.js';
import { Button, buttonClass } from '../components/ui/button.js';

const details = {
  denied: ar.errors.deniedDetail,
  notFound: ar.errors.notFoundDetail,
  unexpected: ar.errors.unexpectedDetail,
};

export function SystemPage({ type }: { type: keyof typeof details }) {
  const back = useBack();
  return (
    <section aria-labelledby="system-title" className="grid gap-3">
      <h1 id="system-title" className="text-title sm:text-title-wide">
        {ar.errors[type]}
      </h1>
      <p className="text-concrete">{details[type]}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/" className={buttonClass('primary')}>
          <House strokeWidth={1.75} size={20} aria-hidden="true" />
          {ar.errors.returnHome}
        </Link>
        <Button variant="secondary" onClick={back}>
          <ArrowLeft
            className="rtl-mirror"
            strokeWidth={1.75}
            size={20}
            aria-hidden="true"
          />
          {ar.common.back}
        </Button>
      </div>
    </section>
  );
}
