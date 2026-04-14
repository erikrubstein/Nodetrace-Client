import ConfirmDialog from '../../components/ConfirmDialog'

export default function AppManagementDialogs({
  appDialog,
  appVersion = '0.0.0',
  busy,
  onCheckForUpdates = null,
  onConfirmClearCache = null,
  setAppDialog,
  serverDisconnectDialogOpen = false,
  handleServerDisconnectDismiss,
  sessionDialogOpen,
  setSessionDialogOpen,
  desktopClientId,
  mobileConnectionCount,
  updateStatus = '',
}) {
  return (
    <>
      {appDialog === 'clear-cache' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAppDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Reset Cache</div>
            <div className="field-stack">
              <div className="inspector__notice">
                Clear the local app cache and reload project assets from the server on next use.
              </div>
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAppDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void onConfirmClearCache?.()} type="button">
                Reset Cache
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {appDialog === 'updates' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAppDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Check For Updates</div>
            <div className="field-stack">
              <div className="inspector__notice">
                Current version: <strong>{appVersion}</strong>
              </div>
              <div className="inspector__notice">{updateStatus || 'Checking for updates...'}</div>
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAppDialog(null)} type="button">
                Close
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void onCheckForUpdates?.()} type="button">
                Check Again
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {serverDisconnectDialogOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <ConfirmDialog
            confirmLabel="Go To Projects"
            confirmTone="ghost"
            onConfirm={() => {
              handleServerDisconnectDismiss?.()
            }}
            title="Server Profile Disconnected"
          >
            <div className="inspector__notice">The server profile for the current project disconnected.</div>
          </ConfirmDialog>
        </div>
      ) : null}

      {sessionDialogOpen ? (
        <div className="dialog-backdrop" onClick={() => setSessionDialogOpen(false)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Mobile Capture</div>
            <div className="inspector__notice">
              Enter this session code on your phone to connect capture directly to this desktop session.
            </div>
            <div className="session-code">{desktopClientId}</div>
            <div className="inspector__notice">
              {mobileConnectionCount > 0
                ? `${mobileConnectionCount} active phone connection${mobileConnectionCount === 1 ? '' : 's'}`
                : 'No active phone connections'}
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" onClick={() => setSessionDialogOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
