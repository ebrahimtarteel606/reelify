import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Get tokens from cookies
    const pageAccessToken = request.cookies.get("facebook_page_access_token")?.value;
    const pageId = request.cookies.get("facebook_page_id")?.value;
    const userAccessToken = request.cookies.get("facebook_access_token")?.value;

    // Check authentication
    if (!userAccessToken) {
      return NextResponse.json({ error: "Not authenticated with Facebook" }, { status: 401 });
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const videoFile = formData.get("video") as File | null;
    const description = (formData.get("description") as string) || "";
    const publishAs = (formData.get("publishAs") as string) || "user"; // 'user' or 'page'

    if (!videoFile) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    // Determine which token and endpoint to use
    let accessToken: string;
    let uploadEndpoint: string;

    if (publishAs === "page" && pageAccessToken && pageId) {
      // Publish to Page
      accessToken = pageAccessToken;
      uploadEndpoint = `https://graph-video.facebook.com/v18.0/${pageId}/videos`;
    } else {
      // Publish to User's profile (as Reel)
      accessToken = userAccessToken;
      // Get user ID first
      const meResponse = await fetch(
        `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`
      );
      const meData = await meResponse.json();

      if (meData.error) {
        return NextResponse.json(
          { error: `Facebook API error: ${meData.error.message}` },
          { status: 400 }
        );
      }

      uploadEndpoint = `https://graph-video.facebook.com/v18.0/${meData.id}/videos`;
    }

    // Convert File to Blob for upload
    const arrayBuffer = await videoFile.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: videoFile.type });

    // Create FormData for Facebook API
    const fbFormData = new FormData();
    fbFormData.append("access_token", accessToken);
    fbFormData.append("source", blob, videoFile.name);
    fbFormData.append("description", description.substring(0, 2000)); // Facebook description limit

    // For Reels, these are important parameters
    fbFormData.append("video_type", "reels"); // Specify this is a Reel
    fbFormData.append("published", "true");

    // Upload video using resumable upload for larger files
    // First, check file size to determine upload method
    const fileSizeInMB = videoFile.size / (1024 * 1024);

    if (fileSizeInMB > 1) {
      // Use chunked upload for larger files
      return await handleChunkedUpload(
        uploadEndpoint,
        accessToken,
        arrayBuffer,
        description,
        videoFile.size
      );
    }

    // For smaller files, use simple upload
    const uploadResponse = await fetch(uploadEndpoint, {
      method: "POST",
      body: fbFormData,
    });

    const uploadData = await uploadResponse.json();

    if (uploadData.error) {
      console.error("Facebook upload error:", uploadData.error);

      // Check for specific errors
      if (uploadData.error.code === 190) {
        return NextResponse.json(
          { error: "Facebook authentication expired. Please re-authenticate.", needsReauth: true },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: `Facebook upload failed: ${uploadData.error.message}` },
        { status: 400 }
      );
    }

    // Get the video URL
    const videoId = uploadData.id;
    const postUrl =
      publishAs === "page"
        ? `https://www.facebook.com/${pageId}/videos/${videoId}`
        : `https://www.facebook.com/reel/${videoId}`;

    return NextResponse.json({
      success: true,
      videoId,
      postUrl,
      message: "Video uploaded successfully to Facebook",
    });
  } catch (error) {
    console.error("Facebook upload error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to upload video to Facebook" }, { status: 500 });
  }
}

/**
 * Handle chunked upload for larger video files
 */
async function handleChunkedUpload(
  endpoint: string,
  accessToken: string,
  arrayBuffer: ArrayBuffer,
  description: string,
  fileSize: number
): Promise<NextResponse> {
  try {
    // Step 1: Initialize upload session
    const initResponse = await fetch(
      `${endpoint}?upload_phase=start&access_token=${accessToken}&file_size=${fileSize}`,
      {
        method: "POST",
      }
    );

    const initData = await initResponse.json();

    if (initData.error) {
      return NextResponse.json(
        { error: `Failed to initialize upload: ${initData.error.message}` },
        { status: 400 }
      );
    }

    const uploadSessionId = initData.upload_session_id;
    const videoId = initData.video_id;

    // Step 2: Upload chunks
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
    const buffer = Buffer.from(arrayBuffer);
    let startOffset = 0;

    while (startOffset < fileSize) {
      const endOffset = Math.min(startOffset + CHUNK_SIZE, fileSize);
      const chunk = buffer.slice(startOffset, endOffset);

      const chunkFormData = new FormData();
      chunkFormData.append("access_token", accessToken);
      chunkFormData.append("upload_phase", "transfer");
      chunkFormData.append("upload_session_id", uploadSessionId);
      chunkFormData.append("start_offset", startOffset.toString());
      chunkFormData.append("video_file_chunk", new Blob([chunk]));

      const chunkResponse = await fetch(endpoint, {
        method: "POST",
        body: chunkFormData,
      });

      const chunkData = await chunkResponse.json();

      if (chunkData.error) {
        return NextResponse.json(
          { error: `Chunk upload failed: ${chunkData.error.message}` },
          { status: 400 }
        );
      }

      startOffset = parseInt(chunkData.end_offset || endOffset.toString());
    }

    // Step 3: Finish upload
    const finishFormData = new FormData();
    finishFormData.append("access_token", accessToken);
    finishFormData.append("upload_phase", "finish");
    finishFormData.append("upload_session_id", uploadSessionId);
    finishFormData.append("description", description.substring(0, 2000));
    finishFormData.append("video_type", "reels");
    finishFormData.append("published", "true");

    const finishResponse = await fetch(endpoint, {
      method: "POST",
      body: finishFormData,
    });

    const finishData = await finishResponse.json();

    if (finishData.error) {
      return NextResponse.json(
        { error: `Failed to finish upload: ${finishData.error.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      videoId: videoId || finishData.id,
      postUrl: `https://www.facebook.com/reel/${videoId || finishData.id}`,
      message: "Video uploaded successfully to Facebook",
    });
  } catch (error) {
    console.error("Chunked upload error:", error);
    return NextResponse.json({ error: "Chunked upload failed" }, { status: 500 });
  }
}
