import { NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { mkdir, mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import crypto from "crypto";
import Busboy from "busboy";
import { extractAudio, clipVideo } from "../../../lib/ffmpeg";
import { transcribeAudio } from "../../../lib/elevenlabs";
import { generateClipCandidates } from "../../../lib/gemini";
import { loadPreferences, savePreferences, type QAPreferences } from "../../../lib/qaStore";

export const runtime = "nodejs";

type UploadedFile = {
  filePath: string;
  filename: string;
  tempDir: string;
  fields: Record<string, string>;
};

const parseUpload = async (request: Request): Promise<UploadedFile> => {
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data");
  }

  if (!request.body) {
    throw new Error("Request body was empty");
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "realify-"));

  return await new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        "content-type": contentType
      }
    });

    let filePath = "";
    let filename = "";
    let fileSaved: Promise<void> | null = null;
    const fields: Record<string, string> = {};

    busboy.on("file", (_fieldname, file, info) => {
      if (filePath) {
        file.resume();
        return;
      }
      filename = info.filename || `upload-${Date.now()}.mp4`;
      const safeName = filename.replace(/[^\w.-]/g, "_");
      filePath = path.join(tempDir, safeName);

      const writeStream = createWriteStream(filePath);
      file.pipe(writeStream);
      fileSaved = new Promise((resolveWrite, rejectWrite) => {
        writeStream.on("finish", resolveWrite);
        writeStream.on("error", rejectWrite);
        file.on("error", rejectWrite);
      });
    });

    busboy.on("field", (fieldname, value) => {
      fields[fieldname] = String(value ?? "").trim();
    });

    busboy.on("error", reject);

    busboy.on("finish", async () => {
      if (!filePath || !fileSaved) {
        reject(new Error("No video file uploaded"));
        return;
      }
      try {
        await fileSaved;
        resolve({ filePath, filename, tempDir, fields });
      } catch (error) {
        reject(error);
      }
    });

    Readable.fromWeb(request.body as any).pipe(busboy);
  });
};

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const upload = await parseUpload(request);
    tempDir = upload.tempDir;

    const audioPath = path.join(tempDir, "audio.wav");
    await extractAudio(upload.filePath, audioPath);

    const segments = await transcribeAudio(audioPath);
    if (segments.length === 0) {
      return NextResponse.json({ error: "Transcript was empty" }, { status: 400 });
    }

    const preferredDuration = upload.fields.preferredDuration
      ? Number(upload.fields.preferredDuration)
      : undefined;
    const preferenceUpdate: QAPreferences = {
      platform: upload.fields.platform || undefined,
      preferredDuration: Number.isFinite(preferredDuration) ? preferredDuration : undefined,
      audience: upload.fields.audience || undefined,
      tone: upload.fields.tone || undefined,
      hookStyle: upload.fields.hookStyle || undefined,
      keyTopics: upload.fields.keyTopics || undefined,
      callToAction: upload.fields.callToAction || undefined
    };

    const storedPreferences = await loadPreferences();
    const mergedPreferences = await savePreferences({
      ...storedPreferences,
      ...preferenceUpdate
    });

    const clipCandidates = await generateClipCandidates(segments, mergedPreferences);
    if (clipCandidates.length === 0) {
      return NextResponse.json(
        { error: "Gemini did not return valid clip candidates" },
        { status: 400 }
      );
    }

    const clipsDir = path.join(process.cwd(), "public", "clips");
    await mkdir(clipsDir, { recursive: true });

    const maxEnd = Math.max(...segments.map((segment) => segment.end));
    const clips = [];

    for (const candidate of clipCandidates) {
      const start = Math.max(0, candidate.start);
      const end = Math.min(candidate.end, maxEnd);
      const duration = end - start;
      if (duration < 30 || duration > 90) {
        continue;
      }
      const filename = `clip-${crypto.randomUUID()}.mp4`;
      const outputPath = path.join(clipsDir, filename);

      await clipVideo({
        inputPath: upload.filePath,
        outputPath,
        start,
        end
      });

      clips.push({
        title: candidate.title,
        start,
        end,
        duration,
        url: `/clips/${filename}`
      });
    }

    if (clips.length === 0) {
      return NextResponse.json(
        { error: "No valid clips were generated" },
        { status: 400 }
      );
    }

    return NextResponse.json({ clips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    const clientErrorMessages = [
      "Missing ELEVENLABS_API_KEY",
      "Missing GEMINI_API_KEY",
      "Expected multipart/form-data",
      "Request body was empty",
      "No video file uploaded"
    ];
    const status = clientErrorMessages.includes(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
