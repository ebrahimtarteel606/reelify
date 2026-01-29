"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReelEditor } from "@/components/reel-editor/ReelEditor";
import { ReelClipInput, ReelExportResult } from "@/types";
import { getVideoBlobUrl } from "@/lib/videoStorage";

function EditorContent() {
  const searchParams = useSearchParams();
  
  // Check synchronously if we need to restore URL (prevents component from loading)
  const needsUrlRestore = useMemo(() => {
    if (typeof window === "undefined") return false;
    const authSuccess = searchParams.get("auth_success");
    const startTime = searchParams.get("startTime");
    const savedReturnUrl = sessionStorage.getItem("auth_return_url");
    return !!(authSuccess && !startTime && savedReturnUrl);
  }, [searchParams]);

  const [isRestoringUrl, setIsRestoringUrl] = useState(needsUrlRestore);

  // Perform the URL restore in an effect
  useEffect(() => {
    if (!needsUrlRestore) return;
    
    const authSuccess = searchParams.get("auth_success");
    const savedReturnUrl = sessionStorage.getItem("auth_return_url");
    
    if (authSuccess && savedReturnUrl) {
      console.log("[Editor] Restoring URL from sessionStorage after OAuth");
      setIsRestoringUrl(true);
      sessionStorage.removeItem("auth_return_url");
      
      try {
        const returnUrl = new URL(savedReturnUrl);
        // Add auth_success to the URL
        returnUrl.searchParams.set("auth_success", authSuccess);
        console.log("[Editor] Redirecting to:", returnUrl.toString());
        window.location.href = returnUrl.toString();
      } catch (e) {
        console.error("[Editor] Failed to restore URL:", e);
        setIsRestoringUrl(false);
      }
    }
  }, [needsUrlRestore, searchParams]);

  // Show loading while restoring URL - this blocks the rest of the component from rendering
  if (isRestoringUrl || needsUrlRestore) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-lg text-muted-foreground">جاري استعادة الجلسة...</p>
        </div>
      </div>
    );
  }
  const videoUrlParam = searchParams.get("videoUrl");
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const title = searchParams.get("title") || "مقطع فيديو";
  const category = searchParams.get("category") || "عام";
  const transcript = searchParams.get("transcript") || "";
  const [videoUrl, setVideoUrl] = useState<string | null>(videoUrlParam);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isLoadingDuration, setIsLoadingDuration] = useState(true);

  // Validate video URL and recreate from IndexedDB if needed
  useEffect(() => {
    const validateAndLoadVideo = async () => {
      // Always try to get video from IndexedDB first (most reliable)
      // If no videoUrlParam or it's a blob URL, get from IndexedDB
      const shouldUseIndexedDB = !videoUrlParam || videoUrlParam.startsWith('blob:');
      
      if (shouldUseIndexedDB) {
        // Get fresh blob URL from IndexedDB
        const newBlobUrl = await getVideoBlobUrl();
        if (newBlobUrl) {
          setVideoUrl(newBlobUrl);
          // Load duration from the new blob URL
          const video = document.createElement("video");
          video.preload = "metadata";
          video.src = newBlobUrl;
          
          video.onloadedmetadata = () => {
            setVideoDuration(video.duration);
            setIsLoadingDuration(false);
          };
          
          video.onerror = () => {
            setIsLoadingDuration(false);
            // Try to estimate duration from endTime if available
            if (endTimeParam) {
              const endTime = Number.parseFloat(endTimeParam);
              setVideoDuration(Math.max(endTime + 10, 60)); // Add buffer, min 60s
            }
          };
          
          video.load();
        } else {
          setIsLoadingDuration(false);
          // Try to estimate duration from endTime if available
          if (endTimeParam) {
            const endTime = Number.parseFloat(endTimeParam);
            setVideoDuration(Math.max(endTime + 10, 60)); // Add buffer, min 60s
          }
        }
      } else {
        // Non-blob URL (e.g., Vercel Blob URL), use it directly
        setVideoUrl(videoUrlParam);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = videoUrlParam;
        
        video.onloadedmetadata = () => {
          setVideoDuration(video.duration);
          setIsLoadingDuration(false);
        };
        
        video.onerror = async () => {
          // If non-blob URL fails, try IndexedDB as fallback
          const newBlobUrl = await getVideoBlobUrl();
          if (newBlobUrl) {
            setVideoUrl(newBlobUrl);
            const fallbackVideo = document.createElement("video");
            fallbackVideo.preload = "metadata";
            fallbackVideo.src = newBlobUrl;
            
            fallbackVideo.onloadedmetadata = () => {
              setVideoDuration(fallbackVideo.duration);
              setIsLoadingDuration(false);
            };
            
            fallbackVideo.onerror = () => {
              setIsLoadingDuration(false);
              if (endTimeParam) {
                const endTime = Number.parseFloat(endTimeParam);
                setVideoDuration(Math.max(endTime + 10, 60));
              }
            };
            
            fallbackVideo.load();
          } else {
            setIsLoadingDuration(false);
            if (endTimeParam) {
              const endTime = Number.parseFloat(endTimeParam);
              setVideoDuration(Math.max(endTime + 10, 60));
            }
          }
        };
        
        video.load();
      }
    };

    void validateAndLoadVideo();
  }, [videoUrlParam, endTimeParam]);

  // Get video duration (for the actual videoUrl state)
  useEffect(() => {
    if (!videoUrl) return;

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = videoUrl;

    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
      setIsLoadingDuration(false);
    };

    video.onerror = () => {
      setIsLoadingDuration(false);
      // Try to estimate duration from endTime if available
      if (endTimeParam) {
        const endTime = Number.parseFloat(endTimeParam);
        setVideoDuration(Math.max(endTime + 10, 60)); // Add buffer, min 60s
      }
    };

    return () => {
      video.src = "";
    };
  }, [videoUrl, endTimeParam]);

  // Convert preview data to ReelClipInput format
  const clipData: ReelClipInput | null = useMemo(() => {
    if (!videoUrl) return null;

    const startTime = startTimeParam ? Number.parseFloat(startTimeParam) : 0;
    const endTime = endTimeParam
      ? Number.parseFloat(endTimeParam)
      : Math.max(videoDuration, 60);

    // Parse transcript into segments if available
    const segments = transcript
      ? transcript
          .split(/[.!?،؛]+/)
          .filter((s) => s.trim().length > 0)
          .map((text, index, arr) => {
            // Distribute transcript segments across the clip duration
            const clipDuration = endTime - startTime;
            const segmentDuration = clipDuration / Math.max(arr.length, 1);
            return {
              text: text.trim(),
              start: startTime + index * segmentDuration,
              end: startTime + (index + 1) * segmentDuration,
              language: /[\u0600-\u06FF]/.test(text)
                ? ("ar" as const)
                : ("en" as const),
            };
          })
      : [];

    return {
      clipId: `clip-${Date.now()}`,
      videoSourceUrl: videoUrl,
      sourceVideoDuration: videoDuration || 60,
      startTime,
      endTime,
      transcription: segments.length > 0 ? { segments } : undefined,
      metadata: {
        title,
        description: transcript,
      },
    };
  }, [
    videoUrl,
    startTimeParam,
    endTimeParam,
    transcript,
    title,
    videoDuration,
  ]);

  if (!videoUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <Card className="w-full max-w-md shadow-card border-0 bg-gradient-card animate-fade-in">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <img
                src="/Transparent black.png"
                alt="Reelify logo"
                className="h-10 w-auto"
              />
            </div>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">
              رابط الفيديو غير موجود
            </p>
            <Button
              className="bg-gradient-teal hover:shadow-teal transition-all duration-200"
              onClick={() => {
                // Set flag to indicate user is navigating back
                if (typeof globalThis.window !== "undefined") {
                  globalThis.sessionStorage.setItem(
                    "reelify_navigation_back",
                    "true",
                  );
                }
                globalThis.history.back();
              }}
            >
              العودة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingDuration || !clipData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-lg text-muted-foreground">جاري تحميل الفيديو...</p>
        </div>
      </div>
    );
  }

  const handleExportSuccess = (result: ReelExportResult) => {
    // Download the exported video
    const a = document.createElement("a");
    a.href = result.videoUrl;
    a.download = `${title || "reel"}-edited.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(result.videoUrl);
  };

  const handleExportError = (error: Error) => {
    console.error("Export error:", error);
    alert(`فشل التصدير: ${error.message}`);
  };

  return (
    <div className="min-h-screen bg-gradient-warm" dir="rtl">
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <img
              src="/Transparent white1.png"
              alt="Reelify logo"
              className="h-8 w-auto"
            />
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">
                {category} • {Math.round(clipData.endTime - clipData.startTime)}{" "}
                ثانية
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              // Set flag to indicate user is navigating back
              if (typeof globalThis.window !== "undefined") {
                globalThis.sessionStorage.setItem(
                  "reelify_navigation_back",
                  "true",
                );
              }
              globalThis.history.back();
            }}
            variant="outline"
            className="bg-gradient-coral text-white border-none hover:shadow-teal transition-all duration-200"
          >
            العودة
          </Button>
        </div>
      </div>
      <ReelEditor
        clipData={clipData}
        theme="dark"
        aspectRatio="9:16"
        exportQuality="medium"
        onExportSuccess={handleExportSuccess}
        onExportError={handleExportError}
      />
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
          <div className="text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-lg text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
