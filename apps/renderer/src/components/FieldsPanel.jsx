import { useState } from 'react'
import PanelSection from './PanelSection'

function formatFieldDraft(field) {
  if (!field) {
    return ''
  }
  return field.type === 'list' ? (Array.isArray(field.value) ? field.value.join(', ') : '') : String(field.value || '')
}

export default function FieldsPanel({
  aiFillRunning,
  busy,
  bulkSelectionCount,
  bulkTemplateCount,
  clearError,
  hasIdentificationTemplates,
  hasBulkSelection,
  identification,
  patchIdentificationField,
  runIdentificationAiFill,
  openApplyTemplateDialog,
  openRemoveTemplateDialog,
  selectedNode,
}) {
  const [fieldDrafts, setFieldDrafts] = useState(() => {
    const nextDrafts = {}
    for (const field of identification?.fields || []) {
      nextDrafts[field.key] = formatFieldDraft(field)
    }
    return nextDrafts
  })
  const [dirtyFields, setDirtyFields] = useState({})

  const hasAiFields = Boolean(identification?.fields?.some((field) => field.mode === 'ai'))

  function getFieldRequestValue(field) {
    if (dirtyFields[field.key]) {
      return String(fieldDrafts[field.key] ?? '')
    }
    return String(field.value ?? '')
  }

  async function handleSaveField(field) {
    if (!selectedNode || !field) {
      return
    }
    clearError()
    try {
      await patchIdentificationField(selectedNode.id, field.key, {
        value: getFieldRequestValue(field),
      })
      setDirtyFields((current) => {
        if (!current[field.key]) {
          return current
        }
        const next = { ...current }
        delete next[field.key]
        return next
      })
      setFieldDrafts((current) => {
        if (!(field.key in current)) {
          return current
        }
        const next = { ...current }
        delete next[field.key]
        return next
      })
    } catch {
      // Parent handles global error state.
    }
  }

  async function handleToggleReviewed(field) {
    if (!selectedNode || !field) {
      return
    }
    clearError()
    try {
      await patchIdentificationField(selectedNode.id, field.key, {
        value: getFieldRequestValue(field),
        reviewed: !field.reviewed,
      })
      setDirtyFields((current) => {
        if (!current[field.key]) {
          return current
        }
        const next = { ...current }
        delete next[field.key]
        return next
      })
      setFieldDrafts((current) => {
        if (!(field.key in current)) {
          return current
        }
        const next = { ...current }
        delete next[field.key]
        return next
      })
    } catch {
      // Parent handles global error state.
    }
  }

  if (!selectedNode) {
    return (
      <div className="fields-panel">
        <PanelSection>
          <div className="inspector__empty">Select a node.</div>
        </PanelSection>
      </div>
    )
  }

  if (hasBulkSelection) {
    return (
      <div className="fields-panel">
        <PanelSection className="field-stack" title="Template">
          <div className="inspector__notice">{bulkSelectionCount} nodes selected.</div>
          <button
            className="ghost-button wide"
            disabled={!hasIdentificationTemplates || busy}
            onClick={openApplyTemplateDialog}
            type="button"
          >
            Apply Template
          </button>
          <button
            className="ghost-button wide"
            disabled={!bulkTemplateCount || busy}
            onClick={openRemoveTemplateDialog}
            type="button"
          >
            Clear Template
          </button>
        </PanelSection>
      </div>
    )
  }

  return (
    <div className="fields-panel">
      {!identification ? (
        <PanelSection className="field-stack" title="Template">
          <button
            className="ghost-button wide"
            disabled={!hasIdentificationTemplates || busy}
            onClick={openApplyTemplateDialog}
            type="button"
          >
            Apply Template
          </button>
          <div className="inspector__empty">Apply a template to work with structured data.</div>
        </PanelSection>
      ) : (
        <PanelSection className="field-stack">
          <div className="identification-template__row">
            <span className="identification-template__name">{identification.templateName}</span>
            <div className="identification-template__actions">
              <button
                aria-label="Remove template"
                className="tool-button identification-template__action"
                disabled={busy}
                onClick={openRemoveTemplateDialog}
                type="button"
              >
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>
          {hasAiFields ? (
            <button
              className="ghost-button wide"
              disabled={busy}
              onClick={() => void runIdentificationAiFill(selectedNode.id)}
              type="button"
            >
              {aiFillRunning ? (
                <>
                  <i aria-hidden="true" className="fa-solid fa-spinner fa-spin button-spinner" />
                  <span>AI Fill</span>
                </>
              ) : (
                'AI Fill'
              )}
            </button>
          ) : null}
          <div className="inspector__title">Fields</div>
          <div className="identification-fields">
            {identification.fields.map((field) => {
              const draftValue = dirtyFields[field.key] ? fieldDrafts[field.key] ?? '' : formatFieldDraft(field)

              return (
                <div key={field.key} className="identification-field">
                  <div className="identification-field__header">
                    <div className="identification-field__label">
                      <span>{field.label}</span>
                    </div>
                  </div>
                  <div className="identification-field__control">
                    {field.type === 'multiline' ? (
                      <textarea
                        className={field.reviewed ? 'identification-field__input is-reviewed' : 'identification-field__input'}
                        disabled={field.reviewed}
                        rows="4"
                        tabIndex={field.reviewed ? -1 : 0}
                        value={draftValue}
                        onBlur={() => void handleSaveField(field)}
                        onChange={(event) => {
                          clearError()
                          setDirtyFields((current) => ({ ...current, [field.key]: true }))
                          setFieldDrafts((current) => ({ ...current, [field.key]: event.target.value }))
                        }}
                      />
                    ) : (
                      <input
                        className={field.reviewed ? 'identification-field__input is-reviewed' : 'identification-field__input'}
                        disabled={field.reviewed}
                        tabIndex={field.reviewed ? -1 : 0}
                        value={draftValue}
                        onBlur={() => void handleSaveField(field)}
                        onChange={(event) => {
                          clearError()
                          setDirtyFields((current) => ({ ...current, [field.key]: true }))
                          setFieldDrafts((current) => ({ ...current, [field.key]: event.target.value }))
                        }}
                      />
                    )}
                    <button
                      aria-label={field.reviewed ? `Unlock ${field.label}` : `Lock ${field.label}`}
                      className={`identification-field__review-toggle ${field.reviewed ? 'is-reviewed' : ''}`}
                      disabled={busy}
                      onClick={() => void handleToggleReviewed(field)}
                      type="button"
                    >
                      <i aria-hidden="true" className={`fa-solid ${field.reviewed ? 'fa-lock' : 'fa-lock-open'}`} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </PanelSection>
      )}
    </div>
  )
}
