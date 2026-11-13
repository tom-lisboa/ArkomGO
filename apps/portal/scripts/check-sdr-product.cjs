// Integration check for the loopback demo. Starts no services and sends no messages.
const {chromium} = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const base = 'http://127.0.0.1:3007';
  const output = path.resolve(__dirname, '../../../.local/ui-review');
  fs.mkdirSync(output, {recursive: true});
  const login = await fetch(base + '/api/demo/backend/__test/ui/local-enter', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}',
  });
  assert.ok(login.ok, 'Start the local demo first');
  const session = await login.json();
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    page.setDefaultTimeout(20000);
    const errors = [], writes = [], responses = [], startup = [];
    const readOperations = ['pipelines.list', 'pipelines.loss-reasons', 'cards.list', 'contacts.list'];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /hydrat|invalid html/i.test(message.text()))
        errors.push(message.text().slice(0, 180));
    });
    page.on('request', request => {
      if (!request.url().includes('/api/demo/backend/')) return;
      const route = new URL(request.url()).pathname;
      if (route.includes('/whatsapp')) startup.push(route);
      if (request.method() === 'GET' || route.endsWith('/__test/ui/local-enter')) return;
      if (readOperations.some(operation => route.endsWith('/crm/' + operation))) return;
      writes.push(route);
    });
    page.on('response', response => {
      if (response.url().includes('/api/demo/backend/'))
        responses.push({route: new URL(response.url()).pathname, status: response.status()});
    });
    // Avoid repeated login attempts across the Chromium page reloads.
    await page.route('**/__test/ui/local-enter', route => route.fulfill({json: session}));
    await page.goto(base + '/demo/systems');
    const enableSemantics = async () => {
      const frame = page.frameLocator('iframe');
      await frame.locator('flt-semantics-placeholder').evaluate(element => element.click());
      return frame;
    };
    let frame = await enableSemantics();
    await frame.getByRole('button', {name: /^BIA SDR/}).click();
    await page.waitForURL('**/demo/systems/sdr');
    frame = await enableSemantics();
    await frame.getByRole('button', {name: /Acessar sistema/}).waitFor();
    assert.equal(startup.length, 0, 'Catalog or details started the product prematurely');
    await frame.getByRole('button', {name: /Acessar sistema/}).click();
    await page.waitForURL('**/demo/sdr');
    const nav = page.getByRole('navigation', {name: 'SDR Arkom', exact: true});
    await nav.waitFor();
    await page.getByRole('heading', {name: 'Seu WhatsApp', exact: true}).waitFor();
    assert.equal(await page.locator('iframe').count(), 0, 'Reduced Flutter chat opened');
    await page.screenshot({path: path.join(output, 'sdr-product-whatsapp.png')});
    await nav.getByRole('button', {name: 'Álbuns', exact: true}).click();
    await page.getByRole('heading', {name: 'Álbum de projetos', exact: true}).waitFor();
    await page.screenshot({path: path.join(output, 'sdr-product-albums.png')});
    await page.getByRole('button', {name: 'Abrir álbum Skills', exact: true}).click();
    await page.getByRole('heading', {name: 'Ligação por IA', exact: true}).waitFor();
    await page.getByRole('button', {name: 'Copiar pedido para o Lovable', exact: true}).waitFor();
    await page.screenshot({path: path.join(output, 'sdr-product-lovable.png')});
    for (const label of ['Agendas', 'Meus dados'])
      assert.equal(await nav.getByRole('button', {name: label, exact: true}).isDisabled(), true);
    const screens = {'Meu negócio': 'business', 'Automações': 'automations', 'Execuções': 'executions',
      CRM: 'crm', Conversas: 'chat', Auditoria: 'audit'};
    for (const [label, name] of Object.entries(screens)) {
      const crm = label === 'CRM' ? page.waitForResponse(response =>
        response.url().endsWith('/crm/pipelines.list'), {timeout: 15000}) : null;
      await nav.getByRole('button', {name: label, exact: true}).click();
      if (crm) assert.equal((await crm).status(), 200, 'CRM DEV did not answer');
      await page.waitForTimeout(900);
      assert.equal(await nav.getByRole('button', {name: label, exact: true}).getAttribute('aria-current'), 'page');
      assert.equal(new URL(page.url()).pathname, '/demo/sdr', 'Product tab left the SDR');
      await page.screenshot({path: path.join(output, 'sdr-editorial-' + name + '.png')});
    }
    await page.setViewportSize({width: 390, height: 844});
    for (const label of ['WhatsApp', 'Meu negócio', 'Conversas', 'Álbuns']) {
      await nav.getByRole('button', {name: label, exact: true}).click();
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
        label + ' overflows the mobile page');
    }
    await page.screenshot({path: path.join(output, 'sdr-product-mobile.png')});
    assert.equal(responses.some(response => response.route.endsWith('/calendar/capabilities') ||
      response.route.endsWith('/customer/graphql')), false, 'Blocked module initialized');
    assert.deepEqual(writes, [], 'Navigation performed a business write');
    assert.deepEqual(errors, []);
    console.log('SDR: catalog → details → complete product; albums/Lovable; CRM DEV; ' +
      'disabled modules; desktop/mobile; no business writes or browser errors.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
