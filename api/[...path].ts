import type { VercelRequest, VercelResponse } from '@vercel/node';

// The compiled backend is CommonJS and may expose the Express app on `.default`
// or directly on the module exports depending on bundling.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const importedApp = require('../backend/dist/app.js');
const app = importedApp.default ?? importedApp;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (app as any)(req, res);
}
