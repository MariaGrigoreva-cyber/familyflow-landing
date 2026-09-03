// Генерация текста статьи через OpenAI Responses API со Structured Outputs.
// Схема жёсткая: модель не может вернуть лишние поля или пропустить нужные.
'use strict';

const { validateSocial, SOCIAL_LIMITS } = require('./source');

// Границы (6–8 слайдов, 4–7 сцен, 20–35 секунд) в саму JSON Schema не кладём:
// strict-режим Structured Outputs не поддерживает minItems/maximum. Их проверяет
// validate() ниже, и при нарушении модель получает второй запрос на починку.
const SOCIAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['telegram', 'threads', 'instagram', 'vk', 'short_video'],
  properties: {
    telegram: { type: 'string', description: 'Самостоятельный пост 700–1300 знаков, не пересказ статьи' },
    threads: { type: 'string', description: 'Коротко и разговорно, одна сильная мысль' },
    instagram: {
      type: 'object',
      additionalProperties: false,
      required: ['carousel', 'caption'],
      properties: {
        carousel: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'slides'],
          properties: {
            title: { type: 'string' },
            slides: {
              type: 'array',
              description: `${SOCIAL_LIMITS.slidesMin}–${SOCIAL_LIMITS.slidesMax} слайдов, до 120 символов на слайд, одна мысль на слайд`,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['number', 'text'],
                properties: {
                  number: { type: 'integer', description: 'Нумерация подряд, начиная с 1' },
                  text: { type: 'string' },
                },
              },
            },
          },
        },
        caption: { type: 'string', description: '600–1300 знаков, дополняет карусель, а не повторяет слайды' },
      },
    },
    vk: { type: 'string', description: 'Самостоятельный пост 700–1500 знаков, начинается с проблемы' },
    short_video: {
      type: 'object',
      additionalProperties: false,
      required: ['hook', 'duration_seconds', 'script', 'caption', 'cta'],
      properties: {
        hook: { type: 'string', description: 'Первые 2–3 секунды ролика' },
        duration_seconds: { type: 'integer', description: `Целое число от ${SOCIAL_LIMITS.durationMin} до ${SOCIAL_LIMITS.durationMax}` },
        script: {
          type: 'array',
          description: `${SOCIAL_LIMITS.scenesMin}–${SOCIAL_LIMITS.scenesMax} сцен`,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['time', 'voice', 'visual', 'overlay'],
            properties: {
              time: { type: 'string', description: 'Например «0–3 с»' },
              voice: { type: 'string', description: 'Что говорит автор' },
              visual: { type: 'string', description: 'Что в кадре: экран телефона, руки, бытовые предметы, интерфейс' },
              overlay: { type: 'string', description: 'Короткая надпись на экране, можно пустую строку' },
            },
          },
        },
        caption: { type: 'string' },
        cta: { type: 'string', description: 'Мягкий призыв' },
      },
    },
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title', 'seo_title', 'seo_description', 'slug', 'excerpt', 'keywords',
    'article_html', 'cta_title', 'cta_text', 'image_prompts', 'social',
  ],
  properties: {
    title: { type: 'string' },
    seo_title: { type: 'string' },
    seo_description: { type: 'string' },
    slug: { type: 'string', description: 'Только строчная латиница, цифры и дефисы' },
    excerpt: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    article_html: {
      type: 'string',
      description: 'HTML статьи без h1. Ровно один {{INSIDE_IMAGE_1}} и один {{INSIDE_IMAGE_2}}',
    },
    cta_title: { type: 'string' },
    cta_text: { type: 'string' },
    image_prompts: {
      type: 'array',
      description: 'Ровно три изображения: hero, inside_1, inside_2 — в этом порядке',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'file', 'alt', 'prompt', 'aspect_ratio'],
        properties: {
          role: { type: 'string', enum: ['hero', 'inside_1', 'inside_2'] },
          file: { type: 'string', enum: ['hero.webp', 'inside-1.webp', 'inside-2.webp'] },
          alt: { type: 'string' },
          prompt: { type: 'string' },
          aspect_ratio: { type: 'string', enum: ['16:9', '4:3'] },
        },
      },
    },
    social: SOCIAL_SCHEMA,
  },
};

