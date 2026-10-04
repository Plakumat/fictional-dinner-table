import { describe, expect, it } from 'vitest';
import { classifyDoc } from './classifyDoc';
import { foldTr, highlight } from './foldTr';

describe('classifyDoc', () => {
  // The five outdated documents in the knowledge base, and the three ways they say so.
  it.each([
    [
      {
        id: 'pol_delivery_fee_v1_old',
        title: 'Delivery fee (2024 archive)',
        category: 'policy',
        tags: ['delivery', 'fee', 'archive'],
        date: '2024-03-01',
      },
    ],
    [{ id: 'ann_fee_archive', title: 'Delivery fee (archive)', category: 'announcement', tags: ['announcement'], date: '2024-03-01' }],
    [{ id: 'howto_9_v0', title: 'An age-restricted item was not handed over (legacy)', category: 'howto', tags: ['how-to'], date: '2024-09-20' }],
    [{ id: 'howto_3_v0', title: 'An item is missing', category: 'howto', tags: ['how-to'], date: '2024-05-10' }],
    [{ id: 'faq_2', title: 'Old answer', category: 'faq', tags: ['archive'], date: null }],
  ])('recognises $id as archived', (doc) => {
    expect(classifyDoc(doc).archived).toBe(true);
  });

  it('does not mark a current policy as archived', () => {
    const doc = { id: 'pol_delivery_fee_v2', title: 'Delivery fee (current)', category: 'policy', tags: ['delivery', 'fee'], date: '2026-06-01' };
    expect(classifyDoc(doc)).toEqual({ authority: 'official', archived: false, undated: false });
  });

  it('ranks a support ticket as a conversation, not as policy', () => {
    const doc = { id: 'ticket_0002', title: 'About the delivery fee', category: 'support_ticket', tags: ['support', 'delivery'], date: '2026-02-03' };
    expect(classifyDoc(doc).authority).toBe('conversation');
  });

  it('flags a document without a date', () => {
    expect(classifyDoc({ id: 'faq_14', title: 'Age checks', category: 'faq' })).toEqual({ authority: 'guidance', archived: false, undated: true });
  });
});

describe('Turkish folding', () => {
  it('folds the way the server does', () => {
    expect(foldTr('İstanbul')).toBe('istanbul');
    expect(foldTr('ISPARTA')).toBe('isparta');
    expect(foldTr('Kadıköy Şişli Üsküdar Çay')).toBe('kadikoy sisli uskudar cay');
  });

  it('finds İstanbul when the query is istanbul, which /i does not', () => {
    expect(/istanbul/i.test('İstanbul')).toBe(false);
    expect(highlight('Kadıköy, İstanbul adresine teslimat', 'istanbul')).toEqual([
      { text: 'Kadıköy, ', hit: false },
      { text: 'İstanbul', hit: true },
      { text: ' adresine teslimat', hit: false },
    ]);
  });

  it('highlights every term, keeping the original characters', () => {
    const segments = highlight('Şişli delivery fee', 'SISLI fee');
    expect(segments.filter((s) => s.hit).map((s) => s.text)).toEqual(['Şişli', 'fee']);
    expect(segments.map((s) => s.text).join('')).toBe('Şişli delivery fee');
  });

  it('ignores terms the server ignores', () => {
    expect(highlight('to be or not', 'to be')).toEqual([{ text: 'to be or not', hit: false }]);
  });
});
