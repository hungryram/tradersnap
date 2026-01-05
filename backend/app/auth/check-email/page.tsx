export default function CheckEmailPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl mb-4">📧</div>
        <h1 className="text-3xl font-bold">Check Your Email</h1>
        <p className="text-slate-400">
          We've sent you a magic link. Click the link in your email to sign in.
        </p>
        <p className="text-sm text-slate-500">
          You can close this window and return to the extension once you've clicked the link.
        </p>
      </div>
    </div>
  )
}
