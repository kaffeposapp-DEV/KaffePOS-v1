export function buildPasswordResetLink(input: {
  webBaseUrl: string;
  email: string;
  token: string;
}) {
  const url = new URL('/reset-password', input.webBaseUrl);
  url.searchParams.set('mode', 'reset');
  url.searchParams.set('email', input.email);
  url.searchParams.set('token', input.token);
  return url.toString();
}

