import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-expect-error: compiled Express app does not ship type declarations
import app from '../backend/dist/app.js';

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (app as any)(req, res);
}
