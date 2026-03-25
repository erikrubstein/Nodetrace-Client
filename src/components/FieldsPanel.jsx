import { useMemo, useState } from 'react'

function formatFieldDraft(field) {
  if (!field) {
    return ''
  }
  return field.type === 'list' ? (Array.isArray(field.value) ? field.value.join(', ') : '') : String(field.value || '')
}

export default function FieldsPanel({
  aiFillRunning,
  busy,
  clearError,
  hasBulkSelection,
  identification,
  patchNodeNeedsAttention,
  patchIdentificationField,
  runIdentificationAiFill,
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

  const reviewProgress = useMemo(() => {
    if (!identification) {
      return null
    }
    return `${identification.reviewedFieldCount}/${identification.totalReviewFieldCount}`
  }, [identification])
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

  async function handleToggleNeedsAttention() {
    if (!selectedNode) {
      return
    }
    clearError()
    try {
      await patchNodeNeedsAttention(selectedNode.id, !selectedNode.needsAttention)
    } catch {
      // Parent handles global error state.
    }
  }

  if (!selectedNode) {
    return (
      <div className="fields-panel">
        <div className="inspector__section">
          <div className="inspector__empty">Select a node.</div>
        </div>
      </div>
    )
  }

  if (hasBulkSelection) {
    return (
      <div className="fields-panel">
        <div className="inspector__section">
          <div className="inspector__empty">Select a single node to edit structured data.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fields-panel">
      <div className="inspector__section field-stack">
        <div className="inspector__title">Status</div>
        {identification ? (
          <div className={`identification-status-block identification-status-block--${identification.status}`}>
            {identification.status === 'reviewed' ? 'Complete' : `Incomplete ${reviewProgress}`}
          </div>
        ) : (
          <div className="identification-status-block identification-status-block--incomplete">No Template</div>
        )}
        <button
          className={`ghost-button wide needs-attention-button ${selectedNode.needsAttention ? 'is-active' : ''}`}
          disabled={busy}
          onClick={() => void handleToggleNeedsAttention()}
          type="button"
        >
          Needs Attention
        </button>
      </div>

      {hasAiFields ? (
        <div className="inspector__section field-stack">
          <div className="inspector__title">AI</div>
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
        </div>
      ) : null}

      {identification ? (
        <div className="inspector__section field-stack">
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
                      aria-label={field.reviewed ? `Unreview ${field.label}` : `Review ${field.label}`}
                      className={`identification-field__review-toggle ${field.reviewed ? 'is-reviewed' : ''}`}
                      disabled={busy}
                      onClick={() => void handleToggleReviewed(field)}
                      type="button"
                    >
                      <i aria-hidden="true" className="fa-solid fa-check" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="inspector__section">
          <div className="inspector__empty">Apply a template in Inspector to work with structured fields.</div>
        </div>
      )}
    </div>
  )
}
