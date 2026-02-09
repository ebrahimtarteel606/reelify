"use client";

import { useEffect, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";

export function useFFmpeg() {
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      if (ffmpeg || loading) return;

      setLoading(true);
      setError(null);

      try {
        const ffmpegInstance = new FFmpeg();

        // Load FFmpeg core files from CDN
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.0/dist/umd";

        await ffmpegInstance.load({
          coreURL: `${baseURL}/ffmpeg-core.js`,
          wasmURL: `${baseURL}/ffmpeg-core.wasm`,
          workerURL: `${baseURL}/ffmpeg-core.worker.js`,
        });

        setFFmpeg(ffmpegInstance);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load FFmpeg"));
      } finally {
        setLoading(false);
      }
    };

    loadFFmpeg();
  }, []);

  return { ffmpeg, loaded, loading, error };
}
