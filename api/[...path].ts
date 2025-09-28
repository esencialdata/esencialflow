import type { VercelRequest, VercelResponse } from '@vercel/node';

type ExpressCompatHandler = (req: VercelRequest, res: VercelResponse) => unknown;

let cachedApp: ExpressCompatHandler | null = null;

const loadApp = async (): Promise<ExpressCompatHandler> => {
  if (cachedApp) {
    return cachedApp;
  }
  // @ts-expect-error: compiled backend bundle does not ship type declarations
  const mod = await import('../backend/dist/app.js');
  const resolved = (mod as any).default?.default ?? (mod as any).default ?? mod;
  if (typeof resolved !== 'function') {
    throw new TypeError('backend/dist/app.js did not export an Express app function');
  }
  cachedApp = resolved as ExpressCompatHandler;
  return cachedApp;
};

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Debug log to trace routing issues
  console.log(`[API handler] path=${req.url}`);
  const app = await loadApp();
  return app(req, res);
}
