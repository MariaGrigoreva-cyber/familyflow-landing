const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs() {
  const result = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const body = arg.slice(2);
    const eq = body.indexOf("=");

    if (eq === -1) {
      result[body] = true;
    } else {
      result[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }

  return result;
}

function commandExists(command) {
  const r = spawnSync(command, ["-version"], {
    stdio: "ignore",
  });

  return r.status === 0;
}

function run(command, args) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (r.status !== 0) {
    throw new Error(
      `${command} завершился с кодом ${r.status}`
    );
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text, maxChars = 22) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current
      ? `${current} ${word}`
      : word;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function tspans(lines, x, y, lineHeight) {
  return lines
    .map(
      (line, i) =>
        `<tspan x="${x}" y="${
          y + i * lineHeight
        }">${escapeXml(line)}</tspan>`
    )
    .join("");
}

function parseSceneDuration(scene, fallback) {
  const text = String(scene.time || "")
    .replace(",", ".");

  const nums = text.match(/\d+(?:\.\d+)?/g);

  if (nums && nums.length >= 2) {
    const start = Number(nums[0]);
    const end = Number(nums[1]);

    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start
    ) {
      return end - start;
    }
  }

  return fallback;
}

function chooseAiIndexes(sceneCount, aiCount) {
  if (aiCount <= 0) return [];
  if (sceneCount <= 1) return [0];

  const count = Math.min(aiCount, sceneCount);
  const result = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.round(
      (i * (sceneCount - 1)) /
      Math.max(1, count - 1)
    );

    if (!result.includes(idx)) {
      result.push(idx);
    }
  }

  for (
    let i = 0;
    result.length < count && i < sceneCount;
    i++
  ) {
    if (!result.includes(i)) {
      result.push(i);
    }
  }

  return result.sort((a, b) => a - b);
}

function readImageStyle() {
  const p = path.join(
    ROOT,
    "prompts",
    "blog",
    "image-style.txt"
  );

  if (!fs.existsSync(p)) {
    return [
      "Warm realistic editorial lifestyle photography.",
      "Cozy modern home.",
      "Natural soft light.",
      "Cream, beige, wood and muted terracotta palette.",
      "Premium but relatable.",
    ].join(" ");
  }

  return fs.readFileSync(p, "utf8")
    .trim()
    .slice(0, 2500);
}

function buildImagePrompt({
  title,
  visual,
  overlay,
  style,
}) {
  return `
Create a vertical editorial lifestyle photograph for a short Instagram Reel
for a Russian family-finance product called "Семейный поток".

ARTICLE:
${title}

SCENE IDEA:
${visual}

THE MESSAGE THAT WILL BE OVERLAID LATER:
${overlay}

STYLE:
${style}

Realistic lifestyle photography.
Modern everyday family home.
Adults approximately 28–42 years old when people are shown.
Warm calm financial-planning mood.
Natural facial expressions.
Modern but ordinary Russian-speaking household context.
Use smartphone, planner, calendar, groceries, envelopes or household objects
only when appropriate to the scene.

Warm cream, beige, natural wood and muted terracotta palette.
Natural soft light.
Editorial photography rather than stock photography.
Vertical composition suitable for 9:16 cropping.
Keep important faces and objects away from extreme edges.
Leave useful negative space for overlay text.

CRITICAL:
NO readable words.
NO readable numbers.
NO logos.
NO watermarks.
NO bank brands.
NO readable financial data.
NO text generated inside the image.
`.trim();
}

async function generateImage({
  prompt,
  target,
  model,
  quality,
}) {
  const response = await fetch(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1536",
        quality,
      }),
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    let message = raw;

    try {
      const parsed = JSON.parse(raw);
      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        raw;
    } catch {}

    throw new Error(
      `OpenAI image API ${response.status}: ${message}`
    );
  }

  const data = JSON.parse(raw);
  const b64 = data?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error(
      "OpenAI image API не вернул b64_json"
    );
  }

  fs.writeFileSync(
    target,
    Buffer.from(b64, "base64")
  );
}

