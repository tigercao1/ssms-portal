import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import indexHtml from '../../../../index.html?raw';
import {
  SIGNATURE_WEB_FONTS,
  SignatureModal,
  TYPED_SIGNATURE_FONT,
} from './SignatureModal';
import { ConsentBlock } from './ConsentBlock';
import { MOCK_CONSENT_TEXT } from '../api/fixtures';
import { base64ByteLength } from './SignatureCanvas';
import { renderWithProviders } from '@/test/render';
import { en } from '@/i18n/messages/en';

const pad = vi.hoisted(() => ({
  empty: true,
  listeners: new Map<string, () => void>(),
}));

vi.mock('signature_pad', () => ({
  default: class {
    addEventListener(name: string, cb: () => void) {
      pad.listeners.set(name, cb);
    }
    removeEventListener() {}
    isEmpty() {
      return pad.empty;
    }
    clear() {
      pad.empty = true;
    }
    toData() {
      return [];
    }
    fromData() {}
    off() {}
  },
}));

function draw() {
  pad.empty = false;
  act(() => pad.listeners.get('endStroke')?.());
}

beforeEach(() => {
  pad.empty = true;
  pad.listeners.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

describe('SignatureModal', () => {
  it('adopts a drawn signature as a base64 PNG', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,iVBORw0KGgo=',
    );
    const onAdopt = vi.fn();
    renderWithProviders(
      <SignatureModal
        open
        kind="signature"
        text={en.signer}
        defaultTypedText="Jane Snow"
        onAdopt={onAdopt}
        onClose={() => {}}
      />,
    );
    const use = screen.getByRole('button', { name: 'Use signature' });
    expect(use).toBeDisabled();
    draw();
    await userEvent.click(use);
    expect(onAdopt).toHaveBeenCalledWith({
      mode: 'drawn',
      png: 'iVBORw0KGgo=',
    });
  });

  it('rejects a drawn signature that stays over 200 KB', async () => {
    const huge = 'A'.repeat(400 * 1024);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      `data:image/png;base64,${huge}`,
    );
    const onAdopt = vi.fn();
    renderWithProviders(
      <SignatureModal
        open
        kind="signature"
        text={en.signer}
        defaultTypedText=""
        onAdopt={onAdopt}
        onClose={() => {}}
      />,
    );
    draw();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use signature' }),
    );
    expect(onAdopt).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('too large');
  });

  it('adopts typed initials prefilled from the signer', async () => {
    const onAdopt = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <SignatureModal
        open
        kind="initials"
        text={en.signer}
        defaultTypedText="JS"
        onAdopt={onAdopt}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Type' }));
    expect(screen.getByTestId('typed-preview')).toHaveTextContent('JS');
    const input = screen.getByLabelText('Type your name');
    await userEvent.clear(input);
    expect(screen.getByRole('button', { name: 'Use initials' })).toBeDisabled();
    await userEvent.type(input, 'J.S.');
    await userEvent.click(screen.getByRole('button', { name: 'Use initials' }));
    expect(onAdopt).toHaveBeenCalledWith({ mode: 'typed', text: 'J.S.' });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('previews a Chinese typed signature in the loaded script fonts', async () => {
    renderWithProviders(
      <SignatureModal
        open
        kind="signature"
        text={en.signer}
        defaultTypedText="王小明"
        onAdopt={() => {}}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Type' }));
    const preview = screen.getByTestId('typed-preview');
    expect(preview).toHaveTextContent('王小明');
    expect(
      TYPED_SIGNATURE_FONT.startsWith("'Dancing Script', 'Ma Shan Zheng'"),
    ).toBe(true);
    for (const family of SIGNATURE_WEB_FONTS) {
      expect(preview.style.fontFamily).toContain(family);
      expect(indexHtml).toContain(`family=${family.replace(/ /g, '+')}`);
    }
  });

  it('clears the drawing', async () => {
    renderWithProviders(
      <SignatureModal
        open
        kind="signature"
        text={en.signer}
        defaultTypedText=""
        onAdopt={() => {}}
        onClose={() => {}}
      />,
    );
    draw();
    expect(screen.getByRole('button', { name: 'Use signature' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(
      screen.getByRole('button', { name: 'Use signature' }),
    ).toBeDisabled();
  });

  it('keeps Tab inside the sheet around the drawing canvas', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <>
        <button type="button">Behind</button>
        <SignatureModal
          open
          kind="signature"
          text={en.signer}
          defaultTypedText=""
          onAdopt={() => {}}
          onClose={onClose}
        />
      </>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Your signature' });
    expect(sheet).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Behind' }).closest('[inert]'),
    ).not.toBeNull();
    for (let i = 0; i < 10; i++) {
      await userEvent.tab({ shift: i % 3 === 0 });
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('ConsentBlock', () => {
  it('shows the given bilingual consent text and toggles', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ConsentBlock
        consentText={MOCK_CONSENT_TEXT}
        checked={false}
        onChange={onChange}
        label="I agree"
      />,
    );
    expect(screen.getByText(MOCK_CONSENT_TEXT.en)).toBeInTheDocument();
    expect(screen.getByText(MOCK_CONSENT_TEXT.zh)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'I agree' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('base64ByteLength', () => {
  it('accounts for padding', () => {
    expect(base64ByteLength('QQ==')).toBe(1);
    expect(base64ByteLength('QUI=')).toBe(2);
    expect(base64ByteLength('QUJD')).toBe(3);
  });
});
