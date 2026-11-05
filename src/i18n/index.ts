import { sorani } from './ckb';
import { soraniPatterns, textArguments } from './patterns';
import { arabic, arabicPatterns } from './ar';

export type Language = 'en' | 'ckb' | 'ar';
export const isLanguage = (value: unknown): value is Language =>
  value === 'en' || value === 'ckb' || value === 'ar';
export const LANGUAGE_KEY = 'kurdmart.language';
let language: Language = 'en';
const cache = new Map<string, string>();
export const getLanguage = (): Language => language;
export function setLanguage(value: Language): void {
  language = value;
  cache.clear();
}
export function readLanguage(search = ''): Language {
  // A shared language link applies only to this URL, not the player's saved preference.
  const requested = new URLSearchParams(search).get('lang');
  if (isLanguage(requested)) return requested;
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    /* Guest play also works without storage permission. */
  }
  if (typeof navigator !== 'undefined') {
    const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const locale of preferred) {
      const base = locale?.toLowerCase().split('-')[0];
      if (isLanguage(base)) return base;
    }
  }
  return 'en';
}
export function storeLanguage(value: Language): boolean {
  try {
    localStorage.setItem(LANGUAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
const buildDictionary = (entries: Record<string, string>) =>
  new Map(Object.entries(entries).map(([key, value]) => [normalize(key), value]));
const dictionaries = { ckb: buildDictionary(sorani), ar: buildDictionary(arabic) };
const compactUnits: Record<Exclude<Language, 'en'>, Record<string, string>> = {
  ar: { K: 'ألف', M: 'مليون', B: 'مليار', T: 'تريليون' },
  ckb: { K: 'هەزار', M: 'ملیۆن', B: 'ملیار', T: 'تریلیۆن' },
};
// Prefer complete sentences to short unit patterns ("Market level …" before "… level …").
const compilePatterns = (entries: Array<[string, string]>) =>
  [...entries]
    .sort((a, b) => b[0].replace(/\{\d+\}/g, '').length - a[0].replace(/\{\d+\}/g, '').length)
    .map(([source, translated]) => {
      const indices: number[] = [];
      const escaped = source
        .split(/(\{\d+\})/)
        .map((piece) => {
          if (/^\{\d+\}$/.test(piece)) {
            const index = Number(piece.slice(1, -1));
            indices.push(index);
            return textArguments[source]?.includes(index)
              ? '(.*?)'
              : '([+×-]?[\\p{Nd}][\\p{Nd}.,/:\\s\\u066b\\u066c]*(?:[KMBT])?)';
          }
          return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        })
        .join('');
      return { match: new RegExp(`^${escaped}$`, 'iu'), translated, indices };
    });
const phrasePatterns = {
  ckb: compilePatterns(soraniPatterns),
  ar: compilePatterns(arabicPatterns),
};

/** Translate only presentation copy. Product IDs, event payloads and save data stay stable. */
export function t(value: string | null | undefined): string {
  if (value == null) return '';
  if (language === 'en' || !value) return value;
  const locale = language;
  const dictionary = dictionaries[locale];
  const patterns = phrasePatterns[locale];
  const cached = cache.get(value);
  if (cached !== undefined) return cached;
  const protectedValues: string[] = [];
  const translate = (text: string, depth = 0): string => {
    const trimmed = text.trim();
    const exact = dictionary.get(normalize(trimmed));
    if (exact !== undefined) return exact;
    if (depth < 8) {
      // Counted product names use the same terminology as shelves and inventory.
      const counted = /^([+×]?[\p{Nd}.,/\u066b\u066c]+)\s+(.+)$/u.exec(trimmed);
      if (counted && dictionary.has(normalize(counted[2])))
        return `${counted[1]} ${dictionary.get(normalize(counted[2]))}`;
      if (/^\d+(?:\.\d+)?s$/.test(trimmed))
        return `${trimmed.slice(0, -1)} ${language === 'ar' ? 'ث' : 'چرکە'}`;
      const compact = /^(\$?[\d.,]+)([KMBT])$/.exec(trimmed);
      if (compact) return `${compact[1]} ${compactUnits[locale][compact[2]]}`;
      for (const { match, translated, indices } of patterns) {
        const found = match.exec(trimmed);
        if (!found) continue;
        return translated.replace(/\{(!?)(\d+)\}/g, (_, raw: string, index: string) => {
          const part = found[indices.indexOf(Number(index)) + 1] ?? '';
          if (!raw) return translate(part, depth + 1);
          protectedValues.push(part);
          return String.fromCharCode(0xe100 + protectedValues.length - 1);
        });
      }
      // These separators join complete UI phrases and lists.
      for (const separator of [' · ', ' → ', ' + ', ' and ', '\n']) {
        if (trimmed.includes(separator))
          return trimmed
            .split(separator)
            .map((part) => translate(part, depth + 1))
            .join(
              separator === ' and '
                ? ' و '
                : language === 'ar' && separator === ' → '
                  ? ' ← '
                  : separator,
            );
      }
    }
    return trimmed;
  };
  const result = translate(value)
    .replace(
      /[0-9۰-۹]/g,
      (digit) => '٠١٢٣٤٥٦٧٨٩'[digit >= '۰' ? digit.charCodeAt(0) - 0x6f0 : Number(digit)],
    )
    // Spaces split Arabic-number runs in bidi. A contiguous ratio keeps current/max order.
    .replace(/([٠-٩])\s*\/\s*([٠-٩])/g, '$1/$2')
    .replace(/([٠-٩])([.,])(?=[٠-٩])/g, (match, digit: string, separator: string) =>
      locale === 'ar' ? digit + (separator === '.' ? '٫' : '٬') : match,
    )
    .replace(
      /[\ue100-\ue1ff]/g,
      (marker) => protectedValues[marker.charCodeAt(0) - 0xe100] ?? marker,
    );
  const translated = value.replace(value.trim(), result);
  // Dynamic timers and currency must not grow memory throughout a long session.
  if (cache.size >= 1024) cache.clear();
  cache.set(value, translated);
  return translated;
}

/** Translate a render's text and accessible labels, never IDs, input values or user content. */
export function html(markup: string): string {
  if (language === 'en') return markup;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const element = node instanceof Element ? node : node.parentElement;
    if (element?.closest('[translate="no"], kbd, code, script, style')) continue;
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      node.textContent = t(node.textContent);
    if (node instanceof Element)
      for (const attribute of ['aria-label', 'aria-valuetext', 'title', 'placeholder']) {
        const value = node.getAttribute(attribute);
        if (value && value !== 'you@example.com') node.setAttribute(attribute, t(value));
      }
  }
  return template.innerHTML;
}

export async function initializeLanguage(): Promise<void> {
  setLanguage(readLanguage(window.location.search));
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
  document.title = t('Mini Market Manager');
  if (language !== 'en') {
    // Canvas labels need the Arabic-script font before their first draw.
    await document.fonts.load('700 20px "Noto Sans Arabic"').catch(() => undefined);
  }
}

/** Exceptions from the browser/server are not copy keys: use a safe local fallback. */
export function errorText(
  message: string,
  fallback = 'The service could not complete the request. Please try again.',
): string {
  return t(
    language !== 'en' && !dictionaries[language].has(normalize(message)) ? fallback : message,
  );
}
