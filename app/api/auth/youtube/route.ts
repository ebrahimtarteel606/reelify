import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/auth/youtube/callback`
);

// Scopes required for YouTube video upload
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export async function GET(request: NextRequest) {
  try {
    // Get the return URL from query params
    const returnUrl = request.nextUrl.searchParams.get("return_url");

    // Generate a random state for CSRF protection
    const state = crypto.randomUUID();

    // Generate the OAuth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      state,
      prompt: "consent", // Force consent screen to get refresh token
    });

    // Create response with redirect
    const response = NextResponse.redirect(authUrl);

    // Store state in httpOnly cookie for verification
    response.cookies.set("youtube_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    });

    // Store the return URL in a cookie so the callback can use it
    // Note: The returnUrl from query params is already URL-decoded by Next.js
    // We need to re-encode it for storage in the cookie
    if (returnUrl) {
      console.log("Setting youtube_return_url cookie:", returnUrl);
      response.cookies.set("youtube_return_url", encodeURIComponent(returnUrl), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10, // 10 minutes
        path: "/",
      });
    } else {
      console.log("No return_url provided in query params");
    }

    return response;
  } catch (error) {
    console.error("YouTube OAuth error:", error);
    return NextResponse.json(
      { error: "Failed to initiate YouTube authentication" },
      { status: 500 }
    );
  }
}

// Check authentication status
export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("youtube_access_token")?.value;
    const refreshToken = request.cookies.get("youtube_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ authenticated: false });
    }

    // If we have a refresh token but no access token, try to refresh
    if (refreshToken && !accessToken) {
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        const response = NextResponse.json({
          authenticated: true,
          needsRefresh: true,
        });

        // Update access token cookie
        if (credentials.access_token) {
          response.cookies.set("youtube_access_token", credentials.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: credentials.expiry_date
              ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
              : 3600,
            path: "/",
          });
        }

        return response;
      } catch {
        // Refresh failed, user needs to re-authenticate
        return NextResponse.json({ authenticated: false });
      }
    }

    return NextResponse.json({ authenticated: true });
  } catch (error) {
    console.error("YouTube auth check error:", error);
    return NextResponse.json({ authenticated: false });
  }
}

// Logout - clear cookies
export async function DELETE() {
  const response = NextResponse.json({ success: true });

  response.cookies.delete("youtube_access_token");
  response.cookies.delete("youtube_refresh_token");
  response.cookies.delete("youtube_oauth_state");
  response.cookies.delete("youtube_return_url");

  return response;
}
