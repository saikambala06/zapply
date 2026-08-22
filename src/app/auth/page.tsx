import { Suspense } from "react";
import AuthForm from "@/components/marketing/AuthForm";

export const metadata = { title: "Sign in" };

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
