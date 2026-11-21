const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent('<div style="width:100px;height:100px" id="item"></div><iframe srcdoc="<div>Modulo</div>"></iframe>');
    const script = fs.readFileSync('js/core/systemZoom.js', 'utf8');
    await page.addScriptTag({ content: script });
    await page.evaluate(() => EasyLocSystemZoom.apply(90));
    assert.equal(await page.locator('#item').evaluate(el => Math.round(el.getBoundingClientRect().width)), 90);
    const frame = page.frames()[1];
    await frame.addScriptTag({ content: script });
    await frame.evaluate(() => EasyLocSystemZoom.apply(90));
    assert.equal(await frame.locator('#elSystemZoom').count(), 0, 'iframe nao duplica a escala');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#item').evaluate(el => Math.round(el.getBoundingClientRect().width)), 100);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#item').evaluate(el => Math.round(el.getBoundingClientRect().width)), 100);
    console.log('OK - zoom no computador, sem duplicacao em iframe, impressao e celular preservados');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
