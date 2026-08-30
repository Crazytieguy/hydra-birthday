export const invitePath = (token: string) => `/invite/${token}`

export const inviteUrl = (token: string) =>
  `${window.location.origin}${invitePath(token)}`
