# ADP auth is only the browser's existing session

Both clients call ADP with same-origin `credentials: 'include'` requests and nothing else: no stored passwords, no copied cookies, no MFA automation, no relay server. ADP offers no refresh token to employees and its cookies are session-scoped, so background Sync only works while the user is signed in to Workforce Now in that browser; when the ADP Session is dead we ask for one normal sign-in instead of trying to stay logged in.
