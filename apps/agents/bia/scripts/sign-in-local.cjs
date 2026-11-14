const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '../../../../.local/runtime/lab-data/credentials.json');

async function signInLocal(page, origin, view = '', company = 'alfa') {
  const { [company + '.admin']: password } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const loginURL = origin + '/api/demo/backend/v1/platform/auth/login';
  await page.goto(origin + '/demo' + (view ? '/' + view : ''));
  await page.locator('flt-semantics-placeholder').evaluate(el => el.click());
  await page.getByRole('textbox', {name:'E-mail'}).fill(company + '@arkom.test');
  await page.getByLabel('Senha', {exact:true}).fill(password);
  const response = page.waitForResponse(r => r.url() === loginURL);
  await page.getByRole('button', {name:'Entrar', exact:true}).click();
  const entry = await response;
  if (!entry.ok()) throw Error('Login local: HTTP ' + entry.status());
  return entry.json();
}

module.exports = { signInLocal };
