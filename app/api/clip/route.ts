import { NextResponse } from "next/server";
import { copyFile, mkdir, mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import crypto from "crypto";
import Busboy from "busboy";

export const runtime = "nodejs";

type ClipUpload = {
  tempDir: string;
  filePath: string;
  title: string;
  start: number;
  end: number;
};

const parseClipUpload = async (request: Request): Promise<ClipUpload> => {
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
      const safeName = (info.filename || `clip-${Date.now()}.mp4`).replace(/[^\w.-]/g, "_");
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
        reject(new Error("No clip file uploaded"));
        return;
      }
      try {
        await fileSaved;
        resolve({
          tempDir,
          filePath,
          title: fields.title || "بدون عنوان",
          start: Number(fields.start ?? 0),
          end: Number(fields.end ?? 0)
        });
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
    const upload = await parseClipUpload(request);
    tempDir = upload.tempDir;

    const clipsDir = path.join(process.cwd(), "public", "clips");
    await mkdir(clipsDir, { recursive: true });
    const filename = `clip-${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(clipsDir, filename);

    await copyFile(upload.filePath, outputPath);

    const duration = Math.max(0, upload.end - upload.start);
    return NextResponse.json({
      title: upload.title,
      start: upload.start,
      end: upload.end,
      duration,
      url: `/clips/${filename}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
