// 管理者のアカウントはコーチと共用するので、保護者・子どもには個人名ではなく「スタッフ」と見せる。
// 管理者の画面（user.isAdmin）だけ本当の名前と、書いた人の目印（staff_label）が見える。
// SQL では  case when X.role = 'admin' and not ${viewerIsAdmin}::boolean then 'スタッフ' else X.display_name end  の形で使う。
export const STAFF_NAME = 'スタッフ'
