import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";
import ClubUser from "@/models/ClubUser";

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

        // Check admin credentials first
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

        // Check club credentials
        const club = await Club.findOne({ username: username.toLowerCase() });
        if (club) {
          const isValid = await bcrypt.compare(password, club.password);
          if (!isValid) return null;
          return {
            id: club._id.toString(),
            name: club.name,
            username: club.username,
            role: "club",
            stripeAccountId: club.stripeAccountId,
            onboardingComplete: club.onboardingComplete,
            hasDirectStripeAccess: club.hasDirectStripeAccess,
          };
        }

        // Check staff (ClubUser) credentials by email
        const staffUser = await ClubUser.findOne({
          email: username.toLowerCase(),
          status: { $in: ["invited", "active"] },
        });
        if (!staffUser) return null;

        let passwordValid = false;
        if (staffUser.password) {
          passwordValid = await bcrypt.compare(password, staffUser.password);
        }
        if (!passwordValid && staffUser.temporaryPassword) {
          passwordValid = await bcrypt.compare(password, staffUser.temporaryPassword);
        }
        if (!passwordValid) return null;

        return {
          id: staffUser._id.toString(),
          name: `${staffUser.firstName} ${staffUser.lastName}`,
          role: "staff",
          clubId: staffUser.clubId.toString(),
          mustChangePassword: staffUser.mustChangePassword,
          staffRole: staffUser.mainRole === "custom" ? staffUser.customRoleLabel : staffUser.mainRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.userId = user.id;
        if (user.role === "club") {
          token.username = user.username;
          token.stripeAccountId = user.stripeAccountId;
          token.onboardingComplete = user.onboardingComplete;
          token.hasDirectStripeAccess = user.hasDirectStripeAccess;
        }
        if (user.role === "staff") {
          token.clubId = user.clubId;
          token.mustChangePassword = user.mustChangePassword;
          token.staffRole = user.staffRole;
        }
      }

      if (token.role === "club" && !token.onboardingComplete) {
        await dbConnect();
        const club = await Club.findById(token.userId).select("onboardingComplete stripeAccountId hasDirectStripeAccess");
        if (club) {
          token.onboardingComplete = club.onboardingComplete;
          token.stripeAccountId = club.stripeAccountId;
          token.hasDirectStripeAccess = club.hasDirectStripeAccess;
        }
      }

      if (token.role === "staff" && token.mustChangePassword) {
        await dbConnect();
        const su = await ClubUser.findById(token.userId).select("mustChangePassword");
        if (su) token.mustChangePassword = su.mustChangePassword;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.id = token.userId;
      if (token.role === "club") {
        session.user.username = token.username;
        session.user.stripeAccountId = token.stripeAccountId;
        session.user.onboardingComplete = token.onboardingComplete;
        session.user.hasDirectStripeAccess = token.hasDirectStripeAccess;
      }
      if (token.role === "staff") {
        session.user.clubId = token.clubId;
        session.user.mustChangePassword = token.mustChangePassword;
        session.user.staffRole = token.staffRole;
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
