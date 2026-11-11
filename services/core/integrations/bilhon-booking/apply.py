#!/usr/bin/env python3
"""Apply the Arkom booking UI fix to the Bilhon page source, without deploying it."""

from argparse import ArgumentParser
from pathlib import Path


def apply(html: str) -> str:
    def replace(old: str, new: str) -> None:
        nonlocal html
        if html.count(old) != 1:
            raise ValueError("Layout changed; review the source before applying: " + old[:100])
        html = html.replace(old, new, 1)

    widget = Path(__file__).with_name("widget-ux.js").read_text(encoding="utf-8")
    replace(
        "  <!-- AGENDA-ABC · NÚCLEO",
        """  <style>
    #cx-book .arkom-booking-zone-hidden { display: none !important; }
    #cx-book .arkom-booking-optin { display: flex; align-items: start; gap: .55rem; margin: 0 0 1rem; }
    #cx-book .arkom-booking-optin input { margin-top: .2em; }
  </style>
  <script>
""" + widget + "  </script>\n  <!-- AGENDA-ABC · NÚCLEO",
    )
    replace(
        "            j.pixelId = null;",
        "            A.whatsappCheckbox = window.ArkomBookingUX.configure(j);\n"
        "            j.pixelId = null;",
    )
    replace(
        "    var observador = new MutationObserver(medir);",
        "    var limparUX = window.ArkomBookingUX.attach(alvo, function () { return A.whatsappCheckbox === true; });\n"
        "    var observador = new MutationObserver(medir);",
    )
    replace(
        "      observador.disconnect();\n      alvo.removeEventListener('click', clicar, true);",
        "      observador.disconnect();\n      limparUX();\n      alvo.removeEventListener('click', clicar, true);",
    )
    start = html.index("      function rotulo(dia, inicio) {")
    end = html.index("      function pegar(url) {", start)
    replace(
        html[start:end],
        """      var ux = window.ArkomBookingUX;
      function fuso() { return ux.displayZone(alvo); }
      function rotulo(inicio) { return ux.localSlot(inicio, fuso()); }
""",
    )
    replace(
        """      var mexeu = false, dica = null;
      ['click', 'change'].forEach(function (t) { alvo.addEventListener(t, function (e) { if (e.isTrusted) mexeu = true; }, true); });""",
        """      var mexeu = false, dica = null, chips = [];
      function pintar(item) {
        var t = rotulo(item.inicio);
        item.botao.setAttribute('aria-label', t.day + ' · ' + t.time);
        item.dia.textContent = t.day;
        item.hora.textContent = t.time;
      }
      ['click', 'change'].forEach(function (t) {
        alvo.addEventListener(t, function (e) {
          if (e.isTrusted) mexeu = true;
          if (t !== 'change' || !e.target.matches('.cx-booking__tz-select')) return;
          chips.forEach(pintar);
          if (dica) dica.hidden = true;
        }, true);
      });""",
    )
    replace(
        "if (!selecionarSlot) { avisar(it.dia, false);",
        "if (!selecionarSlot) { avisar(rotulo(it.inicio).date, false);",
    )
    replace(
        "}, function () { avisar(it.dia, false); ocupado(false); });",
        "}, function () { avisar(rotulo(it.inicio).date, false); ocupado(false); });",
    )
    replace("'vagas-fuso', '(horário de Brasília)'", "'vagas-fuso', '(no fuso selecionado abaixo)'")
    replace(
        """          var t = rotulo(it.dia, it.inicio), b = el('button', 'vagas-item');
          b.type = 'button';
          b.setAttribute('aria-label', t.dia + ' · ' + t.hora);
          b.appendChild(el('span', 'vagas-dia', t.dia));
          b.appendChild(el('span', 'vagas-hora', t.hora));""",
        """          var b = el('button', 'vagas-item');
          b.type = 'button';
          var chip = { inicio: it.inicio, botao: b, dia: el('span', 'vagas-dia'), hora: el('span', 'vagas-hora') };
          chips.push(chip);
          pintar(chip);
          b.appendChild(chip.dia);
          b.appendChild(chip.hora);""",
    )
    replace(
        """          if (mexeu || alvo.querySelector('.cx-booking__day--active')) return;
          if (selecionarSlot && selecionarSlot.primeiroDia) {
            selecionarSlot.primeiroDia(r.primeiro, function () { return !mexeu; }, function (abriu) { if (!mexeu) avisar(r.primeiro, abriu); });
          } else avisar(r.primeiro, abrirDia(r.primeiro));""",
        """          if (mexeu || alvo.querySelector('.cx-booking__day--active')) return;
          var primeiroLocal = rotulo(r.lista[0].inicio).date;
          if (selecionarSlot && selecionarSlot.primeiroDia) {
            selecionarSlot.primeiroDia(primeiroLocal, function () { return !mexeu; }, function (abriu) { if (!mexeu) avisar(primeiroLocal, abriu); });
          } else avisar(primeiroLocal, abrirDia(primeiroLocal));""",
    )
    return html


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("write to a separate output file")
    args.output.write_text(apply(args.source.read_text(encoding="utf-8")), encoding="utf-8")
