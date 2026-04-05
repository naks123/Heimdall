import type { NextConfig } from 'next';

const nextConfig: import('next').NextConfig = {
  // Add env variables to the client
  env: {
    NEXT_PUBLIC_APP_ID: process.env.NEXT_PUBLIC_APP_ID!,
  },
  images: {
    domains: ['static.usernames.app-backend.toolsforhumanity.com'],
  },
  experimental: {},
  allowedDevOrigins: ['localhost:3000', '*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io'],
  reactStrictMode: false,
};

export default nextConfig;
