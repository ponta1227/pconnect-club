import type { MetadataRoute } from 'next'

/**
 * ホーム画面に追加したときのアプリ情報。
 * 招待リンクの画面では start_url をその招待リンクにする（iPhoneはホーム画面のアプリとSafariでログイン状態が別なので、
 * 追加したアイコンから開いたときに、そのまま招待の続きから登録できるようにする）。
 */
export function appManifest(startUrl = '/'): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'P-CONNECT Jr.',
    short_name: 'P-CONNECT Jr.',
    description: 'P-CONNECT Jr. のクラブ連絡アプリ',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#1c4fa0',
    lang: 'ja',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

export function manifestResponse(m: MetadataRoute.Manifest) {
  return new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } })
}