const EXPECTED_IMAGES = [
  { role: 'hero', file: 'hero.webp' },
  { role: 'inside_1', file: 'inside-1.webp' },
  { role: 'inside_2', file: 'inside-2.webp' },
];

// Проверяем ровно то, без чего статья получится битой. Возвращаем список
// человекочитаемых ошибок — он же уходит модели во втором запросе на починку.
function validate(data) {
  const errors = [];
  const nonEmpty = (key) => {
    if (typeof data[key] !== 'string' || !data[key].trim()) errors.push(`Поле "${key}" пустое или не строка`);
  };

  if (!data || typeof data !== 'object') return ['Ответ модели не является JSON-объектом'];

  ['title', 'seo_title', 'seo_description', 'slug', 'excerpt', 'article_html', 'cta_title', 'cta_text']
    .forEach(nonEmpty);

  if (typeof data.slug === 'string' && !/^[a-z0-9-]+$/.test(data.slug)) {
    errors.push(`slug "${data.slug}" не соответствует ^[a-z0-9-]+$ (только строчная латиница, цифры и дефисы)`);
  }

  if (!Array.isArray(data.keywords)) errors.push('keywords должен быть массивом строк');

  if (!Array.isArray(data.image_prompts) || data.image_prompts.length !== 3) {
    errors.push(`image_prompts должен содержать ровно 3 элемента (получено ${
      Array.isArray(data.image_prompts) ? data.image_prompts.length : 'не массив'})`);
  } else {
    EXPECTED_IMAGES.forEach((expected, i) => {
      const img = data.image_prompts[i];
      if (!img || typeof img !== 'object') { errors.push(`image_prompts[${i}] не объект`); return; }
      if (img.role !== expected.role) errors.push(`image_prompts[${i}].role должен быть "${expected.role}"`);
      if (img.file !== expected.file) errors.push(`image_prompts[${i}].file должен быть "${expected.file}"`);
      if (!img.alt || !String(img.alt).trim()) errors.push(`image_prompts[${i}].alt пустой`);
      if (!img.prompt || !String(img.prompt).trim()) errors.push(`image_prompts[${i}].prompt пустой`);
    });
  }

  // Соцпакет проверяем тем же кодом, что и сохранённый источник, — правила
  // для ответа модели и для content/blog/<slug>.json обязаны совпадать.
  errors.push(...validateSocial(data.social, 'social'));

  if (typeof data.article_html === 'string') {
    for (const marker of ['{{INSIDE_IMAGE_1}}', '{{INSIDE_IMAGE_2}}']) {
      const count = data.article_html.split(marker).length - 1;
      if (count !== 1) errors.push(`article_html должен содержать ${marker} ровно один раз (найдено ${count})`);
    }
    if (/<h1[\s>]/i.test(data.article_html)) errors.push('article_html не должен содержать <h1> — он создаётся шаблоном');
  }

  return errors;
}

