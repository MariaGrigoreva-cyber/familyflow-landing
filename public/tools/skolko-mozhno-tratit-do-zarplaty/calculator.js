// Калькулятор «Сколько можно тратить до зарплаты».
//
// Считает только браузер. Введённые суммы никуда не уходят: ни на бэкенд, ни в
// Метрику, ни в URL, и не сохраняются между визитами (ни localStorage, ни
// cookie). В аналитику отправляются лишь имена целей и технические параметры —
// см. window.ffTrack в /script.js.
//
// Формула:
//   свободно = деньги сейчас − обязательные расходы − финансовый запас
//   в день   = свободно / дней
//   в неделю = (свободно / дней) × 7
// Отрицательный дневной ориентир не показывается никогда: при нехватке денег
// страница переключается на состояние «дефицит».
//
// Разбор полей строгий: то, что нельзя понять однозначно, не «чинится» молча, а
// отправляется пользователю ошибкой (см. parseMoney в /tools/calc-core.js).
'use strict';

(function initDailySpendingCalculator() {
  const core = window.ffCalcCore;
  const form = document.getElementById('calcForm');
  const resultEl = document.getElementById('calcResult');
  if (!core || !form || !resultEl) return;

  const { MINUS, rub, rubWords, breakdownRow } = core;

  const CALCULATOR = 'daily_spending';
  // Ниже этого дневного ориентира добавляем мягкую оговорку. Ни красного цвета,
  // ни предупреждающих иконок: человек и так видит небольшую сумму.
  const LOW_DAILY = 500;

  // Денежные поля и срок разбирают общие parseMoney / parseDays из
  // /tools/calc-core.js.
  const fields = core.collectFields({
    money: {
      kind: 'money', required: true, inputId: 'calcMoney', errorId: 'calcMoneyError',
      emptyError: 'Укажите, сколько денег у вас есть сейчас.',
    },
    days: {
      kind: 'days', required: true, inputId: 'calcDays', errorId: 'calcDaysError',
      parse: core.parseDays, errors: core.DAYS_ERRORS,
      emptyError: 'Укажите, через сколько дней ожидается следующий доход.',
    },
    mandatory: { kind: 'money', required: false, inputId: 'calcMandatory', errorId: 'calcMandatoryError' },
    reserve: { kind: 'money', required: false, inputId: 'calcReserve', errorId: 'calcReserveError' },
  });
  if (!fields) return;

  function validate() {
    const problems = [];
    const money = core.readField(fields.money, problems);
    const days = core.readField(fields.days, problems);
    const mandatory = core.readField(fields.mandatory, problems);
    const reserve = core.readField(fields.reserve, problems);

    if (problems.length > 0) return { problems };
    return { values: { money, days, mandatory, reserve } };
  }

  function renderPositive({ money, days, mandatory, reserve, free }) {
    const perDayExact = free / days;
    const perDay = Math.round(perDayExact);
    // Неделю считаем от неокруглённого дневного значения, иначе на длинных
    // сроках копится заметная погрешность.
    const perWeek = Math.round(perDayExact * 7);

    const srParts = [
      `У вас свободно ${rubWords(free)}.`,
      `Можно тратить около ${rubWords(perDay)} в день.`,
    ];
    // На сроках короче недели недельный ориентир только путает: такой суммы
    // до следующего дохода всё равно не будет.
    if (days >= 7) srParts.push(`Примерно ${rubWords(perWeek)} в неделю.`);

    const weekLine = days >= 7
      ? `<p class="calc-result-week" aria-hidden="true">≈ ${rub(perWeek)} в неделю</p>`
      : '';

    const lowNote = perDay < LOW_DAILY
      ? '<p class="calc-result-note">Запас до следующего дохода довольно небольшой — стоит внимательнее отнестись к незапланированным расходам.</p>'
      : '';

    return `
      <div class="calc-result-card calc-result-card-ok">
        <p class="visually-hidden">${srParts.join(' ')}</p>
        <p class="calc-result-free" aria-hidden="true">У вас свободно <strong>${rub(free)}</strong></p>
        <div class="calc-result-label" aria-hidden="true">МОЖНО ТРАТИТЬ ОКОЛО</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount">${rub(perDay)}</span>
          <span class="calc-result-unit">в день</span>
        </p>
        ${weekLine}
        <p class="calc-result-note">Это ориентир, а не обязательный дневной лимит. Если сегодня вы потратите меньше, на следующие дни останется больше.</p>
        ${lowNote}
        <div class="calc-breakdown">
          ${breakdownRow('Сейчас', rub(money))}
          ${breakdownRow('Обязательные расходы', `${MINUS}${rub(mandatory)}`)}
          ${breakdownRow('Запас', `${MINUS}${rub(reserve)}`)}
          ${breakdownRow('Свободно', rub(free), 'calc-breakdown-total')}
        </div>
      </div>`;
  }

  function renderDeficit({ money, mandatory, reserve, free }) {
    const gap = Math.abs(free);

    return `
      <div class="calc-result-card calc-result-card-deficit">
        <p class="visually-hidden">До следующего дохода не хватает ${rubWords(gap)}.</p>
        <div class="calc-result-label" aria-hidden="true">ДО СЛЕДУЮЩЕГО ДОХОДА НЕ ХВАТАЕТ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount">${rub(gap)}</span>
        </p>
        <p class="calc-result-note">Запланированные расходы и выбранный запас превышают текущий остаток.</p>
        <ul class="calc-result-tips">
          <li>пересмотреть расходы, которые ещё можно перенести;</li>
          <li>уменьшить резерв, если это допустимо;</li>
          <li>проверить ближайшие дополнительные доходы.</li>
        </ul>
        <div class="calc-breakdown">
          ${breakdownRow('Сейчас', rub(money))}
          ${breakdownRow('Обязательные расходы', `${MINUS}${rub(mandatory)}`)}
          ${breakdownRow('Запас', `${MINUS}${rub(reserve)}`)}
          ${breakdownRow('Не хватает', rub(gap), 'calc-breakdown-total')}
        </div>
      </div>`;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    for (const field of Object.values(fields)) core.clearError(field);

    const { problems, values } = validate();
    if (problems) {
      for (const [field, message] of problems) core.showError(field, message);
      resultEl.innerHTML = '';
      problems[0][0].input.focus();
      return;
    }

    const free = values.money - values.mandatory - values.reserve;
    const deficit = free < 0;

    resultEl.innerHTML = deficit
      ? renderDeficit({ ...values, free })
      : renderPositive({ ...values, free });

    // В аналитику уходит только тип результата — никаких сумм.
    core.track('calculator_result', { calculator: CALCULATOR, result_type: deficit ? 'deficit' : 'positive' });
    core.revealResult(resultEl);
  });

  for (const field of Object.values(fields)) core.bindInput(field);

  // Чем человек воспользовался на сайте. Канал привлечения (utm_source /
  // utm_medium) сюда не входит намеренно: на страницу приходят и из поиска, и
  // из Telegram, и напрямую — источник определяет лендинг по referrer
  // (ffMarkAttribution в /script.js), а рекламную разметку не трогает вообще.
  // Метки постоянные, ничего пользовательского в них нет и быть не может:
  // в ffMarkAttribution стоит белый список ключей и формат значений.
  //
  // Дальше метка едет обычным путём: cookie ff_attr → familyflow-web
  // (src/lib/metrika.js) → POST /auth/register → users.attribution.
  const ATTRIBUTION = {
    utm_campaign: 'tools',
    utm_content: CALCULATOR,
  };

  const cta = document.getElementById('calcCta');
  if (cta) {
    cta.addEventListener('click', () => {
      core.track('calculator_cta_click', { calculator: CALCULATOR });
      core.markAttribution(ATTRIBUTION);
    });
  }

  core.track('calculator_view', { calculator: CALCULATOR });
  // Не только на клик по CTA: человек может уйти из калькулятора на другую
  // страницу сайта и открыть приложение уже оттуда или из кнопки в шапке.
  core.markAttribution(ATTRIBUTION);
})();
