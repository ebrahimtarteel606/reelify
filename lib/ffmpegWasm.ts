import { fetchFile } from "@ffmpeg/util";
import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;

export async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) {
    return ffmpegPromise;
  }

  ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg();
    // Let the library use its default URLs from unpkg
    await ffmpeg.load();
    return ffmpeg;
  })();

  return ffmpegPromise;
}

export async function writeInputFile(ffmpeg: FFmpeg, name: string, file: File) {
  await ffmpeg.writeFile(name, await fetchFile(file));
}

// Helper to safely delete a file from FFmpeg's virtual filesystem
async function deleteFile(ffmpeg: FFmpeg, name: string) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    // Ignore errors if file doesn't exist
  }
}

export async function extractAudioWav(ffmpeg: FFmpeg, inputName: string, outputName: string) {
  // Use Opus compression for smallest file size (16k bitrate, 16kHz mono)
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "12000",
    "-c:a",
    "libopus",
    "-application",
    "voip",
    "-vbr",
    "on",
    "-b:a",
    "8k",
    "-compression_level",
    "10",
    outputName,
  ]);
  const audioData = await ffmpeg.readFile(outputName);
  await deleteFile(ffmpeg, outputName); // Free memory
  const audioBytes =
    typeof audioData === "string" ? new TextEncoder().encode(audioData) : audioData;
  const audioBlobPart = audioBytes as BlobPart;
  return new Blob([audioBlobPart], { type: "audio/ogg" });
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
  const duration = safeEnd - safeStart;

  // Use stream copy (-c copy) for fast processing - no re-encoding
  // CSS will handle visual cropping to 9:16 in the UI
  await ffmpeg.exec([
    "-ss",
    safeStart.toFixed(3),
    "-i",
    inputName,
    "-t",
    duration.toFixed(3),
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outputName,
  ]);
  const clipData = await ffmpeg.readFile(outputName);
  await deleteFile(ffmpeg, outputName); // Free memory
  const clipBytes = typeof clipData === "string" ? new TextEncoder().encode(clipData) : clipData;
  const clipBlobPart = clipBytes as BlobPart;
  return new Blob([clipBlobPart], { type: "video/mp4" });
}

export async function extractThumbnail(
  ffmpeg: FFmpeg,
  inputName: string,
  outputName: string,
  timestamp: number
) {
  const safeTimestamp = Math.max(0, timestamp);
  // Extract thumbnail efficiently with memory optimizations:
  // - Use input seeking (-ss before -i) for faster, memory-efficient seeking
  // - Limit to 1 frame to minimize memory usage
  // - Use lower quality (5) for smaller file size and less memory
  // - Scale down to 640px width to reduce memory footprint
  await ffmpeg.exec([
    "-ss",
    safeTimestamp.toFixed(3),
    "-i",
    inputName,
    "-frames:v",
    "1",
    "-q:v",
    "5",
    "-vf",
    "scale=640:-1",
    outputName,
  ]);
  const thumbData = await ffmpeg.readFile(outputName);
  await deleteFile(ffmpeg, outputName); // Free memory immediately
  const thumbBytes =
    typeof thumbData === "string" ? new TextEncoder().encode(thumbData) : thumbData;
  const thumbBlobPart = thumbBytes as BlobPart;
  return new Blob([thumbBlobPart], { type: "image/jpeg" });
}

// Clean up input file after all processing is done
export async function cleanupInputFile(ffmpeg: FFmpeg, inputName: string) {
  await deleteFile(ffmpeg, inputName);
}
