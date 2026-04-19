/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_MODEL_NAME: process.env.ARTIFACTS_LLM_MODEL || 'gemini-2.5-flash',
    // Set ARTIFACTS_DEBUG=true in .env.local to show the JSON export button.
    NEXT_PUBLIC_DEBUG: process.env.ARTIFACTS_DEBUG || '',
  },
  // Allow longer API routes for streaming
  experimental: {
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig
