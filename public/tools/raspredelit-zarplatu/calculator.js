// Калькулятор «Как распределить зарплату на месяц».
//
// Считает только браузер. Введённые суммы никуда не уходят: ни на бэкенд, ни в
// Метрику, ни в URL, и не сохраняются между визитами (ни localStorage, ни
// cookie). В аналитику отправляются лишь имена целей и технические параметры —
// см. window.ffTrack в /script.js.
//
// Формула:
//   общий доход  = зарплата + другие доходы
//   запланировано = обязательные расходы + крупные расходы + накопления
//   свободно      = общий доход − запланировано
//   в неделю      = свободно / 4.345
//   доля X        = X / общий доход × 100
//
// Никакого «правильного процента» здесь нет: калькулятор не сравнивает доли с
// 50/30/20 и ни на что не намекает — он показывает только фактическую картину.
// Отрицательный недельный бюджет не показывается никогда: при нехватке денег
// страница переключается на состояние «дефицит».
//
// Разбор полей строгий: то, что нельзя понять однозначно, не «чинится» молча, а
// отправляется пользователю ошибкой (см. parseMoney в /tools/calc-core.js).
'use strict';

(function initSalaryDistributionCalculator() {
  const core = window.ffCalcCore;
  const form = document.getElementById('calcForm');
  const resultEl = document.getElementById('calcResult');
  if (!core || !form || !resultEl) return;

  const { MINUS, rub, rubWords, breakdownRow } = core;

  const CALCULATOR = 'salary_distribution';
  // Среднее число недель в месяце: 365.25 / 12 / 7 ≈ 4.345. Делить на 4 —
  // значит завышать недельный ориентир примерно на 8%.
  const WEEKS_IN_MONTH = 4.345;

  const fields = core.collectFields({
    salary: {
      kind: 'money', required: true, inputId: 'calcSalary', errorId: 'calcSalaryError',
      emptyError: 'Укажите зарплату после налогов.',
    },
    extra: { kind: 'money', required: false, inputId: 'calcExtra', errorId: 'calcExtraError' },
    mandatory: { kind: 'money', required: false, inputId: 'calcMandatory', errorId: 'calcMandatoryError' },
    large: { kind: 'money', required: false, inputId: 'calcLarge', errorId: 'calcLargeError' },
    savings: { kind: 'money', required: false, inputId: 'calcSavings', errorId: 'calcSavingsError' },
  });
  if (!fields) return;

  function validate() {
    const problems = [];
    const salary = core.readField(fields.salary, problems);
    const extra = core.readField(fields.extra, problems);
    const mandatory = core.readField(fields.mandatory, problems);
    const large = core.readField(fields.large, problems);
    const savings = core.readField(fields.savings, problems);

    if (problems.length > 0) return { problems };
    return { values: { salary, extra, mandatory, large, savings } };
  }

  // Разбивка сумм — одинаковая во всех трёх состояниях, меняется только
  // последняя строка.
  function breakdown({ income, mandatory, large, savings }, totalLabel, totalValue) {
    return `
        <div class="calc-breakdown">
          ${breakdownRow('Общий доход', rub(income))}
          ${breakdownRow('Обязательные расходы', `${MINUS}${rub(mandatory)}`)}
          ${breakdownRow('Запланированные крупные расходы', `${MINUS}${rub(large)}`)}
          ${breakdownRow('Накопления', `${MINUS}${rub(savings)}`)}
          ${breakdownRow(totalLabel, totalValue, 'calc-breakdown-total')}
        </div>`;
  }

  // Доли дохода. Проценты округляем до целых — сумма округлённых может
  // отличаться от 100 на единицу, и «подгонять» её не нужно: это создало бы
  // цифру, которой нет в расчёте. Ширина полосы берётся от неокруглённой доли.
  //
  // Никаких оценок вроде «слишком много на жильё»: только факт.
  function renderSplit({ income, mandatory, large, savings, free }) {
    if (income <= 0) return '';

    const parts = [
      { key: 'mandatory', label: 'обязательные расходы', value: mandatory },
      { key: 'large', label: 'крупные расходы', value: large },
      { key: 'savings', label: 'накопления', value: savings },
      { key: 'free', label: 'свободные деньги', value: Math.max(free, 0) },
    ].filter((part) => part.value > 0);

    if (parts.length === 0) return '';

    const bar = parts
      .map((part) => `<span class="calc-split-seg calc-split-seg-${part.key}" style="width:${(part.value / income) * 100}%"></span>`)
      .join('');

    const rows = parts
      .map((part) => `<li class="calc-split-row">
            <span class="calc-split-key"><span class="calc-split-dot calc-split-dot-${part.key}" aria-hidden="true"></span>${part.label}</span>
            <span class="calc-split-value">${Math.round((part.value / income) * 100)}%</span>
          </li>`)
      .join('');

    return `
        <div class="calc-split">
          <h3 class="calc-split-title">Как распределён доход</h3>
          <div class="calc-split-bar" aria-hidden="true">${bar}</div>
          <ul class="calc-split-list">${rows}</ul>
        </div>`;
  }

  function renderPositive(data) {
    const { free } = data;
    const perWeek = Math.round(free / WEEKS_IN_MONTH);

    const srText = [
      `После всех планов остаётся ${rubWords(free)}.`,
      `Это около ${rubWords(perWeek)} в неделю.`,
    ].join(' ');

    return `
      <div class="calc-result-card calc-result-card-ok">
        <p class="visually-hidden">${srText}</p>
        <div class="calc-result-label" aria-hidden="true">ПОСЛЕ ВСЕХ ПЛАНОВ ОСТАЁТСЯ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount">${rub(free)}</span>
        </p>
        <p class="calc-result-week" aria-hidden="true">Это около ${rub(perWeek)} в неделю</p>
        <p class="calc-result-note">Это деньги на текущие расходы месяца — те, у которых пока нет назначения. Недельный ориентир получается делением на 4,345: столько недель в среднем месяце.</p>
        ${breakdown(data, 'Свободно', rub(free))}
        ${renderSplit(data)}
      </div>`;
  }

  function renderZero(data) {
    return `
      <div class="calc-result-card calc-result-card-ok">
        <p class="visually-hidden">Весь доход уже распределён.</p>
        <div class="calc-result-label" aria-hidden="true">РЕЗУЛЬТАТ</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount calc-result-amount-text">Весь доход уже распределён</span>
        </p>
        <p class="calc-result-note">После обязательных расходов, запланированных покупок и накоплений свободных денег на текущие расходы не остаётся.</p>
        ${breakdown(data, 'Свободно', rub(0))}
        ${renderSplit(data)}
      </div>`;
  }

  function renderDeficit(data) {
    const gap = Math.abs(data.free);

    return `
      <div class="calc-result-card calc-result-card-deficit">
        <p class="visually-hidden">План превышает доход на ${rubWords(gap)}.</p>
        <div class="calc-result-label" aria-hidden="true">ПЛАН ПРЕВЫШАЕТ ДОХОД НА</div>
        <p class="calc-result-main" aria-hidden="true">
          <span class="calc-result-amount">${rub(gap)}</span>
        </p>
        <p class="calc-result-note">На запланированные расходы и накопления нужно на ${rub(gap)} больше, чем составляет доход этого месяца.</p>
        <p class="calc-result-note">Можно проверить, какие расходы можно перенести или уменьшить сумму, которую планируется отложить.</p>
        ${breakdown(data, 'Не хватает', rub(gap))}
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

    const income = values.salary + values.extra;
    const planned = values.mandatory + values.large + values.savings;
    const free = income - planned;
    const data = { ...values, income, planned, free };

    let resultType;
    if (free > 0) resultType = 'positive';
    else if (free === 0) resultType = 'zero';
    else resultType = 'deficit';

    if (resultType === 'positive') resultEl.innerHTML = renderPositive(data);
    else if (resultType === 'zero') resultEl.innerHTML = renderZero(data);
    else resultEl.innerHTML = renderDeficit(data);

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
