import { expect, type Page } from '@playwright/test';

export async function noEnglish(page: Page, selector: string) {
  const missing = await page.locator(selector).evaluate((root) => {
    const copy: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node instanceof Element ? node : node.parentElement;
      if (
        !element ||
        element.closest('[translate="no"],kbd,code,#debug-panel,input,option[value="en"]')
      )
        continue;
      if (node.nodeType === Node.TEXT_NODE) copy.push(node.textContent ?? '');
      if (node instanceof Element)
        for (const attr of ['aria-label', 'aria-valuetext', 'title', 'placeholder'])
          copy.push(node.getAttribute(attr) ?? '');
    }
    return copy.filter((s) =>
      /[A-Za-z]{2,}/.test(s.replace(/WASD|Shift|WebGL|API|JSON|English/g, '')),
    );
  });
  expect(missing).toEqual([]);
}
