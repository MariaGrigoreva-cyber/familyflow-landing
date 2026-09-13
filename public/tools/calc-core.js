// Общее для калькуляторов в /tools/.
//
// Здесь живёт всё, что одинаково у любого денежного калькулятора: строгий разбор
// сумм, формат разрядов, показ ошибок у полей, разметка строки разбивки и
// обёртки над аналитикой из /script.js. Сами формулы и тексты результата —
// в calculator.js рядом с конкретной страницей.
//
// Ничего не хранит и никуда не отправляет: введённые суммы остаются в DOM
// страницы. В аналитику отсюда уходят только имя цели и технические параметры
// (см. window.ffTrack в /script.js).
'use strict';

window.ffCalcCore = (function initCalcCore() {
  const NARROW = ' '; // узкий неразрывный пробел — разделитель разрядов
  const NBSP = ' ';
  const MINUS = '−';  // типографский минус, а не дефис

  // Потолок на сумму: 999 999 999 ₽. Больше — почти наверняка лишний разряд,
  // и об этом лучше сказать, чем считать по ошибочному числу.
  const MAX_MONEY = 999999999;

  const track = (goal, params) => {
    if (typeof window.ffTrack === 'function') window.ffTrack(goal, params);
  };

  // Метка того, чем человек воспользовался на сайте. Канал привлечения
  // (utm_source / utm_medium) сюда не входит намеренно: его определяет лендинг
  // по referrer (ffMarkAttribution в /script.js), а рекламную разметку не
  // трогает вообще.
  const markAttribution = (marks) => {
    if (typeof window.ffMarkAttribution === 'function') window.ffMarkAttribution(marks);
  };

  const groupDigits = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW);

  // Тот же формат разрядов, что на остальном сайте (см. fmt в /script.js).
  const fmtNum = (value) =>
    typeof window.ffFmtNum === 'function' ? window.ffFmtNum(value) : groupDigits(String(Math.round(value)));

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

  // Любые пробелы, включая неразрывные: разряды человек может разделить и
  // обычным пробелом, и тем, что подставило это же поле при вводе.
  const SPACES = /[\s  ]/g;
  const LEADING_MINUS = /^[-−–—]/;

  // Разбор денежного поля. Возвращает либо { status: 'ok', value }, либо причину —
  // вызывающий превращает её в человеческую ошибку. Ничего не исправляем молча.
  //
  // Понимаем: «5000», «5 000», «5 000», «5000 ₽», «5000 руб.», пробелы по краям.
  // Не понимаем (и говорим об этом): минус, буквы, копейки, слишком крупные суммы.
  //
  // Тихо превратить «-5000» в 5000 в финансовом калькуляторе недопустимо —
  // человек увидит правдоподобный, но чужой результат.
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

  const MONEY_ERRORS = {
    negative: 'Сумма не может быть отрицательной.',
    invalid: 'Введите сумму цифрами.',
    kopecks: 'Укажите сумму в целых рублях, без копеек.',
    'too-big': 'Сумма выглядит слишком большой — проверьте, не лишний ли разряд.',
  };

  const MAX_DAYS = 365;

  // Разбор срока «через сколько дней следующий доход». «12 дней» понимаем
  // наравне с «12»: поле подписано так же. Ноль, минус и больше года — ошибки.
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

  const DAYS_ERRORS = {
    negative: 'Количество дней не может быть отрицательным.',
    invalid: 'Введите количество дней цифрами.',
    zero: 'Дней должно быть хотя бы один — укажите 1, если доход придёт завтра.',
    'too-big': `Укажите срок не больше ${MAX_DAYS} дней — для более далёких планов калькулятор не подойдёт.`,
  };

  // Разряды расставляем на лету только тогда, когда во введённом нет ничего,
  // кроме цифр и пробелов. Если человек написал «-5000» или «абв» — оставляем
  // строку ровно такой, какой он её видит, и говорим об ошибке при расчёте.
  const GROUPABLE = /^[\d\s  ]*$/;

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
      const parsed = field.parse(input.value);
      if (parsed.status !== 'ok') return;
      const digits = String(parsed.value);
      input.value = field.kind === 'money' ? groupDigits(digits) : digits;
    });
  }

  // Описание полей → объекты с найденными в DOM input/error. Возвращает null,
  // если хоть одного элемента на странице нет: собирать половину формы незачем.
  //
  // spec: { name: { kind, required, inputId, errorId, parse, errors, emptyError } }
  function collectFields(spec) {
    const fields = {};
    for (const [name, def] of Object.entries(spec)) {
      const input = document.getElementById(def.inputId);
      const error = document.getElementById(def.errorId);
      if (!input || !error) return null;
      fields[name] = Object.assign({}, def, {
        input,
        error,
        parse: def.parse || parseMoney,
        errors: def.errors || MONEY_ERRORS,
      });
    }
    return fields;
  }

  // Читает поле и складывает ошибку в problems. Пустое необязательное денежное
  // поле — это ноль, а не ошибка.
  function readField(field, problems) {
    const parsed = field.parse(field.input.value);
    if (parsed.status === 'ok') return parsed.value;

    if (parsed.status === 'empty') {
      if (!field.required) return 0;
      problems.push([field, field.emptyError]);
      return null;
    }

    problems.push([field, field.errors[parsed.status]]);
    return null;
  }

  function breakdownRow(label, value, extraClass) {
    return `<div class="calc-breakdown-row${extraClass ? ` ${extraClass}` : ''}"><span>${label}</span><span>${value}</span></div>`;
  }

  function revealResult(resultEl) {
    const box = resultEl.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }

  return {
    NARROW, NBSP, MINUS, MAX_MONEY,
    SPACES, LEADING_MINUS,
    track, markAttribution,
    groupDigits, fmtNum, rub, plural, rubWords,
    parseMoney, MONEY_ERRORS,
    MAX_DAYS, parseDays, DAYS_ERRORS,
    clearError, showError, bindInput,
    collectFields, readField,
    breakdownRow, revealResult,
  };
})();
