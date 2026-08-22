/** Single source of truth for "does this user have Premium right now". */
export function isPremium(user: any) {
  if (!user) return false;
  const now = Date.now();
  if (user.plan === "premium") return true;
  if (user.trialEndsAt && new Date(user.trialEndsAt).getTime() > now) return true;
  if (user.premiumUntil && new Date(user.premiumUntil).getTime() > now) return true;
  return false;
}

export function trialDaysLeft(user: any) {
  if (!user?.trialEndsAt) return 0;
  const ms = new Date(user.trialEndsAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}
