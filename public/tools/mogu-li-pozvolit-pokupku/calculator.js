// Калькулятор «Могу ли я позволить себе эту покупку?».
//
// Разовая проверка одной покупки прямо сейчас. Ничего не сохраняет, не ведёт
// историю и не пересчитывает будущие периоды — это задача приложения.
//
// Считает только браузер. Введённые суммы никуда не уходят: ни на бэкенд, ни в
// Метрику, ни в URL, и не сохраняются между визитами (ни localStorage, ни
// cookie). В аналитику отправляются лишь имена целей и технические параметры —
// см. window.ffTrack в /script.js.
//
// Формула:
//   свободно до покупки   = деньги сейчас − обязательные расходы − запас
//   свободно после покупки = свободно до покупки − стоимость покупки
//   в день после покупки  = свободно после покупки / дней   (только если > 0)
//   доля покупки          = стоимость / свободно до покупки × 100 (только если свободно > 0)
//
// Четыре состояния:
//   existing_deficit — свободно до покупки < 0: дефицит был ещё до покупки,
//                      стоимость покупки с ним не смешиваем;
//   affordable       — после покупки остаётся больше нуля;
//   exact            — после покупки ровно ноль;
//   unaffordable     — после покупки меньше нуля.
// Никаких «безопасно / рискованно»: запас человек задаёт сам, и он неприкосновенен.
// Отрицательный дневной остаток не показывается никогда.
//
// Разбор полей строгий: то, что нельзя понять однозначно, не «чинится» молча, а
// отправляется пользователю ошибкой (см. parseMoney / parseDays в calc-core.js).
'use strict';

