import { afterEach, expect, it } from 'vitest';
import { errorText, setLanguage, t } from '../src/i18n';
import { arabic, arabicPatterns } from '../src/i18n/ar';
import { sorani } from '../src/i18n/ckb';
import { soraniPatterns } from '../src/i18n/patterns';

afterEach(() => setLanguage('en'));

it('covers every existing translation and preserves each template argument', () => {
  expect(Object.keys(arabic).sort()).toEqual(Object.keys(sorani).sort());
  const patterns = new Map(arabicPatterns);
  expect([...patterns.keys()].sort()).toEqual(soraniPatterns.map(([key]) => key).sort());
  for (const [key, translated] of soraniPatterns) {
    const slots = (text: string) => (text.match(/\{!?\d+\}/g) ?? []).sort();
    expect(slots(patterns.get(key)!), key).toEqual(slots(translated));
  }
  for (const text of [...Object.values(arabic), ...patterns.values()]) {
    expect(text.replace(/Shift|WASD|JSON|WebGL|API/g, '')).not.toMatch(/[a-z]{2,}|[پچژگڵڕۆێەک]/iu);
  }
});

it('localizes game signs, changing amounts and errors while preserving player names', () => {
  setLanguage('ar');
  expect(t('ENTRANCE / EXIT')).toBe('دخول / خروج');
  expect(t('CARTS 3/12')).toBe('العربات ٣/١٢');
  expect(t('Pick up $2.5K')).toBe('اجمع $٢٫٥ ألف');
  expect(t('Market level 20!')).toBe('بلغ المتجر المستوى ٢٠!');
  expect(t('Tomato cannery · level 4')).toBe('مصنع معجون الطماطم · المستوى ٤');
  expect(t('Machines → Staff')).toBe('الآلات ← الطاقم');
  expect(t('Account: Noor 123')).toBe('الحساب: Noor 123');
  expect(errorText('Email or password is incorrect.')).toBe(
    'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  );
  expect(errorText('Network request failed')).toBe('تعذّر إكمال الطلب. حاول مرة أخرى.');
  setLanguage('ckb');
  expect(t('Market level 20!')).not.toBe('بلغ المتجر المستوى ٢٠!');
  setLanguage('en');
  expect(t('Market level 20!')).toBe('Market level 20!');
});
