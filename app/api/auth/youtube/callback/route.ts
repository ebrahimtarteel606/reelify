import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/youtube/callback`
);

export async function GET(request: NextRequest) {
  // Helper to get the redirect URL with auth params
  const getRedirectUrl = (authParam: string) => {
    const storedReturnUrl = request.cookies.get('youtube_return_url')?.value;
    console.log('youtube_return_url cookie value:', storedReturnUrl);
    
    if (storedReturnUrl) {
      try {
        // Decode the stored return URL (it was encoded when stored) and append auth param
        const decodedUrl = decodeURIComponent(storedReturnUrl);
        console.log('Decoded return URL:', decodedUrl);
        const returnUrl = new URL(decodedUrl);
        returnUrl.searchParams.set('auth_success', 'youtube');
        // Remove auth_error if present
        returnUrl.searchParams.delete('auth_error');
        const finalUrl = returnUrl.toString();
        console.log('Final redirect URL:', finalUrl);
        return finalUrl;
      } catch (e) {
        console.error('Failed to parse return URL:', e, 'Raw value:', storedReturnUrl);
      }
    }
    
    // Fallback to /editor with auth param
    console.log('Using fallback redirect URL');
    return new URL(`/editor?${authParam}`, request.url).toString();
  };

  const getErrorRedirectUrl = (error: string) => {
    const storedReturnUrl = request.cookies.get('youtube_return_url')?.value;
    
    if (storedReturnUrl) {
      try {
        const decodedUrl = decodeURIComponent(storedReturnUrl);
        const returnUrl = new URL(decodedUrl);
        returnUrl.searchParams.set('auth_error', error);
        returnUrl.searchParams.delete('auth_success');
        return returnUrl.toString();
      } catch (e) {
        console.error('Failed to parse return URL for error redirect:', e);
      }
    }
    
    return new URL(`/editor?auth_error=${encodeURIComponent(error)}`, request.url).toString();
  };

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('YouTube OAuth error:', error);
      const response = NextResponse.redirect(getErrorRedirectUrl(error));
      response.cookies.delete('youtube_return_url');
      return response;
    }

    // Verify state to prevent CSRF
    const storedState = request.cookies.get('youtube_oauth_state')?.value;
    if (!state || state !== storedState) {
      console.error('State mismatch:', { state, storedState });
      const response = NextResponse.redirect(getErrorRedirectUrl('state_mismatch'));
      response.cookies.delete('youtube_return_url');
      return response;
    }

    if (!code) {
      const response = NextResponse.redirect(getErrorRedirectUrl('no_code'));
      response.cookies.delete('youtube_return_url');
      return response;
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      const response = NextResponse.redirect(getErrorRedirectUrl('no_access_token'));
      response.cookies.delete('youtube_return_url');
      return response;
    }

    // Create redirect response - use the stored return URL
    const response = NextResponse.redirect(getRedirectUrl('auth_success=youtube'));

    // Store tokens in httpOnly cookies
    response.cookies.set('youtube_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expiry_date 
        ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
        : 3600, // Default 1 hour
      path: '/',
    });

    if (tokens.refresh_token) {
      response.cookies.set('youtube_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }

    // Clear the state and return URL cookies
    response.cookies.delete('youtube_oauth_state');
    response.cookies.delete('youtube_return_url');

    return response;
  } catch (error) {
    console.error('YouTube callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response = NextResponse.redirect(getErrorRedirectUrl(errorMessage));
    response.cookies.delete('youtube_return_url');
    return response;
  }
}
