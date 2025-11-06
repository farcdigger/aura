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
          {/* Logo */}
          <div className="mb-6 flex items-center gap-3">
            <img 
              src="/frora-logo.png" 
              alt="XFRORA Logo" 
              className="w-12 h-12 rounded-full object-cover"
            />
            <h1 className="text-3xl font-bold text-gray-800 uppercase">XFRORA</h1>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-800">
            Connect & Create Your
            <br />
            Digital Avatar
          </h2>
          
          <p className="text-lg text-gray-600 max-w-md">
            Link your X profile, generate a unique AI creature, and mint on Base.
          </p>
          <p className="text-sm text-gray-500 mt-3">
            Max supply is fixed at 5,555 xFrora NFTs—mint yours before they’re gone.
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl">
            <div className="bg-white/80 border border-teal-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Minted</p>
              <p className="text-2xl font-bold text-gray-800">
                {loadingStats && !mintStats ? "…" : mintedCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/80 border border-purple-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Remaining</p>
              <p className="text-2xl font-bold text-gray-800">
                {loadingStats && !mintStats ? "…" : remainingCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/80 border border-blue-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Supply</p>
              <p className="text-2xl font-bold text-gray-800">
                {maxSupply.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-6 max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Mint Progress</p>
              <p className="text-xs text-gray-500">
                {loadingStats && !mintStats ? "…" : `${progressPercent.toFixed(1)}%`}
              </p>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 via-blue-500 to-purple-600 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
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
                <div className="w-full h-full rounded-full bg-gradient-to-br from-purple-200 via-blue-200 to-teal-200 flex items-center justify-center overflow-hidden ring-4 ring-purple-300">
                  <img
                    src={xUser.profile_image_url.replace('_normal', '_400x400')}
                    alt={`@${xUser.username}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Decorative badge */}
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg border-2 border-purple-400">
                  <p className="text-sm font-bold text-gray-800">@{xUser.username}</p>
                </div>
              </>
            ) : (
              // Default Fox Placeholder
              <>
                <div className="w-full h-full rounded-full bg-gradient-to-br from-purple-200 via-blue-200 to-teal-200 flex items-center justify-center">
                  <span className="text-9xl">🦊</span>
                </div>
              </>
            )}
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-teal-400 rounded-full opacity-70 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

