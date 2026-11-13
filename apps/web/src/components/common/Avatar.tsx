import React, { useState } from 'react';

interface AvatarProps {
  seed?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isSpeaking?: boolean;
  isMuted?: boolean;
  role?: 'OWNER' | 'MODERATOR' | 'SPEAKER' | 'AUDIENCE';
  className?: string;
}

const COLORS = [
  'from-orange-500 to-red-600',
  'from-amber-400 to-orange-600',
  'from-red-500 to-rose-700',
  'from-yellow-400 to-amber-600',
  'from-purple-500 to-pink-600',
  'from-emerald-400 to-teal-600',
  'from-blue-500 to-indigo-600',
  'from-pink-500 to-rose-600',
];

export const Avatar: React.FC<AvatarProps> = ({
  seed = '',
  name = 'Guest',
  size = 'md',
  isSpeaking = false,
  isMuted = false,
  role = 'AUDIENCE',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  // Hash seed for consistent color
  const hash = (seed || name).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorClass = COLORS[Math.abs(hash) % COLORS.length];

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-2xl',
  };

  const emojiSizeClasses = {
    sm: 'text-sm',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-5xl',
  };

  const initial = (name || 'G').trim().charAt(0).toUpperCase();

  const isImage =
    !imgError &&
    seed &&
    (seed.startsWith('data:image/') ||
      seed.startsWith('http://') ||
      seed.startsWith('https://') ||
      seed.startsWith('/'));

  const isEmoji = seed && seed.startsWith('emoji:');
  const emojiChar = isEmoji ? seed.slice(6) : null;

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <div
        className={`
          ${sizeClasses[size]}
          rounded-full bg-gradient-to-br ${colorClass}
          flex items-center justify-center font-extrabold text-white shadow-md select-none overflow-hidden
          transition-all duration-300
          ${isSpeaking ? 'ring-4 ring-green-400 animate-pulse' : ''}
          ${role === 'OWNER' ? 'border-2 border-accent' : ''}
          ${role === 'SPEAKER' && !isSpeaking ? 'ring-2 ring-primary' : ''}
        `}
      >
        {isImage ? (
          <img
            src={seed}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : isEmoji ? (
          <span className={`${emojiSizeClasses[size]} leading-none`}>{emojiChar}</span>
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {/* Role badge */}
      {role === 'OWNER' && (
        <span
          className="absolute -top-1 -right-1 text-xs bg-accent text-bg-base rounded-full p-0.5 shadow font-bold"
          title="Chủ phòng"
        >
          👑
        </span>
      )}
      {role === 'SPEAKER' && (
        <span
          className="absolute -bottom-1 -right-1 text-xs bg-primary text-white rounded-full p-0.5 shadow font-bold"
          title="Đang trên sân khấu"
        >
          🎤
        </span>
      )}
      {isMuted && (
        <span
          className="absolute -bottom-1 -left-1 text-xs bg-danger text-white rounded-full p-0.5 shadow"
          title="Bị tắt mic"
        >
          🔇
        </span>
      )}
    </div>
  );
};

export default Avatar;
