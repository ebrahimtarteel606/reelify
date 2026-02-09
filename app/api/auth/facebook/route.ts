import { NextRequest, NextResponse } from "next/server";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const REDIRECT_URI = `${BASE_URL}/api/auth/facebook/callback`;

// Scopes required for Facebook video upload (Reels)
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "publish_video",
].join(",");

export async function GET(request: NextRequest) {
  try {
    if (!FACEBOOK_APP_ID) {
      return NextResponse.json({ error: "Facebook App ID not configured" }, { status: 500 });
    }

    // Get the return URL from query params
    const returnUrl = request.nextUrl.searchParams.get("return_url");

    // Generate a random state for CSRF protection
    const state = crypto.randomUUID();

    // Generate the OAuth URL
    const authUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    authUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");

    // Create response with redirect
    const response = NextResponse.redirect(authUrl.toString());

    // Store state in httpOnly cookie for verification
    response.cookies.set("facebook_oauth_state", state, {
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
      response.cookies.set("facebook_return_url", encodeURIComponent(returnUrl), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10, // 10 minutes
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Facebook OAuth error:", error);
    return NextResponse.json(
      { error: "Failed to initiate Facebook authentication" },
      { status: 500 }
    );
  }
}

// Check authentication status
export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("facebook_access_token")?.value;
    const pageAccessToken = request.cookies.get("facebook_page_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ authenticated: false });
    }

    // Verify the token is still valid by making a simple API call
    const debugResponse = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`
    );

    const debugData = await debugResponse.json();

    if (!debugData.data?.is_valid) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({
      authenticated: true,
      hasPageToken: !!pageAccessToken,
    });
  } catch (error) {
    console.error("Facebook auth check error:", error);
    return NextResponse.json({ authenticated: false });
  }
}

// Logout - clear cookies
export async function DELETE() {
  const response = NextResponse.json({ success: true });

  response.cookies.delete("facebook_access_token");
  response.cookies.delete("facebook_page_access_token");
  response.cookies.delete("facebook_page_id");
  response.cookies.delete("facebook_oauth_state");
  response.cookies.delete("facebook_return_url");

  return response;
}
