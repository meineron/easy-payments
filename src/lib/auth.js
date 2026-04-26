import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";
import ClubUser from "@/models/ClubUser";
import User from "@/models/User";
import Membership from "@/models/Membership";

// Resolve which clubId is "active" for a User. Preference order:
//   1. The user's persisted `lastActiveClubId` (if it's still an active membership)
//   2. The first active membership found (sorted by creation desc)
//   3. null (user has no active memberships → /select-club shows pending invites or My Clubs)
async function resolveActiveClubId(user, memberships) {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) return null;

  if (user.lastActiveClubId) {
    const last = active.find(
      (m) => String(m.clubId) === String(user.lastActiveClubId),
    );
    if (last) return String(last.clubId);
  }
  return String(active[0].clubId);
}

// Loads memberships + a parallel club-name lookup, returns shape used in JWT/session.
// Memberships whose underlying Club has been deactivated are filtered out so
// they never appear in the switcher and can't be resolved as `activeClubId`.
async function loadMembershipsForUser(userId) {
  const memberships = await Membership.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
  if (memberships.length === 0) return [];
  const clubIds = memberships.map((m) => m.clubId);
  // NOTE: do NOT include logoUrl here — it lands inside the JWT cookie and
  // some clubs store base64 data-URIs as logos which inflates the cookie past
  // Node's 16 KB header limit (HTTP 431). The switcher falls back to initials
  // and can fetch logos via /api/club/profile when needed.
  const clubs = await Club.find({ _id: { $in: clubIds } })
    .select("name language status")
    .lean();
  const clubById = Object.fromEntries(clubs.map((c) => [String(c._id), c]));
  return memberships
    .filter((m) => {
      const club = clubById[String(m.clubId)];
      return club && club.status !== "deactivated";
    })
    .map((m) => ({
      clubId: String(m.clubId),
      clubName: clubById[String(m.clubId)]?.name || "",
      role: m.mainRole,
      customRoleLabel: m.customRoleLabel || "",
      status: m.status,
    }));
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { username, password } = credentials;
        if (!username || !password) return null;
        const usernameLc = username.toLowerCase().trim();

        // 1. Platform admin (env-based) — unchanged from before.
        if (
          username === process.env.ADMIN_USERNAME &&
          password === process.env.ADMIN_PASSWORD
        ) {
          return {
            id: "admin",
            name: "Admin",
            role: "admin",
          };
        }

        await dbConnect();

        // 2. Unified User login (preferred path going forward). Lookup by
        //    username OR email so existing club admins (whose `User` row was
        //    seeded from `Club.username`) and email-invited staff both work.
        const user = await User.findOne({
          $or: [{ username: usernameLc }, { email: usernameLc }],
        });

        if (user && user.status !== "disabled") {
          let valid = false;
          if (user.password) {
            valid = await bcrypt.compare(password, user.password);
          }
          if (!valid && user.temporaryPassword) {
            valid = await bcrypt.compare(password, user.temporaryPassword);
          }
          if (valid) {
            const memberships = await loadMembershipsForUser(user._id);
            const activeClubId = await resolveActiveClubId(user, memberships);
            const activeMembership = memberships.find(
              (m) => m.clubId === activeClubId,
            );

            const club = activeClubId
              ? await Club.findById(activeClubId)
                  .select("stripeAccountId onboardingComplete hasDirectStripeAccess name")
                  .lean()
              : null;

            return {
              // Backwards-compat: `id` is the active clubId so existing routes
              // (`clubId: session.user.id`) keep working unchanged.
              id: activeClubId || String(user._id),
              name: club?.name || `${user.firstName} ${user.lastName}`.trim() || user.username,
              role: user.isPlatformAdmin ? "admin" : (activeClubId ? "club" : "user"),
              // New fields:
              userId: String(user._id),
              username: user.username,
              activeClubId,
              memberships,
              membershipRole: activeMembership?.role || null,
              mustChangePassword: !!user.mustChangePassword,
              isPlatformAdmin: !!user.isPlatformAdmin,
              // Stripe context for the active club (kept for backwards compat
              // with the existing dashboard banner / stripe routes).
              stripeAccountId: club?.stripeAccountId || null,
              onboardingComplete: !!club?.onboardingComplete,
              hasDirectStripeAccess: !!club?.hasDirectStripeAccess,
            };
          }
        }

        // 3. Legacy Club credential provider — kept enabled until every existing
        //    Club has been seeded into the User collection. Once seeded, this
        //    branch is unreachable in practice (those usernames will resolve
        //    via path 2 above) and can be removed.
        const club = await Club.findOne({ username: usernameLc });
        if (club && club.status === "deactivated") {
          return null;
        }
        if (club && club.password) {
          const isValid = await bcrypt.compare(password, club.password);
          if (isValid) {
            return {
              id: club._id.toString(),
              name: club.name,
              username: club.username,
              role: "club",
              userId: club._id.toString(),
              activeClubId: club._id.toString(),
              memberships: [{
                clubId: club._id.toString(),
                clubName: club.name,
                role: "owner",
                status: "active",
              }],
              membershipRole: "owner",
              mustChangePassword: false,
              isPlatformAdmin: false,
              stripeAccountId: club.stripeAccountId,
              onboardingComplete: club.onboardingComplete,
              hasDirectStripeAccess: club.hasDirectStripeAccess,
              isLegacyClubLogin: true,
            };
          }
        }

        // 4. Legacy ClubUser staff credential provider — kept until staff
        //    migration runs (Phase 2). Only honors users that have NOT yet
        //    been migrated to a `User` row.
        const staffUser = await ClubUser.findOne({
          email: usernameLc,
          status: { $in: ["invited", "active"] },
        });
        if (staffUser) {
          // Block login if the parent club has been deactivated.
          const parentClub = await Club.findById(staffUser.clubId).select("status").lean();
          if (parentClub?.status === "deactivated") {
            return null;
          }
          let passwordValid = false;
          if (staffUser.password) {
            passwordValid = await bcrypt.compare(password, staffUser.password);
          }
          if (!passwordValid && staffUser.temporaryPassword) {
            passwordValid = await bcrypt.compare(password, staffUser.temporaryPassword);
          }
          if (passwordValid) {
            return {
              id: staffUser._id.toString(),
              name: `${staffUser.firstName} ${staffUser.lastName}`,
              role: "staff",
              userId: staffUser._id.toString(),
              activeClubId: staffUser.clubId.toString(),
              clubId: staffUser.clubId.toString(),
              memberships: [{
                clubId: staffUser.clubId.toString(),
                clubName: "",
                role: staffUser.mainRole,
                status: staffUser.status,
              }],
              membershipRole: staffUser.mainRole === "custom" ? staffUser.customRoleLabel : staffUser.mainRole,
              mustChangePassword: staffUser.mustChangePassword,
              isPlatformAdmin: false,
              isLegacyStaffLogin: true,
            };
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    // The `update()` API on the client invokes `jwt` again with `trigger: "update"`
    // and the data passed to `update()` available on the `session` argument here.
    // This is how the club-switcher dropdown refreshes the JWT after switching.
    async jwt({ token, user, trigger, session: updateData }) {
      // Defensive: existing tokens may carry `clubLogoUrl` (base64 data-URIs)
      // that bloated the cookie past Node's 16 KB header limit. Strip on every
      // pass so old cookies self-heal without forcing a re-login.
      if (Array.isArray(token.memberships)) {
        for (const m of token.memberships) {
          if (m && "clubLogoUrl" in m) delete m.clubLogoUrl;
        }
      }

      if (user) {
        token.role = user.role;
        token.userId = user.userId || user.id;
        token.username = user.username || null;
        token.activeClubId = user.activeClubId || null;
        token.memberships = user.memberships || [];
        token.membershipRole = user.membershipRole || null;
        token.mustChangePassword = !!user.mustChangePassword;
        token.isPlatformAdmin = !!user.isPlatformAdmin;
        token.stripeAccountId = user.stripeAccountId || null;
        token.onboardingComplete = !!user.onboardingComplete;
        token.hasDirectStripeAccess = !!user.hasDirectStripeAccess;
        // Backwards-compat alias for routes / pages that still read `token.id`.
        token.id = user.id;
        token.name = user.name;
      }

      // Handle session.update({ activeClubId: "..." }) coming from /api/auth/switch-club
      // or any client-side switcher.
      if (trigger === "update" && updateData?.activeClubId && token.userId) {
        const targetClubId = String(updateData.activeClubId);
        const membership = (token.memberships || []).find(
          (m) => m.clubId === targetClubId && m.status === "active",
        );
        if (membership) {
          token.activeClubId = targetClubId;
          token.id = targetClubId;
          token.membershipRole = membership.role;

          // Refresh stripe/club fields for the new active club.
          await dbConnect();
          const club = await Club.findById(targetClubId)
            .select("stripeAccountId onboardingComplete hasDirectStripeAccess name")
            .lean();
          token.stripeAccountId = club?.stripeAccountId || null;
          token.onboardingComplete = !!club?.onboardingComplete;
          token.hasDirectStripeAccess = !!club?.hasDirectStripeAccess;
          token.name = club?.name || token.name;

          await User.findByIdAndUpdate(token.userId, {
            lastActiveClubId: targetClubId,
          });
        }
      }

      // Refresh memberships/onboarding state on every request for "club" tokens
      // (cheap; existing code did this for `onboardingComplete` already). Also
      // drop deactivated clubs from `token.memberships` so a soft-deleted club
      // disappears from the switcher mid-session without forcing a re-login.
      if (token.role === "club" && token.userId) {
        if (!user && trigger !== "update") {
          await dbConnect();
          if (Array.isArray(token.memberships) && token.memberships.length > 0) {
            const ids = token.memberships.map((m) => m.clubId);
            const clubs = await Club.find({ _id: { $in: ids } })
              .select("_id status")
              .lean();
            const activeIds = new Set(
              clubs.filter((c) => c.status !== "deactivated").map((c) => String(c._id)),
            );
            if (activeIds.size !== token.memberships.length) {
              token.memberships = token.memberships.filter((m) => activeIds.has(m.clubId));
              if (token.activeClubId && !activeIds.has(String(token.activeClubId))) {
                // The currently-active club was just deactivated. Pick another
                // active membership if any, otherwise clear the context.
                const fallback = token.memberships[0];
                token.activeClubId = fallback ? fallback.clubId : null;
                token.id = token.activeClubId || token.userId;
                token.membershipRole = fallback?.role || null;
              }
            }
          }
          if (token.activeClubId && !token.onboardingComplete) {
            const club = await Club.findById(token.activeClubId)
              .select("onboardingComplete stripeAccountId hasDirectStripeAccess")
              .lean();
            if (club) {
              token.onboardingComplete = !!club.onboardingComplete;
              token.stripeAccountId = club.stripeAccountId || null;
              token.hasDirectStripeAccess = !!club.hasDirectStripeAccess;
            }
          }
        }
      }

      if (token.role === "staff" && token.mustChangePassword) {
        await dbConnect();
        const su = await ClubUser.findById(token.userId).select("mustChangePassword").lean();
        if (su) token.mustChangePassword = su.mustChangePassword;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.id = token.id || token.userId;
      session.user.userId = token.userId;
      session.user.username = token.username;
      session.user.activeClubId = token.activeClubId;
      session.user.memberships = token.memberships || [];
      session.user.membershipRole = token.membershipRole;
      session.user.mustChangePassword = !!token.mustChangePassword;
      session.user.isPlatformAdmin = !!token.isPlatformAdmin;
      session.user.stripeAccountId = token.stripeAccountId || null;
      session.user.onboardingComplete = !!token.onboardingComplete;
      session.user.hasDirectStripeAccess = !!token.hasDirectStripeAccess;
      // Legacy fields for routes that still check role === "staff"
      if (token.role === "staff") {
        session.user.clubId = token.activeClubId;
        session.user.staffRole = token.membershipRole;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
