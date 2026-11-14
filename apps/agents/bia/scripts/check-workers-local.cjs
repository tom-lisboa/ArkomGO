const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, expect} = require('@playwright/test');

const origin = 'http://127.0.0.1:3007';
const api = origin + '/api/demo/backend';
const root = path.resolve(__dirname, '../../../..');

async function verify() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({acceptDownloads: true});
    const login = page.waitForResponse(response => response.url() === api + '/__test/ui/local-enter');
    await page.goto(origin + '/demo/sdr');
    const entry = await login;
    assert.equal(entry.status(), 200, 'login da demo');
    const session = await entry.json();
    assert.equal(session.identity.organization_id, 'org_demo_alfa');
    const headers = {Authorization: 'Bearer ' + session.access_token};
    const frame = page.frameLocator('iframe[data-arkom-agent="sdr"]');

    const qr = frame.getByRole('button', {name: /^Gerar (novo )?QR Code$/});
    await expect(qr).toBeEnabled({timeout: 45000});
    const existingQR = frame.getByRole('img', {name: 'QR Code para conectar seu WhatsApp'});
    if (!(await existingQR.isVisible())) {
      await qr.click();
      await expect(existingQR).toBeVisible({timeout: 40000});
    }
    const messaging = await page.request.get(api + '/v1/sdr/whatsapp/messaging', {headers});
    assert.equal(messaging.status(), 200);
    assert.equal((await messaging.json()).media_available, true);
    console.log('WhatsApp: QR do gateway exibido sem parear número.');

    await frame.getByRole('button', {name: 'Conversas', exact: true}).click();
    const fixtureTitle = 'Validação local de mídia';
    const listed = await page.request.get(api + '/v1/sdr/conversations', {headers});
    let fixture = (await listed.json()).items.find(item => item.label === fixtureTitle);
    if (!fixture) {
      const created = await page.request.post(api + '/__test/ui/conversations', {
        headers: {...headers, 'Idempotency-Key': 'bia-local-media-check'},
        data: {label: fixtureTitle},
      });
      assert.equal(created.status(), 201);
      fixture = (await created.json()).conversation;
      await frame.getByRole('button', {name: 'Atualizar conversa'}).click();
    }
    assert.equal(fixture.channel, 'fake_whatsapp');
    await frame.getByRole('button', {name: new RegExp(fixtureTitle)}).click();
    if (fixture.automation === 'active') {
      await frame.getByRole('button', {name: 'Assumir atendimento', exact: true}).click();
    }
    const configuredCodecs = path.join(root, '.local/media-tools/bin/ffmpeg');
    const ffmpeg = process.env.ARKOM_MEDIA_BIN
      ? path.join(process.env.ARKOM_MEDIA_BIN, 'ffmpeg')
      : fs.existsSync(configuredCodecs) ? configuredCodecs : 'ffmpeg';
    const png = execFileSync(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32',
        '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'],
    );
    const chooser = frame.getByLabel('Arquivo para anexar');
    await expect(chooser).toBeEnabled();
    const upload = page.waitForResponse(response =>
      response.request().method() === 'POST' && response.url().endsWith('/conversations/' + fixture.id + '/media'));
    await chooser.setInputFiles({name: 'imagem-sintetica.png', mimeType: 'image/png', buffer: png});
    const uploaded = await upload;
    assert.equal(uploaded.status(), 202, 'upload na BIA');
    const {asset} = await uploaded.json();
    await expect(frame.getByText('imagem-sintetica.png · Pronto para enviar')).toBeVisible({timeout: 25000});
    const content = await page.request.get(api + '/v1/sdr/media/' + asset.id + '/content', {headers});
    assert.equal(content.status(), 200);
    assert.equal(content.headers()['content-type'], 'image/png');
    await frame.getByRole('button', {name: 'Remover anexo'}).click();
    console.log('Mídia: worker preparou a imagem anexada pela BIA.');

    await frame.getByRole('button', {name: 'Meus dados', exact: true}).click();
    const exportButton = frame.getByRole('button', {name: 'Baixar meus dados', exact: true});
    await expect(exportButton).toBeEnabled();
    const downloaded = page.waitForEvent('download');
    await exportButton.click();
    const zip = await downloaded;
    assert.equal(zip.suggestedFilename(), 'meus-dados-sdr.zip');
    const archive = await zip.path();
    const manifest = JSON.parse(execFileSync('unzip', ['-p', archive, 'manifest.json'], {encoding: 'utf8'}));
    assert.equal(manifest.organization_id, 'org_demo_alfa');

    const query = {query: '{ customer { exports { id status } } }'};
    const overview = await page.request.post(api + '/v1/customer/graphql', {headers, data: query});
    assert.equal(overview.status(), 200);
    const job = (await overview.json()).data.customer.exports.find(item => item.status === 'ready');
    assert(job, 'exportação pronta');
    const credentials = JSON.parse(fs.readFileSync(path.join(root, '.local/runtime/lab-data/credentials.json')));
    async function testSession(company, role) {
      const response = await page.request.post(api + '/__test/ui/login', {
        data: {company, role, access_code: credentials[company + '.' + role]},
      });
      assert.equal(response.status(), 200, 'sessão de teste');
      return {Authorization: 'Bearer ' + (await response.json()).access_token};
    }
    const beta = await testSession('beta', 'admin');
    const operator = await testSession('alfa', 'operator');
    const betaStatus = await page.request.get(api + '/v1/sdr/whatsapp', {headers: beta});
    assert.equal(betaStatus.status(), 200);
    assert.equal((await betaStatus.json()).qr_data_url, undefined);
    assert.equal((await page.request.get(api + '/v1/sdr/media/' + asset.id + '/content', {headers: beta})).status(), 404);
    assert.equal((await page.request.get(api + '/v1/customer/exports/' + job.id + '/content', {headers: beta})).status(), 404);
    assert.equal((await page.request.post(api + '/v1/customer/graphql', {headers: operator, data: query})).status(), 403);
    await zip.delete();
    console.log('Meus dados: download ZIP pelo painel, isolamento Alfa/Beta e acesso reservado a administradores.');
  } finally {
    await browser.close();
  }
}

verify().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
