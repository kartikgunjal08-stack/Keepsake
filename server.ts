import crypto from 'crypto';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {createServer as createViteServer} from 'vite';
import {
  creditSingleSitePurchase,
  getAllAdminRecords,
  getGiftBySlug,
  getOrCreateCreator,
  LimitReachedError,
  publishGift,
  unlockUnlimitedPass,
} from './src/db/repository.ts';
import {
  createSupabaseAuthClient,
  getSupabaseAdmin,
  inspectSupabaseHealth,
  SupabaseConfigError,
} from './src/db/supabase.ts';
import {type AuthRequest, requireAuth, requireFounder} from './src/middleware/auth.ts';
import type {GiftConfig} from './src/types/gift.ts';
import {PLAN_PRICES} from './src/utils/merchantConfig.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UTR_PATTERN = /^[a-zA-Z0-9_-]{6,40}$/;

function getRazorpayCredentials(): {keyId: string; keySecret: string} | null {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) return null;
  return {keyId, keySecret};
}

async function verifyRazorpayPaymentStatusAndAmount(
  creds: {keyId: string; keySecret: string},
  paymentId: string,
  requiredPaise: number,
): Promise<void> {
  const authToken = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  const rzpRes = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'GET',
      headers: {Authorization: `Basic ${authToken}`},
    },
  );

  const payJson = (await rzpRes.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    error?: {description?: string};
  };

  if (!rzpRes.ok || !payJson.id) {
    throw new Error(
      payJson?.error?.description ||
        'Could not find this Payment ID in Razorpay. Make sure payment succeeded.',
    );
  }

  if (payJson.status !== 'captured' && payJson.status !== 'authorized') {
    throw new Error(
      `Payment status in Razorpay is "${payJson.status || 'incomplete'}", not paid.`,
    );
  }

  if ((payJson.currency || 'INR') !== 'INR' || Number(payJson.amount || 0) < requiredPaise) {
    throw new Error(
      `Paid amount (₹${Number(payJson.amount || 0) / 100}) is less than required (₹${requiredPaise / 100}).`,
    );
  }
}

