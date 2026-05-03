import type { MouseEvent as ReactMouseEvent, MouseEventHandler, Ref } from "react";

export interface QcReferenceOverlayArea {
  id: string;
  label: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QcReferenceResizeHandle = "nw" | "ne" | "sw" | "se";

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
  onAreaMouseDown?: (areaId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onResizeHandleMouseDown?: (
    areaId: string,
    handle: QcReferenceResizeHandle,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
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
  onAreaMouseDown,
  onResizeHandleMouseDown,
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
                className={`qc-reference-region${activeAreaId === area.id ? " is-active is-editable" : ""}`}
                style={{
                  left: `${area.x}%`,
                  top: `${area.y}%`,
                  width: `${area.width}%`,
                  height: `${area.height}%`,
                }}
                title={area.title}
                onMouseDown={
                  activeAreaId === area.id && onAreaMouseDown
                    ? (event) => onAreaMouseDown(area.id, event)
                    : undefined
                }
                data-testid={`qc-reference-region-${area.id}`}
              >
                <span className="qc-reference-region-label">{area.label}</span>
                {activeAreaId === area.id && onResizeHandleMouseDown ? (
                  <>
                    <button
                      className="qc-reference-handle is-nw"
                      type="button"
                      aria-label="Zmien rozmiar z lewego gornego rogu"
                      onMouseDown={(event) => onResizeHandleMouseDown(area.id, "nw", event)}
                      data-testid={`qc-reference-handle-${area.id}-nw`}
                    />
                    <button
                      className="qc-reference-handle is-ne"
                      type="button"
                      aria-label="Zmien rozmiar z prawego gornego rogu"
                      onMouseDown={(event) => onResizeHandleMouseDown(area.id, "ne", event)}
                      data-testid={`qc-reference-handle-${area.id}-ne`}
                    />
                    <button
                      className="qc-reference-handle is-sw"
                      type="button"
                      aria-label="Zmien rozmiar z lewego dolnego rogu"
                      onMouseDown={(event) => onResizeHandleMouseDown(area.id, "sw", event)}
                      data-testid={`qc-reference-handle-${area.id}-sw`}
                    />
                    <button
                      className="qc-reference-handle is-se"
                      type="button"
                      aria-label="Zmien rozmiar z prawego dolnego rogu"
                      onMouseDown={(event) => onResizeHandleMouseDown(area.id, "se", event)}
                      data-testid={`qc-reference-handle-${area.id}-se`}
                    />
                  </>
                ) : null}
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
