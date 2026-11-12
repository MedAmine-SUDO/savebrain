import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import { SetupScreen } from "./components/SetupScreen";
import { SignInScreen } from "./components/SignInScreen";
import { Frame } from "./components/AppIcon";
import { consumeConnectLink, getConfig, supabaseFor, type Config } from "./lib/config";
import "./index.css";

consumeConnectLink();
const cfg = getConfig();

// No project yet → setup. Project but no session → sign in. Otherwise → the app.
function Root() {
  return cfg ? <SessionGate cfg={cfg} /> : <SetupScreen />;
}
function SessionGate({ cfg }: { cfg: Config }) {
  const sb = supabaseFor(cfg);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);
  if (session === undefined) return <Frame status="Loading…"><p className="text-sm text-[var(--muted)]">Loading your second brain…</p></Frame>;
  if (!session) return <SignInScreen sb={sb} />;
  return <App key={session.user.id} sb={sb} cfg={cfg} user={session.user} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
