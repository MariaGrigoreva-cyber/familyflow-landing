#!/usr/bin/env node
// Что публиковать сегодня.
//
//   npm run content:today                     самая свежая статья с готовым контентом
//   npm run content:today -- --slug=<slug>    конкретная статья
//
// Читает content/blog/*.json и показывает, какие площадки уже опубликованы,
// какие готовы и что логично взять следующим. Ничего не меняет: ни источники,
// ни public. Ни OpenAI, ни сети здесь нет — это локальный редакционный отчёт.
'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..');

try {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
} catch {
  /* dotenv не установлен — работаем на значениях по умолчанию */
}

const sourceStore = require('./blog/source');

const DEFAULT_SITE_URL = 'https://myfamilyflow.ru';
const CONTENT_BLOG_DIR = path.join(ROOT, 'content', 'blog');

// Как площадки называются в отчёте.
const LABELS = {
  telegram: 'TELEGRAM',
  threads: 'THREADS',
  instagram: 'INSTAGRAM',
  short_video: 'REELS',
  vk: 'VK',
};

const log = (message = '') => console.log(message);

class TodayError extends Error {}

function parseArgs(argv) {
  const args = { slug: null, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--slug=')) args.slug = arg.slice('--slug='.length).trim();
    else throw new TodayError(`Неизвестный аргумент «${arg}». Доступен --slug=`);
  }
  return args;
}

function humanDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).split('-');
  return `${day}.${month}.${year}`;
}

// Битый файл не должен ронять весь отчёт: скажем о нём и покажем остальное.
async function loadSources() {
  const files = await sourceStore.listSourceFiles(CONTENT_BLOG_DIR);
  const sources = [];
  const broken = [];

  for (const file of files) {
    const label = `content/blog/${path.basename(file)}`;
    try {
      const source = await sourceStore.readSource(file);
      const problems = sourceStore.validateSource(source, label);
      // problems уже содержат имя файла — второй раз его не приписываем.
      if (problems.length > 0) broken.push(problems[0]);
      else sources.push(source);
    } catch (error) {
      broken.push(`${label}: ${error.message}`);
    }
  }

  return { sources, broken };
}

const byDateDesc = (a, b) => {
  const left = a.published_at || a.created_at;
  const right = b.published_at || b.created_at;
  if (left === right) return a.slug.localeCompare(b.slug);
  return right.localeCompare(left);
};

function splitByStatus(distribution) {
  const groups = { ready: [], published: [], skipped: [] };
  for (const platform of sourceStore.PLATFORMS) {
    const entry = distribution[platform];
    if (entry && groups[entry.status]) groups[entry.status].push({ platform, ...entry });
  }
  return groups;
}

// Полный текст — только для рекомендованной площадки, иначе вывод разрастается.
function printFullContent(platform, social) {
  if (platform === 'telegram' || platform === 'threads' || platform === 'vk') {
    log(social[platform]);
    log('');
    log(`[${social[platform].length} знаков]`);
    return;
  }

  if (platform === 'instagram') {
    const { carousel, caption } = social.instagram;
    log(`Карусель: ${carousel.title}`);
    log('');
    for (const slide of carousel.slides) {
      log(`${String(slide.number).padStart(2)}. ${slide.text}   [${slide.text.length} симв.]`);
    }
    log('');
    log('Caption:');
    log(caption);
    log('');
    log(`[${caption.length} знаков]`);
    return;
  }

  const video = social.short_video;
  log(`Хук: ${video.hook}`);
  log(`${video.duration_seconds} секунд · ${video.script.length} сцен`);
  log('');
  for (const scene of video.script) {
    log(`  ${scene.time}`);
    log(`    голос: ${scene.voice}`);
    log(`    кадр:  ${scene.visual}`);
    log(`    экран: ${scene.overlay || '— без надписи —'}`);
  }
  log('');
  log(`Описание: ${video.caption}`);
  log(`Призыв:   ${video.cta}`);
}

