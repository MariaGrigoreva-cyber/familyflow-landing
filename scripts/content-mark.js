#!/usr/bin/env node
// Отметить площадку опубликованной или пропущенной.
//
//   npm run content:mark -- --slug=<slug> --platform=<platform> --published
//   npm run content:mark -- --slug=<slug> --platform=<platform> --skipped
//   npm run content:mark -- --slug=<slug> --init
//
// Меняет ровно одну запись в distribution внутри content/blog/<slug>.json.
// Тексты в social, статья, SEO, картинки и всё содержимое public/ остаются
// нетронутыми: distribution — это только состояние публикации.
//
// --init создаёт distribution для старой статьи из уже сохранённого social,
// ничего при этом не публикуя.
//
// Ни OpenAI, ни сети. Постинг команда не делает — только отмечает факт.
'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const sourceStore = require('./blog/source');

const CONTENT_BLOG_DIR = path.join(ROOT, 'content', 'blog');
const SLUG_RE = /^[a-z0-9-]+$/;

const log = (message = '') => console.log(message);
const done = (message) => console.log(`✓ ${message}`);

class MarkError extends Error {}

const rel = (filePath) => path.relative(ROOT, filePath);

function parseArgs(argv) {
  const args = { slug: null, platform: null, action: null, init: false, help: false };

  for (const arg of argv) {
    if (arg === '--published' || arg === '--skipped') {
      const action = arg.slice(2);
      if (args.action && args.action !== action) {
        throw new MarkError('--published и --skipped взаимоисключающие');
      }
      args.action = action;
    } else if (arg === '--init') args.init = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--slug=')) args.slug = arg.slice('--slug='.length).trim();
    else if (arg.startsWith('--platform=')) args.platform = arg.slice('--platform='.length).trim();
    else throw new MarkError(`Неизвестный аргумент «${arg}». Доступны --slug=, --platform=, --published, --skipped, --init`);
  }

  if (!args.slug) throw new MarkError('Не задан --slug');
  if (!SLUG_RE.test(args.slug)) throw new MarkError(`slug «${args.slug}» не подходит под ^[a-z0-9-]+$`);

  if (args.init) {
    if (args.action || args.platform) {
      throw new MarkError('--init не сочетается с --platform, --published и --skipped');
    }
    return args;
  }

  if (!args.platform) throw new MarkError(`Не задан --platform. Доступны: ${sourceStore.PLATFORMS.join(', ')}`);
  if (!sourceStore.PLATFORMS.includes(args.platform)) {
    throw new MarkError(`Неизвестная площадка «${args.platform}». Доступны: ${sourceStore.PLATFORMS.join(', ')}`);
  }
  if (!args.action) throw new MarkError('Укажите --published или --skipped');

  return args;
}

function todayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

async function loadSource(slug) {
  const file = sourceStore.sourcePath(CONTENT_BLOG_DIR, slug);
  let source;
  try {
    source = await sourceStore.readSource(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const available = (await sourceStore.listSourceFiles(CONTENT_BLOG_DIR))
        .map((item) => path.basename(item, '.json'));
      throw new MarkError(
        `Нет источника ${rel(file)}.` +
        (available.length ? `\nЕсть такие статьи:\n  - ${available.join('\n  - ')}` : '')
      );
    }
    throw new MarkError(error.message);
  }

  const problems = sourceStore.validateSource(source, `content/blog/${slug}.json`);
  if (problems.length > 0) {
    throw new MarkError(`Источник не прошёл проверку:\n  - ${problems.join('\n  - ')}\n\nФайл не изменён.`);
  }

  return { source, file };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    log('npm run content:mark -- --slug=<slug> --platform=<platform> --published');
    log('npm run content:mark -- --slug=<slug> --platform=<platform> --skipped');
    log('npm run content:mark -- --slug=<slug> --init');
    return;
  }

  const { source, file } = await loadSource(args.slug);

  // Нормализация достраивает distribution по тому, что реально есть в social:
  // старые статьи получают его при первой же отметке.
  const distribution = sourceStore.normalizeDistribution(source);
  const hadDistribution = source.distribution !== undefined;

  if (args.init) {
    if (hadDistribution) {
      log(`В ${rel(file)} distribution уже есть — ничего не меняю.`);
      log(`Состояние: ${Object.entries(distribution).map(([p, e]) => `${p}=${e.status}`).join(', ')}`);
      return;
    }
    const updated = { ...source, distribution };
    const problems = sourceStore.validateSource(updated, `content/blog/${source.slug}.json`);
    if (problems.length > 0) {
      throw new MarkError(`Не удалось создать distribution:\n  - ${problems.join('\n  - ')}\n\nФайл не изменён.`);
    }
    await sourceStore.writeSourceAtomic(file, updated);
    done(`${rel(file)} — distribution создан из сохранённого social`);
    for (const platform of sourceStore.PLATFORMS) {
      const entry = distribution[platform];
      log(`  ${platform.padEnd(12)} ${entry ? entry.status : '— нет контента, площадка не добавлена —'}`);
    }
    return;
  }

  // ready можно поставить только там, где есть что публиковать; published и
  // skipped — это факт из жизни, их разрешаем и без контента... но отмечать
  // публикацию того, чего нет в source, бессмысленно, поэтому проверяем.
  if (args.action === 'published' && !sourceStore.hasSocialFor(source.social, args.platform)) {
    throw new MarkError(
      `В social нет контента для площадки «${args.platform}» — отмечать публикацию нечего.\n` +
      `Сгенерировать: npm run blog:social -- --slug=${source.slug}\n\nФайл не изменён.`
    );
  }

  const before = distribution[args.platform];
  const after = args.action === 'published'
    ? { status: 'published', published_at: todayIso() }
    : { status: 'skipped', published_at: null };

  // Меняем ровно одну площадку, порядок ключей сохраняем.
  const updated = {
    ...source,
    distribution: { ...distribution, [args.platform]: after },
  };

  const problems = sourceStore.validateSource(updated, `content/blog/${source.slug}.json`);
  if (problems.length > 0) {
    throw new MarkError(`Обновлённый источник не прошёл проверку:\n  - ${problems.join('\n  - ')}\n\nФайл не изменён.`);
  }

  await sourceStore.writeSourceAtomic(file, updated);

  const wasLabel = before ? before.status : 'нет записи';
  done(`${args.platform}: ${wasLabel} → ${after.status}${after.published_at ? ` (${after.published_at})` : ''}`);
  if (!hadDistribution) log(`  distribution создан из сохранённого social`);
  log(`  ${rel(file)} — изменено только поле distribution`);

  const rest = sourceStore.PLATFORMS.filter((platform) => distribution[platform] && platform !== args.platform);
  if (rest.length > 0) {
    log('');
    log('Остальные площадки:');
    for (const platform of rest) {
      const entry = updated.distribution[platform];
      log(`  ${platform.padEnd(12)} ${entry.status}${entry.published_at ? ` (${entry.published_at})` : ''}`);
    }
  }
  log('');
  log(`Что дальше: npm run content:today -- --slug=${source.slug}`);
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
});
