declare module '../backend/dist/app.js' {
  import type { RequestHandler } from 'express';
  const app: RequestHandler;
  export default app;
}
