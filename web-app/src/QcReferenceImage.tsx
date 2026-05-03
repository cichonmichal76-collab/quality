import type { MouseEventHandler, Ref } from "react";

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
  activeAreaId?: string | null;
  draftArea?: QcReferenceOverlayArea | null;
  caption?: string | null;
  helperText?: string | null;
  interactive?: boolean;
  stageRef?: Ref<HTMLDivElement>;
  onStageMouseDown?: MouseEventHandler<HTMLDivElement>;
  onStageMouseMove?: MouseEventHandler<HTMLDivElement>;
  onStageMouseUp?: MouseEventHandler<HTMLDivElement>;
}

export function QcReferenceImage({
  imageUrl,
  imageAlt,
  areas = [],
  activeAreaId,
  draftArea,
  caption,
  helperText,
  interactive = false,
  stageRef,
  onStageMouseDown,
  onStageMouseMove,
  onStageMouseUp,
}: QcReferenceImageProps) {
  return (
    <div className="qc-reference-inline">
      <div
        ref={stageRef}
        className={`qc-reference-stage${interactive ? " is-interactive" : ""}`}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        data-testid="qc-reference-stage"
      >
        <img className="qc-reference-image" src={imageUrl} alt={imageAlt} draggable={false} />
        {areas.length > 0 || draftArea ? (
          <div className="qc-reference-overlay" aria-hidden="true">
            {areas.map((area) => (
              <div
                key={area.id}
                className={`qc-reference-region${activeAreaId === area.id ? " is-active" : ""}`}
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
            {draftArea ? (
              <div
                className="qc-reference-region is-draft"
                style={{
                  left: `${draftArea.x}%`,
                  top: `${draftArea.y}%`,
                  width: `${draftArea.width}%`,
                  height: `${draftArea.height}%`,
                }}
                title={draftArea.title}
              >
                <span className="qc-reference-region-label">{draftArea.label}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {helperText ? <p className="qc-reference-helper">{helperText}</p> : null}
      {caption ? <p className="details-subtitle">{caption}</p> : null}
    </div>
  );
}
