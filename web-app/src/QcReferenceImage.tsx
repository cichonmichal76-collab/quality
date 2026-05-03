export interface QcReferenceOverlayArea {
  id: string;
  label: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface QcReferenceImageProps {
  imageUrl: string;
  imageAlt: string;
  areas?: QcReferenceOverlayArea[];
  caption?: string | null;
}

export function QcReferenceImage({
  imageUrl,
  imageAlt,
  areas = [],
  caption,
}: QcReferenceImageProps) {
  return (
    <div className="qc-reference-inline">
      <div className="qc-reference-stage">
        <img className="qc-reference-image" src={imageUrl} alt={imageAlt} />
        {areas.length > 0 ? (
          <div className="qc-reference-overlay" aria-hidden="true">
            {areas.map((area) => (
              <div
                key={area.id}
                className="qc-reference-region"
                style={{
                  left: `${area.x}%`,
                  top: `${area.y}%`,
                  width: `${area.width}%`,
                  height: `${area.height}%`,
                }}
                title={area.title}
              >
                <span className="qc-reference-region-label">{area.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {caption ? <p className="details-subtitle">{caption}</p> : null}
    </div>
  );
}
