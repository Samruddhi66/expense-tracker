import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Compass className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-ink-900 dark:text-white">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          The page you are looking for does not exist or has moved.
        </p>
        <Link to="/dashboard" className="btn-primary mt-6 inline-flex">
          <Home className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
