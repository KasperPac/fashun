export default function ConfirmPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-4xl mb-4">📬</div>
        <h1 className="text-2xl font-black text-white mb-2">Check your email</h1>
        <p className="text-zinc-400 text-sm">
          We sent a confirmation link to your email address. Click it to activate your account, then{' '}
          <a href="/login" className="text-purple-400 hover:underline">log in here</a>.
        </p>
      </div>
    </div>
  )
}
