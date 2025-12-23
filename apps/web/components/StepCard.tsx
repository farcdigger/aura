"use client";

interface StepCardProps {
  icon: "x" | "wallet" | "nft";
  title: string;
  subtitle?: string;
  status?: "idle" | "connected" | "completed";
  statusText?: string;
  actionButton?: React.ReactNode;
  children?: React.ReactNode;
}

export default function StepCard({
  icon,
  title,
  subtitle,
  status = "idle",
  statusText,
  actionButton,
  children,
}: StepCardProps) {
  const getStatusStyles = () => {
    switch (status) {
      case "connected":
        return "border-green-300/50 dark:border-green-700/50 bg-green-50/30 dark:bg-green-900/10";
      case "completed":
        return "border-blue-300/50 dark:border-blue-700/50 bg-blue-50/30 dark:bg-blue-900/10";
      default:
        return "border-gray-200/50 dark:border-gray-800/50 bg-white/60 dark:bg-gray-900/60";
    }
  };

  const renderIcon = () => {
    const iconClasses = "w-16 h-16 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center mb-6";
    
    switch (icon) {
      case "x":
        return (
          <div className={iconClasses}>
            <svg className="w-8 h-8 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
        );
      case "wallet":
        return (
          <div className={iconClasses}>
            <svg className="w-8 h-8 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="18" height="14" rx="2" />
              <path d="M3 10h18" />
              <circle cx="17" cy="14" r="1" fill="currentColor" />
            </svg>
          </div>
        );
      case "nft":
        return (
          <div className={iconClasses}>
            <svg className="w-8 h-8 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className={`bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-2 rounded-2xl p-8 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_18px_60px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_18px_60px_rgb(255,255,255,0.12)] transition-all duration-500 ${getStatusStyles()}`}>
      {/* Icon */}
      {renderIcon()}

      {/* Title */}
      <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-3 text-center">
        {title}
      </h3>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-sm text-gray-600 text-center mb-4 dark:text-gray-400">
          {subtitle}
        </p>
      )}

      {/* Status */}
      {statusText && (
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-2 bg-green-100/50 dark:bg-green-900/30 border border-green-300/50 dark:border-green-700/50 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-medium">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span>{statusText}</span>
          </div>
        </div>
      )}

      {/* Action Button */}
      {actionButton && <div className="mt-6">{actionButton}</div>}

      {/* Children */}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
