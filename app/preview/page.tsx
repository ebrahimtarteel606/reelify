"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function PreviewContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url");
  const title = searchParams.get("title") || "مقطع فيديو";
  const duration = searchParams.get("duration");
  const thumbnail = searchParams.get("thumbnail");
  const category = searchParams.get("category") || "عام";
  const tagsParam = searchParams.get("tags") || "";
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const transcript = searchParams.get("transcript") || "";
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);

  if (!url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <Card className="w-full max-w-md shadow-card border-0 bg-gradient-card animate-fade-in">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">رابط الفيديو غير موجود</p>
            <Button
              className="bg-gradient-teal hover:shadow-teal transition-all duration-200"
              onClick={() => window.close()}
            >
              إغلاق
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDownloadVideo = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleDownloadThumbnail = async () => {
    if (!thumbnail) return;
    try {
      const response = await fetch(thumbnail);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${title}-thumbnail.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      window.open(thumbnail, "_blank");
    }
  };

  const handleDownloadTranscript = () => {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${title}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  const videoFitClass = isPortrait === false ? "object-contain" : "object-cover";
  const videoWrapperClass = `aspect-[9/16] relative ${
    isPortrait === false ? "bg-black" : "bg-gray-900"
  }`;

  return (
    <div className="min-h-screen bg-gradient-warm py-10 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Video Player - 9:16 Vertical Format */}
        <div className="flex justify-center">
          <Card className="shadow-card border-0 bg-gradient-card overflow-hidden animate-fade-in hover:shadow-card-hover transition-all duration-500 w-full max-w-md">
            <div className={videoWrapperClass}>
              <video
                src={url}
                poster={thumbnail || undefined}
                controls
                autoPlay
                onLoadedMetadata={(event) => {
                  const { videoWidth, videoHeight } = event.currentTarget;
                  if (videoWidth && videoHeight) {
                    setIsPortrait(videoHeight >= videoWidth);
                  }
                }}
                className={`w-full h-full ${videoFitClass}`}
                playsInline
              />
            </div>
          </Card>
        </div>

        {/* Video Info */}
        <Card className="shadow-card border-0 bg-gradient-card animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CardContent className="p-8 space-y-6">
            {/* Title & Category */}
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="inline-flex items-center px-4 py-1.5 text-sm font-semibold bg-primary/10 text-primary rounded-full">
                  {category}
                </span>
                {duration && (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {duration} ثانية
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-foreground leading-snug">{title}</h1>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  الوسوم
                </h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-4 py-1.5 text-sm bg-muted text-foreground rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript Preview */}
            {transcript && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  النص المفرّغ
                </h3>
                <div className="p-5 bg-muted/50 rounded-2xl text-base text-foreground/80 leading-relaxed max-h-40 overflow-y-auto border border-border/50">
                  {transcript}
                </div>
              </div>
            )}

            {/* Download Buttons */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                التحميلات
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Button
                  onClick={handleDownloadVideo}
                  className="w-full h-12 bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  الفيديو
                </Button>
                {thumbnail && (
                  <Button
                    onClick={handleDownloadThumbnail}
                    variant="outline"
                    className="w-full h-12 border-2 hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    الصورة
                  </Button>
                )}
                {transcript && (
                  <Button
                    onClick={handleDownloadTranscript}
                    variant="outline"
                    className="w-full h-12 border-2 hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    النص
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => window.close()}
                  className="w-full h-12 hover:bg-muted hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  إغلاق
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PreviewPage() {
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
      <PreviewContent />
    </Suspense>
  );
}
