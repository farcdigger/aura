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
    <div className="relative text-center py-8 px-4 animate-fade-in">
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 max-w-6xl mx-auto">
        {/* Left: Text Content */}
        <div className="flex-1 text-left">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-black dark:text-white">
            Connect & Create Your
            <br />
            Digital Avatar
          </h2>
          
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md">
            Link your X profile, spin up a unique AI creature, and mint your xFrora on Base with the
            help of secure x402 payments. Each mint costs 5&nbsp;USDC and happens in two quick wallet confirmations.
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-3">
            Max supply is fixed at 5,555 xFrora NFTs—mint yours before they’re gone.
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl">
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Minted</p>
              <p className="text-2xl font-bold text-black dark:text-white">
                {loadingStats && !mintStats ? "…" : mintedCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Remaining</p>
              <p className="text-2xl font-bold text-black dark:text-white">
                {loadingStats && !mintStats ? "…" : remainingCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Supply</p>
              <p className="text-2xl font-bold text-black dark:text-white">
                {maxSupply.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-6 max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-black dark:text-white">Mint Progress</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {loadingStats && !mintStats ? "…" : `${progressPercent.toFixed(1)}%`}
              </p>
            </div>
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-black dark:bg-white transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              {loadingStats && !mintStats
                ? "Loading supply data…"
                : `${mintedCount.toLocaleString()} of ${maxSupply.toLocaleString()} xFrora NFTs minted`}
            </p>
          </div>
        </div>
        
        {/* Right: Creature Image / X Profile Picture */}
        <div className="flex-1 flex justify-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80">
            {xUser ? (
              // X Profile Picture
              <>
                <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-900 border-4 border-black dark:border-white flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={xUser.profile_image_url.replace('_normal', '_400x400')}
                    alt={`@${xUser.username}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Decorative badge */}
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-white dark:bg-black px-4 py-2 rounded-full shadow-lg border-2 border-black dark:border-white">
                  <p className="text-sm font-bold text-black dark:text-white">@{xUser.username}</p>
                </div>
              </>
            ) : (
              // Default Fox Placeholder
              <>
                <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-900 border-4 border-black dark:border-white flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/frora-logo.png"
                    alt="xFrora Logo"
                    className="w-48 h-48 object-cover rounded-full shadow-lg"
                  />
                </div>
              </>
            )}
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-400 dark:bg-yellow-600 rounded-full opacity-50 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

