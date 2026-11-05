/**
 * apps/web/src/components/CrmDealLink.tsx
 *
 * "Open the deal in the CRM": the server builds the address from the client's own CRM host; the browser still takes
 * only a plain https link (never javascript: or anything else a bad value could carry).
 */

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export function safeCrmUrl(url?: string | null): string | null {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

export function CrmDealLink({ url, className }: { url?: string | null; className?: string }) {
  const href = safeCrmUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="crm-deal-link"
      className={cn('inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline', className)}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Открыть сделку в CRM
    </a>
  );
}

export default CrmDealLink;
