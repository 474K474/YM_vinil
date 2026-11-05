type Props = {
  cover: string | null;
  size: number;
  spinning?: boolean;
  className?: string;
};

/** Сама пластинка: бороздки, блик и «яблоко» с обложкой в центре. */
export function Vinyl({ cover, size, spinning, className }: Props) {
  return (
    <div
      className={`vinyl ${spinning ? "spinning" : ""} ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className="vinyl-label"
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      />
      <div className="vinyl-hole" />
      <div className="vinyl-sheen" />
    </div>
  );
}
