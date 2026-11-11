const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const path = process.argv[2];
if (!path) throw new Error('Usage: node verify.cjs <directory containing booking.html, booking-fixed.html and sdk.js>');
const read = f => readFileSync(path + '/' + f, 'utf8');
const patched = read('booking-fixed.html');
const original = read('booking.html');
const sdk = read('sdk.js');
const optIn = 'cf61270f-76b2-4dc5-bfda-5e19438a939e';
const time = '2026-11-10T13:00:00.000Z';
const future = '2026-11-10T13:45:00.000Z';
const base = 'https://api.clickmax.io/public/booking/projeto-de-zambinati/call-estrategica-arkom';
const scripts = html => [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);

async function until(check, what) {
  for (let i = 0; i < 100; i++) {
    const r = check();
    if (r) return r;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error('Timed out: ' + what);
}

async function test({ patchedPage, consent, changeWhileOpen }) {
  const html = patchedPage ? patched : original;
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><div id="vagas" hidden></div><div id="cx-book" data-cx-booking="projeto-de-zambinati/call-estrategica-arkom"></div>', {
    url: 'https://diagnostico.bilhon.com/agendar-reuniao', runScripts: 'outside-only', virtualConsole: vc
  });
  const w = dom.window, d = w.document;
  const root = d.querySelector('#cx-book');
  const get = s => d.querySelector(s);
  const send = [];
  let lookups = [];
  const summary = { scheduleName: 'Diagnóstico de IA', teamName: 'Time Bilhon', durationMinutes: 45, maxAdvanceDays: 14,
    attendantName: 'Time Bilhon', publicSubtitle: 'Opcional: digite SIM em “Informação adicional”',
    bookingFields: [{field:'name',required:true},{field:'email',required:true},{field:'telephone',required:true},
      {field:'observations',required:false},{field:'custom',required:false,customFieldId:optIn}] };
  try {
    w.eval('const OriginalDate = Date; Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ["2026-11-09T22:00:00Z"])); } static now() { return Date.parse("2026-11-09T22:00:00Z"); } };');
    w.turnstile = {render: (_node, opts) => { opts.callback('local-fixture'); return 'local-fixture'; }, remove() {}};
    w.matchMedia = () => ({matches:false, addEventListener(){}});
    w.fetch = async (url, init) => {
      const u = new URL(url, w.location.href);
      const res = v => new Response(JSON.stringify(v), {status:200});
      if (u.href === base) return res(summary);
      if (u.pathname.endsWith('/available-days')) return res(u.searchParams.get('month') === '11' ? ['2026-11-10'] : []);
      if (u.pathname.endsWith('/slots')) {
        lookups.push(u.searchParams.get('tz'));
        return res([{startAt:time,endAt:future}]);
      }
      if (u.pathname.endsWith('/bookings')) {
        send.push(JSON.parse(init.body));
        return res({startAt:time,endAt:future,scheduledCallId:'fixture-booking'});
      }
      return res({});
    };
    w.__agendaAbc = {ok:true,base};
    if (patchedPage) {
      w.eval(scripts(html).find(s => s.includes('window.ArkomBookingUX =')));
      const fetch = w.fetch;
      let valid;
      w.fetch = async (...args) => {
        const r = await fetch(...args);
        if (args[0] !== base) return r;
        const j = await r.json();
        valid = w.ArkomBookingUX.configure(j);
        return new Response(JSON.stringify(j), {status:200});
      };
      w.ArkomBookingUX.attach(root, () => valid === true);
    }
    w.eval(sdk);
    const tz = await until(() => get('.cx-booking__tz-select'), 'timezone dropdown');
    const changeZone = v => { tz.value = v; tz.dispatchEvent(new w.Event('change', {bubbles:true})); };
    changeZone('America/Cuiaba');
    w.eval(scripts(html).find(s => s.includes('var MAX_HORARIOS = 6')));
    const chip = await until(() => get('.vagas-hora'), 'quick slot');
    assert.equal(chip.textContent, patchedPage ? '09:00' : '10:00');
    changeZone('Europe/Lisbon');
    assert.equal(chip.textContent, patchedPage ? '13:00' : '10:00');
    const day = await until(() => [...d.querySelectorAll('.cx-booking__day')].find(b => !b.disabled && b.textContent === '10'), 'calendar day');
    day.click();
    const slot = await until(() => get('.cx-booking__slot'), 'calendar slot');
    assert.equal(slot.textContent, '13:00');
    slot.click();
    const form = await until(() => get('.cx-booking__form'), 'booking form');
    const fill = (selector, value) => {
      const field = form.querySelector(selector);
      assert.ok(field, selector);
      field.value = value;
      field.dispatchEvent(new w.Event('input', {bubbles:true}));
    };
    fill('[autocomplete=name]', 'Pessoa de Teste');
    fill('[autocomplete=email]', 'teste@example.test');
    fill('[autocomplete=tel]', '+5511999990000');
    if (patchedPage) {
      assert.ok(tz.closest('label').classList.contains('arkom-booking-zone-hidden'));
      assert.equal(form.querySelector('.cx-booking__back').getAttribute('aria-label'), 'Alterar horário ou fuso');
      assert.equal(form.querySelector('textarea'), null);
      assert.equal(form.querySelector('input[type=checkbox]').checked, false);
      if (consent) form.querySelector('input[type=checkbox]').click();
      assert.equal(w.ArkomBookingUX.localSlot('2026-11-10T23:00:00Z','Asia/Kolkata').date,'2026-11-11');
    }
    if (changeWhileOpen && !patchedPage) changeZone('America/Sao_Paulo');
    if (changeWhileOpen && patchedPage) {
      form.querySelector('.cx-booking__back').click();
      await until(() => !tz.closest('label').classList.contains('arkom-booking-zone-hidden'), 'timezone available after going back');
      changeZone('America/Sao_Paulo');
      const brSlot = await until(() => get('.cx-booking__slot'), 'reloaded timezone slot');
      assert.equal(brSlot.textContent, '10:00');
      brSlot.click();
      const newForm = await until(() => get('.cx-booking__form'), 'new booking form');
      assert.equal(newForm.querySelector('[autocomplete=name]').value, 'Pessoa de Teste');
      assert.equal(newForm.querySelector('input[type=checkbox]').checked, consent);
    }
    const activeForm = get('.cx-booking__form');
    activeForm.dispatchEvent(new w.Event('submit',{cancelable:true}));
    if (!patchedPage) {
      assert.equal(send.length, 0, 'broken version does not submit after changing timezone on the form');
      return;
    }
    await until(() => get('.cx-booking__success'), 'success');
    assert.equal(send.length, 1);
    assert.equal(send[0].startAt, time);
    assert.equal(send[0].tz, changeWhileOpen ? 'America/Sao_Paulo' : 'Europe/Lisbon');
    assert.deepEqual(send[0].fieldValues, consent ? [{field:'custom',customFieldId:optIn,value:'SIM'}] : undefined);
    assert.ok(lookups.includes(send[0].tz));
  } finally { w.close(); }
}

(async () => {
  await test({patchedPage:false, changeWhileOpen:true});
  console.log('Reproduzido: faixa em Brasília e nenhuma requisição ao trocar fuso com a ficha aberta.');
  await test({patchedPage:true, consent:false, changeWhileOpen:false});
  console.log('Corrigido: faixa acompanha Cuiabá e Lisboa; reserva usa fuso correto e omite consentimento desmarcado.');
  await test({patchedPage:true, consent:true, changeWhileOpen:true});
  console.log('Corrigido: trocar fuso preserva os dados, reserva uma vez e só envia SIM quando a caixa foi marcada.');
})().catch(e => { console.error(e); process.exitCode = 1; });
