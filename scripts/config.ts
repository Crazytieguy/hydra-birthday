// Where this app lives. The wizard provisions against these; the invite
// script prints links for them.
export const PROJECT = 'hydra-birthday'
export const GITHUB_REPO = 'Crazytieguy/hydra-birthday'
export const VERCEL_SCOPE = 'crazytieguys-projects'
export const APEX = 'code-bloom.app'
export const DOMAIN = `${PROJECT}.${APEX}`
export const CONVEX_TEAM_ID = 131507
// Also hardcoded in package.json's `dev` script.
export const DEV_PORT = 3000

export const siteOrigin = (prod: boolean) =>
  prod ? `https://${DOMAIN}` : `http://localhost:${DEV_PORT}`
