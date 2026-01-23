"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
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

  if (!url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-500">رابط الفيديو غير موجود</p>
            <Button className="mt-4" onClick={() => window.close()}>
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-8 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Video Player */}
        <Card className="shadow-xl border-0 bg-white overflow-hidden">
          <div className="aspect-video bg-gray-900">
            <video
              src={url}
              poster={thumbnail || undefined}
              controls
              autoPlay
              className="w-full h-full object-contain"
              playsInline
            />
          </div>
        </Card>

        {/* Video Info */}
        <Card className="shadow-lg border-0 bg-white">
          <CardContent className="p-6 space-y-5">
            {/* Title & Category */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-primary/10 text-primary rounded-full">
                  {category}
                </span>
                {duration && (
                  <span className="text-sm text-muted-foreground">
                    {duration} ثانية
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">الوسوم</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript Preview */}
            {transcript && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">النص المفرّغ</h3>
                <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 leading-relaxed max-h-32 overflow-y-auto">
                  {transcript}
                </div>
              </div>
            )}

            {/* Download Buttons */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">التحميلات</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Button onClick={handleDownloadVideo} className="w-full">
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  الفيديو
                </Button>
                {thumbnail && (
                  <Button onClick={handleDownloadThumbnail} variant="outline" className="w-full">
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    الصورة
                  </Button>
                )}
                {transcript && (
                  <Button onClick={handleDownloadTranscript} variant="outline" className="w-full">
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    النص
                  </Button>
                )}
                <Button variant="ghost" onClick={() => window.close()} className="w-full">
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
