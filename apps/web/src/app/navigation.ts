import { useNavigate } from 'react-router';

export function loginPath(returnTo: string) {
  return '/login?' + new URLSearchParams({ returnTo });
}
export function safeReturnTo(value: string | null) {
  if (
    !value?.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    return '/';
  const url = new URL(value, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.pathname.startsWith('//') ||
    /^\/login\/?$/i.test(url.pathname)
  )
    return '/';
  return url.pathname + url.search + url.hash;
}
export function useBack() {
  const navigate = useNavigate();
  return () => {
    if (window.history.state?.idx > 0) void navigate(-1);
    else void navigate('/', { replace: true });
  };
}