// Для остальных ready — одна строка, чтобы отчёт оставался читаемым.
function briefContent(platform, social) {
  if (platform === 'instagram') {
    const slides = social.instagram.carousel.slides.length;
    return `карусель ${slides} ${slides === 1 ? 'слайд' : 'слайдов'}, caption ${social.instagram.caption.length} знаков`;
  }
  if (platform === 'short_video') {
    return `${social.short_video.duration_seconds} секунд, ${social.short_video.script.length} сцен`;
  }
  return `${social[platform].length} знаков`;
}

function printReport(source, siteUrl) {
  const distribution = sourceStore.normalizeDistribution(source);
  const groups = splitByStatus(distribution);
  const [today, ...next] = groups.ready;

  log('КОНТЕНТ НА СЕГОДНЯ');
  log('');
  log('Статья:');
  log(source.title);
  log('');
  log('URL:');
  log(`${siteUrl}${source.url || `/blog/${source.slug}/`}`);
  log('');

  if (!today) {
    log('Готовых площадок нет — всё либо опубликовано, либо пропущено.');
  } else {
    log(`СЕГОДНЯ — ${LABELS[today.platform]}`);
    log('');
    printFullContent(today.platform, source.social);
    log('');
  }

  if (next.length > 0) {
    log('СЛЕДОМ:');
    for (const item of next) log(`  ${LABELS[item.platform]} — ${briefContent(item.platform, source.social)}`);
    log('');
  }

  if (groups.published.length > 0) {
    log('Уже опубликовано:');
    for (const item of groups.published) log(`  ${LABELS[item.platform]} — ${humanDate(item.published_at)}`);
    log('');
  }

  if (groups.skipped.length > 0) {
    log('Пропущено:');
    for (const item of groups.skipped) log(`  ${LABELS[item.platform]}`);
    log('');
  }

  // Площадки, для которых в social просто нет контента.
  const absent = sourceStore.PLATFORMS.filter((platform) => !distribution[platform]);
  if (absent.length > 0) {
    log(`Контента пока нет: ${absent.map((p) => LABELS[p]).join(', ')}`);
    log(`  Дособрать: npm run blog:social -- --slug=${source.slug}`);
    log('');
  }

  if (today) {
    log('Отметить после публикации:');
    log(`  npm run content:mark -- --slug=${source.slug} --platform=${today.platform} --published`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    log('npm run content:today                     самая свежая статья с готовым контентом');
    log('npm run content:today -- --slug=<slug>    конкретная статья');
    return;
  }

  const siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL;
  const { sources, broken } = await loadSources();

  for (const problem of broken) log(`! ${problem}`);
  if (broken.length > 0) log('');

  if (sources.length === 0) {
    throw new TodayError(
      'Нет ни одного читаемого источника в content/blog. Сгенерируйте статью: npm run blog'
    );
  }

  if (args.slug) {
    const source = sources.find((item) => item.slug === args.slug);
    if (!source) {
      throw new TodayError(
        `Нет статьи «${args.slug}». Доступны:\n  - ${sources.map((item) => item.slug).join('\n  - ')}`
      );
    }
    printReport(source, siteUrl);
    return;
  }

  // Без slug: самая свежая опубликованная статья, где есть что публиковать.
  const candidates = sources
    .filter((source) => source.status === 'published')
    .sort(byDateDesc);

  const withReady = candidates.find((source) => {
    const distribution = sourceStore.normalizeDistribution(source);
    return sourceStore.PLATFORMS.some((platform) => distribution[platform]?.status === 'ready');
  });

  if (!withReady) {
    log('Для опубликованных статей нет контента со статусом ready.');
    if (candidates.length > 0) {
      log('');
      log('Посмотреть состояние конкретной статьи:');
      log(`  npm run content:today -- --slug=${candidates[0].slug}`);
    }
    return;
  }

  printReport(withReady, siteUrl);
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
});
