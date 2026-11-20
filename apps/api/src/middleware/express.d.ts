import type { Viewer } from './access.js';
declare global {
  namespace Express {
    interface Request {
      viewer: Viewer;
    }
  }
}
