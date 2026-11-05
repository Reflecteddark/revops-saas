import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CrmDealLink, safeCrmUrl } from './CrmDealLink';

describe('CrmDealLink', () => {
  it('opens the deal of the CRM in a new tab, without handing the cabinet to the other page', () => {
    render(<CrmDealLink url="https://client.amocrm.ru/leads/detail/5272089" />);

    const link = screen.getByTestId('crm-deal-link');
    expect(link).toHaveAttribute('href', 'https://client.amocrm.ru/leads/detail/5272089');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('Открыть сделку в CRM');
  });

  it.each([undefined, null, '', 'javascript:alert(1)', 'http://client.amocrm.ru/leads/detail/1', 'data:text/html,x', 'https://user:pass@client.amocrm.ru/x', 'not a url'])(
    'shows nothing for %s',
    (url) => {
      expect(safeCrmUrl(url as string | null | undefined)).toBeNull();
      const { container } = render(<CrmDealLink url={url as string | null | undefined} />);
      expect(container).toBeEmptyDOMElement();
    }
  );
});
