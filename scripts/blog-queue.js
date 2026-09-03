#!/usr/bin/env node
// Просмотр контент-плана блога.
//
//   npm run blog:queue                      вся очередь таблицей
//   npm run blog:queue -- --status=queued   только неопубликованные
//   npm run blog:queue -- --limit=10        первые N строк
//   npm run blog:next                       следующая статья к написанию
//
// Команда только читает content/blog-queue.json и ничего не меняет — ни в самой
// очереди, ни в public/blog. Сети и OpenAI здесь нет: тему по-прежнему выбирает
// человек и запускает генерацию сам (npm run blog -- --topic="...").
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'content', 'blog-queue.json');

const STATUSES = ['queued', 'draft', 'approved', 'published', 'skipped'];
const MAX_ORDER = 30;

const log = (message = '') => console.log(message);

class QueueError extends Error {}

function parseArgs(argv) {
  const args = { next: false, status: null, limit: null };

  for (const arg of argv) {
    if (arg === '--next') args.next = true;
    else if (arg.startsWith('--status=')) args.status = arg.slice('--status='.length).trim();
    else if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(value) || value < 1) {
        throw new QueueError(`--limit ждёт целое число больше нуля, получено «${arg.slice('--limit='.length)}»`);
      }
      args.limit = value;
    } else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new QueueError(`Неизвестный аргумент «${arg}». Доступны --next, --status=, --limit=`);
  }

  if (args.status && !STATUSES.includes(args.status)) {
    throw new QueueError(`Неизвестный статус «${args.status}». Доступны: ${STATUSES.join(', ')}`);
  }

  return args;
}

// Очередь — источник контент-плана, поэтому проверяем строго и ничего не
// чиним автоматически: тихая правка чужого плана хуже понятной ошибки.
function readQueue() {
  let raw;
  try {
    raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new QueueError(`Не найден ${path.relative(ROOT, QUEUE_PATH)}`);
    throw error;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new QueueError(`content/blog-queue.json — битый JSON: ${error.message}`);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new QueueError('content/blog-queue.json должен быть объектом с полями version и items');
  }
  if (!Array.isArray(data.items)) {
    throw new QueueError('content/blog-queue.json: поле items должно быть массивом');
  }

  const problems = [];
  const seenIds = new Map();
  const seenOrders = new Map();

  data.items.forEach((item, i) => {
    const where = `элемент #${i + 1}`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`${where}: должен быть объектом`);
      return;
    }

    const label = typeof item.id === 'string' && item.id ? `«${item.id}»` : where;

    if (typeof item.id !== 'string' || !item.id.trim()) problems.push(`${where}: пустой id`);
    else if (seenIds.has(item.id)) problems.push(`${label}: id повторяется (см. элемент #${seenIds.get(item.id) + 1})`);
    else seenIds.set(item.id, i);

    if (!Number.isInteger(item.publish_order)) {
      problems.push(`${label}: publish_order должен быть целым числом`);
    } else if (item.publish_order < 1 || item.publish_order > MAX_ORDER) {
      problems.push(`${label}: publish_order ${item.publish_order} вне диапазона 1..${MAX_ORDER}`);
    } else if (seenOrders.has(item.publish_order)) {
      problems.push(`${label}: publish_order ${item.publish_order} уже занят («${seenOrders.get(item.publish_order)}»)`);
    } else {
      seenOrders.set(item.publish_order, item.id);
    }

    if (!STATUSES.includes(item.status)) {
      problems.push(`${label}: неизвестный статус «${item.status}». Доступны: ${STATUSES.join(', ')}`);
    }
    if (typeof item.topic !== 'string' || !item.topic.trim()) problems.push(`${label}: пустой topic`);
    if (typeof item.primary_query !== 'string' || !item.primary_query.trim()) {
      problems.push(`${label}: пустой primary_query`);
    }
    if (item.status === 'published') {
      if (typeof item.slug !== 'string' || !item.slug.trim()) problems.push(`${label}: статус published, но нет slug`);
      if (typeof item.url !== 'string' || !item.url.trim()) problems.push(`${label}: статус published, но нет url`);
    }
  });

  if (problems.length > 0) {
    throw new QueueError(`Очередь не прошла проверку:\n  - ${problems.join('\n  - ')}\n\nИсправьте content/blog-queue.json вручную — автоматически ничего не меняю.`);
  }

  // Ссылки на несуществующие id — не повод падать, план ещё пишется. Но знать
  // о них полезно: опечатку в id иначе никто не заметит.
  const unknownLinks = [];
  for (const item of data.items) {
    for (const link of item.internal_links || []) {
      if (!seenIds.has(link)) unknownLinks.push(`${item.id} → ${link}`);
    }
  }

  return { items: data.items, unknownLinks };
}

