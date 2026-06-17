import React from "react";

interface HealthBarProps {
  health: number;
  maxHealth: number;
}

export default function HealthBar({ health, maxHealth }: HealthBarProps) {
  const pct = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : 0;
  const modifier =
    pct >= 75 ? "high" : pct >= 50 ? "medium" : pct >= 25 ? "low" : "critical";

  return (
    <div className="health-bar">
      <div className="health-bar__track">
        <div
          className={`health-bar__fill health-bar__fill--${modifier}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="health-bar__label">
        {health}&nbsp;/&nbsp;{maxHealth}
      </span>
    </div>
  );
}
