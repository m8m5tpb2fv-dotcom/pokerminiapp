const SUIT_SYMBOLS: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
const RED_SUITS = new Set(['h', 'd']);

export function Card({ code }: { code: string }) {
  const rank = code.slice(0, -1);
  const suit = code.slice(-1);
  const isRed = RED_SUITS.has(suit);
  return (
    <div className={`card ${isRed ? 'card-red' : 'card-black'}`}>
      <span>{rank}</span>
      <span>{SUIT_SYMBOLS[suit] ?? suit}</span>
    </div>
  );
}

export function CardBack() {
  return <div className="card card-back" />;
}
