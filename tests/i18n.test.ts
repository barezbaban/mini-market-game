import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { errorText, getLanguage, readLanguage, storeLanguage, setLanguage, t } from '../src/i18n';
import { sorani } from '../src/i18n/ckb';
import { PRODUCTS } from '../src/game/data/products';
import { UPGRADES } from '../src/game/data/upgrades';
import { CHAPTERS, BUSINESS_MILESTONES, REGULARS, SHOP_STYLES } from '../src/game/data/career';

afterEach(() => {
  setLanguage('en');
  vi.unstubAllGlobals();
});
const englishWords = (text: string) =>
  text.replace(/WASD|Shift|WebGL|API|JSON/g, '').match(/[A-Za-z]{2,}/g);

describe('Sorani presentation', () => {
  it('respects an explicit choice over the browser and handles denied storage', () => {
    vi.stubGlobal('navigator', { language: 'ckb-IQ' });
    vi.stubGlobal('localStorage', {
      getItem: () => 'en',
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(readLanguage()).toBe('en');
    expect(storeLanguage('ckb')).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(readLanguage()).toBe('ckb');
  });
  it('recognizes numbers from Kurdish browser locales, without translating account names', () => {
    setLanguage('ckb');
    expect(t('Need $١٬٢٣٤ more')).toBe('$١٬٢٣٤ی زیاتر پێویستە');
    expect(t('١٬٢٣٤ XP to level 5 · ۳۱ customers served')).not.toMatch(/[A-Za-z]/);
    expect(t('Account: Ava ۱۲۳')).toBe('هەژمار: Ava ۱۲۳');
  });
  it('uses a supported link language before the saved choice, without persisting it', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => 'en', setItem });
    expect(readLanguage('?debug=true&lang=ckb')).toBe('ckb');
    expect(readLanguage('?lang=unknown')).toBe('en');
    expect(readLanguage()).toBe('en');
    expect(setItem).not.toHaveBeenCalled();
  });
  it('chooses the first supported browser language and does not assume every Kurdish dialect is Sorani', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('navigator', { language: 'ar-IQ', languages: ['ar-IQ', 'ckb-IQ', 'en'] });
    expect(readLanguage()).toBe('ar');
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB', 'ckb-IQ'] });
    expect(readLanguage()).toBe('en');
    vi.stubGlobal('navigator', { language: 'ku-Latn' });
    expect(readLanguage()).toBe('en');
  });
  it('preserves English verbatim and does not change engine data', () => {
    const copy = '  Level 12 · $2,340 · 20 XP  ';
    expect(t(copy)).toBe(copy);
    const before = JSON.stringify([PRODUCTS, UPGRADES]);
    setLanguage('ckb');
    PRODUCTS.forEach((p) => expect(englishWords(t(p.name))).toBeNull());
    expect(JSON.stringify([PRODUCTS, UPGRADES])).toBe(before);
    expect(getLanguage()).toBe('ckb');
  });
  it('covers product, upgrade, milestone, chapter and regular terminology', () => {
    setLanguage('ckb');
    const copy = [
      ...PRODUCTS.flatMap((p) => [p.name, p.plural, `+1 ${p.name}`, `2/10 ${p.plural}`]),
      ...UPGRADES.map((u) => u.name),
      ...CHAPTERS.flatMap((c) => [c.name, c.goal]),
      ...BUSINESS_MILESTONES.flatMap((m) => [m.title, m.description]),
      ...REGULARS.flatMap((r) => [r.name, r.story]),
      ...SHOP_STYLES.flatMap((s) => [s.name, s.sign]),
    ];
    expect(copy.filter((s) => englishWords(t(s)))).toEqual([]);
  });
  it('keeps names intact, localizes amounts and handles complete variable phrases', () => {
    setLanguage('ckb');
    expect(t('Account: Alex 123')).toBe('هەژمار: Alex 123');
    expect(t('CARTS 3/12')).toBe('عەرەبانە ٣/١٢');
    expect(t('  12 / 24  ')).toBe('  ١٢/٢٤  ');
    const copy = [
      'Each plant produces 3 tomatoes every 3s. 5 maximum.',
      'Each bed produces 1 carrot every 2s. 8 maximum. Each new bed costs 20% more.',
      '1 corn makes 1 grilled corn, sold for $23. Includes its own shelf. A batch takes 6.0s and starts with available input. Upgrade its limit from 2 to 4, 6, then 8 ingredients.',
      'Bring 1 Tomato · 2 Egg here from your basket.',
      'Level 20 unlocks 11 carts · Cashier tier 6 and more',
      'Requires player level 20 and Cashier level 1 and 20 paid orders (3/20)',
      '1,050 XP to level 9 · 150 customers served',
      'Thief approaching Checkout 1! 2m west. Collect the cash or catch them in your net circle.',
      'Thief fleeing with $12! 3m south. Sprint into net range to catch them.',
      'Thief escaped with $25. Collect cash sooner!',
      'Market level 20! New upgrades in Manage',
      '$25 stacked · +11 XP',
      'Rush 1:04 · 3/6 orders',
      'In progress · 35s · 3/6 orders',
      'Last rush: completed! +150 XP.',
      'PICK UP $23.4K',
      'Efficient: wait for a full 4-item batch',
      'Backup: level 5 · $1,234 · 45 paid orders. This replaces your current local market.',
      'Cloud revision 2: level 5, $1,234, 45 paid orders. Saved 10/4/2026.',
    ];
    expect(copy.filter((s) => englishWords(t(s))).map((s) => [s, t(s)])).toEqual([]);
  });
  it('has consistent case-insensitive keys and no accidental English translations', () => {
    const keys = new Map<string, string>();
    for (const [key, value] of Object.entries(sorani)) {
      const normalized = key.toLowerCase().replace(/\s+/g, ' ').trim();
      if (keys.has(normalized)) expect(value, key).toBe(keys.get(normalized));
      keys.set(normalized, value);
      expect(englishWords(value), key).toBeNull();
    }
  });
  it('uses local error messages for unexpected server or browser exceptions', () => {
    setLanguage('ckb');
    expect(englishWords(errorText('QuotaExceededError: the quota was exceeded'))).toBeNull();
    expect(errorText('Email or password is incorrect.')).toBe('ئیمەیل یان وشەی نهێنی هەڵەیە.');
    setLanguage('en');
    expect(errorText('Network down')).toBe('Network down');
  });
  it('covers standalone player-facing sentences at presentation boundaries', () => {
    setLanguage('ckb');
    const sources = [
      'src/main.ts',
      'src/game/ui/Hud.ts',
      'src/game/ui/BusinessPanels.ts',
      'src/game/ui/HelpPanel.ts',
      'src/game/ui/SettingsExtras.ts',
      'src/game/systems/BusinessInsights.ts',
      'src/game/data/career.ts',
      'src/game/systems/RushHourSystem.ts',
    ];
    const missing: string[] = [];
    for (const path of sources) {
      const ast = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) &&
          /^[A-Z][a-z].* [a-z]/.test(node.text) &&
          !/[<>#{}]/.test(node.text) &&
          !['The 3D market could not start.'].includes(node.text) &&
          englishWords(t(node.text))
        )
          missing.push(`${path}: ${node.text}`);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(missing).toEqual([]);
  }, 30_000); // Source files may need to hydrate in an iCloud-backed checkout.
});
