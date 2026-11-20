import { randomBytes } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';
import type { PrismaClient } from '@prisma/client';
import type { Request } from 'express';

import type { AppEnv } from '../../config/env.js';
import { digest, idle, sessionId } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import { writeAudit } from '../access/audit.js';
import { accessTransaction, type Tx } from '../access/repo.js';
const dummyHash = hash(randomBytes(32));
export const invalidLogin = () =>
  new AppError(
    401,
    'INVALID_CREDENTIALS',
    'اسم المستخدم أو كلمة المرور غير صحيحة',
  );
export async function logIn(
  req: Request,
  input: { username: string; password: string },
) {
  const env: AppEnv = req.app.locals.env;
  const db: PrismaClient = req.app.locals.db;
  // Verify the expensive hash before acquiring the access-control write lock.
  const candidate = await db.user.findUnique({
    where: { username: input.username },
    select: { id: true, passwordHash: true },
  });
  const verified = await verify(
    candidate?.passwordHash ?? (await dummyHash),
    input.password,
  );
  return accessTransaction(db, true, async (tx) => {
    const user = await tx.user.findUnique({
      where: { username: input.username },
    });
    const matches =
      verified &&
      !!candidate &&
      user?.id === candidate.id &&
      user.passwordHash === candidate.passwordHash;
    const now = Date.now(),
      locked = !!user?.lockedUntil && user.lockedUntil.getTime() > now;
    const audit = (action: string) =>
      writeAudit(
        tx,
        env.AUDIT_HMAC_SECRET,
        req.ip ?? null,
        user,
        action,
        'User',
        user?.id ?? null,
        null,
        { username: input.username },
      );
    if (!matches || !user?.isActive || locked) {
      await audit('login.failed');
      if (user?.isActive && !locked) {
        const failures = (user.lockedUntil ? 0 : user.failedAttempts) + 1;
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: failures,
            lockedUntil: failures >= 5 ? new Date(now + 900000) : null,
          },
        });
        if (failures >= 5) await audit('login.lockout');
      }
      return null;
    }
    const token = randomBytes(32).toString('hex');
    await tx.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(now),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    await tx.session.create({
      data: {
        id: digest(env.SESSION_SECRET, token),
        userId: user.id,
        expiresAt: new Date(now + idle),
      },
    });
    await audit('login');
    return token;
  });
}
export async function logout(tx: Tx, req: Request) {
  await tx.session.delete({
    where: { id: sessionId(req, req.app.locals.env.SESSION_SECRET) },
  });
}
export async function changeOwnPassword(
  tx: Tx,
  id: number,
  old: string,
  password: string,
) {
  const u = await tx.user.findUniqueOrThrow({ where: { id } });
  if (!(await verify(u.passwordHash, old))) throw invalidLogin();
  await tx.user.update({
    where: { id },
    data: { passwordHash: await hash(password), sessions: { deleteMany: {} } },
  });
}

export async function profile(tx: Tx, id: number) {
  const { role, sites, ...user } = await tx.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      role: { select: { id: true, name: true } },
      sites: { select: { site: true }, orderBy: { siteId: 'asc' } },
    },
  });
  return {
    user,
    roleName: role?.name ?? null,
    roleId: role?.id ?? null,
    sites: sites.map((s) => s.site),
  };
}
