export default function TemplatesPanel({
  busy,
  clearError,
  hasTemplateChanges,
  error,
  createNewTemplate,
  requestDeleteTemplate,
  requestSaveTemplate,
  selectedTemplateEditorId,
  selectTemplateEditor,
  templateForm,
  templates,
  updateTemplateField,
  duplicateTemplate,
}) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateEditorId) || null
  const canSave = !busy && hasTemplateChanges
  const hasAiFields = templateForm.fields.some((field) => (field.mode || 'manual') === 'ai')

  return (
    <div className="templates-panel">
      <section className="inspector__section templates-panel__section">
        <div className="inspector__title">Template</div>
        <div className="templates-panel__toolbar">
          <select
            disabled={busy}
            value={selectedTemplateEditorId || ''}
            onChange={(event) => {
              clearError()
              selectTemplateEditor(event.target.value)
            }}
          >
            {(templates || []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            aria-label="New template"
            className="tool-button templates-panel__new-button"
            disabled={busy}
            onClick={createNewTemplate}
            type="button"
          >
            <i aria-hidden="true" className="fa-solid fa-plus" />
          </button>
        </div>

        <label>
          <span>Name</span>
          <input
            value={templateForm.name}
            onChange={(event) => {
              clearError()
              updateTemplateField('name', null, event.target.value)
            }}
          />
        </label>

        {hasAiFields ? (
          <>
            <label>
              <span>AI Instructions</span>
              <textarea
                placeholder="Describe how AI should use scoped node text and images for this template."
                rows="5"
                value={templateForm.aiInstructions || ''}
                onChange={(event) => {
                  clearError()
                  updateTemplateField('aiInstructions', null, event.target.value)
                }}
              />
            </label>
            <div className="template-field-editor__depths">
              <label>
                <span>Parent depth</span>
                <input
                  max="5"
                  min="0"
                  type="number"
                  value={templateForm.parentDepth ?? 0}
                  onChange={(event) => {
                    clearError()
                    updateTemplateField('parentDepth', null, event.target.value)
                  }}
                />
              </label>
              <label>
                <span>Child depth</span>
                <input
                  max="5"
                  min="0"
                  type="number"
                  value={templateForm.childDepth ?? 0}
                  onChange={(event) => {
                    clearError()
                    updateTemplateField('childDepth', null, event.target.value)
                  }}
                />
              </label>
            </div>
          </>
        ) : null}

        <label className="templates-panel__field-group">
          <span>Fields</span>
          <div className="template-field-editor">
            {templateForm.fields.map((field, index) => (
              <div className="template-field-editor__field" key={field.id || index}>
                <div className="template-field-editor__row">
                  <input
                    placeholder="Label"
                    value={field.label}
                    onChange={(event) => {
                      clearError()
                      updateTemplateField('label', index, event.target.value)
                    }}
                  />
                  <input
                    placeholder="key_name"
                    value={field.key}
                    onChange={(event) => {
                      clearError()
                      updateTemplateField('key', index, event.target.value)
                    }}
                  />
                  <select
                    value={field.mode || 'manual'}
                    onChange={(event) => {
                      clearError()
                      updateTemplateField('mode', index, event.target.value)
                    }}
                  >
                    <option value="manual">Manual</option>
                    <option value="ai">AI-Assisted</option>
                  </select>
                  <select
                    value={field.type}
                    onChange={(event) => {
                      clearError()
                      updateTemplateField('type', index, event.target.value)
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="multiline">Multiline</option>
                  </select>
                  <button
                    aria-label={`Remove ${field.label || 'field'}`}
                    className="tool-button template-field-editor__remove-button"
                    disabled={busy}
                    onClick={() => {
                      clearError()
                      updateTemplateField('remove', index)
                    }}
                    type="button"
                  >
                    <i aria-hidden="true" className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </label>

        <button
          className="ghost-button wide"
          disabled={busy}
          onClick={() => {
            clearError()
            updateTemplateField('add')
          }}
          type="button"
        >
          Add Field
        </button>

        <div className="templates-panel__actions-bar">
          <button className="ghost-button" disabled={!canSave} onClick={requestSaveTemplate} type="button">
            Save
          </button>
          <button
            className="ghost-button"
            disabled={busy}
            onClick={() => {
              clearError()
              void duplicateTemplate()
            }}
            type="button"
          >
            Duplicate
          </button>
          <button className="danger-button" disabled={busy} onClick={requestDeleteTemplate} type="button">
            Delete
          </button>
        </div>

        {error ? <div className="inspector__notice error">{error}</div> : null}
      </section>

      <div className="inspector__section inspector__footer">
        <div className="settings-panel__meta-row">
          <span>Template ID</span>
          <strong>{selectedTemplate?.id || 'n/a'}</strong>
        </div>
      </div>
    </div>
  )
}
