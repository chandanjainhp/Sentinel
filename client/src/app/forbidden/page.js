import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface text-text-primary px-4">
      <div className="max-w-md w-full bg-surface-2 border border-border rounded-lg p-8 shadow-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
        </div>
        
        <h1 className="text-2xl font-semibold text-center mb-2 font-jetbrains tracking-tight">Access Denied</h1>
        <p className="text-text-secondary text-center mb-8 text-sm">
          You do not have permission to view this page. If you believe this is an error, please contact your platform administrator.
        </p>

        <div className="flex flex-col gap-3">
          <Link 
            href="/incidents"
            className="w-full text-center bg-accent text-white py-2 px-4 rounded font-medium text-sm transition-colors hover:bg-accent-hover"
          >
            Return to Dashboard
          </Link>
          <a 
            href="mailto:support@sentinel.io?subject=Access Request"
            className="w-full text-center bg-transparent text-text-secondary py-2 px-4 rounded font-medium text-sm transition-colors border border-border hover:bg-surface-3 hover:text-text-primary"
          >
            Request Access
          </a>
        </div>
      </div>
    </div>
  );
}
