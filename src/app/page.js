import { useRouter } from "next/router"; // migrated
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role === "admin") {
    redirect("/admin");
  }
  if (session?.user?.role === "staff") {
    redirect(session.user.mustChangePassword ? "/set-password" : "/staff/dashboard");
  }
  if (session?.user?.role === "club") {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
