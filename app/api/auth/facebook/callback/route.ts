import { NextRequest, NextResponse } from "next/server";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const REDIRECT_URI = `${BASE_URL}/api/auth/facebook/callback`;

export async function GET(request: NextRequest) {
  // Helper to get the redirect URL with auth params
  const getRedirectUrl = () => {
    const storedReturnUrl = request.cookies.get("facebook_return_url")?.value;

    if (storedReturnUrl) {
      try {
        // Decode the stored return URL and append auth param
        const returnUrl = new URL(decodeURIComponent(storedReturnUrl));
        returnUrl.searchParams.set("auth_success", "facebook");
        returnUrl.searchParams.delete("auth_error");
        return returnUrl.toString();
      } catch (e) {
        console.error("Failed to parse return URL:", e);
      }
    }

    // Fallback to /editor with auth param
    return new URL("/editor?auth_success=facebook", request.url).toString();
  };

  const getErrorRedirectUrl = (error: string) => {
    const storedReturnUrl = request.cookies.get("facebook_return_url")?.value;

    if (storedReturnUrl) {
      try {
        const returnUrl = new URL(decodeURIComponent(storedReturnUrl));
        returnUrl.searchParams.set("auth_error", error);
        returnUrl.searchParams.delete("auth_success");
        return returnUrl.toString();
      } catch (e) {
        console.error("Failed to parse return URL:", e);
      }
    }

    return new URL(`/editor?auth_error=${encodeURIComponent(error)}`, request.url).toString();
  };

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Check for OAuth errors
    if (error) {
      console.error("Facebook OAuth error:", error, errorDescription);
      const response = NextResponse.redirect(getErrorRedirectUrl(errorDescription || error));
      response.cookies.delete("facebook_return_url");
      return response;
    }

    // Verify state to prevent CSRF
    const storedState = request.cookies.get("facebook_oauth_state")?.value;
    if (!state || state !== storedState) {
      console.error("State mismatch:", { state, storedState });
      const response = NextResponse.redirect(getErrorRedirectUrl("state_mismatch"));
      response.cookies.delete("facebook_return_url");
      return response;
    }

    if (!code) {
      const response = NextResponse.redirect(getErrorRedirectUrl("no_code"));
      response.cookies.delete("facebook_return_url");
      return response;
    }

    // Exchange code for access token
    const tokenUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", FACEBOOK_APP_ID!);
    tokenUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET!);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Facebook token error:", tokenData.error);
      const response = NextResponse.redirect(getErrorRedirectUrl(tokenData.error.message));
      response.cookies.delete("facebook_return_url");
      return response;
    }

    const { access_token, expires_in } = tokenData;

    if (!access_token) {
      const response = NextResponse.redirect(getErrorRedirectUrl("no_access_token"));
      response.cookies.delete("facebook_return_url");
      return response;
    }

    // Exchange for a long-lived token (60 days instead of 1-2 hours)
    const longLivedUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", FACEBOOK_APP_ID!);
    longLivedUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET!);
    longLivedUrl.searchParams.set("fb_exchange_token", access_token);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    const finalToken = longLivedData.access_token || access_token;
    const finalExpiry = longLivedData.expires_in || expires_in;

    // Get user's pages to allow posting Reels
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${finalToken}`
    );
    const pagesData = await pagesResponse.json();

    // Create redirect response - use the stored return URL
    const response = NextResponse.redirect(getRedirectUrl());

    // Store user access token in httpOnly cookie
    response.cookies.set("facebook_access_token", finalToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: finalExpiry || 60 * 60 * 24 * 60, // Default 60 days
      path: "/",
    });

    // If user has pages, store the first page's access token
    // (In production, you'd let the user select a page)
    if (pagesData.data && pagesData.data.length > 0) {
      const firstPage = pagesData.data[0];

      response.cookies.set("facebook_page_access_token", firstPage.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 60, // 60 days (page tokens don't expire if derived from long-lived user token)
        path: "/",
      });

      response.cookies.set("facebook_page_id", firstPage.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 60,
        path: "/",
      });
    }

    // Clear the state and return URL cookies
    response.cookies.delete("facebook_oauth_state");
    response.cookies.delete("facebook_return_url");

    return response;
  } catch (error) {
    console.error("Facebook callback error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const response = NextResponse.redirect(getErrorRedirectUrl(errorMessage));
    response.cookies.delete("facebook_return_url");
    return response;
  }
}
