'use client';

// Rainbow-colored Defog logo
// Colors match the progress bar rainbow (red to green)

interface DefogLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Same colors as ProgressBar rainbow (red -> orange -> yellow -> green)
const RAINBOW_COLORS = [
  '#ff3366', // D - Red
  '#ff8800', // e - Orange
  '#ffcc00', // f - Yellow
  '#77ee33', // o - Light green
  '#00ff88', // g - Brand green
];

export function DefogLogo({ size = 'md', className = '' }: DefogLogoProps) {
  const letters = ['D', 'e', 'f', 'o', 'g'];

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <span className={`font-bold tracking-tight ${sizeClasses[size]} ${className}`}>
      {letters.map((letter, index) => (
        <span
          key={index}
          style={{ color: RAINBOW_COLORS[index] }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
