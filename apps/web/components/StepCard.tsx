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
  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return "border-green-500/50 bg-green-500/10 dark:border-green-400/40 dark:bg-green-500/15";
      case "completed":
        return "border-blue-500/50 bg-blue-500/10 dark:border-blue-400/40 dark:bg-blue-500/15";
      default:
        return "border-white/20 bg-white/5 dark:border-white/10 dark:bg-white/10";
    }
  };

  const renderIcon = () => {
    switch (icon) {
      case "x":
        return (
          <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center mx-auto mb-4 dark:bg-purple-500">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
        );
      case "wallet":
        return (
          <div className="w-16 h-16 rounded-full bg-teal-500 flex items-center justify-center mx-auto mb-4 dark:bg-teal-400">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="6" width="18" height="14" rx="2" />
              <path d="M3 10h18" />
              <circle cx="17" cy="14" r="1" fill="currentColor" />
            </svg>
          </div>
        );
      case "nft":
        return (
          <div className="w-16 h-16 rounded-full bg-teal-500 flex items-center justify-center mx-auto mb-4 dark:bg-teal-400">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className={`card ${getStatusColor()} transition-all duration-300`}>
      {/* Icon */}
      {renderIcon()}

      {/* Title */}
      <h3 className="text-xl font-bold text-center mb-2 text-gray-800 dark:text-slate-100">{title}</h3>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-sm text-gray-600 text-center mb-4 dark:text-slate-300">{subtitle}</p>
      )}

      {/* Status */}
      {statusText && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-500 text-green-700 px-3 py-1 rounded-full text-xs font-medium dark:bg-green-500/15 dark:border-green-400/40 dark:text-green-300">
            <span>{statusText}</span>
          </div>
        </div>
      )}

      {/* Action Button */}
      {actionButton && <div className="mt-4">{actionButton}</div>}

      {/* Children */}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

