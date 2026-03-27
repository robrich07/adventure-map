import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from './supabase';


// Signs up a new user with email and password.
// Creates a profile row after successful signup.
export async function signUp(email: string, password: string, username: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };
  if (!data.user) return { error: 'Signup failed — no user returned' };

  // Create profile row linked to the new user
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: data.user.id,
      username,
      email,
    });

  if (profileError) return { error: profileError.message };

  return { error: null };
}

// Signs in an existing user with email and password.
export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { error: null };
}

// Signs the current user out and clears the local session.
export async function signOut(): Promise<void> {
  console.log('[Auth] signing out');
  await supabase.auth.signOut();
}

WebBrowser.maybeCompleteAuthSession();

// initiates google OAuth sign in via device browser
// uses PKCE flow for security
export async function singInWithGoogle(): Promise<{ error: string | null }> {
    const redirectUrl = AuthSession.makeRedirectUri();


    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
        },
    });

    if (error) return { error: error.message };
    if (!data.url) return { error: 'No OAuth URL returned' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);


    if (result.type === 'success') {
        const { url } = result;
        
        // Check if URL contains access_token directly (implicit flow)
        // or a code (PKCE flow)
        if (url.includes('access_token')) {
            // Parse the fragment and set session directly
            const params = new URLSearchParams(url.split('#')[1]);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            
            if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            }
        } else {
            await supabase.auth.exchangeCodeForSession(url);
        }
        }

    return { error: null };
}