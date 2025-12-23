"use client";

interface Creation {
  id: number;
  image: string;
  tokenId?: number;
}

interface PreviousCreationsProps {
  creations?: Creation[];
}

export default function PreviousCreations({ creations = [] }: PreviousCreationsProps) {
  // xFrora example creations - always show these beautiful examples
  const xFroraExamples = [
    { id: 1, image: "/frora-1.png", tokenId: undefined },
    { id: 2, image: "/frora-2.png", tokenId: undefined },
    { id: 3, image: "/frora-3.png", tokenId: undefined },
    { id: 4, image: "/frora-4.png", tokenId: undefined },
  ];

  const displayCreations = creations.length > 0 ? creations : xFroraExamples;

  return (
    <div className="mt-16 animate-fade-in">
      <h2 className="text-4xl md:text-5xl font-light text-center mb-12 text-gray-900 dark:text-gray-50 tracking-tight">
        {creations.length > 0 ? "Previous Creations" : "Example Creations"}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {displayCreations.map((creation, index) => (
          <div
            key={creation.id || index}
            className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-4 hover:scale-105 cursor-pointer transition-all duration-500 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_18px_60px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_18px_60px_rgb(255,255,255,0.12)]"
          >
            <div className="aspect-square rounded-xl bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 border border-gray-200/50 dark:border-gray-800/50 flex items-center justify-center overflow-hidden">
              {/* xFrora image or real NFT image */}
              {creation.image && (creation.image.startsWith("http") || creation.image.startsWith("ipfs://") || creation.image.startsWith("/")) ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                  src={creation.image}
                  alt={`Creation #${creation.tokenId || creation.id}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to placeholder on error
                    e.currentTarget.style.display = "none";
                    e.currentTarget.parentElement!.innerHTML = '<span class="text-6xl">🎨</span>';
                  }}
                />
                </>
              ) : (
                <span className="text-6xl">{creation.image || "🎨"}</span>
              )}
            </div>

            {creation.tokenId && (
              <div className="mt-3 text-center">
                <p className="text-sm text-black dark:text-white font-semibold">Token #{creation.tokenId}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

