import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

export async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) {
    return ffmpegPromise;
  }

  ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });
    return ffmpeg;
  })();

  return ffmpegPromise;
}

export async function writeInputFile(ffmpeg: FFmpeg, name: string, file: File) {
  await ffmpeg.writeFile(name, await fetchFile(file));
}

export async function extractAudioWav(ffmpeg: FFmpeg, inputName: string, outputName: string) {
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    outputName
  ]);
  const audioData = await ffmpeg.readFile(outputName);
  return new Blob([audioData], { type: "audio/wav" });
}

export async function clipVideoSegment(
  ffmpeg: FFmpeg,
  inputName: string,
  outputName: string,
  start: number,
  end: number
) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  await ffmpeg.exec([
    "-ss",
    safeStart.toFixed(3),
    "-to",
    safeEnd.toFixed(3),
    "-i",
    inputName,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputName
  ]);
  const clipData = await ffmpeg.readFile(outputName);
  return new Blob([clipData], { type: "video/mp4" });
}