const byOrder = (a, b) => a.publish_order - b.publish_order;

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function clip(value, width) {
  const text = String(value ?? '');
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

function printTable(items) {
  // Ширины подгоняем под окно терминала, но не уже разумного минимума —
  // иначе таблица превращается в кашу из многоточий.
  const available = Math.max(process.stdout.columns || 120, 100);
  const fixed = 5 + 10 + 34 + 3 * 2; // order + status + cluster + разделители
  const rest = available - fixed - 2;
  const topicWidth = Math.max(34, Math.round(rest * 0.58));
  const queryWidth = Math.max(24, rest - topicWidth);

  const header =
    pad('ORDER', 5) + '  ' + pad('STATUS', 10) + '  ' + pad('CLUSTER', 34) + '  ' +
    pad('TOPIC', topicWidth) + '  ' + 'PRIMARY QUERY';
  log(header);
  log('─'.repeat(Math.min(header.length + queryWidth - 'PRIMARY QUERY'.length, available)));

  for (const item of items) {
    log(
      pad(item.publish_order, 5) + '  ' +
      pad(item.status, 10) + '  ' +
      pad(clip(item.cluster, 34), 34) + '  ' +
      pad(clip(item.topic, topicWidth), topicWidth) + '  ' +
      clip(item.primary_query, queryWidth)
    );
  }
}

function printSummary(all) {
  const counts = STATUSES.map((status) => [status, all.filter((item) => item.status === status).length])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}: ${count}`);
  log('');
  log(`Всего: ${all.length} · ${counts.join(' · ')}`);
}

function printNext(all) {
  const next = all.filter((item) => item.status === 'queued').sort(byOrder)[0];

  if (!next) {
    log('В очереди не осталось тем со статусом queued.');
    log('Добавьте новые в content/blog-queue.json или посмотрите статусы: npm run blog:queue');
    return;
  }

  log('Следующая статья:');
  log('');
  log(`№: ${next.publish_order}`);
  log(`Тема: ${next.topic}`);
  log(`Кластер: ${next.cluster}`);
  log(`Основной запрос: ${next.primary_query}`);
  log(`Дополнительные запросы: ${(next.secondary_queries || []).join(', ') || '—'}`);
  log(`Angle: ${next.angle || '—'}`);
  log(`Связь с продуктом: ${next.product_connection || '—'}`);
  log('');
  log('Запустить генерацию:');
  log(`  npm run blog -- --topic="${next.topic}"`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    log('npm run blog:queue [-- --status=queued] [-- --limit=10]');
    log('npm run blog:next');
    return;
  }

  const { items, unknownLinks } = readQueue();

  if (args.next) {
    printNext(items);
    return;
  }

  let rows = [...items].sort(byOrder);
  if (args.status) rows = rows.filter((item) => item.status === args.status);
  const filteredCount = rows.length;
  if (args.limit) rows = rows.slice(0, args.limit);

  if (rows.length === 0) {
    log(`Нет материалов со статусом «${args.status}».`);
    return;
  }

  printTable(rows);

  if (args.status || args.limit) {
    log('');
    const parts = [`показано: ${rows.length}`];
    if (args.status) parts.push(`статус «${args.status}»: ${filteredCount}`);
    parts.push(`всего в очереди: ${items.length}`);
    log(parts.join(' · '));
  } else {
    printSummary(items);
  }

  if (unknownLinks.length > 0) {
    log('');
    log(`! internal_links ссылаются на неизвестные id: ${unknownLinks.join(', ')}`);
  }
}

try {
  main();
} catch (error) {
  if (error instanceof QueueError) {
    console.error(`\n✗ ${error.message}`);
  } else {
    console.error(`\n✗ Не удалось прочитать очередь: ${error.message}`);
  }
  process.exitCode = 1;
}
