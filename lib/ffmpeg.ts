import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type ClipOptions = {
  inputPath: string;
  outputPath: string;
  start: number;
  end: number;
};

export async function extractAudio(inputPath: string, outputPath: string) {
  await execFileAsync(
    "ffmpeg",
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
    "ffmpeg",
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
