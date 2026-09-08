const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const x = arg.slice(2);
    const eq = x.indexOf("=");
    if (eq === -1) out[x] = true;
    else out[x.slice(0, eq)] = x.slice(eq + 1);
  }
  return out;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (r.status !== 0) {
    throw new Error(`${cmd} завершился с кодом ${r.status}`);
  }
}

function getDuration(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    {encoding: "utf8"}
  );

  if (r.status !== 0) return null;

  const n = Number(String(r.stdout).trim());
  return Number.isFinite(n) ? n : null;
}

const args = parseArgs();
const slug = args.slug;

if (!slug) {
  throw new Error("Укажи --slug=<slug>");
}

const sourcePath = path.join(
  ROOT,
  "content",
  "blog",
  `${slug}.json`
);

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Не найден ${sourcePath}`);
}

const source = JSON.parse(
  fs.readFileSync(sourcePath, "utf8")
);

const reel = source?.social?.short_video;

if (!reel?.script?.length) {
  throw new Error("Нет social.short_video.script");
}

const voicePath = path.join(
  ROOT,
  "public",
  "social",
  slug,
  "reels",
  "voice.mp3"
);

if (!fs.existsSync(voicePath)) {
  throw new Error(`Не найдена озвучка: ${voicePath}`);
}

const audioDuration = getDuration(voicePath);
const requestedDuration =
  Number(reel.duration_seconds) || 28;

const duration = Math.max(
  requestedDuration,
  audioDuration ? audioDuration + 0.25 : requestedDuration
);

const data = {
  slug,
  title: source.title,
  hook: reel.hook || "",
  duration_seconds: duration,

  // ВАЖНО:
  // аудио внутри Remotion отключаем,
  // иначе старый macOS падает на встроенном ffprobe.
  voice_static_path: "",

  scenes: reel.script,
};

const dataPath = path.join(
  ROOT,
  "motion-reels",
  "current-data.json"
);

fs.writeFileSync(
  dataPath,
  JSON.stringify(data, null, 2) + "\n"
);

const outDir = path.join(
  ROOT,
  "public",
  "social",
  slug,
  "reels-motion"
);

const framesDir = path.join(
  outDir,
  "frames"
);

const normalizedDir = path.join(
  outDir,
  "frames-normalized"
);

const output = path.join(
  outDir,
  "reel.mp4"
);

fs.rmSync(framesDir, {
  recursive: true,
  force: true,
});

fs.rmSync(normalizedDir, {
  recursive: true,
  force: true,
});

fs.rmSync(output, {
  force: true,
});

fs.mkdirSync(framesDir, {
  recursive: true,
});

fs.mkdirSync(normalizedDir, {
  recursive: true,
});

console.log("");
console.log("MOTION REEL — LEGACY macOS");
console.log("--------------------------");
console.log(`Статья: ${source.title}`);
console.log(`Сцен: ${reel.script.length}`);
console.log(`Озвучка: ${audioDuration?.toFixed(1) || "?"} сек`);
console.log(`Видео: ${duration.toFixed(1)} сек`);
console.log("OpenAI-вызовы: 0");
console.log("");

console.log("→ Remotion рисует PNG-кадры без аудио...");

run(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "remotion",
    "render",
    "motion-reels/index.jsx",
    "MotionReel",
    framesDir,
    "--sequence",
    "--image-format=png",
    "--concurrency=3",
  ]
);

let frames = fs
  .readdirSync(framesDir)
  .filter((x) => x.toLowerCase().endsWith(".png"))
  .sort();

if (!frames.length) {
  throw new Error("Remotion не создал PNG-кадры");
}

console.log(`✓ Получено кадров: ${frames.length}`);

frames.forEach((name, i) => {
  const from = path.join(framesDir, name);
  const to = path.join(
    normalizedDir,
    `frame-${String(i + 1).padStart(6, "0")}.png`
  );

  fs.copyFileSync(from, to);
});

console.log("→ Системный ffmpeg собирает MP4 + озвучку...");

run("ffmpeg", [
  "-y",

  "-framerate", "30",
  "-i",
  path.join(
    normalizedDir,
    "frame-%06d.png"
  ),

  "-i", voicePath,

  "-map", "0:v:0",
  "-map", "1:a:0",

  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "20",
  "-pix_fmt", "yuv420p",

  "-c:a", "aac",
  "-b:a", "192k",

  "-af",
  "loudnorm=I=-16:TP=-1.5:LRA=11",

  "-t", duration.toFixed(3),

  "-movflags", "+faststart",

  output,
]);

console.log("");
console.log("DONE");
console.log(output);
console.log("");
console.log(`Открыть:\nopen "${output}"`);
