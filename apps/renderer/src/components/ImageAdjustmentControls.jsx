import { defaultImageEdits } from '../lib/image'

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function adjustmentActionButton({ active = false, disabled = false, iconClassName, label, onClick }) {
  return (
    <span className="icon-button-wrap" key={label}>
      <button
        aria-label={label}
        className={`tool-button preview-panel__tool-button ${active ? 'is-active' : ''}`}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <i aria-hidden="true" className={iconClassName} />
      </button>
      <span aria-hidden="true" className="icon-tooltip">
        {label}
      </span>
    </span>
  )
}

function AdjustmentSlider({ defaultValue, edits, iconClassName, label, max, min, onChange, valueKey }) {
  const value = edits[valueKey]
  const maxValue = Number(max)
  const minValue = Number(min)

  function applyValue(nextValue) {
    onChange({
      ...edits,
      [valueKey]: clampNumber(nextValue, minValue, maxValue),
    })
  }

  return (
    <label className="preview-panel__adjustment-row">
      <span className="preview-panel__adjustment-label">{label}</span>
      <input
        className="preview-panel__adjustment-slider"
        max={max}
        min={min}
        type="range"
        value={value}
        onChange={(event) => applyValue(Number(event.target.value))}
        onWheel={(event) => {
          event.preventDefault()
          const delta = Math.sign(event.deltaY)
          if (delta === 0) {
            return
          }
          applyValue(Number(value) - (delta * 5))
        }}
      />
      <span className="preview-panel__control-header-actions">
        <strong>{value}</strong>
        {adjustmentActionButton({
          disabled: value === defaultValue,
          iconClassName,
          label: `Reset ${label}`,
          onClick: () => applyValue(defaultValue),
        })}
      </span>
    </label>
  )
}

export default function ImageAdjustmentControls({ edits, onChange, onResetAll, onToggleInvert }) {
  const hasAdjustmentChanges =
    edits.brightness !== defaultImageEdits.brightness ||
    edits.contrast !== defaultImageEdits.contrast ||
    edits.exposure !== defaultImageEdits.exposure ||
    edits.sharpness !== defaultImageEdits.sharpness ||
    edits.denoise !== defaultImageEdits.denoise ||
    edits.invert !== defaultImageEdits.invert

  return (
    <div className="inspector__section field-stack preview-panel__controls">
      <div className="inspector__section-header">
        <div className="inspector__title">Adjustments</div>
        <div className="preview-panel__adjustment-header-actions">
          {adjustmentActionButton({
            active: edits.invert,
            iconClassName: 'fa-solid fa-circle-half-stroke',
            label: 'Invert Colors',
            onClick: onToggleInvert,
          })}
          {adjustmentActionButton({
            disabled: !hasAdjustmentChanges,
            iconClassName: 'fa-solid fa-arrow-rotate-left',
            label: 'Reset Adjustments',
            onClick: onResetAll,
          })}
        </div>
      </div>
      <AdjustmentSlider
        defaultValue={defaultImageEdits.brightness}
        edits={edits}
        iconClassName="fa-solid fa-arrow-rotate-left"
        label="Brightness"
        max="100"
        min="-100"
        onChange={onChange}
        valueKey="brightness"
      />
      <AdjustmentSlider
        defaultValue={defaultImageEdits.contrast}
        edits={edits}
        iconClassName="fa-solid fa-arrow-rotate-left"
        label="Contrast"
        max="200"
        min="0"
        onChange={onChange}
        valueKey="contrast"
      />
      <AdjustmentSlider
        defaultValue={defaultImageEdits.exposure}
        edits={edits}
        iconClassName="fa-solid fa-arrow-rotate-left"
        label="Exposure"
        max="100"
        min="-100"
        onChange={onChange}
        valueKey="exposure"
      />
      <AdjustmentSlider
        defaultValue={defaultImageEdits.sharpness}
        edits={edits}
        iconClassName="fa-solid fa-arrow-rotate-left"
        label="Sharpness"
        max="100"
        min="0"
        onChange={onChange}
        valueKey="sharpness"
      />
      <AdjustmentSlider
        defaultValue={defaultImageEdits.denoise}
        edits={edits}
        iconClassName="fa-solid fa-arrow-rotate-left"
        label="Denoise"
        max="100"
        min="0"
        onChange={onChange}
        valueKey="denoise"
      />
    </div>
  )
}
