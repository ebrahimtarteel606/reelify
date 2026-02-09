import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/auth/youtube/callback`
);

export async function POST(request: NextRequest) {
  try {
    // Get tokens from cookies
    const accessToken = request.cookies.get("youtube_access_token")?.value;
    const refreshToken = request.cookies.get("youtube_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ error: "Not authenticated with YouTube" }, { status: 401 });
    }

    // Set credentials
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Parse the multipart form data
    const formData = await request.formData();
    const videoFile = formData.get("video") as File | null;
    const title = (formData.get("title") as string) || "My Reel";
    const description = (formData.get("description") as string) || "";
    const tags = (formData.get("tags") as string) || "";
    const privacyStatus = (formData.get("privacyStatus") as string) || "private";

    if (!videoFile) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    // Convert File to Buffer
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create YouTube API client
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Convert buffer to readable stream
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // Upload video
    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title.substring(0, 100), // YouTube title limit
          description: description.substring(0, 5000), // YouTube description limit
          tags: tags
            ? tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          categoryId: "22", // People & Blogs (common for Shorts)
        },
        status: {
          privacyStatus: privacyStatus as "private" | "public" | "unlisted",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: stream,
      },
    });

    const videoId = uploadResponse.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // For Shorts, the video should be vertical (9:16) and under 60 seconds
    // YouTube automatically detects this and shows it in Shorts feed

    return NextResponse.json({
      success: true,
      videoId,
      videoUrl,
      message: "Video uploaded successfully to YouTube",
    });
  } catch (error) {
    console.error("YouTube upload error:", error);

    // Check for specific error types
    if (error instanceof Error) {
      // Token refresh needed
      if (
        error.message.includes("invalid_grant") ||
        error.message.includes("Token has been expired")
      ) {
        return NextResponse.json(
          { error: "YouTube authentication expired. Please re-authenticate.", needsReauth: true },
          { status: 401 }
        );
      }

      // Quota exceeded
      if (error.message.includes("quotaExceeded")) {
        return NextResponse.json(
          { error: "YouTube API quota exceeded. Please try again later." },
          { status: 429 }
        );
      }

      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to upload video to YouTube" }, { status: 500 });
  }
}
