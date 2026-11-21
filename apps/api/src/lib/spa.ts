import { basename, dirname, extname, resolve } from 'node:path';

import express, { Router } from 'express';

const viteAsset = /-[\w-]{8,}\.[a-z\d]+$/i;

export function serveSpa(webRoot: string) {
  const router = Router();
  const assets = resolve(webRoot, 'assets');
  const index = resolve(webRoot, 'index.html');

  router.use(
    express.static(webRoot, {
      cacheControl: false,
      redirect: false,
      setHeaders(res, file) {
        const hashed =
          dirname(file) === assets && viteAsset.test(basename(file));
        res.setHeader(
          'Cache-Control',
          hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  router.get('/{*path}', (req, res, next) => {
    if (extname(req.path) || !req.accepts('html')) return next();
    res
      .set('Cache-Control', 'no-cache')
      .sendFile(index, { cacheControl: false });
  });
  return router;
}
