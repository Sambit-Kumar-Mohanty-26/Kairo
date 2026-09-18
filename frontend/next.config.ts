import type { NextConfig } from "next";

/* Deliberately bare. Google sign-in used to be proxied through here so the
   API's hostname stayed out of the address bar; both of its visible legs are
   route handlers in this app now (app/api/auth/google/*), so there is nothing
   left to rewrite. Everything else reaches the API over fetch, where the URL
   is never on screen. */
const nextConfig: NextConfig = {};

export default nextConfig;