async function generateVoice({
  text,
  target,
  model,
  voice,
}) {
  const response = await fetch(
    "https://api.openai.com/v1/audio/speech",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: "mp3",
        instructions:
          "Speak in Russian. Warm, natural female lifestyle-blog voice. Calm but energetic, conversational, not advertising. Clear articulation. Brisk pace suitable for a 25–35 second Instagram Reel.",
      }),
    }
  );

  if (!response.ok) {
    const raw = await response.text();

    let message = raw;

    try {
      const parsed = JSON.parse(raw);
      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        raw;
    } catch {}

    throw new Error(
      `OpenAI speech API ${response.status}: ${message}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  fs.writeFileSync(target, buffer);
}

function getDuration(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    {
      encoding: "utf8",
    }
  );

  if (r.status !== 0) return null;

  const n = Number(String(r.stdout).trim());

  return Number.isFinite(n) ? n : null;
}

function makeOverlaySvg({
  text,
  sceneNumber,
  totalScenes,
  isLast,
}) {
  const clean = String(text || "").trim();

  let fontSize = 64;

  if (clean.length <= 28) fontSize = 76;
  else if (clean.length <= 50) fontSize = 68;
  else if (clean.length <= 80) fontSize = 60;
  else fontSize = 52;

  let maxChars = 22;

  if (fontSize >= 76) maxChars = 18;
  else if (fontSize >= 68) maxChars = 21;
  else if (fontSize >= 60) maxChars = 24;
  else maxChars = 28;

  const lines = wrapText(clean, maxChars);

  const lineHeight = Math.round(fontSize * 1.15);
  const textHeight = lines.length * lineHeight;

  const startY = Math.round(
    1120 - textHeight / 2
  );

  return Buffer.from(`
  <svg width="1080" height="1920"
       viewBox="0 0 1080 1920"
       xmlns="http://www.w3.org/2000/svg">

    <defs>
      <linearGradient id="shade"
        x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"
          stop-color="#241E19"
          stop-opacity="0.20"/>
        <stop offset="42%"
          stop-color="#241E19"
          stop-opacity="0.16"/>
        <stop offset="100%"
          stop-color="#241E19"
          stop-opacity="0.70"/>
      </linearGradient>
    </defs>

    <rect width="1080" height="1920"
          fill="url(#shade)"/>

    <text x="76" y="105"
          font-family="Arial, Helvetica, sans-serif"
          font-size="25"
          font-weight="700"
          letter-spacing="3"
          fill="#FFFFFF">
      СЕМЕЙНЫЙ ПОТОК
    </text>

    <text x="1000" y="105"
          text-anchor="end"
          font-family="Arial, Helvetica, sans-serif"
          font-size="27"
          font-weight="600"
          fill="#FFFFFF">
      ${String(sceneNumber).padStart(2, "0")}
      /
      ${String(totalScenes).padStart(2, "0")}
    </text>

    <text x="76"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="#FFFFFF">
      ${tspans(
        lines,
        76,
        startY,
        lineHeight
      )}
    </text>

    ${
      isLast
        ? `
      <rect x="76" y="1510"
            width="360" height="62"
            rx="31"
            fill="#B95030"/>

      <text x="256" y="1551"
            text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif"
            font-size="25"
            font-weight="700"
            fill="#FFFFFF">
        СОХРАНИТЕ
      </text>
      `
        : ""
    }

    <line x1="76" y1="1735"
          x2="205" y2="1735"
          stroke="#EF9270"
          stroke-width="7"
          stroke-linecap="round"/>

    <text x="76" y="1795"
          font-family="Arial, Helvetica, sans-serif"
          font-size="26"
          fill="#FFFFFF">
      myfamilyflow.ru
    </text>
  </svg>
  `);
}

async function buildFrame({
  background,
  target,
  overlay,
  sceneNumber,
  totalScenes,
  isLast,
}) {
  const svg = makeOverlaySvg({
    text: overlay,
    sceneNumber,
    totalScenes,
    isLast,
  });

  await sharp(background)
    .resize(1080, 1920, {
      fit: "cover",
      position: "centre",
    })
    .composite([
      {
        input: svg,
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(target);
}

async function main() {
  loadEnv();

  const args = parseArgs();

  const slug = args.slug;

  if (!slug) {
    throw new Error(
      "Укажи --slug=kak-raspredelit-zarplatu-na-mesyats"
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Некорректный slug");
  }

  if (!commandExists("ffmpeg")) {
    throw new Error(
      "ffmpeg не найден. Установи: brew install ffmpeg"
    );
  }

  if (!commandExists("ffprobe")) {
    throw new Error(
      "ffprobe не найден. Он устанавливается вместе с ffmpeg."
    );
  }

  const sourcePath = path.join(
    ROOT,
    "content",
    "blog",
    `${slug}.json`
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Не найден ${sourcePath}`
    );
  }

  const source = JSON.parse(
    fs.readFileSync(sourcePath, "utf8")
  );

  const reel = source?.social?.short_video;

  if (
    !reel ||
    !Array.isArray(reel.script) ||
    !reel.script.length
  ) {
    throw new Error(
      "В исходнике нет social.short_video.script"
    );
  }

  const scenes = reel.script;

  const aiImages = Math.max(
    0,
    Math.min(
      scenes.length,
      Number(args["ai-images"] ?? 2)
    )
  );

  const imageQuality =
    String(args.quality || "medium");

  if (
    !["low", "medium", "high"]
      .includes(imageQuality)
  ) {
    throw new Error(
      "--quality должен быть low, medium или high"
    );
  }

  const force = Boolean(args.force);
  const reuseImages =
    Boolean(args["reuse-images"]);
  const reuseVoice =
    Boolean(args["reuse-voice"]);
  const dryRun =
    Boolean(args["dry-run"]);

  const imageModel =
    process.env.OPENAI_IMAGE_MODEL ||
    "gpt-image-2";

  const ttsModel =
    process.env.OPENAI_TTS_MODEL ||
    "gpt-4o-mini-tts";

  const ttsVoice =
    process.env.OPENAI_TTS_VOICE ||
    "coral";

  const outDir = path.join(
    ROOT,
    "public",
    "social",
    slug,
    "reels"
  );

  const assetsDir = path.join(
    outDir,
    "assets"
  );

  const framesDir = path.join(
    outDir,
    "frames"
  );

  const clipsDir = path.join(
    outDir,
    "clips"
  );

  const voicePath = path.join(
    outDir,
    "voice.mp3"
  );

  const reelPath = path.join(
    outDir,
    "reel.mp4"
  );

  const aiIndexes = chooseAiIndexes(
    scenes.length,
    aiImages
  );

  console.log("");
  console.log("REELS");
  console.log("-----");
  console.log(`Статья: ${source.title}`);
  console.log(`Сцен: ${scenes.length}`);
  console.log(
    `Заявленная длительность: ${
      reel.duration_seconds || "?"
    } сек`
  );
  console.log(`AI-визуалов: ${aiImages}`);
  console.log(
    `AI-сцены: ${
      aiIndexes.length
        ? aiIndexes
            .map((x) => x + 1)
            .join(", ")
        : "нет"
    }`
  );
  console.log(
    `Image model: ${imageModel}`
  );
  console.log(`TTS model: ${ttsModel}`);
  console.log(`Voice: ${ttsVoice}`);
  console.log("");

  if (dryRun) {
    console.log(
      "DRY RUN — OpenAI не вызывается и файлы не создаются."
    );
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Нет OPENAI_API_KEY в .env"
    );
  }

  if (fs.existsSync(outDir)) {
    if (!force) {
      throw new Error(
        `Reels уже существует: ${outDir}\n` +
        `Для перегенерации добавь --force`
      );
    }

    if (!reuseImages && !reuseVoice) {
      fs.rmSync(outDir, {
        recursive: true,
        force: true,
      });
    } else {
      if (fs.existsSync(framesDir)) {
        fs.rmSync(framesDir, {
          recursive: true,
          force: true,
        });
      }

      if (fs.existsSync(clipsDir)) {
        fs.rmSync(clipsDir, {
          recursive: true,
          force: true,
        });
      }

      for (const file of [
        "reel.mp4",
        "silent.mp4",
        "concat.txt",
        "cover.png",
        "caption.txt",
        "reel.json",
      ]) {
        fs.rmSync(
          path.join(outDir, file),
          { force: true }
        );
      }

      if (!reuseImages) {
        fs.rmSync(assetsDir, {
          recursive: true,
          force: true,
        });
      }

      if (!reuseVoice) {
        fs.rmSync(voicePath, {
          force: true,
        });
      }
    }
  }

  fs.mkdirSync(assetsDir, {
    recursive: true,
  });

  fs.mkdirSync(framesDir, {
    recursive: true,
  });

  fs.mkdirSync(clipsDir, {
    recursive: true,
  });

  const style = readImageStyle();

  const aiBackgrounds = new Map();

  for (const sceneIndex of aiIndexes) {
    const scene = scenes[sceneIndex];

    const target = path.join(
      assetsDir,
      `ai-${String(
        sceneIndex + 1
      ).padStart(2, "0")}.png`
    );

    if (
      reuseImages &&
      fs.existsSync(target)
    ) {
      console.log(
        `↻ Сцена ${
          sceneIndex + 1
        }: используем готовый AI-визуал`
      );

      aiBackgrounds.set(
        sceneIndex,
        target
      );

      continue;
    }

    const prompt = buildImagePrompt({
      title: source.title,
      visual:
        scene.visual ||
        scene.voice ||
        source.title,
      overlay:
        scene.overlay || "",
      style,
    });

    console.log(
      `→ OpenAI: визуал для сцены ${
        sceneIndex + 1
      }...`
    );

    await generateImage({
      prompt,
      target,
      model: imageModel,
      quality: imageQuality,
    });

    aiBackgrounds.set(
      sceneIndex,
      target
    );

    console.log("✓ AI-визуал готов");
  }

  const articleDir = path.join(
    ROOT,
    "public",
    "blog",
    slug
  );

  const articleImages = [
    "hero.webp",
    "inside-1.webp",
    "inside-2.webp",
  ]
    .map((name) =>
      path.join(articleDir, name)
    )
    .filter((p) =>
      fs.existsSync(p)
    );

  if (
    !articleImages.length &&
    !aiBackgrounds.size
  ) {
    throw new Error(
      "Нет ни AI-визуалов, ни изображений статьи"
    );
  }

  console.log("");
  console.log("→ Собираем сцены...");

  for (
    let i = 0;
    i < scenes.length;
    i++
  ) {
    const scene = scenes[i];

    let background =
      aiBackgrounds.get(i);

    if (!background) {
      if (articleImages.length) {
        background =
          articleImages[
            i % articleImages.length
          ];
      } else {
        background =
          [...aiBackgrounds.values()][
            i % aiBackgrounds.size
          ];
      }
    }

    const overlay =
      String(scene.overlay || "").trim() ||
      String(scene.voice || "").trim() ||
      (i === 0
        ? String(reel.hook || "")
        : "");

    const framePath = path.join(
      framesDir,
      `${String(i + 1).padStart(
        2,
        "0"
      )}.png`
    );

    await buildFrame({
      background,
      target: framePath,
      overlay,
      sceneNumber: i + 1,
      totalScenes: scenes.length,
      isLast:
        i === scenes.length - 1,
    });

    console.log(
      `✓ frame ${i + 1}/${scenes.length}`
    );
  }

  const narration = scenes
    .map((s) =>
      String(s.voice || "").trim()
    )
    .filter(Boolean)
    .join(" ");

  if (!narration) {
    throw new Error(
      "В short_video.script нет voice"
    );
  }

  console.log("");
  console.log("→ Озвучка...");

  if (
    reuseVoice &&
    fs.existsSync(voicePath)
  ) {
    console.log(
      "↻ Используем готовую voice.mp3"
    );
  } else {
    await generateVoice({
      text: narration,
      target: voicePath,
      model: ttsModel,
      voice: ttsVoice,
    });

    console.log("✓ voice.mp3");
  }

  const requestedDuration =
    Number(reel.duration_seconds) ||
    30;

  const fallback =
    requestedDuration /
    scenes.length;

  const durations = scenes.map(
    (scene) =>
      parseSceneDuration(
        scene,
        fallback
      )
  );

  let videoDuration =
    durations.reduce(
      (sum, x) => sum + x,
      0
    );

  const audioDuration =
    getDuration(voicePath);

  if (
    audioDuration &&
    audioDuration >
      videoDuration - 0.15
  ) {
    const extra =
      audioDuration -
      videoDuration +
      0.4;

    durations[
      durations.length - 1
    ] += extra;

    videoDuration += extra;
  }

  console.log(
    `Озвучка: ${
      audioDuration
        ? audioDuration.toFixed(1)
        : "?"
    } сек`
  );

  console.log(
    `Видео: ${videoDuration.toFixed(
      1
    )} сек`
  );

  if (
    audioDuration &&
    audioDuration >
      requestedDuration * 1.35
  ) {
    console.log(
      "⚠ Озвучка заметно длиннее сценария. После просмотра можно ускорить текст или сократить voice."
    );
  }

  console.log("");
  console.log("→ Собираем MP4...");

  const clipPaths = [];

  for (
    let i = 0;
    i < scenes.length;
    i++
  ) {
    const frame = path.join(
      framesDir,
      `${String(i + 1).padStart(
        2,
        "0"
      )}.png`
    );

    const clip = path.join(
      clipsDir,
      `${String(i + 1).padStart(
        2,
        "0"
      )}.mp4`
    );

    const d = Math.max(
      1,
      durations[i]
    );

    const fadeOutStart =
      Math.max(0.3, d - 0.3);

    run("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-i",
      frame,
      "-t",
      d.toFixed(3),
      "-vf",
      `scale=1080:1920,fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeOutStart.toFixed(
        3
      )}:d=0.25`,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-an",
      clip,
    ]);

    clipPaths.push(clip);
  }

  const concatPath = path.join(
    outDir,
    "concat.txt"
  );

  fs.writeFileSync(
    concatPath,
    clipPaths
      .map(
        (p) =>
          `file '${p.replace(
            /'/g,
            "'\\''"
          )}'`
      )
      .join("\n") + "\n"
  );

  const silentPath = path.join(
    outDir,
    "silent.mp4"
  );

  run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-c",
    "copy",
    silentPath,
  ]);

  run("ffmpeg", [
    "-y",
    "-i",
    silentPath,
    "-i",
    voicePath,
    "-filter_complex",
    `[1:a]apad=pad_dur=${videoDuration.toFixed(
      3
    )}[a]`,
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    videoDuration.toFixed(3),
    "-movflags",
    "+faststart",
    reelPath,
  ]);

  fs.copyFileSync(
    path.join(framesDir, "01.png"),
    path.join(outDir, "cover.png")
  );

  const caption = [
    String(reel.caption || "").trim(),
    String(reel.cta || "").trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  fs.writeFileSync(
    path.join(outDir, "caption.txt"),
    caption + "\n"
  );

  fs.writeFileSync(
    path.join(outDir, "reel.json"),
    JSON.stringify(
      {
        slug,
        title: source.title,
        duration_seconds:
          Number(
            videoDuration.toFixed(2)
          ),
        scenes: scenes.length,
        ai_images: aiImages,
        image_model: imageModel,
        image_quality: imageQuality,
        tts_model: ttsModel,
        tts_voice: ttsVoice,
        generated_at:
          new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  console.log("");
  console.log("DONE");
  console.log(`Видео: ${reelPath}`);
  console.log(
    `Обложка: ${path.join(
      outDir,
      "cover.png"
    )}`
  );
  console.log(
    `Подпись: ${path.join(
      outDir,
      "caption.txt"
    )}`
  );
  console.log("");
  console.log(
    `Открыть папку:\nopen "${outDir}"`
  );
}

main().catch((error) => {
  console.error("");
  console.error("ERROR");
  console.error(
    error.message || error
  );
  process.exit(1);
});
