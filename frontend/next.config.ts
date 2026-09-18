import type { NextConfig } from "next";

/** The API's real origin. Everything except OAuth talks to it directly over
 *  fetch, where the URL is invisible; OAuth is the one flow that navigates the
 *  whole browser, so it is the one that has to be proxied. */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  /* Google sign-in is a full-page navigation, so whatever host serves it is
     the host in the address bar. Sending the browser straight to the API meant
     a Render URL on screen twice — once on the way to Google, once on the way
     back — which reads as a redirect through somewhere unrelated. Proxying the
     two OAuth routes keeps the whole flow on this origin.

     Only these two routes: NEXT_PUBLIC_API_URL stays the real absolute URL
     because the sensor agent runs on the customer's own network and cannot
     resolve a path relative to this app. */
  async rewrites() {
    return [{ source: "/api/auth/google/:path*", destination: `${API}/auth/google/:path*` }];
  },
};

export default nextConfig;
