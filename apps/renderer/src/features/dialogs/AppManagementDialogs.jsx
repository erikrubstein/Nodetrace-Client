import ConfirmDialog from '../../components/ConfirmDialog'

export default function AppManagementDialogs({
  appDialog,
  appVersion = '0.0.0',
  busy,
  handleDialogEnter,
  onCheckForUpdates = null,
  onConfirmClearCache = null,
  setAppDialog,
  serverDisconnectDialogOpen = false,
  handleServerDisconnectDismiss,
  sessionDialogOpen,
  setSessionDialogOpen,
  desktopClientId,
  mobileCaptureIsLocal = false,
  mobileCaptureUrls = [],
  mobileConnectionCount,
  updateStatus = '',
}) {
  return (
    <>
      {appDialog === 'clear-cache' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAppDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter?.(event, () => void onConfirmClearCache?.(), !busy)}
            role="dialog"
          >
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
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter?.(event, () => void onCheckForUpdates?.(), !busy)}
            role="dialog"
          >
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
            onKeyDown={(event) => handleDialogEnter?.(event, () => handleServerDisconnectDismiss?.(), true)}
            title="Server Profile Disconnected"
          >
            <div className="inspector__notice">The server profile for the current project disconnected.</div>
          </ConfirmDialog>
        </div>
      ) : null}

      {sessionDialogOpen ? (
        <div className="dialog-backdrop" onClick={() => setSessionDialogOpen(false)} role="presentation">
          <div className="dialog dialog--mobile-capture" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Mobile Capture</div>
            {mobileCaptureUrls.length ? (
              <>
                <div className="inspector__notice">
                  {mobileCaptureIsLocal
                    ? 'Connect your phone to the same Wi-Fi or LAN as this computer, then open one of these addresses:'
                    : 'Open this address in your phone browser:'}
                </div>
                <div aria-label="Mobile capture addresses" className="mobile-capture__url-list">
                  {mobileCaptureUrls.map((url) => (
                    <code className="mobile-capture__url" key={url}>
                      {url}
                    </code>
                  ))}
                </div>
                <div className="inspector__notice">
                  {mobileCaptureIsLocal
                    ? 'Each address includes this computer’s IP address, the temporary Local Projects port, and the /capture endpoint.'
                    : 'The address includes the configured server, its port, and the /capture endpoint.'}
                </div>
              </>
            ) : (
              <div className="inspector__notice">
                {mobileCaptureIsLocal
                  ? 'No LAN address is available yet. Connect this computer and your phone to the same Wi-Fi or LAN, then reopen this dialog.'
                  : 'Open the /capture endpoint for this Nodetrace server in your phone browser.'}
              </div>
            )}
            <div className="mobile-capture__session-label">Then enter this session code</div>
            <div aria-label="Session code" className="session-code">{desktopClientId}</div>
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
