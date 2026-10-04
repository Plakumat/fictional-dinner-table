// Renders docs/diagrams/*.mmd to PNG with Mermaid in the Playwright browser
// that the e2e suite already installs. Run from client/:  npm run diagrams
//
// The sources are the truth; the PNGs are committed so that nobody needs to
// run this to read the README. Mermaid is loaded from a CDN at a pinned
// version rather than installed, since nothing in the application needs it.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIR = fileURLToPath(new URL('../../docs/diagrams/', import.meta.url));
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.esm.min.mjs';
// ELK lays out flowcharts with subgraphs far more legibly than the default engine.
const ELK = 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@1.0.1/dist/mermaid-layout-elk.esm.min.mjs';
const FONTS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap';

// Sofra's palette, from client/src/ui/styles/global.css.
const ink = '#1c1917';
const muted = '#5c5752';
const line = '#e6e0d6';
const linen = '#f5f1ea';
const paper = '#faf8f4';
const nar = '#b42318';
const narTint = '#fbe4e1';
const olive = '#3f6b3a';
const oliveTint = '#e8efe3';
const saffronTint = '#fbefd9';
const saffronInk = '#8a5a00';

const config = {
  startOnLoad: false,
  theme: 'base',
  fontFamily: 'Manrope, system-ui, sans-serif',
  themeVariables: {
    fontFamily: 'Manrope, system-ui, sans-serif',
    fontSize: '14px',
    background: '#ffffff',
    primaryColor: '#ffffff',
    primaryTextColor: ink,
    primaryBorderColor: ink,
    secondaryColor: linen,
    secondaryBorderColor: line,
    tertiaryColor: paper,
    tertiaryBorderColor: line,
    lineColor: muted,
    textColor: ink,
    titleColor: ink,
    clusterBkg: paper,
    clusterBorder: line,
    edgeLabelBackground: '#ffffff',
    // Sequence diagrams
    actorBkg: linen,
    actorBorder: ink,
    actorTextColor: ink,
    actorLineColor: line,
    signalColor: ink,
    signalTextColor: ink,
    labelBoxBkgColor: narTint,
    labelBoxBorderColor: nar,
    labelTextColor: ink,
    loopTextColor: ink,
    noteBkgColor: saffronTint,
    noteBorderColor: saffronInk,
    noteTextColor: ink,
    activationBkgColor: oliveTint,
    activationBorderColor: olive,
    sequenceNumberColor: '#ffffff',
    // State diagrams
    labelBackgroundColor: '#ffffff',
    stateBkg: '#ffffff',
    stateLabelColor: ink,
    transitionColor: muted,
    transitionLabelColor: ink,
    compositeBackground: paper,
    altBackground: paper,
    specialStateColor: ink,
    innerEndBackground: ink,
  },
  layout: 'elk',
  elk: { nodePlacementStrategy: 'NETWORK_SIMPLEX', mergeEdges: false },
  // Line breaks are where the sources put them, not where a 200px limit falls.
  markdownAutoWrap: false,
  flowchart: { curve: 'basis', nodeSpacing: 28, rankSpacing: 48, padding: 12, wrappingWidth: 1000 },
  sequence: { diagramMarginX: 12, diagramMarginY: 12, actorMargin: 36, messageMargin: 28, mirrorActors: false, noteMargin: 8, boxMargin: 8 },
  state: { useMaxWidth: false },
};

const page = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}">
<style>
  body { margin: 0; background: #ffffff; }
  #wrap { display: inline-block; padding: 28px; background: #ffffff; }
  #wrap svg { display: block; }
</style></head><body><div id="wrap"></div></body></html>`;

// `npm run diagrams -- 05` renders only the sources whose name contains "05".
const only = process.argv.slice(2);
const files = (await readdir(DIR)).filter((f) => f.endsWith('.mmd') && (only.length === 0 || only.some((part) => f.includes(part)))).sort();
const browser = await chromium.launch();
const tab = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1200 } });
await tab.setContent(page, { waitUntil: 'load' });
await tab.addScriptTag({
  type: 'module',
  content: `
    import mermaid from '${MERMAID}';
    import elk from '${ELK}';
    mermaid.registerLayoutLoaders(elk);
    mermaid.initialize(${JSON.stringify(config)});
    window.mermaid = mermaid;`,
});
await tab.waitForFunction(() => Boolean(window.mermaid));
// Mermaid measures text before drawing; the fonts must be in by then, or a
// box is sized for the fallback font and the real one overflows it.
await tab.evaluate(() => Promise.all(['400', '600', '700', '800'].map((w) => document.fonts.load(`${w} 14px Manrope`))));

for (const file of files) {
  const source = await readFile(DIR + file, 'utf8');
  const width = await tab.evaluate(
    async ({ id, source }) => {
      const { svg } = await window.mermaid.render(id, source);
      const wrap = document.getElementById('wrap');
      wrap.innerHTML = svg;
      const el = wrap.querySelector('svg');
      // Mermaid sizes the drawing in a viewBox and lets CSS stretch it; pin it to its own size.
      const [, , w, h] = el.getAttribute('viewBox').split(' ').map(Number);
      el.style.maxWidth = '';
      el.setAttribute('width', String(Math.ceil(w)));
      el.setAttribute('height', String(Math.ceil(h)));
      return Math.ceil(w);
    },
    { id: 'd' + file.replace(/\W/g, ''), source },
  );
  const out = DIR + file.replace(/\.mmd$/, '.png');
  await tab.locator('#wrap').screenshot({ path: out });
  console.log(`${file} → ${out.slice(DIR.length)} (${width}px wide)`);
}

await browser.close();
