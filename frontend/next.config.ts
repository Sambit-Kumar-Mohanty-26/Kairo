import type { NextConfig } from "next";

/** The API's real origin. Everything except OAuth talks to it directly over
 *  fetch, where the URL is invisible; OAuth is the one flow that navigates the
 *  whole browser, so it is the one that has to be proxied. */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  /* Google sign-in is a full-page navigation, so whatever host serves it is
     the host in the address bar. Only the callback is proxied: the outbound leg
     is a route handler in this app (app/api/auth/google/start), because it needs
     nothing but a public client_id and bouncing off Render to build it showed
     Render's cold-start page on our own domain. The callback does need the API —
     that is where the client secret and the session live.

     NEXT_PUBLIC_API_URL stays the real absolute URL everywhere else: the sensor
     agent runs on the customer's own network and cannot resolve a path relative
     to this app. */
  async rewrites() {
    return [
      { source: "/api/auth/google/callback", destination: `${API}/auth/google/callback` },
    ];
  },
};

export default nextConfig;
