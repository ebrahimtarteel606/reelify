import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type QAPreferences = {
  platform?: string;
  preferredDuration?: number;
  audience?: string;
  tone?: string;
  hookStyle?: string;
  keyTopics?: string;
  callToAction?: string;
};

const dataDir = path.join(process.cwd(), "data");
const prefsPath = path.join(dataDir, "user-preferences.json");

export async function loadPreferences(): Promise<QAPreferences> {
  try {
    const content = await readFile(prefsPath, "utf-8");
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function savePreferences(update: QAPreferences): Promise<QAPreferences> {
  const existing = await loadPreferences();
  const merged = { ...existing, ...update };
  await mkdir(dataDir, { recursive: true });
  await writeFile(prefsPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
