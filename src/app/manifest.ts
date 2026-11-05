import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'P-CONNECT Jr.',
    short_name: 'P-CONNECT Jr.',
    description: 'P-CONNECT Jr. のクラブ連絡アプリ',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#1e6fd9',
    lang: 'ja',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
