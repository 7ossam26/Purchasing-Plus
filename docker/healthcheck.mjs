import process from 'node:process';

try {
  const { ok } = await globalThis.fetch(
    `http://127.0.0.1:${process.env.PORT || 3000}/api/health`,
    { signal: globalThis.AbortSignal.timeout(4_000) },
  );
  process.exitCode = ok ? 0 : 1;
} catch {
  process.exitCode = 1;
}
