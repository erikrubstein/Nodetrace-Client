export default function AccountDialogs({
  accountDialog,
  accountForm,
  accountStatus,
  busy,
  changePassword,
  changeUsername,
  deleteAccount,
  error,
  handleDialogEnter,
  logoutUser,
  resolvedAccountDialogUsername,
  setAccountDialog,
  setAccountForm,
}) {
  return (
    <>
      {accountDialog === 'overview' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div className="dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="dialog__title">Manage Account</div>
            <div className="inspector__notice">
              Signed in as <strong>{resolvedAccountDialogUsername || 'Unknown user'}</strong>
            </div>
            <div className="field-stack">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog('username')} type="button">
                Change Username
              </button>
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog('password')} type="button">
                Change Password
              </button>
              <button className="danger-button" disabled={busy} onClick={() => setAccountDialog('delete-account')} type="button">
                Delete Account
              </button>
              <button className="ghost-button" disabled={busy} onClick={logoutUser} type="button">
                Logout
              </button>
            </div>
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountDialog === 'username' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleDialogEnter(event, changeUsername, Boolean(accountForm.username.trim()) && !busy)}
            role="dialog"
          >
            <div className="dialog__title">Change Username</div>
            <input
              autoFocus
              onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="New username"
              value={accountForm.username}
            />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !accountForm.username.trim()} onClick={changeUsername} type="button">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountDialog === 'password' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                changePassword,
                Boolean(
                  accountForm.currentPassword &&
                    accountForm.newPassword &&
                    accountForm.confirmPassword &&
                    accountForm.newPassword === accountForm.confirmPassword,
                ) && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">Change Password</div>
            <input
              autoFocus
              onChange={(event) => setAccountForm((current) => ({ ...current, currentPassword: event.target.value }))}
              placeholder="Current password"
              type="password"
              value={accountForm.currentPassword}
            />
            <input
              onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))}
              placeholder="New password"
              type="password"
              value={accountForm.newPassword}
            />
            <input
              onChange={(event) => setAccountForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              placeholder="Retype new password"
              type="password"
              value={accountForm.confirmPassword || ''}
            />
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountForm.confirmPassword && accountForm.newPassword !== accountForm.confirmPassword ? (
              <div className="inspector__notice error">New passwords do not match.</div>
            ) : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !accountForm.currentPassword ||
                  !accountForm.newPassword ||
                  !accountForm.confirmPassword ||
                  accountForm.newPassword !== accountForm.confirmPassword
                }
                onClick={changePassword}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountDialog === 'delete-account' ? (
        <div className="dialog-backdrop" onClick={() => !busy && setAccountDialog(null)} role="presentation">
          <div
            className="dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) =>
              handleDialogEnter(
                event,
                deleteAccount,
                accountForm.deleteConfirmation === resolvedAccountDialogUsername && !busy,
              )
            }
            role="dialog"
          >
            <div className="dialog__title">Delete Account</div>
            <div className="inspector__notice">
              Type <strong>{resolvedAccountDialogUsername}</strong> to permanently delete this account from the server.
            </div>
            <div className="inspector__notice error">
              This is not just removing a saved login from this client. It deletes the real server account and any
              server-side access tied to it.
            </div>
            <input
              autoFocus
              onChange={(event) => setAccountForm((current) => ({ ...current, deleteConfirmation: event.target.value }))}
              placeholder="Username"
              value={accountForm.deleteConfirmation}
            />
            <div className="inspector__notice">Account deletion is blocked while you still own projects.</div>
            {error ? <div className="inspector__notice error">{error}</div> : null}
            {!error && accountStatus ? <div className="inspector__notice">{accountStatus}</div> : null}
            <div className="dialog__actions">
              <button className="ghost-button" disabled={busy} onClick={() => setAccountDialog(null)} type="button">
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy || accountForm.deleteConfirmation !== resolvedAccountDialogUsername}
                onClick={deleteAccount}
                type="button"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
