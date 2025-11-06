"use client";

interface HeroProps {
  xUser?: {
    x_user_id: string;
    username: string;
    profile_image_url: string;
    bio?: string;
  } | null;
}

export default function Hero({ xUser }: HeroProps) {
  return (
    <div className="relative text-center py-8 px-4 animate-fade-in">
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 max-w-6xl mx-auto">
        {/* Left: Text Content */}
        <div className="flex-1 text-left">
          {/* Logo */}
          <div className="mb-6 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <span className="text-2xl">🐱</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Aura Creatures</h1>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-800">
            Connect & Create Your
            <br />
            Digital Avatar
          </h2>
          
          <p className="text-lg text-gray-600 max-w-md">
            Link your X profile, generate a unique AI creature, and mint on Base.
          </p>
        </div>
        
        {/* Right: Creature Image / X Profile Picture */}
        <div className="flex-1 flex justify-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80">
            {xUser ? (
              // X Profile Picture
              <>
                <div className="w-full h-full rounded-full bg-gradient-to-br from-purple-200 via-blue-200 to-teal-200 flex items-center justify-center overflow-hidden ring-4 ring-purple-300">
                  <img
                    src={xUser.profile_image_url}
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