(function initPurchaseAffordabilityCalculator() {
  const core = window.ffCalcCore;
  const form = document.getElementById('calcForm');
  const resultEl = document.getElementById('calcResult');
  if (!core || !form || !resultEl) return;

  const { MINUS, rub, rubWords, breakdownRow } = core;

  const CALCULATOR = 'purchase_affordability';

  // Покупка за 0 ₽ — не вопрос «могу ли я себе позволить», а почти наверняка
  // пропущенная цифра. Говорим об этом, а не показываем «помещается».
  const parsePrice = (raw) => {
    const parsed = core.parseMoney(raw);
    return parsed.status === 'ok' && parsed.value === 0 ? { status: 'zero' } : parsed;
  };

  const fields = core.collectFields({
    money: {
      kind: 'money', required: true, inputId: 'calcMoney', errorId: 'calcMoneyError',
      emptyError: 'Укажите, сколько денег у вас есть сейчас.',
    },
    price: {
      kind: 'money', required: true, inputId: 'calcPrice', errorId: 'calcPriceError',
      parse: parsePrice,
      errors: Object.assign({}, core.MONEY_ERRORS, { zero: 'Стоимость покупки должна быть больше нуля.' }),
      emptyError: 'Укажите, сколько стоит покупка.',
    },
    mandatory: { kind: 'money', required: false, inputId: 'calcMandatory', errorId: 'calcMandatoryError' },
    reserve: { kind: 'money', required: false, inputId: 'calcReserve', errorId: 'calcReserveError' },
    days: {
      kind: 'days', required: true, inputId: 'calcDays', errorId: 'calcDaysError',
      parse: core.parseDays, errors: core.DAYS_ERRORS,
      emptyError: 'Укажите, через сколько дней ожидается следующий доход.',
    },
  });
  if (!fields) return;

  function validate() {
    const problems = [];
    const money = core.readField(fields.money, problems);
    const price = core.readField(fields.price, problems);
    const mandatory = core.readField(fields.mandatory, problems);
    const reserve = core.readField(fields.reserve, problems);
    const days = core.readField(fields.days, problems);

    if (problems.length > 0) return { problems };
    return { values: { money, price, mandatory, reserve, days } };
  }

  // Верх разбивки одинаков во всех состояниях: откуда берётся свободная сумма.
  function baseRows({ money, mandatory, reserve }) {
    return `
          ${breakdownRow('Сейчас', rub(money))}
          ${breakdownRow('Обязательные расходы', `${MINUS}${rub(mandatory)}`)}
          ${breakdownRow('Финансовый запас', `${MINUS}${rub(reserve)}`)}`;
  }

  // Разбивка с покупкой — для affordable / exact / unaffordable.
  function purchaseBreakdown(data, totalLabel, totalValue) {
    return `
        <div class="calc-breakdown">
          ${baseRows(data)}
          ${breakdownRow('Свободно до покупки', rub(data.free), 'calc-breakdown-total')}
          ${breakdownRow('Покупка', `${MINUS}${rub(data.price)}`)}
          ${breakdownRow(totalLabel, totalValue, 'calc-breakdown-total')}
        </div>`;
  }

  // Процент от неокруглённой доли; меньше 1% не пишем как «около 0%».
  function shareText({ price, free }) {
    const share = (price / free) * 100;
    return share < 1 ? 'меньше 1%' : `около ${Math.round(share)}%`;
  }

  function renderAffordable(data) {
    const { after, days } = data;
    const perDay = Math.round(after / days);
    const perDayVisible = perDay < 1 ? `меньше 1${core.NBSP}₽` : rub(perDay);
    const perDayWords = perDay < 1 ? 'меньше 1 рубля' : rubWords(perDay);

    const srText = [
      'Да, покупка помещается в текущий бюджет.',
      `После покупки останется ${rubWords(after)} свободных.`,
      `Это примерно ${perDayWords} в день до следующего дохода.`,
    ].join(' ');

    return `
      <div class="calc-result-card calc-result-card-ok">
        <p class="visually-hidden">${srText}</p>
        <p class="calc-result-verdict" aria-hidden="true">Да, покупка помещается в текущий бюджет</p>
        <div class="calc-result-label" aria-hidden="true">ПОСЛЕ ПОКУПКИ ОСТАНЕТСЯ СВОБОДНЫХ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount">${rub(after)}</span>
        </p>
        <p class="calc-result-week" aria-hidden="true">Это примерно ${perDayVisible} в день до следующего дохода.</p>
        <p class="calc-result-note">Покупка использует ${shareText(data)} свободной суммы.</p>
        ${purchaseBreakdown(data, 'Останется свободно', rub(after))}
      </div>`;
  }

  function renderExact(data) {
    return `
      <div class="calc-result-card calc-result-card-ok">
        <p class="visually-hidden">Покупка полностью использует свободную сумму.</p>
        <div class="calc-result-label" aria-hidden="true">РЕЗУЛЬТАТ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount calc-result-amount-text">Покупка полностью использует свободную сумму</span>
        </p>
        <p class="calc-result-note">После обязательных расходов, выбранного запаса и этой покупки свободных денег до следующего дохода не останется.</p>
        <p class="calc-result-note">Расчёт не учитывает незапланированные траты, которые могут появиться позже.</p>
        ${purchaseBreakdown(data, 'Останется свободно', rub(0))}
      </div>`;
  }

  function renderUnaffordable(data) {
    const gap = Math.abs(data.after);

    return `
      <div class="calc-result-card calc-result-card-deficit">
        <p class="visually-hidden">Покупка не помещается в текущий бюджет на ${rubWords(gap)}.</p>
        <div class="calc-result-label" aria-hidden="true">РЕЗУЛЬТАТ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount calc-result-amount-text">Покупка не помещается в текущий бюджет на ${rub(gap)}</span>
        </p>
        <p class="calc-result-note">Чтобы оплатить её сейчас, пришлось бы использовать часть денег, которые вы указали как обязательные расходы или финансовый запас.</p>
        ${purchaseBreakdown(data, 'Не хватает', rub(gap))}
      </div>`;
  }

  // Дефицит был ещё до покупки: стоимость покупки показываем отдельно, чтобы не
  // складывать чужой для неё дефицит с её ценой.
  function renderExistingDeficit(data) {
    const gap = Math.abs(data.free);

    return `
      <div class="calc-result-card calc-result-card-deficit">
        <p class="visually-hidden">Свободного бюджета на покупку сейчас нет. Обязательные расходы и выбранный финансовый запас уже превышают текущий остаток на ${rubWords(gap)}.</p>
        <div class="calc-result-label" aria-hidden="true">РЕЗУЛЬТАТ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount calc-result-amount-text">Свободного бюджета на покупку сейчас нет</span>
        </p>
        <p class="calc-result-note" aria-hidden="true">Обязательные расходы и выбранный финансовый запас уже превышают текущий остаток на ${rub(gap)}.</p>
        <div class="calc-breakdown">
          ${baseRows(data)}
          ${breakdownRow('Превышение до покупки', rub(gap), 'calc-breakdown-total')}
        </div>
        <p class="calc-result-note">Стоимость покупки: ${rub(data.price)}</p>
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
    const after = free - values.price;
    const data = { ...values, free, after };

    let resultType;
    if (free < 0) resultType = 'existing_deficit';
    else if (after > 0) resultType = 'affordable';
    else if (after === 0) resultType = 'exact';
    else resultType = 'unaffordable';

    if (resultType === 'existing_deficit') resultEl.innerHTML = renderExistingDeficit(data);
    else if (resultType === 'affordable') resultEl.innerHTML = renderAffordable(data);
    else if (resultType === 'exact') resultEl.innerHTML = renderExact(data);
    else resultEl.innerHTML = renderUnaffordable(data);

    // В аналитику уходит только тип результата — никаких сумм.
    core.track('calculator_result', { calculator: CALCULATOR, result_type: resultType });
    core.revealResult(resultEl);
  });

  for (const field of Object.values(fields)) core.bindInput(field);

  // Чем человек воспользовался на сайте. Канал привлечения (utm_source /
  // utm_medium) сюда не входит намеренно: источник определяет лендинг по
  // referrer (ffMarkAttribution в /script.js), а рекламную разметку не трогает
  // вообще. Метки постоянные, ничего пользовательского в них нет и быть не
  // может: в ffMarkAttribution стоит белый список ключей и формат значений.
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
