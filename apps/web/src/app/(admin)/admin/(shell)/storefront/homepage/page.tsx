import { redirect } from 'next/navigation';

/** Homepage block editor removed — layout is fixed in code / seeded config. */
export default function AdminHomepageRedirectPage() {
  redirect('/admin');
}
