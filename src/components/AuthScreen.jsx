import { useState } from 'react'

export default function AuthScreen({ busy, clearError, error, onLogin, onRegister }) {
  const [mode, setMode] = useState('login')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')

  function submitLogin() {
    clearError?.()
    const payload = {
      username: loginUsername.trim().toLowerCase(),
      password: loginPassword,
    }
    if (!payload.username || !payload.password) {
      return
    }
    void onLogin(payload)
  }

  function submitRegister() {
    clearError?.()
    const payload = {
      username: registerUsername.trim().toLowerCase(),
      password: registerPassword,
    }
    if (!payload.username || !payload.password) {
      return
    }
    void onRegister(payload)
  }

  function onLoginKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitLogin()
    }
  }

  function onRegisterKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitRegister()
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-shell">
        <div className="auth-brand">
          <img alt="Nodetrace" className="auth-brand__logo" src="/nodetrace.svg" />
          <div className="auth-title">Nodetrace</div>
        </div>
        <div className="auth-card">
        {mode === 'login' ? (
          <div className="auth-column" onKeyDown={onLoginKeyDown}>
            <div className="auth-column__title">Login</div>
            <div className="field-stack auth-fields">
              <label>
                <span>Username</span>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  onChange={(event) => {
                    clearError?.()
                    setLoginUsername(event.target.value)
                  }}
                  value={loginUsername}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  onChange={(event) => {
                    clearError?.()
                    setLoginPassword(event.target.value)
                  }}
                  type="password"
                  value={loginPassword}
                />
              </label>
            </div>
            <button
              className="primary-button wide"
              disabled={busy || !loginUsername.trim() || !loginPassword}
              onClick={submitLogin}
              type="button"
            >
              Login
            </button>
          </div>
        ) : (
          <div className="auth-column" onKeyDown={onRegisterKeyDown}>
            <div className="auth-column__title">Register</div>
            <div className="field-stack auth-fields">
              <label>
                <span>Username</span>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => {
                    clearError?.()
                    setRegisterUsername(event.target.value)
                  }}
                  value={registerUsername}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  onChange={(event) => {
                    clearError?.()
                    setRegisterPassword(event.target.value)
                  }}
                  type="password"
                  value={registerPassword}
                />
              </label>
            </div>
            <button
              className="primary-button wide"
              disabled={busy || !registerUsername.trim() || !registerPassword}
              onClick={submitRegister}
              type="button"
            >
              Create Account
            </button>
          </div>
        )}
        {error ? <div className="inspector__notice auth-error">{error}</div> : null}
        </div>
        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              <span>Need an account?</span>
              <button
                className="auth-switch__link"
                onClick={() => {
                  clearError?.()
                  setMode('register')
                }}
                type="button"
              >
                Register
              </button>
            </>
          ) : (
            <>
              <span>Already have an account?</span>
              <button
                className="auth-switch__link"
                onClick={() => {
                  clearError?.()
                  setMode('login')
                }}
                type="button"
              >
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
