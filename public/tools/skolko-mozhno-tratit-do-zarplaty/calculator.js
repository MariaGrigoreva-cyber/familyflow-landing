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
// отправляется пользователю ошибкой. Тихо превратить «-5000» в 5000 в финансовом
// калькуляторе недопустимо — человек увидит правдоподобный, но чужой результат.
'use strict';

(function initDailySpendingCalculator() {
  const form = document.getElementById('calcForm');
  const resultEl = document.getElementById('calcResult');
  if (!form || !resultEl) return;

  const CALCULATOR = 'daily_spending';
  const MAX_DAYS = 365;
  // Потолок на сумму: 999 999 999 ₽. Больше — почти наверняка лишний разряд,
  // и об этом лучше сказать, чем считать по ошибочному числу.
  const MAX_MONEY = 999999999;
  // Ниже этого дневного ориентира добавляем мягкую оговорку. Ни красного цвета,
  // ни предупреждающих иконок: человек и так видит небольшую сумму.
  const LOW_DAILY = 500;

  const NARROW = ' '; // узкий неразрывный пробел — разделитель разрядов
  const NBSP = ' ';
  const MINUS = '−';  // типографский минус, а не дефис

  const track = (goal, params) => {
    if (typeof window.ffTrack === 'function') window.ffTrack(goal, params);
  };

  // Тот же формат разрядов, что на остальном сайте (см. fmt в /script.js).
  const fmtNum = (value) =>
    typeof window.ffFmtNum === 'function'
      ? window.ffFmtNum(value)
      : String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NARROW);

  const rub = (value) => `${fmtNum(value)}${NBSP}₽`;

  const plural = (value, one, few, many) => {
    const abs = Math.abs(Math.round(value)) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  };

  // Для скринридера суммы произносим словами: в видимой вёрстке разряды
  // разделены узким пробелом, и «19 000» может прочитаться как «19 000».
  const rubWords = (value) => `${Math.round(value)} ${plural(value, 'рубль', 'рубля', 'рублей')}`;

  const fields = {
    money: { kind: 'money', required: true },
    days: { kind: 'days', required: true },
    mandatory: { kind: 'money', required: false },
    reserve: { kind: 'money', required: false },
  };

  const ids = {
    money: ['calcMoney', 'calcMoneyError'],
    days: ['calcDays', 'calcDaysError'],
    mandatory: ['calcMandatory', 'calcMandatoryError'],
    reserve: ['calcReserve', 'calcReserveError'],
  };

  for (const [name, [inputId, errorId]] of Object.entries(ids)) {
    fields[name].input = document.getElementById(inputId);
    fields[name].error = document.getElementById(errorId);
    if (!fields[name].input || !fields[name].error) return;
  }

  const groupDigits = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW);

  // Любые пробелы, включая неразрывные: разряды человек может разделить и
  // обычным пробелом, и тем, что подставило это же поле при вводе.
  const SPACES = /[\s  ]/g;
  const LEADING_MINUS = /^[-−–—]/;

  // Разбор денежного поля. Возвращает либо { status: 'ok', value }, либо причину —
  // вызывающий превращает её в человеческую ошибку. Ничего не исправляем молча.
  //
  // Понимаем: «5000», «5 000», «5 000», «5000 ₽», «5000 руб.», пробелы по краям.
  // Не понимаем (и говорим об этом): минус, буквы, копейки, слишком крупные суммы.
  function parseMoney(raw) {
    const text = String(raw).trim();
    if (text === '') return { status: 'empty' };
    if (LEADING_MINUS.test(text)) return { status: 'negative' };

    // Валюта в конце — не ошибка ввода: поле и так подписано рублём.
    const withoutCurrency = text.replace(/(?:₽|руб\.?|р\.)$/i, '');
    const compact = withoutCurrency.replace(SPACES, '');

    if (compact === '') return { status: 'invalid' };
    if (/^\d+[.,]\d+$/.test(compact)) return { status: 'kopecks' };
    if (!/^\d+$/.test(compact)) return { status: 'invalid' };

    const value = Number(compact);
    if (!Number.isSafeInteger(value)) return { status: 'too-big' };
    if (value > MAX_MONEY) return { status: 'too-big' };
    return { status: 'ok', value };
  }

  // То же для срока. «12 дней» разбираем наравне с «12»: поле подписано так же.
  function parseDays(raw) {
    const text = String(raw).trim();
    if (text === '') return { status: 'empty' };
    if (LEADING_MINUS.test(text)) return { status: 'negative' };

    const compact = text.replace(/(?:дней|дня|день|дн\.?)$/i, '').replace(SPACES, '');
    if (compact === '') return { status: 'invalid' };
    if (!/^\d+$/.test(compact)) return { status: 'invalid' };

    const value = Number(compact);
    if (!Number.isSafeInteger(value)) return { status: 'too-big' };
    if (value < 1) return { status: 'zero' };
    if (value > MAX_DAYS) return { status: 'too-big' };
    return { status: 'ok', value };
  }

  const parse = (field, raw) => (field.kind === 'money' ? parseMoney(raw) : parseDays(raw));

  const MONEY_ERRORS = {
    negative: 'Сумма не может быть отрицательной.',
    invalid: 'Введите сумму цифрами.',
    kopecks: 'Укажите сумму в целых рублях, без копеек.',
    'too-big': 'Сумма выглядит слишком большой — проверьте, не лишний ли разряд.',
  };

  const DAYS_ERRORS = {
    negative: 'Количество дней не может быть отрицательным.',
    invalid: 'Введите количество дней цифрами.',
    zero: 'Дней должно быть хотя бы один — укажите 1, если доход придёт завтра.',
    'too-big': `Укажите срок не больше ${MAX_DAYS} дней — для более далёких планов калькулятор не подойдёт.`,
  };

  // Сообщения для пустых обязательных полей — они зависят от смысла поля,
  // а не от типа разбора.
  const EMPTY_ERRORS = {
    money: 'Укажите, сколько денег у вас есть сейчас.',
    days: 'Укажите, через сколько дней ожидается следующий доход.',
  };

  // Разряды расставляем на лету только тогда, когда во введённом нет ничего,
  // кроме цифр и пробелов. Если человек написал «-5000» или «абв» — оставляем
  // строку ровно такой, какой он её видит, и говорим об ошибке при расчёте.
  const GROUPABLE = /^[\d\s  ]*$/;

  function bindInput(field) {
    const { input } = field;

    input.addEventListener('input', () => {
      clearError(field);
      if (field.kind !== 'money' || !GROUPABLE.test(input.value)) return;

      const caret = input.selectionStart === null ? input.value.length : input.selectionStart;
      const digitsBeforeCaret = (input.value.slice(0, caret).match(/\d/g) || []).length;
      const next = groupDigits(input.value.replace(SPACES, ''));
      if (next === input.value) return;

      input.value = next;
      // Возвращаем каретку после того же по счёту разряда, что и до перестановки
      // пробелов, — иначе курсор прыгает в конец строки.
      let pos = 0;
      let seen = 0;
      while (pos < next.length && seen < digitsBeforeCaret) {
        if (/\d/.test(next[pos])) seen += 1;
        pos += 1;
      }
      try { input.setSelectionRange(pos, pos); } catch { /* поле без выделения — не страшно */ }
    });

    // Приводим к единому виду только то, что уже разобрано однозначно: «5000 ₽»
    // становится «5 000». Значение при этом не меняется; непонятный ввод
    // остаётся как есть и дожидается ошибки.
    input.addEventListener('blur', () => {
      const parsed = parse(field, input.value);
      if (parsed.status !== 'ok') return;
      const digits = String(parsed.value);
      input.value = field.kind === 'money' ? groupDigits(digits) : digits;
    });
  }

  function clearError(field) {
    field.error.hidden = true;
    field.error.textContent = '';
    field.input.removeAttribute('aria-invalid');
  }

  function showError(field, message) {
    field.error.textContent = message;
    field.error.hidden = false;
    field.input.setAttribute('aria-invalid', 'true');
  }

  // Читает поле и складывает ошибку в problems. Пустое необязательное денежное
  // поле — это ноль, а не ошибка.
  function read(field, name, problems) {
    const parsed = parse(field, field.input.value);
    if (parsed.status === 'ok') return parsed.value;

    if (parsed.status === 'empty') {
      if (!field.required) return 0;
      problems.push([field, EMPTY_ERRORS[name] || EMPTY_ERRORS[field.kind]]);
      return null;
    }

    const messages = field.kind === 'money' ? MONEY_ERRORS : DAYS_ERRORS;
    problems.push([field, messages[parsed.status]]);
    return null;
  }

  function validate() {
    const problems = [];
    const money = read(fields.money, 'money', problems);
    const days = read(fields.days, 'days', problems);
    const mandatory = read(fields.mandatory, 'mandatory', problems);
    const reserve = read(fields.reserve, 'reserve', problems);

    if (problems.length > 0) return { problems };
    return { values: { money, days, mandatory, reserve } };
  }

  function breakdownRow(label, value, extraClass) {
    return `<div class="calc-breakdown-row${extraClass ? ` ${extraClass}` : ''}"><span>${label}</span><span>${value}</span></div>`;
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

  function revealResult() {
    const box = resultEl.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    for (const field of Object.values(fields)) clearError(field);

    const { problems, values } = validate();
    if (problems) {
      for (const [field, message] of problems) showError(field, message);
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
    track('calculator_result', { calculator: CALCULATOR, result_type: deficit ? 'deficit' : 'positive' });
    revealResult();
  });

  for (const field of Object.values(fields)) bindInput(field);

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

  const markAttribution = () => {
    if (typeof window.ffMarkAttribution === 'function') window.ffMarkAttribution(ATTRIBUTION);
  };

  const cta = document.getElementById('calcCta');
  if (cta) {
    cta.addEventListener('click', () => {
      track('calculator_cta_click', { calculator: CALCULATOR });
      markAttribution();
    });
  }

  track('calculator_view', { calculator: CALCULATOR });
  // Не только на клик по CTA: человек может уйти из калькулятора на другую
  // страницу сайта и открыть приложение уже оттуда или из кнопки в шапке.
  markAttribution();
})();
