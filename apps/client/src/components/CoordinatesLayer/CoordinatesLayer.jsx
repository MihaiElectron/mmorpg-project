import { useState, useEffect } from "react";

export default function CoordinatesLayer() {
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    const id = setInterval(() => {
      const player = window.game?.scene?.getScene("WorldScene")?.player;
      if (!player) return;
      setCoords({ x: Math.round(player.x), y: Math.round(player.y) });
    }, 100);

    return () => clearInterval(id);
  }, []);

  if (!coords) return null;

  return (
    <div className="coords-layer">
      <span className="coords-layer__text">X&nbsp;{coords.x}</span>
      <span className="coords-layer__text">Y&nbsp;{coords.y}</span>
    </div>
  );
}