// Модель иногда всё же оборачивает JSON в ```json — снимаем обёртку перед разбором.
function parseJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Модель вернула невалидный JSON: ${err.message}`);
  }
}

function isUnsupportedFormatError(err) {
  const message = String(err?.message || '');
  return err?.status === 400 && /json_schema|response_format|text\.format|strict|schema/i.test(message);
}

async function callModel(client, model, input, { structured, schema = SCHEMA, schemaName = 'blog_article', maxTokens = 20000 }) {
  const params = {
    model,
    input,
    max_output_tokens: maxTokens,
    text: structured
      ? { format: { type: 'json_schema', name: schemaName, strict: true, schema } }
      : { format: { type: 'json_object' } },
  };

  const response = await client.responses.create(params);

  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason || 'неизвестно';
    throw new Error(`Модель не закончила ответ (причина: ${reason}). Попробуйте более узкую тему.`);
  }
  const text = response.output_text;
  if (!text) throw new Error('Модель вернула пустой ответ');
  return text;
}

// Один запрос + при необходимости один автоматический запрос на исправление
// структуры. Общий для статьи и для отдельной генерации соцпакета — правила
// обработки ответа у них обязаны совпадать.
async function askModel({ client, model, input, schema, schemaName, validateFn, log, repairHint, failMessage, maxTokens }) {
  const options = { structured: true, schema, schemaName, maxTokens };

  let raw;
  try {
    raw = await callModel(client, model, input, options);
  } catch (err) {
    if (!isUnsupportedFormatError(err)) throw err;
    // Модель не умеет Structured Outputs — откатываемся на json_object,
    // формат всё равно описан в промптах.
    log(`! Модель ${model} не поддерживает JSON Schema, использую json_object`);
    options.structured = false;
    raw = await callModel(client, model, input, options);
  }

  let data;
  let errors;
  try {
    data = parseJson(raw);
    errors = validateFn(data);
  } catch (err) {
    data = null;
    errors = [err.message];
  }

  if (errors.length === 0) return data;

  log(`! Структура ответа невалидна, прошу модель исправить:\n  - ${errors.join('\n  - ')}`);

  const repairInput = [
    ...input,
    { role: 'assistant', content: raw },
    {
      role: 'user',
      content:
        'Твой предыдущий ответ не прошёл проверку структуры:\n' +
        errors.map((e) => `- ${e}`).join('\n') +
        `\n\nВерни исправленный JSON целиком, в точности по требуемой структуре. ${repairHint}`,
    },
  ];

  const repaired = await callModel(client, model, repairInput, options);
  const repairedData = parseJson(repaired);
  const repairedErrors = validateFn(repairedData);

  if (repairedErrors.length > 0) {
    throw new Error(`${failMessage}:\n  - ${repairedErrors.join('\n  - ')}`);
  }

  log('✓ Структура исправлена со второй попытки');
  return repairedData;
}

async function generateArticle({ client, model, systemPrompt, topic, log }) {
  return askModel({
    client,
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `ТЕМА СТАТЬИ: ${topic}` },
    ],
    schema: SCHEMA,
    schemaName: 'blog_article',
    validateFn: validate,
    log,
    repairHint: 'Содержание статьи сохрани, меняй только то, что нарушает требования.',
    failMessage: 'Модель дважды вернула невалидную структуру, статья не создана',
  });
}

// Соцпакет для уже написанной статьи: сама статья не трогается, модель получает
// только её содержательный контекст и требования из prompts/blog/social.txt.
async function generateSocial({ client, model, systemPrompt, socialPrompt, article, log }) {
  const input = [
    { role: 'system', content: `${systemPrompt}\n\n${socialPrompt}` },
    {
      role: 'user',
      content: [
        'Статья уже написана и опубликована. Переписывать её не нужно.',
        'Нужен только контент-пакет для соцсетей по требованиям выше.',
        '',
        `ТЕМА: ${article.topic}`,
        `ЗАГОЛОВОК: ${article.title}`,
        `ЛИД: ${article.excerpt}`,
        '',
        'ТЕКСТ СТАТЬИ:',
        article.text,
        '',
        'Верни JSON только с объектом social.',
      ].join('\n'),
    },
  ];

  return askModel({
    client,
    model,
    input,
    schema: SOCIAL_SCHEMA,
    schemaName: 'blog_social',
    validateFn: (data) => validateSocial(data, 'social'),
    log,
    repairHint: 'Смысл постов сохрани, меняй только то, что нарушает требования.',
    failMessage: 'Модель дважды вернула невалидный соцпакет, исходник не изменён',
    maxTokens: 8000,
  });
}

module.exports = { generateArticle, generateSocial, validate, SCHEMA, SOCIAL_SCHEMA };
