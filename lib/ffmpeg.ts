import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);
const ffmpegPath =
  process.env.FFMPEG_PATH ||
  ffmpegInstaller?.path ||
  ffmpegStatic ||
  "ffmpeg";

type ClipOptions = {
  inputPath: string;
  outputPath: string;
  start: number;
  end: number;
};

export async function extractAudio(inputPath: string, outputPath: string) {
  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath
    ],
    { maxBuffer: 1024 * 1024 * 20 }
  );
}

export async function clipVideo({ inputPath, outputPath, start, end }: ClipOptions) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-ss",
      safeStart.toFixed(3),
      "-to",
      safeEnd.toFixed(3),
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath
    ],
    { maxBuffer: 1024 * 1024 * 20 }
  );
}
