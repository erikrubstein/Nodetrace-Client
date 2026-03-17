export default function PreviewPanel({
  beginPreviewPan,
  busy,
  copySelectedImage,
  downloadSelectedImage,
  previewTransform,
  previewViewportRef,
  selectedNode,
  setError,
  stopPreviewPan,
}) {
  return (
    <div className="preview-panel">
      <div className="preview-panel__actions">
        <button
          className="ghost-button"
          disabled={!selectedNode?.imageUrl || busy}
          onClick={async () => {
            try {
              await downloadSelectedImage()
            } catch (submitError) {
              setError(submitError.message)
            }
          }}
          type="button"
        >
          Download Image
        </button>
        <button
          className="ghost-button"
          disabled={!selectedNode?.imageUrl || busy}
          onClick={async () => {
            try {
              await copySelectedImage()
            } catch (submitError) {
              setError(submitError.message)
            }
          }}
          type="button"
        >
          Copy Image
        </button>
      </div>
      {selectedNode?.imageUrl ? (
        <div
          ref={previewViewportRef}
          className="preview-viewport"
          onPointerDown={beginPreviewPan}
          onPointerUp={stopPreviewPan}
          onPointerCancel={stopPreviewPan}
        >
          <div
            className="preview-stage"
            style={{
              transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.scale})`,
            }}
          >
            <img className="preview-stage__image" src={selectedNode.imageUrl} alt={selectedNode.name} />
          </div>
        </div>
      ) : (
        <div className="inspector__section">
          <div className="inspector__empty">Select a photo to preview the full-resolution image.</div>
        </div>
      )}
    </div>
  )
}
