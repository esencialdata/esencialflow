import type { VercelRequest, VercelResponse } from '@vercel/node';
const app = require('../backend/dist/app.js').default;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (app as any)(req, res);
}
