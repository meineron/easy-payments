import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default function HomePage() {
  return <LoginForm />;
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (session?.user?.role === "admin") {
    return { redirect: { destination: "/admin", permanent: false } };
  }
  if (session?.user?.role === "staff") {
    return {
      redirect: {
        destination: session.user.mustChangePassword ? "/set-password" : "/staff/dashboard",
        permanent: false,
      },
    };
  }
  if (session?.user?.role === "club") {
    return { redirect: { destination: "/dashboard", permanent: false } };
  }

  return { props: {} };
}
