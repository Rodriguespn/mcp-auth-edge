"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConsentForm() {
  const searchParams = useSearchParams();

  const clientId = searchParams.get("client_id") || "Unknown Client";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";
  const codeChallenge = searchParams.get("code_challenge") || "";
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "";

  const handleSubmit = (action: "allow" | "deny") => {
    if (action === "deny") {
      // Redirect back with error
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set("error", "access_denied");
      errorUrl.searchParams.set("error_description", "User denied the request");
      if (state) errorUrl.searchParams.set("state", state);
      window.location.href = errorUrl.toString();
      return;
    }

    // For "allow", redirect to Google OAuth via Supabase Auth
    // Store the MCP OAuth params in state so we can retrieve them after Google auth
    const mcpOAuthState = btoa(
      JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
      })
    );

    const authUrl = new URL(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize`
    );
    authUrl.searchParams.set("provider", "google");
    // After Google auth, redirect back to our callback page
    authUrl.searchParams.set(
      "redirect_to",
      `${window.location.origin}/oauth/callback`
    );
    // Pass MCP OAuth params encoded in state
    authUrl.searchParams.set("state", mcpOAuthState);

    window.location.href = authUrl.toString();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-5">
      <div className="bg-white rounded-xl shadow-lg p-10 max-w-md w-full">
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">
          Authorize Application
        </h1>
        <p className="text-gray-600 mb-6 break-all">{clientId}</p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-sm text-gray-600 mb-3">
            This application will be able to:
          </h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-gray-800">
              <span className="text-green-500 font-bold">✓</span>
              Access your account information
            </li>
            <li className="flex items-center gap-2 text-gray-800">
              <span className="text-green-500 font-bold">✓</span>
              Use MCP tools on your behalf
            </li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleSubmit("deny")}
            className="flex-1 py-3 px-6 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => handleSubmit("allow")}
            className="flex-1 py-3 px-6 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      }
    >
      <ConsentForm />
    </Suspense>
  );
}
