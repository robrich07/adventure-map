import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthState = {
    session: Session | null;
    loading: boolean;
};

// subscribes to supabase auth state changes and returns current session
// session is persisted via expo-secure-store so users stay logged in when app restarts
export function useAuth(): AuthState {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log('[Auth] session loaded:', session ? session.user.email : 'none');
            setSession(session);
            setLoading(false);
        });

        // subscribe to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log('[Auth] state changed:', event, session?.user?.email ?? 'signed out');
                setSession(session);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    return { session, loading };
}