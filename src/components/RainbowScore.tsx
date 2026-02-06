'use client';

interface RainbowScoreProps {
  score: number;
  maxScore?: number;
}

export default function RainbowScore({ score, maxScore = 10 }: RainbowScoreProps) {
  const normalizedScore = Math.min(Math.max(0, score), maxScore);
  const dots = Array.from({ length: maxScore }, (_, i) => i + 1);

  return (
    <div className="rainbow-score" title={`Score: ${score}`}>
      {dots.map((dotNum) => (
        <div
          key={dotNum}
          className={`rainbow-dot ${dotNum <= normalizedScore ? `active score-${dotNum}` : ''}`}
        />
      ))}
      <span className="ml-2 text-xs font-semibold text-[var(--text-secondary)]">
        {score}
      </span>
    </div>
  );
}
