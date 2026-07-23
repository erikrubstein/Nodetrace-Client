import { useRef } from 'react'

import IconButton from '../../components/IconButton'
import { ResetIcon } from '../../components/icons'
import { defaultFloorPlanAppearance, normalizeFloorPlanAppearance } from './model'

export default function FloorPlanAppearancePanel({
  activeFloorPlan,
  busy,
  floorPlans,
  onActiveFloorPlanChange,
  onDeleteFloorPlan,
  onUpdateAppearance,
  onUploadFloorPlan,
}) {
  const uploadInputRef = useRef(null)
  const appearance = normalizeFloorPlanAppearance(activeFloorPlan?.appearance)

  function patchAppearance(patch) {
    if (!activeFloorPlan) {
      return
    }
    void onUpdateAppearance(activeFloorPlan.id, patch)
  }

  return (
    <div className="settings-panel floor-plan-appearance-panel">
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload another floor plan image"
        className="floor-plan-workspace__file-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            void onUploadFloorPlan(file)
          }
        }}
        ref={uploadInputRef}
        type="file"
      />
      <section className="inspector__section settings-panel__section">
        <div className="inspector__title">Plan</div>
        {activeFloorPlan ? (
          <div className="settings-panel__grid">
            <label>
              <span>Current plan</span>
              <select
                aria-label="Floor plan"
                onChange={(event) => onActiveFloorPlanChange(event.target.value)}
                value={activeFloorPlan.id}
              >
                {floorPlans.map((floorPlan) => (
                  <option key={floorPlan.id} value={floorPlan.id}>{floorPlan.name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="inspector__notice">No floor plan has been uploaded.</div>
        )}
        <button className="ghost-button settings-panel__reset" disabled={busy} onClick={() => uploadInputRef.current?.click()} type="button">
          Upload Plan
        </button>
        {activeFloorPlan ? (
          <button className="danger-button" disabled={busy} onClick={() => onDeleteFloorPlan(activeFloorPlan)} type="button">
            Delete Plan
          </button>
        ) : null}
      </section>

      {activeFloorPlan ? (
        <section className="inspector__section settings-panel__section">
          <div className="inspector__title">Appearance</div>
          <div className="settings-panel__grid">
            <label>
              <span>Background</span>
              <select
                aria-label="Floor plan background"
                disabled={busy}
                onChange={(event) => patchAppearance({ transparentWhite: event.target.value === 'transparent' })}
                value={appearance.transparentWhite ? 'transparent' : 'visible'}
              >
                <option value="visible">Original</option>
                <option value="transparent">Transparent</option>
              </select>
            </label>
            {appearance.transparentWhite ? (
              <>
                <label>
                  <span>Ink</span>
                  <select
                    aria-label="Floor plan ink"
                    disabled={busy}
                    onChange={(event) => patchAppearance({ inkMode: event.target.value })}
                    value={appearance.inkMode}
                  >
                    <option value="original">Original</option>
                    <option value="theme">Match Theme</option>
                    <option value="custom">Custom Color</option>
                  </select>
                </label>
                <label>
                  <span>Background color</span>
                  <div className="floor-plan-appearance-panel__control-with-reset">
                    <input
                      aria-label="Floor plan background color"
                      disabled={busy}
                      onChange={(event) => patchAppearance({ backgroundColor: event.target.value })}
                      type="color"
                      value={appearance.backgroundColor}
                    />
                    <IconButton
                      aria-label="Reset background color"
                      className="tool-button"
                      disabled={busy || appearance.backgroundColor === defaultFloorPlanAppearance.backgroundColor}
                      onClick={() => patchAppearance({
                        backgroundColor: defaultFloorPlanAppearance.backgroundColor,
                      })}
                      tooltip="Reset Background Color"
                    >
                      <ResetIcon />
                    </IconButton>
                  </div>
                </label>
              </>
            ) : null}
            {appearance.transparentWhite && appearance.inkMode === 'custom' ? (
              <label>
                <span>Ink color</span>
                <div className="floor-plan-appearance-panel__control-with-reset">
                  <input
                    aria-label="Floor plan ink color"
                    disabled={busy}
                    onChange={(event) => patchAppearance({ inkColor: event.target.value })}
                    type="color"
                    value={appearance.inkColor}
                  />
                  <IconButton
                    aria-label="Reset ink color"
                    className="tool-button"
                    disabled={busy || appearance.inkColor === defaultFloorPlanAppearance.inkColor}
                    onClick={() => patchAppearance({
                      inkColor: defaultFloorPlanAppearance.inkColor,
                    })}
                    tooltip="Reset Ink Color"
                  >
                    <ResetIcon />
                  </IconButton>
                </div>
              </label>
            ) : null}
          </div>
          {appearance.transparentWhite ? (
            <div className="settings-panel__range-group">
              {appearance.inkMode === 'theme' ? (
                <label className="settings-panel__range-row">
                  <span>Brightness</span>
                  <div className="settings-panel__range-control floor-plan-appearance-panel__range-control">
                    <input
                      aria-label="Floor plan brightness"
                      disabled={busy}
                      max="100"
                      min="0"
                      onChange={(event) => patchAppearance({ themeBrightness: Number(event.target.value) })}
                      type="range"
                      value={appearance.themeBrightness}
                    />
                    <strong>{appearance.themeBrightness}%</strong>
                    <IconButton
                      aria-label="Reset floor plan brightness"
                      className="tool-button"
                      disabled={busy || appearance.themeBrightness === defaultFloorPlanAppearance.themeBrightness}
                      onClick={() => patchAppearance({
                        themeBrightness: defaultFloorPlanAppearance.themeBrightness,
                      })}
                      tooltip="Reset Brightness"
                    >
                      <ResetIcon />
                    </IconButton>
                  </div>
                </label>
              ) : null}
              <label className="settings-panel__range-row">
                <span>Background cutoff</span>
                <div className="settings-panel__range-control floor-plan-appearance-panel__range-control">
                  <input
                    aria-label="Floor plan background cutoff"
                    disabled={busy}
                    max="255"
                    min="1"
                    onChange={(event) => patchAppearance({ whiteThreshold: Number(event.target.value) })}
                    type="range"
                    value={appearance.whiteThreshold}
                  />
                  <strong>{appearance.whiteThreshold}</strong>
                  <IconButton
                    aria-label="Reset background cutoff"
                    className="tool-button"
                    disabled={busy || appearance.whiteThreshold === defaultFloorPlanAppearance.whiteThreshold}
                    onClick={() => patchAppearance({
                      whiteThreshold: defaultFloorPlanAppearance.whiteThreshold,
                    })}
                    tooltip="Reset Background Cutoff"
                  >
                    <ResetIcon />
                  </IconButton>
                </div>
              </label>
            </div>
          ) : null}
          <button
            className="ghost-button settings-panel__reset"
            disabled={busy}
            onClick={() => void onUpdateAppearance(activeFloorPlan.id, defaultFloorPlanAppearance)}
            type="button"
          >
            Reset Appearance
          </button>
        </section>
      ) : null}
    </div>
  )
}
