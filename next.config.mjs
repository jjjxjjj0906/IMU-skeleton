/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true
  },
  // Mac Safari compatibility optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  // Optimize for Mac Safari
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Optimize for Mac Safari
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false
      }
    }
    return config
  },
  // Headers for better Mac compatibility
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          }
        ]
      }
    ]
  }
}

export default nextConfig


