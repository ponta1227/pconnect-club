import { appManifest, manifestResponse } from '@/lib/manifest'

export function GET() {
  return manifestResponse(appManifest('/'))
}
