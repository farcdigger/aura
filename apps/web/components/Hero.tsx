"use client";

interface HeroProps {
  xUser?: {
    x_user_id: string;
    username: string;
    profile_image_url: string;
    bio?: string;
  } | null;
  mintStats?: {
    minted: number;
    remaining: number;
    maxSupply: number;
  } | null;
  loadingStats?: boolean;
}

export default function Hero({ xUser, mintStats, loadingStats }: HeroProps) {
  const mintedCount = mintStats?.minted ?? 0;
  const remainingCount = mintStats?.remaining ?? 5555;
  const maxSupply = mintStats?.maxSupply ?? 5555;
  const progressPercent =
    maxSupply > 0 ? Math.min(Math.max((mintedCount / maxSupply) * 100, 0), 100) : 0;

  return (
    <section className="relative overflow-hidden py-12 md:py-16 lg:py-20 mb-16">
      {/* Bulutsu Arka Plan */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gray-200/30 dark:bg-gray-800/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-slate-200/30 dark:bg-slate-800/20 rounded-full blur-3xl" />
      </div>

      <div className="relative flex flex-col md:flex-row items-center justify-center gap-12 max-w-6xl mx-auto">
        {/* Left: Text Content */}
        <div className="flex-1 text-left">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-gray-900 dark:text-gray-50 mb-6 leading-tight tracking-tight">
            Connect & Create Your
            <br />
            <span className="font-normal text-gray-700 dark:text-gray-300">Digital Avatar</span>
          </h2>
          
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-md mb-4 leading-relaxed font-light">
            Link your X profile, spin up a unique AI creature, and mint your xFrora on Base with the
            help of secure x402 payments.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-8">
            Max supply is fixed at 5,555 xFrora NFTs—mint yours before they're gone.
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 max-w-xl mb-8">
            {[
              { label: "Minted", value: mintedCount },
              { label: "Remaining", value: remainingCount },
              { label: "Total Supply", value: maxSupply },
            ].map((stat, idx) => (
              <div 
                key={idx}
                className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-6 text-center shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]"
              >
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 font-medium">
                  {stat.label}
                </p>
                <p className="text-2xl md:text-3xl font-light text-gray-900 dark:text-gray-50">
                  {loadingStats && !mintStats ? "…" : stat.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="max-w-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mint Progress</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {loadingStats && !mintStats ? "…" : `${progressPercent.toFixed(1)}%`}
              </p>
            </div>
            <div className="relative h-3 bg-gray-200/50 dark:bg-gray-800/50 rounded-full overflow-hidden shadow-inner">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 dark:from-gray-300 dark:via-gray-400 dark:to-gray-300 transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {loadingStats && !mintStats
                ? "Loading supply data…"
                : `${mintedCount.toLocaleString()} of ${maxSupply.toLocaleString()} xFrora NFTs minted`}
            </p>
          </div>
        </div>
        
        {/* Right: Avatar Image */}
        <div className="flex-1 flex justify-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80">
            {xUser ? (
              <div className="relative">
                <div className="absolute inset-0 bg-gray-200/30 dark:bg-gray-800/20 rounded-full blur-2xl" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800 border-4 border-gray-300/50 dark:border-gray-700/50 flex items-center justify-center overflow-hidden shadow-[0_15px_50px_rgb(0,0,0,0.15)] dark:shadow-[0_15px_50px_rgb(255,255,255,0.10)]">
                  <img
                    src={xUser.profile_image_url.replace('_normal', '_400x400')}
                    alt={`@${xUser.username}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl px-4 py-2 rounded-xl shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] border border-gray-200/50 dark:border-gray-800/50">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">@{xUser.username}</p>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-gray-200/30 dark:bg-gray-800/20 rounded-full blur-2xl" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800 border-4 border-gray-300/50 dark:border-gray-700/50 flex items-center justify-center overflow-hidden shadow-[0_15px_50px_rgb(0,0,0,0.15)] dark:shadow-[0_15px_50px_rgb(255,255,255,0.10)]">
                  <img
                    src="/frora-logo.png"
                    alt="xFrora Logo"
                    className="w-3/4 h-3/4 object-cover rounded-full"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
