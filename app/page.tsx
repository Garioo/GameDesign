import Link from "next/link";

export default function HomePage() {
  return (
    <main className="screen">
      <h1>Game Design System</h1>
      <p>The team's living game design documents.</p>
      <Link href="/login">Sign in →</Link>
    </main>
  );
}
