import type { VercelRequest, VercelResponse } from '@vercel/node';
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
