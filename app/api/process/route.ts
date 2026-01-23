import { NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";
import { transcribeAudio } from "../../../lib/elevenlabs";
import { generateClipCandidates } from "../../../lib/gemini";
import { loadPreferences, savePreferences, type QAPreferences } from "../../../lib/qaStore";

export const runtime = "nodejs";

type UploadedFile = {
  filePath: string;
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
    let fileSaved: Promise<void> | null = null;
    const fields: Record<string, string> = {};

    busboy.on("file", (_fieldname, file, info) => {
      if (filePath) {
        file.resume();
        return;
      }
      const incomingName = info.filename || `audio-${Date.now()}.wav`;
      const safeName = incomingName.replace(/[^\w.-]/g, "_");
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
        resolve({ filePath, tempDir, fields });
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

    const segments = await transcribeAudio(upload.filePath);
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

    const hasUpdate = Object.values(preferenceUpdate).some(
      (value) => value !== undefined && value !== ""
    );
    const mergedPreferences = hasUpdate
      ? await savePreferences(preferenceUpdate)
      : await loadPreferences();

    const clipCandidates = await generateClipCandidates(segments, mergedPreferences);
    if (clipCandidates.length === 0) {
      return NextResponse.json(
        { error: "Gemini did not return valid clip candidates" },
        { status: 400 }
      );
    }
    return NextResponse.json({ clips: clipCandidates });
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
