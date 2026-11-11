(function (window) {
  'use strict';
  var optInField = 'cf61270f-76b2-4dc5-bfda-5e19438a939e';

  function localSlot(instant, zone) {
    var date = new Date(instant);
    var parts = {};
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return {
      date: parts.year + '-' + parts.month + '-' + parts.day,
      day: parts.weekday.replace('.', '').toLowerCase() + ' ' + parts.day + '/' + parts.month,
      time: parts.hour + ':' + parts.minute
    };
  }

  function displayZone(root) {
    var select = root.querySelector('.cx-booking__tz-select');
    var candidates = [select && select.value, Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC'];
    for (var i = 0; i < candidates.length; i++) {
      if (!candidates[i]) continue;
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: candidates[i] });
        return candidates[i];
      } catch (_) { /* tente o próximo fuso válido */ }
    }
  }

  function configure(summary) {
    var fields = summary.bookingFields;
    if (!Array.isArray(fields)) return false;
    var custom = fields.filter(function (f) { return f && f.field === 'custom'; });
    if (custom.length !== 1 || custom[0].customFieldId !== optInField || custom[0].required !== false) return false;
    summary.bookingFields = fields.filter(function (f) {
      return f && !((f.field === 'observations' || f.field === 'notes') && f.required === false);
    });
    return true;
  }

  function attach(root, supportsOptIn) {
    function update() {
      var form = root.querySelector('.cx-booking__form');
      var zone = root.querySelector('.cx-booking__tz-select');
      var zoneWrap = zone && zone.closest('.cx-booking__tz');
      if (zoneWrap) zoneWrap.classList.toggle('arkom-booking-zone-hidden', !!form || !!root.querySelector('.cx-booking__success'));
      var subtitle = root.querySelector('.cx-booking__attendant');
      if (supportsOptIn() && subtitle && /digite SIM em/i.test(subtitle.textContent)) {
        subtitle.textContent = 'Time Bilhon · Diagnóstico';
      }
      if (!form || form.dataset.arkomBookingUx === '1') return;
      form.dataset.arkomBookingUx = '1';
      var back = form.querySelector('.cx-booking__back');
      if (back) {
        back.setAttribute('aria-label', 'Alterar horário ou fuso');
        var label = back.lastChild;
        if (label && label.nodeType === 3) label.nodeValue = 'Alterar horário ou fuso';
      }
      var error = form.querySelector('.cx-booking__form-error');
      if (error) error.setAttribute('role', 'alert');
      var optIn;
      form.querySelectorAll('.cx-booking__field').forEach(function (field, index) {
        var label = field.querySelector('.cx-booking__label');
        var input = field.querySelector('.cx-booking__input');
        if (!label || !input) return;
        if (input.autocomplete === 'tel') label.textContent = 'Celular com DDD';
        if (!input.id) input.id = 'arkom-booking-field-' + index;
        label.htmlFor = input.id;
        if (supportsOptIn() && label.textContent.trim() === 'Informação adicional' &&
            input.tagName === 'INPUT' && !input.required) optIn = { field: field, input: input };
      });
      if (!optIn) return;
      var label = form.ownerDocument.createElement('label');
      var checkbox = form.ownerDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = /^sim$/i.test(optIn.input.value.trim());
      label.className = 'arkom-booking-optin';
      label.append(checkbox, ' Quero receber a confirmação e os lembretes desta reunião no WhatsApp da Arkom (opcional).');
      checkbox.addEventListener('change', function () {
        optIn.input.value = checkbox.checked ? 'SIM' : '';
        optIn.input.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
      optIn.field.before(label);
      optIn.field.classList.add('arkom-booking-zone-hidden');
    }
    var observer = new window.MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    update();
    return function () { observer.disconnect(); };
  }

  window.ArkomBookingUX = { localSlot: localSlot, displayZone: displayZone, configure: configure, attach: attach };
})(window);
