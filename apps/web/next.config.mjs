/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // `next build` dan `next dev` menulis ke direktori berbeda.
  // Tanpa ini, menjalankan build saat dev server hidup akan mengoyak chunk
  // dev-nya dan memunculkan "Cannot find module './557.js'" di setiap rute.
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',

  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' }];
  },
};
export default nextConfig;
