import type { MetadataRoute } from 'next'

// クラブ内だけのアプリなので、検索エンジンには一切巡回させない
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
