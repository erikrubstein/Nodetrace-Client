export default function CameraPanel({
  beginCameraSelection,
  busy,
  cameraDevices,
  cameraNotice,
  cameraSelection,
  cameraVideoRef,
  cameraViewportRef,
  captureFullCameraFrame,
  selectedCameraId,
  selectedNode,
  setSelectedCameraId,
}) {
  return (
    <div className="camera-panel">
      <div className="inspector__section field-stack">
        <label>
          <span>Input</span>
          <select value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)}>
            {cameraDevices.length === 0 ? <option value="">No camera inputs</option> : null}
            {cameraDevices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <div className="camera-panel__hint">
          {selectedNode
            ? selectedNode.isVariant
              ? `Capture target: ${selectedNode.name} (variant anchor)`
              : `Capture target: ${selectedNode.name}`
            : 'Select a node to capture into.'}
        </div>
        <div className="camera-panel__actions">
          <button
            className="primary-button wide"
            disabled={!selectedNode || selectedNode.isVariant || busy}
            onClick={() => void captureFullCameraFrame()}
            type="button"
          >
            Take Photo
          </button>
          <button
            className="ghost-button wide"
            disabled={!selectedNode || busy}
            onClick={() => void captureFullCameraFrame('variant')}
            type="button"
          >
            Take Variant Photo
          </button>
        </div>
      </div>
      <div
        ref={cameraViewportRef}
        className={`camera-viewport ${selectedNode?.isVariant ? 'disabled' : ''}`}
        onPointerDown={beginCameraSelection}
      >
        <video ref={cameraVideoRef} autoPlay className="camera-video" muted playsInline />
        {cameraSelection ? (
          <div
            className="camera-selection"
            style={{
              left: `${cameraSelection.x}px`,
              top: `${cameraSelection.y}px`,
              width: `${cameraSelection.width}px`,
              height: `${cameraSelection.height}px`,
            }}
          />
        ) : null}
      </div>
      <div className="inspector__notice">{cameraNotice || 'Drag to crop and upload.'}</div>
    </div>
  )
}
