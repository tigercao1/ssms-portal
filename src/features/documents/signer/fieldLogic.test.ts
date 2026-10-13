import { describe, expect, it } from 'vitest';
import {
  buildSignBody,
  initialValues,
  isFieldFilled,
  missingRequired,
  orderFields,
  syncLockedValues,
  type SignerFieldLike,
} from './fieldLogic';

const f = (over: Partial<SignerFieldLike> & Pick<SignerFieldLike, 'id' | 'type'>): SignerFieldLike => ({
  page: 1,
  x: 72,
  y: 100,
  w: 120,
  h: 24,
  required: true,
  prefill: null,
  ...over,
});

const fields: SignerFieldLike[] = [
  f({ id: 'sig', type: 'signature', y: 80 }),
  f({ id: 'name', type: 'full_name', y: 600, prefill: 'full_name' }),
  f({ id: 'date', type: 'date', y: 600, x: 300, prefill: 'date_signed' }),
  f({ id: 'agree', type: 'checkbox', page: 2, y: 700 }),
  f({ id: 'note', type: 'text', required: false, y: 400 }),
  f({ id: 'ini', type: 'initials', page: 2, y: 100 }),
  f({ id: 'mail', type: 'text', prefill: 'email', required: false, y: 300 }),
];
const identity = { signerName: 'Jane Snow', email: 'jane@example.com', today: '2026-10-12' };

describe('fieldLogic', () => {
  it('orders fields by page, top to bottom, then left to right', () => {
    expect(orderFields(fields).map((x) => x.id)).toEqual([
      'name',
      'date',
      'note',
      'mail',
      'sig',
      'agree',
      'ini',
    ]);
  });

  it('prefills full name, email, signing date and unchecked boxes', () => {
    expect(initialValues(fields, identity)).toEqual({
      name: 'Jane Snow',
      date: '2026-10-12',
      agree: false,
      note: '',
      mail: 'jane@example.com',
    });
  });

  it('keeps locked fields in sync with the typed legal name', () => {
    const values = syncLockedValues(fields, initialValues(fields, identity), {
      ...identity,
      signerName: 'Jane A. Snow',
    });
    expect(values.name).toBe('Jane A. Snow');
    expect(values.note).toBe('');
  });

  it('reports missing required fields in reading order', () => {
    const values = initialValues(fields, identity);
    expect(missingRequired(fields, values, {}).map((x) => x.id)).toEqual(['sig', 'agree', 'ini']);
    expect(isFieldFilled(f({ id: 'agree', type: 'checkbox' }), { agree: true }, {})).toBe(true);
    expect(isFieldFilled(f({ id: 'name', type: 'full_name' }), { name: '  ' }, {})).toBe(false);
  });

  it('builds the sign body exactly per the contract', () => {
    const values = { ...initialValues(fields, identity), agree: true, note: '  hi  ' };
    const body = buildSignBody(fields, ' Jane Snow ', values, {
      sig: { mode: 'drawn', png: 'iVBOR' },
      ini: { mode: 'typed', text: 'JS' },
    });
    expect(body).toEqual({
      consent: true,
      signerName: 'Jane Snow',
      values: {
        name: 'Jane Snow',
        date: '2026-10-12',
        agree: true,
        note: 'hi',
        mail: 'jane@example.com',
      },
      signatures: {
        sig: { mode: 'drawn', png: 'iVBOR' },
        ini: { mode: 'typed', text: 'JS' },
      },
    });
  });

  it('omits empty optional text and always sends checkbox booleans', () => {
    const body = buildSignBody(fields, 'J', { agree: false, note: '' }, {});
    expect(body.values).toEqual({ agree: false });
    expect(body.signatures).toEqual({});
  });

});
