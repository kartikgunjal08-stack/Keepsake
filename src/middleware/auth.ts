import type {NextFunction, Request, Response} from 'express';
import {getSupabaseAdmin} from '../db/supabase.ts';

export const FOUNDER_ADMIN_EMAIL = 'kartikgunjal08@gmail.com';

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  email_verified: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({error: 'Unauthorized: Missing token'});
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({error: 'Unauthorized: Missing token'});
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const {data, error} = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({error: 'Session expired. Please sign in again.'});
      return;
    }

    const email = (data.user.email || '').trim();
    const emailVerified = Boolean(
      data.user.email_confirmed_at || data.user.confirmed_at || email,
    );
    const metaName =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined) ||
      '';
    const name = metaName.trim() || email.split('@')[0] || 'Creator';

    req.user = {
      uid: data.user.id,
      email,
      name,
      email_verified: emailVerified,
    };
    next();
  } catch (error) {
    console.error('Error verifying Supabase access token:', error);
    res.status(401).json({error: 'Unauthorized: Invalid token'});
  }
};

export const requireFounder = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const email = (req.user?.email || '').toLowerCase();
  if (!req.user?.email_verified || email !== FOUNDER_ADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({error: 'Forbidden: Founder access required.'});
    return;
  }
  next();
};
