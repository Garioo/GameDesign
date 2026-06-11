"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!window.location.hash.includes("access_token=")) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/home");
    });
  }, [router]);

  return null;
}
