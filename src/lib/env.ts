// 環境変数の読み出し。未設定でもビルドは通るようにし、使う時点で検査する。
export const env = {
  appUrl: () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  isProd: () => process.env.NODE_ENV === 'production',
  lineChannelId: () => process.env.LINE_CHANNEL_ID ?? '',
  lineChannelSecret: () => process.env.LINE_CHANNEL_SECRET ?? '',
  setupSecret: () => process.env.SETUP_SECRET ?? '',
  vapidPublic: () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  vapidPrivate: () => process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: () => process.env.VAPID_SUBJECT ?? 'mailto:noreply@club.pconnect.jp',
  resendKey: () => process.env.RESEND_API_KEY ?? '',
  mailFrom: () => process.env.MAIL_FROM ?? 'P-CONNECT Jr. <noreply@club.pconnect.jp>',
  supabaseUrl: () => process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  storageBucket: () => process.env.STORAGE_BUCKET ?? 'club-files',
  cronSecret: () => process.env.CRON_SECRET ?? '',
  // 開発用ログイン。本番ビルドでは常に無効。
  devLoginEnabled: () => process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === '1',
}