function handleRouteError(res: express.Response, error: unknown, fallbackMessage: string) {
  if (error instanceof LimitReachedError) {
    res.status(402).json({error: error.message, code: 'LIMIT_REACHED'});
    return;
  }
  if (error instanceof SupabaseConfigError) {
    res.status(503).json({error: error.message, code: 'SUPABASE_NOT_CONFIGURED'});
    return;
  }
  const msg = error instanceof Error ? error.message : fallbackMessage;
  res.status(500).json({error: msg});
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '8mb'}));

  app.get('/api/health', async (_req, res) => {
    const supabase = await inspectSupabaseHealth();
    const creds = getRazorpayCredentials();
    let razorpayApiOk = false;
    let razorpayMode: 'live' | 'test' | 'unconfigured' = 'unconfigured';

    if (creds) {
      razorpayMode = creds.keyId.startsWith('rzp_live_') ? 'live' : 'test';
      try {
        const authToken = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
        const rzpCheck = await fetch('https://api.razorpay.com/v1/payments?count=1', {
          method: 'GET',
          headers: {Authorization: `Basic ${authToken}`},
        });
        razorpayApiOk = rzpCheck.ok;
      } catch {
        razorpayApiOk = false;
      }
    }

    res.json({
      ok: supabase.configured && supabase.creatorsTableOk && supabase.giftsTableOk,
      supabase,
      razorpayConfigured: Boolean(creds),
      razorpayApiOk,
      razorpayMode,
    });
  });

  app.post('/api/auth/signup', async (req, res) => {
    const body = req.body as {name?: string; email?: string; password?: string};
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim() || email.split('@')[0] || 'Creator';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({error: 'Please enter a valid email address.'});
      return;
    }
    if (password.length < 6) {
      res.status(400).json({error: 'Password must be at least 6 characters long.'});
      return;
    }

    try {
      const admin = getSupabaseAdmin();
      const {data: created, error: createErr} = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {full_name: name.slice(0, 80)},
      });

      if (createErr || !created?.user) {
        const msg = String(createErr?.message || '');
        if (
          msg.toLowerCase().includes('already') ||
          msg.toLowerCase().includes('exists') ||
          msg.toLowerCase().includes('registered')
        ) {
          res.status(409).json({
            error: 'An account with this email already exists. Switch to Sign In instead.',
          });
          return;
        }
        res.status(400).json({error: msg || 'Could not create Keepsake account.'});
        return;
      }

      const authClient = createSupabaseAuthClient();
      const {data: signedIn, error: signInErr} = await authClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr || !signedIn?.session || !signedIn?.user) {
        res.status(500).json({error: signInErr?.message || 'Account created, but sign-in failed.'});
        return;
      }

      const creator = await getOrCreateCreator(signedIn.user.id, email, name);
      res.status(201).json({
        session: {
          accessToken: signedIn.session.access_token,
          refreshToken: signedIn.session.refresh_token,
          expiresAt: (signedIn.session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000,
        },
        user: {
          uid: signedIn.user.id,
          email,
          displayName: name,
          emailVerified: true,
        },
        creator,
      });
    } catch (error) {
      handleRouteError(res, error, 'Could not create Keepsake account.');
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const body = req.body as {email?: string; password?: string};
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
      res.status(400).json({error: 'Enter your email and password.'});
      return;
    }

    try {
      const authClient = createSupabaseAuthClient();
      const {data, error} = await authClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data?.session || !data?.user) {
        res.status(401).json({error: 'Invalid email or password.'});
        return;
      }

      const displayName =
        String(
          data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            email.split('@')[0] ||
            'Creator',
        ).trim();

      const creator = await getOrCreateCreator(data.user.id, email, displayName);
      res.json({
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: (data.session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000,
        },
        user: {
          uid: data.user.id,
          email,
          displayName,
          emailVerified: true,
        },
        creator,
      });
    } catch (error) {
      handleRouteError(res, error, 'Could not sign in right now.');
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = String((req.body as {refreshToken?: string})?.refreshToken || '').trim();
    if (!refreshToken) {
      res.status(400).json({error: 'Missing refresh token.'});
      return;
    }

    try {
      const authClient = createSupabaseAuthClient();
      const {data, error} = await authClient.auth.refreshSession({refresh_token: refreshToken});
      if (error || !data?.session || !data?.user) {
        res.status(401).json({error: 'Session expired. Please sign in again.'});
        return;
      }

      const email = (data.user.email || '').trim();
      const displayName = String(
        data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          email.split('@')[0] ||
          'Creator',
      ).trim();

      res.json({
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: (data.session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000,
        },
        user: {
          uid: data.user.id,
          email,
          displayName,
          emailVerified: Boolean(data.user.email_confirmed_at || data.user.confirmed_at || email),
        },
      });
    } catch (error) {
      handleRouteError(res, error, 'Could not refresh session.');
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({
      user: {
        uid: req.user!.uid,
        email: req.user!.email,
        displayName: req.user!.name,
        emailVerified: req.user!.email_verified,
      },
    });
  });

  app.get('/api/payments/config', (_req, res) => {
    const creds = getRazorpayCredentials();
    res.json({
      razorpayCheckoutEnabled: Boolean(creds),
      keyId: creds ? creds.keyId : null,
    });
  });

  app.post('/api/razorpay/order', requireAuth, async (req: AuthRequest, res) => {
    const creds = getRazorpayCredentials();
    if (!creds) {
      res.status(503).json({
        error: 'Razorpay checkout is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Secrets.',
      });
      return;
    }

    const plan = (req.body as {plan?: string})?.plan;
    if (plan !== 'single9' && plan !== 'unlimited99') {
      res.status(400).json({error: 'Invalid plan selected.'});
      return;
    }

    const amountInr = plan === 'single9' ? PLAN_PRICES.single : PLAN_PRICES.unlimited;
    const amountPaise = amountInr * 100;
    const uid = req.user!.uid;
    const receipt = `ks_${uid.slice(0, 10)}_${Date.now()}`.slice(0, 40);

    try {
      const authToken = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authToken}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt,
          notes: {
            creatorId: uid,
            email: String(req.user!.email || ''),
            plan,
          },
        }),
      });

      const orderJson = (await rzpRes.json().catch(() => ({}))) as {
        id?: string;
        amount?: number;
        currency?: string;
        error?: {description?: string};
      };

      if (!rzpRes.ok || !orderJson.id) {
        const desc = orderJson?.error?.description || 'Could not create Razorpay order.';
        res.status(502).json({error: desc});
        return;
      }

      res.json({
        orderId: orderJson.id,
        amount: orderJson.amount || amountPaise,
        currency: orderJson.currency || 'INR',
        keyId: creds.keyId,
      });
    } catch (error) {
      console.error('Razorpay order creation error:', error);
      res.status(502).json({error: 'Unable to reach Razorpay right now. Please try again.'});
    }
  });

  app.post('/api/razorpay/verify', requireAuth, async (req: AuthRequest, res) => {
    const creds = getRazorpayCredentials();
    if (!creds) {
      res.status(503).json({error: 'Razorpay checkout is not configured yet.'});
      return;
    }

    const body = req.body as {
      plan?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    const plan = body?.plan;
    const orderId = String(body?.razorpay_order_id || '').trim();
    const paymentId = String(body?.razorpay_payment_id || '').trim();
    const signature = String(body?.razorpay_signature || '').trim();

    if (
      (plan !== 'single9' && plan !== 'unlimited99') ||
      !orderId ||
      !paymentId ||
      !signature
    ) {
      res.status(400).json({error: 'Incomplete Razorpay payment verification payload.'});
      return;
    }

    const expectedSig = crypto
      .createHmac('sha256', creds.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');

    if (
      expectedBuf.length === 0 ||
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      res.status(400).json({error: 'Razorpay signature verification failed.'});
      return;
    }

    try {
      const uid = req.user!.uid;
      const email = String(req.user!.email || '');
      const displayName = String(req.user!.name || req.user!.email || 'Creator');

      const creator =
        plan === 'single9'
          ? await creditSingleSitePurchase(uid, email, displayName, paymentId)
          : await unlockUnlimitedPass(uid, email, displayName, paymentId);

      res.json({creator, paymentId});
    } catch (error) {
      handleRouteError(res, error, 'Payment verified, but unlocking account failed.');
    }
  });

  app.post('/api/razorpay/payment-link', requireAuth, async (req: AuthRequest, res) => {
    const creds = getRazorpayCredentials();
    if (!creds) {
      res.status(503).json({
        error: 'Razorpay is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Secrets.',
      });
      return;
    }

    const body = req.body as {plan?: string; origin?: string};
    const plan = body?.plan;
    if (plan !== 'single9' && plan !== 'unlimited99') {
      res.status(400).json({error: 'Invalid plan selected.'});
      return;
    }

    const rawOrigin = String(body?.origin || '').trim();
    const fallbackOrigin = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const safeOrigin = /^https?:\/\/[^/\s]+$/i.test(rawOrigin) ? rawOrigin : fallbackOrigin;
    const planParam = plan === 'unlimited99' ? 'unlimited' : 'single';
    const callbackUrl = `${safeOrigin}/?rzp_plan=${planParam}`;

    const amountInr = plan === 'single9' ? PLAN_PRICES.single : PLAN_PRICES.unlimited;
    const amountPaise = amountInr * 100;
    const uid = req.user!.uid;
    const email = String(req.user!.email || '').trim();
    const name = String(req.user!.name || 'Keepsake Creator').slice(0, 60);
    const referenceId = `ks_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 40);

    try {
      const authToken = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authToken}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          accept_partial: false,
          reference_id: referenceId,
          description:
            plan === 'single9'
              ? `Keepsake 1 Extra Surprise Website (₹${amountInr})`
              : `Keepsake Infinite Websites Pass (₹${amountInr})`,
          customer: {
            name,
            ...(email ? {email} : {}),
          },
          notify: {
            sms: false,
            email: false,
          },
          reminder_enable: false,
          notes: {
            creatorId: uid,
            plan,
          },
          callback_url: callbackUrl,
          callback_method: 'get',
        }),
      });

      const linkJson = (await rzpRes.json().catch(() => ({}))) as {
        id?: string;
        short_url?: string;
        error?: {description?: string};
      };

      if (!rzpRes.ok || !linkJson.short_url) {
        const desc = linkJson?.error?.description || 'Could not create Razorpay payment link.';
        res.status(502).json({error: desc});
        return;
      }

      res.json({
        shortUrl: linkJson.short_url,
        paymentLinkId: linkJson.id,
        referenceId,
      });
    } catch (error) {
      console.error('Razorpay payment link creation error:', error);
      res.status(502).json({error: 'Unable to reach Razorpay right now. Please try again.'});
    }
  });

  app.post('/api/razorpay/verify-link', requireAuth, async (req: AuthRequest, res) => {
    const creds = getRazorpayCredentials();
    if (!creds) {
      res.status(503).json({error: 'Razorpay is not configured yet.'});
      return;
    }

    const body = req.body as {
      plan?: string;
      razorpay_payment_id?: string;
      razorpay_payment_link_id?: string;
      razorpay_payment_link_reference_id?: string;
      razorpay_payment_link_status?: string;
      razorpay_signature?: string;
    };

    const plan = body?.plan;
    const paymentId = String(body?.razorpay_payment_id || '').trim();
    const linkId = String(body?.razorpay_payment_link_id || '').trim();
    const referenceId = String(body?.razorpay_payment_link_reference_id || '').trim();
    const linkStatus = String(body?.razorpay_payment_link_status || '').trim();
    const signature = String(body?.razorpay_signature || '').trim();

    if (
      (plan !== 'single9' && plan !== 'unlimited99') ||
      !paymentId ||
      !linkId ||
      linkStatus !== 'paid' ||
      !signature
    ) {
      res.status(400).json({error: 'Incomplete Razorpay payment link verification payload.'});
      return;
    }

    const expectedSig = crypto
      .createHmac('sha256', creds.keySecret)
      .update(`${linkId}|${referenceId}|${linkStatus}|${paymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');

    if (
      expectedBuf.length === 0 ||
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      res.status(400).json({error: 'Razorpay payment link signature verification failed.'});
      return;
    }

    try {
      const requiredPaise =
        (plan === 'single9' ? PLAN_PRICES.single : PLAN_PRICES.unlimited) * 100;
      await verifyRazorpayPaymentStatusAndAmount(creds, paymentId, requiredPaise);

      const uid = req.user!.uid;
      const email = String(req.user!.email || '');
      const displayName = String(req.user!.name || req.user!.email || 'Creator');

      const creator =
        plan === 'single9'
          ? await creditSingleSitePurchase(uid, email, displayName, paymentId)
          : await unlockUnlimitedPass(uid, email, displayName, paymentId);

      res.json({creator, paymentId});
    } catch (error) {
      handleRouteError(res, error, 'Payment verified, but unlocking account failed.');
    }
  });

  app.get('/api/creator', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = String(req.user!.email || '');
      const displayName = String(req.user!.name || req.user!.email || 'Creator');
      const creator = await getOrCreateCreator(uid, email, displayName);
      res.json({creator});
    } catch (error) {
      handleRouteError(res, error, 'Failed to load creator profile.');
    }
  });

  app.post('/api/creator/purchase-single', requireAuth, async (req: AuthRequest, res) => {
    const utr = String((req.body as {utr?: string})?.utr || '').trim();
    if (!UTR_PATTERN.test(utr)) {
      res.status(400).json({error: 'Valid UTR or Razorpay Payment ID is required.'});
      return;
    }

    try {
      const creds = getRazorpayCredentials();
      if (creds) {
        if (!utr.startsWith('pay_')) {
          res.status(400).json({
            error: 'Enter a valid Razorpay Payment ID starting with pay_ (e.g. pay_Q1a2B3c4D5).',
          });
          return;
        }
        await verifyRazorpayPaymentStatusAndAmount(creds, utr, PLAN_PRICES.single * 100);
      }

      const uid = req.user!.uid;
      const email = String(req.user!.email || '');
      const displayName = String(req.user!.name || req.user!.email || 'Creator');
      const creator = await creditSingleSitePurchase(uid, email, displayName, utr);
      res.json({creator});
    } catch (error) {
      handleRouteError(res, error, 'Failed to credit extra site.');
    }
  });

  app.post('/api/creator/unlock-unlimited', requireAuth, async (req: AuthRequest, res) => {
    const utr = String((req.body as {utr?: string})?.utr || '').trim();
    if (!UTR_PATTERN.test(utr)) {
      res.status(400).json({error: 'Valid UTR or Razorpay Payment ID is required.'});
      return;
    }

    try {
      const creds = getRazorpayCredentials();
      if (creds) {
        if (!utr.startsWith('pay_')) {
          res.status(400).json({
            error: 'Enter a valid Razorpay Payment ID starting with pay_ (e.g. pay_Q1a2B3c4D5).',
          });
          return;
        }
        await verifyRazorpayPaymentStatusAndAmount(creds, utr, PLAN_PRICES.unlimited * 100);
      }

      const uid = req.user!.uid;
      const email = String(req.user!.email || '');
      const displayName = String(req.user!.name || req.user!.email || 'Creator');
      const creator = await unlockUnlimitedPass(uid, email, displayName, utr);
      res.json({creator});
    } catch (error) {
      handleRouteError(res, error, 'Failed to unlock Infinite Pass.');
    }
  });

  app.post('/api/gifts', requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as {
      gift?: GiftConfig;
      preferredSlug?: string;
    };

    if (!body || !body.gift || typeof body.gift !== 'object') {
      res.status(400).json({error: 'Invalid gift payload.'});
      return;
    }

    try {
      const uid = req.user!.uid;
      const email = String(req.user!.email || '');
      const displayName = String(req.user!.name || req.user!.email || 'Creator');
      const result = await publishGift(uid, email, displayName, body.gift, body.preferredSlug);
      res.status(201).json(result);
    } catch (error) {
      handleRouteError(res, error, 'Failed to publish surprise website.');
    }
  });

  app.get('/api/gifts/:slug', async (req, res) => {
    try {
      const gift = await getGiftBySlug(req.params.slug);
      if (!gift) {
        res.status(404).json({error: 'Surprise link not found.'});
        return;
      }
      res.json({gift});
    } catch (error) {
      handleRouteError(res, error, 'Failed to load surprise website.');
    }
  });

  app.get('/api/admin/records', requireAuth, requireFounder, async (_req: AuthRequest, res) => {
    try {
      const data = await getAllAdminRecords();
      res.json(data);
    } catch (error) {
      handleRouteError(res, error, 'Failed to load admin records.');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Keepsake server running on http://0.0.0.0:${port}`);
  });
}

startServer();
