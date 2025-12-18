"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CallbackHandler() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the state parameter which contains our MCP OAuth params
        const stateParam = searchParams.get("state");

        if (!stateParam) {
          throw new Error("Missing state parameter");
        }

        // Decode the MCP OAuth params from state
        let mcpParams;
        try {
          mcpParams = JSON.parse(atob(stateParam));
        } catch {
          throw new Error("Invalid state parameter");
        }

        const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = mcpParams;

        if (!redirect_uri) {
          throw new Error("Missing redirect_uri in state");
        }

        // Check if there's an error from Supabase Auth
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
          const errorUrl = new URL(redirect_uri);
          errorUrl.searchParams.set("error", error);
          if (errorDescription) {
            errorUrl.searchParams.set("error_description", errorDescription);
          }
          if (state) {
            errorUrl.searchParams.set("state", state);
          }
          window.location.href = errorUrl.toString();
          return;
        }

        // Get the access token from the URL hash (Supabase returns it in the fragment)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");

        if (!accessToken) {
          throw new Error("No access token received from authentication");
        }

        // Generate an authorization code
        // In a real implementation, you would:
        // 1. Store this code in a database with the associated user and PKCE params
        // 2. Set an expiration time (typically 10 minutes)
        // For now, we'll encode the access token as the code (simplified)
        const authCode = btoa(JSON.stringify({
          access_token: accessToken,
          client_id: client_id,
          code_challenge: code_challenge,
          code_challenge_method: code_challenge_method,
          created_at: Date.now(),
        }));

        // Redirect back to the MCP client with the authorization code
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set("code", authCode);
        if (state) {
          redirectUrl.searchParams.set("state", state);
        }

        setStatus("success");

        // Small delay to show success message before redirect
        setTimeout(() => {
          window.location.href = redirectUrl.toString();
        }, 500);

      } catch (err) {
        console.error("Callback error:", err);
        setErrorMessage(err instanceof Error ? err.message : "Unknown error occurred");
        setStatus("error");
      }
    };

    handleCallback();
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Completing authorization...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">✕</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Authorization Failed</h1>
          <p className="text-gray-600">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-10 max-w-md w-full text-center">
        <div className="text-green-500 text-4xl mb-4">✓</div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Authorization Successful</h1>
        <p className="text-gray-600">Redirecting back to application...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
