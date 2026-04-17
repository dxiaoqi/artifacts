/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_MODEL_NAME: process.env.ARTIFACTS_LLM_MODEL || 'gemini-2.5-flash',
  },
  // Allow longer API routes for streaming
  experimental: {
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig
