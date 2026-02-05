/** @type {import('next').NextConfig} */
const nextConfig = {
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-App-Version', value: require('./package.json').version },
      ],
    },
  ],
};

module.exports = nextConfig;
