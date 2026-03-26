export default function CameraPanel({
  busy,
  cameraDevices,
  cameraNotice,
  cameraVideoRef,
  cameraViewportRef,
  captureFullCameraFrame,
  identificationTemplates,
  selectedCameraId,
  selectedCameraTemplateId,
  selectedNode,
  setSelectedCameraId,
  setSelectedCameraTemplateId,
}) {
  async function handleAddPhotoNode() {
    await captureFullCameraFrame('child', {
      templateId: selectedCameraTemplateId || null,
    })
  }

  async function handleAddPhoto() {
    await captureFullCameraFrame('variant', {
      templateId: selectedCameraTemplateId || null,
    })
  }

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
        <label>
          <span>Template</span>
          <select value={selectedCameraTemplateId} onChange={(event) => setSelectedCameraTemplateId(event.target.value)}>
            <option value="">No template</option>
            {(identificationTemplates || []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <div className="camera-panel__hint">
          {selectedNode
            ? `Capture target: ${selectedNode.name}`
            : 'Select a node to capture into.'}
        </div>
        <div className="camera-panel__actions">
          <button
            className="primary-button wide"
            disabled={!selectedNode || busy}
            onClick={() => void handleAddPhotoNode()}
            type="button"
          >
            Take Photo Node
          </button>
          <button
            className="button wide"
            disabled={!selectedNode || busy}
            onClick={() => void handleAddPhoto()}
            type="button"
          >
            Add Photo
          </button>
        </div>
      </div>
      <div ref={cameraViewportRef} className="camera-viewport">
        <video ref={cameraVideoRef} autoPlay className="camera-video" muted playsInline />
      </div>
      <div className="inspector__notice">{cameraNotice || 'Capture a photo into the selected node.'}</div>
    </div>
  )
}
