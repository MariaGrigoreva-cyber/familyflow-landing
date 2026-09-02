// Генерация текста статьи через OpenAI Responses API со Structured Outputs.
// Схема жёсткая: модель не может вернуть лишние поля или пропустить нужные.
'use strict';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title', 'seo_title', 'seo_description', 'slug', 'excerpt', 'keywords',
    'article_html', 'cta_title', 'cta_text', 'image_prompts',
    'telegram_post', 'threads_post',
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
    telegram_post: { type: 'string' },
    threads_post: { type: 'string' },
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

async function callModel(client, model, input, { structured }) {
  const params = {
    model,
    input,
    max_output_tokens: 20000,
    text: structured
      ? { format: { type: 'json_schema', name: 'blog_article', strict: true, schema: SCHEMA } }
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

// Один запрос + при необходимости один автоматический запрос на исправление структуры.
async function generateArticle({ client, model, systemPrompt, topic, log }) {
  const input = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `ТЕМА СТАТЬИ: ${topic}` },
  ];

  let structured = true;
  let raw;
  try {
    raw = await callModel(client, model, input, { structured });
  } catch (err) {
    if (!isUnsupportedFormatError(err)) throw err;
    // Модель не умеет Structured Outputs — откатываемся на json_object,
    // формат всё равно описан в prompts/blog/system.txt.
    log(`! Модель ${model} не поддерживает JSON Schema, использую json_object`);
    structured = false;
    raw = await callModel(client, model, input, { structured });
  }

  let data;
  let errors;
  try {
    data = parseJson(raw);
    errors = validate(data);
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
        '\n\nВерни исправленный JSON целиком, в точности по требуемой структуре. ' +
        'Содержание статьи сохрани, меняй только то, что нарушает требования.',
    },
  ];

  const repaired = await callModel(client, model, repairInput, { structured });
  const repairedData = parseJson(repaired);
  const repairedErrors = validate(repairedData);

  if (repairedErrors.length > 0) {
    throw new Error(
      'Модель дважды вернула невалидную структуру, статья не создана:\n  - ' + repairedErrors.join('\n  - ')
    );
  }

  log('✓ Структура исправлена со второй попытки');
  return repairedData;
}

module.exports = { generateArticle, validate, SCHEMA };
