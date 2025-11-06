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
  // Frora example creations - always show these beautiful examples
  const froraExamples = [
    { id: 1, image: "/frora-1.png", tokenId: undefined },
    { id: 2, image: "/frora-2.png", tokenId: undefined },
    { id: 3, image: "/frora-3.png", tokenId: undefined },
    { id: 4, image: "/frora-4.png", tokenId: undefined },
  ];

  const displayCreations = creations.length > 0 ? creations : froraExamples;

  return (
    <div className="mt-16 animate-fade-in">
      <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
        {creations.length > 0 ? "Previous Creations" : "Example Creations"}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {displayCreations.map((creation, index) => (
          <div
            key={creation.id || index}
            className="card hover:scale-105 cursor-pointer transition-all duration-300"
          >
            <div className="aspect-square rounded-lg bg-gradient-to-br from-purple-900 to-blue-900 flex items-center justify-center overflow-hidden">
              {/* Frora image or real NFT image */}
              {creation.image && (creation.image.startsWith("http") || creation.image.startsWith("ipfs://") || creation.image.startsWith("/")) ? (
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
              ) : (
                <span className="text-6xl">{creation.image || "🎨"}</span>
              )}
            </div>

            {creation.tokenId && (
              <div className="mt-3 text-center">
                <p className="text-sm text-gray-700 font-semibold">Token #{creation.tokenId}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

